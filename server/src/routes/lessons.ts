/**
 * Lesson routes: the grouped catalogue, the reader payload and the completion endpoint that
 * feeds the XP/badge service.
 *
 * Declares FULL paths (`/lessons`, `/lessons/:slug`, `/lessons/:id/complete`) because the
 * orchestrator mounts this router at the api root, not under a `/lessons` prefix.
 */

import { Router, type Request } from 'express';
import { Types } from 'mongoose';
import { route } from '../lib/asyncRoute.ts';
import { notFound, unauthorized } from '../lib/http.ts';
import { optionalAuth, requireAuth } from '../middleware/auth.ts';
import { Lesson, Plant, Progress } from '../models/index.ts';
import { awardBadgesIfEarned, awardXp } from '../services/award.ts';

export const lessonsRouter: Router = Router();

const OBJECT_ID = /^[0-9a-f]{24}$/i;

/**
 * The Lesson model allows `section: null` for a standalone lesson outside any track. The list
 * groups by a title string, so those lessons share one explicit heading rather than appearing
 * under an unnamed bucket the client cannot label.
 */
const STANDALONE_SECTION = 'Standalone';

type LessonRecord = {
  _id: Types.ObjectId;
  plantId?: Types.ObjectId | null;
  slug: string;
  title: string;
  body: string;
  order?: number | null;
  estMinutes?: number | null;
  section?: string | null;
  published?: boolean;
};

type PlantRef = {
  _id: Types.ObjectId;
  slug: string;
  commonName: string;
  botanicalName: string;
  images?: readonly unknown[] | null;
};

/** Plant fields the reader inlines: the card plus the safety band, with no second request. */
type PlantDetail = {
  _id: Types.ObjectId;
  slug: string;
  commonName: string;
  botanicalName: string;
  family: string;
  partsUsed?: readonly string[] | null;
  toxicity?: string | null;
  contraindications?: string | null;
  sources?: readonly unknown[] | null;
  images?: readonly unknown[] | null;
};

const PLANT_CARD_FIELDS = 'slug commonName botanicalName images';
const PLANT_DETAIL_FIELDS =
  'slug commonName botanicalName family partsUsed toxicity contraindications sources images';

type Neighbour = { slug: string; title: string; order: number };

function callerOf(req: Request): { id: string; role: string } {
  const user = req.user;
  if (!user) throw unauthorized('Authentication required');
  return user;
}

/** Accept a 24-hex id or a slug, in either position. */
function identifierFilter(identifier: string): Record<string, unknown>[] {
  const conditions: Record<string, unknown>[] = [{ slug: identifier }];
  if (OBJECT_ID.test(identifier)) conditions.push({ _id: new Types.ObjectId(identifier) });
  return conditions;
}

function sectionLabel(section: string | null | undefined): string {
  const trimmed = section?.trim();
  return trimmed ? trimmed : STANDALONE_SECTION;
}

/**
 * Set `read: true` on the learner's Progress row for a plant and report whether THIS call is the
 * one that first flipped it (a fresh row, or an existing row going false -> true). That boolean
 * is the first-time bonus signal, so it must be false for every repeat completion.
 */
async function markPlantRead(userId: string, plantId: string): Promise<boolean> {
  // Two attempts: the retry covers the duplicate-key race described in the catch.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const existing = await Progress.findOne({ userId, plantId })
      .select('read')
      .lean<{ read?: boolean } | null>();
    const firstTime = existing?.read !== true;

    try {
      if (existing) {
        await Progress.updateOne({ userId, plantId }, { $set: { read: true } });
      } else {
        await Progress.create({ userId, plantId, read: true });
      }
      return firstTime;
    } catch (err) {
      // `(userId, plantId)` is a compound unique index, so two concurrent completions can both
      // read "no row" and both try to insert; the loser gets E11000. Re-read on the retry: by
      // then the winner's row exists with `read: true`, so firstTime comes out false and the
      // one-time bonus is never paid twice. Mongo tags a duplicate-key failure with `code: 11000`.
      const mongoError = err as { code?: number };
      if (mongoError.code !== 11000 || attempt === 1) throw err;
    }
  }
  // Unreachable: the loop either returns or rethrows on its final pass.
  return false;
}

