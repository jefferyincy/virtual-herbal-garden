/**
 * Spaced-repetition flashcards: the due queue and the grading write.
 *
 * Mounted at the api root by the orchestrator, so every path here is full. All scheduling maths
 * lives in `services/srs.ts`; this file only loads/creates the `Progress` row, applies the
 * scheduler and persists the result.
 */

import { Router } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';
import { Plant, Progress, SRS_RATINGS, type ProgressDoc } from '../models/index.ts';
import { route } from '../lib/asyncRoute.ts';
import { notFound } from '../lib/http.ts';
import { paginated } from '../lib/query.ts';
import { requireAuth } from '../middleware/auth.ts';
import { validate } from '../middleware/validate.ts';
import { awardBadgesIfEarned } from '../services/award.ts';
import {
  intervalLabel,
  masteryFor,
  newSrsState,
  previewIntervals,
  schedule,
  type SrsState,
} from '../services/srs.ts';

export const flashcardsRouter: Router = Router();

const OBJECT_ID = /^[0-9a-f]{24}$/i;
const DEFAULT_DUE_LIMIT = 20;
const MAX_DUE_LIMIT = 50;

type LeanProgress = ProgressDoc & { _id: Types.ObjectId };

type PlantCard = {
  _id: Types.ObjectId;
  slug: string;
  commonName: string;
  botanicalName: string;
  family: string;
  partsUsed?: string[] | null;
  images?: unknown[] | null;
};

/** Exactly the fields a flashcard's answer side renders. */
const PLANT_CARD_FIELDS = 'slug commonName botanicalName family partsUsed images';

function identifierFilter(identifier: string): Record<string, unknown>[] {
  const conditions: Record<string, unknown>[] = [{ slug: identifier }];
  if (OBJECT_ID.test(identifier)) conditions.unshift({ _id: new Types.ObjectId(identifier) });
  return conditions;
}

/** The compound unique (userId, plantId) index reports a clash as mongo code 11000. */
function isDuplicateKey(err: unknown): boolean {
  if (typeof err !== 'object' || err === null || !('code' in err)) return false;
  return err.code === 11000;
}

function srsStateOf(row: LeanProgress): SrsState {
  const srs = row.srs;
  return {
    ease: srs?.ease ?? 2.5,
    intervalDays: srs?.intervalDays ?? 0,
    dueAt: srs?.dueAt ? new Date(srs.dueAt) : new Date(),
    reps: srs?.reps ?? 0,
    lapses: srs?.lapses ?? 0,
  };
}

const dueQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(MAX_DUE_LIMIT).optional(),
});

flashcardsRouter.get(
  '/flashcards/due',
  requireAuth,
  validate({ query: dueQuerySchema }),
  route(async (req, res) => {
    const caller = req.user;
    if (!caller) return;
    const query = req.query as unknown as z.infer<typeof dueQuerySchema>;
    const limit = query.limit ?? DEFAULT_DUE_LIMIT;
    const now = new Date();

    const [rows, dueCount, knownPlantIds] = await Promise.all([
      Progress.find({ userId: caller.id, 'srs.dueAt': { $lte: now } })
        .sort({ 'srs.dueAt': 1 })
        .limit(limit)
        .lean<LeanProgress[]>(),
      Progress.countDocuments({ userId: caller.id, 'srs.dueAt': { $lte: now } }),
      Progress.distinct('plantId', { userId: caller.id }),
    ]);

    const plantIds = rows.map((row) => row.plantId);
    const plants = plantIds.length
      ? await Plant.find({ _id: { $in: plantIds } }).select(PLANT_CARD_FIELDS).lean<PlantCard[]>()
      : [];
    const byId: Record<string, PlantCard> = {};
    for (const plant of plants) byId[String(plant._id)] = plant;

    const items = rows
      .map((row) => {
        const plant = byId[String(row.plantId)];
        if (!plant) return null;
        return {
          plantId: String(row.plantId),
          plant,
          srs: srsStateOf(row),
          mastery: row.mastery ?? 0,
          // The prompt is DERIVED from the plant record, never authored: it asks about the same
          // two facts every monograph states (parts used, preparation) and the answer side is the
          // plant record itself (`partsUsed` + `preparations`), so a card can never be stale
          // relative to the data it quizzes.
          question: `Which part of ${plant.commonName} is traditionally used, and what is it prepared as?`,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);

    // Plants the learner has never opened have no `Progress` row at all, and this route does NOT
    // backfill rows for them: creating cards for unread plants would fake study history and would
    // make every plant immediately "due". They are counted honestly as `newAvailable` so the
    // client can offer to start them through the normal read flow instead.
    const newAvailable = await Plant.countDocuments({ _id: { $nin: knownPlantIds } });

    res.json({
      ...paginated(items, dueCount, 1, limit),
      dueCount,
      newAvailable,
    });
  }),
);

const gradeParamsSchema = z.object({ plantId: z.string().trim().min(1) });
const gradeBodySchema = z.object({ rating: z.enum(SRS_RATINGS) });

flashcardsRouter.post(
  '/flashcards/:plantId/grade',
  requireAuth,
  validate({ params: gradeParamsSchema, body: gradeBodySchema }),
  route(async (req, res) => {
    const caller = req.user;
    if (!caller) return;
    const { plantId } = req.params as z.infer<typeof gradeParamsSchema>;
    const { rating } = req.body as z.infer<typeof gradeBodySchema>;
    const now = new Date();

    const plant = await Plant.findOne({ $or: identifierFilter(plantId) })
      .select('_id')
      .lean<{ _id: Types.ObjectId } | null>();
    if (!plant) throw notFound('Plant not found');

    let row = await Progress.findOne({ userId: caller.id, plantId: plant._id }).lean<LeanProgress | null>();
    if (!row) {
      try {
        row = await Progress.create({
          userId: caller.id,
          plantId: plant._id,
          read: false,
          mastery: 0,
          srs: newSrsState(now),
        });
      } catch (err) {
        // Duplicate-key race: a concurrent grade created the row between our read and our create.
        // Re-read and retry once - the row now exists, so the careful thing is to grade whatever
        // is stored rather than to overwrite it with a fresh state.
        if (!isDuplicateKey(err)) throw err;
        row = await Progress.findOne({ userId: caller.id, plantId: plant._id }).lean<LeanProgress | null>();
        if (!row) throw err;
      }
    }

    const next = schedule(srsStateOf(row), rating, now);
    const mastery = masteryFor(row.mastery ?? 0, rating);

    const saved = await Progress.findOneAndUpdate(
      { _id: row._id },
      { $set: { srs: next, mastery } },
      { new: true },
    ).lean<LeanProgress | null>();

    // A review is deliberately worth no XP - it is not a first read, and paying for every flip
    // would turn the deck into an XP farm. Badges are still evaluated (with `event: null`) so
    // streak-based unlocks can land on a study session; that is an explicit choice, not a missing
    // award call.
    await awardBadgesIfEarned({ userId: caller.id, event: null, now });

    res.json({
      srs: saved ? srsStateOf(saved) : next,
      mastery: saved?.mastery ?? mastery,
      intervalLabel: intervalLabel(next.intervalDays),
      xpAwarded: 0,
      // Previews for the state just persisted, so the next time this card appears the four
      // buttons' intervals are truthful.
      previewIntervals: previewIntervals(next, now),
    });
  }),
);