lessonsRouter.get(
  '/lessons',
  optionalAuth,
  route(async (req, res) => {
    const callerId = req.user?.id ?? null;

    const lessons = await Lesson.find({ published: true })
      .sort({ order: 1, title: 1 })
      .lean<LessonRecord[]>();

    // Resolve completion for the whole catalogue with ONE Progress query rather than one per
    // lesson: a lesson is completed through its plant's Progress row, so the plant ids come from
    // the lessons themselves and the result is inverted into a Set for O(1) lookups. An
    // anonymous caller has no rows, so every lesson is false without a query.
    const completedPlants = new Set<string>();
    if (callerId) {
      const plantIds = [
        ...new Set(
          lessons
            .map((lesson) => lesson.plantId)
            .filter((id): id is Types.ObjectId => id instanceof Types.ObjectId)
            .map((id) => String(id)),
        ),
      ];
      if (plantIds.length > 0) {
        const rows = await Progress.find({ userId: callerId, plantId: { $in: plantIds }, read: true })
          .select('plantId')
          .lean<Array<{ plantId: Types.ObjectId }>>();
        for (const row of rows) completedPlants.add(String(row.plantId));
      }
    }

    const isCompleted = (lesson: LessonRecord): boolean =>
      lesson.plantId instanceof Types.ObjectId && completedPlants.has(String(lesson.plantId));

    // One query for every referenced plant, shared by the row's card and the icon lookup.
    const plantIdsToLoad = [
      ...new Set(
        lessons
          .map((lesson) => lesson.plantId)
          .filter((id): id is Types.ObjectId => id instanceof Types.ObjectId)
          .map((id) => String(id)),
      ),
    ];
    const plants = plantIdsToLoad.length
      ? await Plant.find({ _id: { $in: plantIdsToLoad } })
          .select(PLANT_CARD_FIELDS)
          .lean<PlantRef[]>()
      : [];
    const plantById = new Map<string, PlantRef>();
    for (const plant of plants) plantById.set(String(plant._id), plant);

    const groups: Array<{ section: string; lessons: Array<Record<string, unknown>> }> = [];
    const sections: Array<{ name: string; lessonCount: number }> = [];
    const groupBySection = new Map<string, Array<Record<string, unknown>>>();

    for (const lesson of lessons) {
      const name = sectionLabel(lesson.section);
      const plant = lesson.plantId instanceof Types.ObjectId ? plantById.get(String(lesson.plantId)) : undefined;
      const row = {
        _id: lesson._id,
        slug: lesson.slug,
        title: lesson.title,
        section: lesson.section ?? null,
        order: lesson.order ?? 0,
        estMinutes: lesson.estMinutes ?? 0,
        completed: isCompleted(lesson),
        plant: plant
          ? {
              slug: plant.slug,
              commonName: plant.commonName,
              botanicalName: plant.botanicalName,
              images: plant.images ?? [],
            }
          : null,
      };

      const bucket = groupBySection.get(name);
      if (bucket) {
        bucket.push(row);
        continue;
      }
      // First lesson seen for this section both opens the group and fixes the section order:
      // the lessons are already sorted by `order`, so appearance order is reading order.
      groupBySection.set(name, [row]);
    }

    for (const [name, groupedLessons] of groupBySection) {
      groups.push({ section: name, lessons: groupedLessons });
      sections.push({ name, lessonCount: groupedLessons.length });
    }

    // The "continue learning" affordance: the first lesson the caller has not completed, in
    // order. An anonymous caller has completed none, so the first lesson overall is the target.
    const nextLesson = callerId ? lessons.find((lesson) => !isCompleted(lesson)) : lessons[0];

    res.json({
      sections,
      groups,
      nextLesson: nextLesson ? { slug: nextLesson.slug, title: nextLesson.title } : null,
    });
  }),
);

lessonsRouter.get(
  '/lessons/:slug',
  optionalAuth,
  route(async (req, res) => {
    const identifier = req.params.slug ?? '';

    const lesson = await Lesson.findOne({ $or: identifierFilter(identifier), published: true }).lean<
      LessonRecord | null
    >();
    if (!lesson) throw notFound('Lesson not found');

    const sectionLessons = await Lesson.find({ published: true, section: lesson.section ?? null })
      .sort({ order: 1, title: 1 })
      .lean<LessonRecord[]>();

    const siblings: Neighbour[] = sectionLessons.map((entry) => ({
      slug: entry.slug,
      title: entry.title,
      order: entry.order ?? 0,
    }));

    const index = siblings.findIndex((entry) => entry.slug === lesson.slug);
    const position = { index: index < 0 ? 1 : index + 1, total: siblings.length };

    const plant =
      lesson.plantId instanceof Types.ObjectId
        ? await Plant.findById(lesson.plantId).select(PLANT_DETAIL_FIELDS).lean<PlantDetail | null>()
        : null;

    let completed = false;
    if (req.user && lesson.plantId instanceof Types.ObjectId) {
      completed = Boolean(
        await Progress.exists({ userId: req.user.id, plantId: lesson.plantId, read: true }),
      );
    }

    res.json({
      lesson: {
        _id: lesson._id,
        slug: lesson.slug,
        title: lesson.title,
        body: lesson.body,
        section: lesson.section ?? null,
        order: lesson.order ?? 0,
        estMinutes: lesson.estMinutes ?? 0,
      },
      plant,
      siblings,
      prev: index > 0 ? (siblings[index - 1] ?? null) : null,
      next: index >= 0 ? (siblings[index + 1] ?? null) : null,
      position,
      completed,
    });
  }),
);

lessonsRouter.post(
  '/lessons/:id/complete',
  requireAuth,
  route(async (req, res) => {
    const user = callerOf(req);
    const identifier = req.params.id ?? '';

    const lesson = await Lesson.findOne({ $or: identifierFilter(identifier), published: true }).lean<
      LessonRecord | null
    >();
    if (!lesson) throw notFound('Lesson not found');

    let firstTime = false;
    if (lesson.plantId instanceof Types.ObjectId) {
      // Completion is stored on the lesson's plant Progress row. `buildLearnerStats` in
      // `award.ts` derives `lessonsCompleted` from exactly this signal (Progress rows with
      // `read: true` joined back through Lesson), so the two must keep agreeing.
      firstTime = await markPlantRead(user.id, String(lesson.plantId));
    }
    // A lesson without a plantId has no Progress row to key on and the schema has no per-lesson
    // completion store, so there is nothing to be idempotent against. Report firstTime false
    // rather than inventing state the database does not hold.

    const event = {
      kind: 'complete_lesson' as const,
      lessonId: String(lesson._id),
      firstTime,
    };

    const award = await awardXp({ userId: user.id, event });
    const badgesEarned = await awardBadgesIfEarned({ userId: user.id, event });

    res.json({
      completed: true,
      xpAwarded: award.xpAwarded,
      level: award.level,
      levelUp: award.levelUp,
      badgesEarned,
    });
  }),
);
