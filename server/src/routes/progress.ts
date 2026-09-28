/**
 * Learner progress: the per-plant table, the "my progress" summary, the read-plant award, the
 * leaderboard and the per-plant SRS detail.
 *
 * Mounted at the api root by the orchestrator, so every path here is full. DECLARATION ORDER
 * MATTERS: `/progress/me`, `/progress/read` and `/progress/plant/:plantId` MUST stay above any
 * bare `/progress/:param` route, or the dynamic segment would swallow the literal paths.
 *
 * This file is the only place `Progress.read` flips false -> true and the only place the
 * "+5 read plant" award is issued; the XP itself is written by `services/award.ts`.
 */

import { Router } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';
import { Attempt, Badge, Plant, Post, Progress, User, type ProgressDoc } from '../models/index.ts';
import { route } from '../lib/asyncRoute.ts';
import { notFound } from '../lib/http.ts';
import { paginated, pagination } from '../lib/query.ts';
import { optionalAuth, requireAuth } from '../middleware/auth.ts';
import { validate } from '../middleware/validate.ts';
import { awardBadgesIfEarned, awardXp, buildLearnerStats } from '../services/award.ts';
import { isDue, masteryFor, newSrsState, previewIntervals, type SrsState } from '../services/srs.ts';
import { XP, levelProgress, type XpEvent } from '../services/xp.ts';

export const progressRouter: Router = Router();

const OBJECT_ID = /^[0-9a-f]{24}$/i;

/** Mastery at or above this counts as "mastered" on the progress summary. */
const MASTERED_AT = 4;
const MS_PER_WEEK = 7 * 86_400_000;

type LeanProgress = ProgressDoc & { _id: Types.ObjectId };

type PlantLite = {
  _id: Types.ObjectId;
  slug: string;
  commonName: string;
  botanicalName: string;
  family: string;
  partsUsed?: string[] | null;
  images?: unknown[] | null;
};

const PLANT_LITE_FIELDS = 'slug commonName botanicalName family partsUsed images';

type UserScore = { name: string; handle: string; level: number; xp: number };

/** Accept a 24-hex id or a slug, in either position. */
function identifierFilter(identifier: string): Record<string, unknown>[] {
  const conditions: Record<string, unknown>[] = [{ slug: identifier }];
  if (OBJECT_ID.test(identifier)) conditions.unshift({ _id: new Types.ObjectId(identifier) });
  return conditions;
}

async function resolvePlantLite(identifier: string): Promise<PlantLite> {
  const plant = await Plant.findOne({ $or: identifierFilter(identifier) })
    .select(PLANT_LITE_FIELDS)
    .lean<PlantLite | null>();
  if (!plant) throw notFound('Plant not found');
  return plant;
}

/** The SRS block of a progress row as a plain `SrsState` (stored dates normalised to `Date`). */
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

/** The compound unique (userId, plantId) index reports a clash as mongo code 11000. */
function isDuplicateKey(err: unknown): boolean {
  if (typeof err !== 'object' || err === null || !('code' in err)) return false;
  return err.code === 11000;
}

const progressQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).optional(),
});

progressRouter.get(
  '/progress',
  requireAuth,
  validate({ query: progressQuerySchema }),
  route(async (req, res) => {
    const caller = req.user;
    if (!caller) return;
    const query = req.query as unknown as z.infer<typeof progressQuerySchema>;
    const window = pagination(query);
    const now = new Date();

    const [rows, allRows, totalPlants] = await Promise.all([
      Progress.find({ userId: caller.id })
        .sort({ 'srs.dueAt': 1 })
        .skip(window.skip)
        .limit(window.limit)
        .lean<LeanProgress[]>(),
      // The summary describes the whole collection of rows, not the page, so it is computed from
      // a full (projected) read rather than the paged window.
      Progress.find({ userId: caller.id }).select('read mastery srs.dueAt').lean<LeanProgress[]>(),
      Plant.countDocuments({}),
    ]);

    const plantIds = rows.map((row) => row.plantId);
    const plants = plantIds.length
      ? await Plant.find({ _id: { $in: plantIds } }).select(PLANT_LITE_FIELDS).lean<PlantLite[]>()
      : [];
    const byId: Record<string, PlantLite> = {};
    for (const plant of plants) byId[String(plant._id)] = plant;

    const items = rows.map((row) => ({
      plantId: String(row.plantId),
      read: row.read ?? false,
      mastery: row.mastery ?? 0,
      srs: srsStateOf(row),
      plant: byId[String(row.plantId)] ?? null,
    }));

    // "Mastered" is mastery >= 4; `dueNow` counts the caller's own cards whose due instant has
    // already arrived. Both come from the full row set, so they stay correct while paging.
    let plantsRead = 0;
    let mastered = 0;
    let dueNow = 0;
    for (const row of allRows) {
      if (row.read) plantsRead += 1;
      if ((row.mastery ?? 0) >= MASTERED_AT) mastered += 1;
      if (row.srs?.dueAt && new Date(row.srs.dueAt).getTime() <= now.getTime()) dueNow += 1;
    }

    res.json({
      ...paginated(items, allRows.length, window.page, window.pageSize),
      summary: { plantsRead, totalPlants, mastered, dueNow },
    });
  }),
);

/**
 * Recent activity: a genuine merge of three record types the learner produced - read progress
 * rows, quiz attempts and approved posts. Each is mapped to the same `{kind, label, at, href}`
 * shape, concatenated, sorted newest-first and capped at 12, so the screen renders one timeline
 * instead of three.
 */
progressRouter.get(
  '/progress/me',
  requireAuth,
  route(async (req, res) => {
    const caller = req.user;
    if (!caller) return;

    const [user, stats, readRows, attempts, approvedPosts] = await Promise.all([
      User.findById(caller.id).select('xp level streak badges').lean<{
        xp?: number | null;
        level?: number | null;
        streak?: { current?: number | null; longest?: number | null; lastActiveAt?: Date | null } | null;
        badges?: Array<{ key: string; earnedAt: Date }> | null;
      } | null>(),
      buildLearnerStats(caller.id),
      Progress.find({ userId: caller.id, read: true })
        .sort({ updatedAt: -1 })
        .limit(12)
        .select('plantId updatedAt')
        .lean<LeanProgress[]>(),
      Attempt.find({ userId: caller.id })
        .sort({ createdAt: -1 })
        .limit(12)
        .select('quizId createdAt score total')
        .lean<Array<{ quizId: Types.ObjectId; createdAt: Date; score: number; total: number }>>(),
      Post.find({ userId: caller.id, status: 'approved' })
        .sort({ createdAt: -1 })
        .limit(12)
        .select('title createdAt')
        .lean<Array<{ title: string; createdAt: Date }>>(),
    ]);

    const readPlantIds = readRows.map((row) => row.plantId);
    const readPlants = readPlantIds.length
      ? await Plant.find({ _id: { $in: readPlantIds } }).select('slug commonName').lean<
          Array<{ _id: Types.ObjectId; slug: string; commonName: string }>
        >()
      : [];
    const readPlantById: Record<string, { slug: string; commonName: string }> = {};
    for (const plant of readPlants) readPlantById[String(plant._id)] = plant;

    type Activity = { kind: 'read' | 'quiz' | 'post'; label: string; at: Date; href: string };
    const activity: Activity[] = [];
    for (const row of readRows) {
      const plant = readPlantById[String(row.plantId)];
      activity.push({
        kind: 'read',
        label: plant ? `Read ${plant.commonName}` : 'Read a plant monograph',
        at: row.updatedAt,
        href: plant ? `/plants/${plant.slug}` : '/progress',
      });
    }
    for (const attempt of attempts) {
      activity.push({
        kind: 'quiz',
        label: `Scored ${attempt.score}/${attempt.total} on a quiz`,
        at: attempt.createdAt,
        href: `/quizzes/${String(attempt.quizId)}/result`,
      });
    }
    for (const post of approvedPosts) {
      activity.push({
        kind: 'post',
        label: `Posted "${post.title}"`,
        at: post.createdAt,
        href: '/community',
      });
    }
    activity.sort((a, b) => b.at.getTime() - a.at.getTime());

    const earnedAtByKey: Record<string, string> = {};
    for (const badge of user?.badges ?? []) earnedAtByKey[badge.key] = badge.earnedAt.toISOString();
    const badgeKeys = Object.keys(earnedAtByKey);
    const badgeDocs = badgeKeys.length
      ? await Badge.find({ key: { $in: badgeKeys } }).select('key name icon xpReward').lean<
          Array<{ key: string; name: string; icon: string; xpReward?: number | null }>
        >()
      : [];
    const badgeMetaByKey: Record<string, { name: string; icon: string; xpReward: number }> = {};
    for (const badge of badgeDocs) {
      badgeMetaByKey[badge.key] = {
        name: badge.name,
        icon: badge.icon,
        xpReward: badge.xpReward ?? 0,
      };
    }
    const badges = badgeKeys
      .filter((key) => badgeMetaByKey[key] !== undefined)
      .map((key) => {
        const meta = badgeMetaByKey[key] as { name: string; icon: string; xpReward: number };
        return { key, name: meta.name, icon: meta.icon, xpReward: meta.xpReward, earnedAt: earnedAtByKey[key] as string };
      });

    res.json({
      xp: user?.xp ?? 0,
      level: user?.level ?? 1,
      levelProgress,
      streak: {
        current: user?.streak?.current ?? 0,
        longest: user?.streak?.longest ?? 0,
        lastActiveAt: user?.streak?.lastActiveAt ?? null,
      },
      badges,
      stats,
      recentActivity: activity.slice(0, 12).map((entry) => ({ ...entry, at: entry.at.toISOString() })),
    });
  }),
);

const readBodySchema = z.object({ plantId: z.string().trim().min(1) });

progressRouter.post(
  '/progress/read',
  requireAuth,
  validate({ body: readBodySchema }),
  route(async (req, res) => {
    const caller = req.user;
    if (!caller) return;
    const { plantId } = req.body as z.infer<typeof readBodySchema>;
    const now = new Date();
    const plant = await resolvePlantLite(plantId);

    const existing = await Progress.findOne({ userId: caller.id, plantId: plant._id }).lean<
      LeanProgress | null
    >();

    if (existing?.read) {
      // The no-double-award guard lives HERE, in existing document state: a row that is already
      // `read: true` awards nothing and is returned unchanged.
      const user = await User.findById(caller.id).select('level').lean<{ level?: number } | null>();
      res.json({
        progress: existing,
        xpAwarded: 0,
        level: user?.level ?? 1,
        levelUp: false,
        badgesEarned: [],
      });
      return;
    }

    // A brand-new row is the "first time" bonus; a row whose `read` flips false -> true is not.
    const firstTime = existing === null;
    let row: LeanProgress;
    if (firstTime) {
      try {
        row = await Progress.create({
          userId: caller.id,
          plantId: plant._id,
          read: true,
          mastery: 0,
          srs: newSrsState(now),
        });
      } catch (err) {
        // The compound unique (userId, plantId) index throws when a concurrent request created
        // the row a moment ago; retry once as an upsert instead of surfacing a 500. The retry
        // cannot double-award: `firstTime` is already false for this request.
        if (!isDuplicateKey(err)) throw err;
        const upserted = await Progress.findOneAndUpdate(
          { userId: caller.id, plantId: plant._id },
          { $set: { read: true } },
          { new: true },
        ).lean<LeanProgress | null>();
        if (!upserted) throw err;
        row = upserted;
      }
    } else {
      const updated = await Progress.findOneAndUpdate(
        { _id: existing._id },
        { $set: { read: true } },
        { new: true },
      ).lean<LeanProgress | null>();
      row = updated ?? existing;
    }

    const event: XpEvent = {
      kind: 'read_plant',
      plantId: String(plant._id),
      plantFamily: plant.family,
      firstTime,
    };
    const award = await awardXp({ userId: caller.id, event, now });
    // Badges are evaluated after the XP write so the stats they score already include this read.
    const badgesEarned = await awardBadgesIfEarned({ userId: caller.id, event, now });

    res.json({
      progress: row,
      xpAwarded: award.xpAwarded,
      level: award.level,
      levelUp: award.levelUp,
      badgesEarned,
    });
  }),
);

const leaderboardQuerySchema = z.object({
  window: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.enum(['week', 'all']).default('week'),
  ),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

progressRouter.get(
  '/leaderboard',
  optionalAuth,
  validate({ query: leaderboardQuerySchema }),
  route(async (req, res) => {
    const caller = req.user;
    const query = req.query as unknown as z.infer<typeof leaderboardQuerySchema>;
    const limit = query.limit ?? 50;
    const now = new Date();

    const scoreByUser: Record<string, number> = {};
    if (query.window === 'all') {
      // All-time IS stored: `User.xp` is the running total, so it is read directly.
      const users = await User.find({ banned: { $ne: true } })
        .sort({ xp: -1 })
        .limit(limit)
        .select('name handle level xp')
        .lean<Array<{ _id: Types.ObjectId; name: string; handle: string; level?: number | null; xp?: number | null }>>();
      for (const user of users) scoreByUser[String(user._id)] = user.xp ?? 0;
    } else {
      // "This week" is NOT stored as a time series, so it is reconstructed from the records that
      // actually produced the XP in the window: every `Attempt.xpAwarded`, plus a read award for
      // each `Progress` row that is `read: true` and whose `updatedAt` falls inside the window,
      // weighted by XP.READ_PLANT. A learner whose only activity was a read older than the window
      // therefore contributes 0 to the week board - the honest answer the stored schema supports.
      const since = new Date(now.getTime() - MS_PER_WEEK);
      const [attemptRows, readRows] = await Promise.all([
        Attempt.aggregate<{ _id: Types.ObjectId; total: number }>([
          { $match: { createdAt: { $gte: since } } },
          { $group: { _id: '$userId', total: { $sum: '$xpAwarded' } } },
        ]),
        Progress.aggregate<{ _id: Types.ObjectId; count: number }>([
          { $match: { read: true, updatedAt: { $gte: since } } },
          { $group: { _id: '$userId', count: { $sum: 1 } } },
        ]),
      ]);
      for (const row of attemptRows) {
        const key = String(row._id);
        scoreByUser[key] = (scoreByUser[key] ?? 0) + row.total;
      }
      for (const row of readRows) {
        const key = String(row._id);
        scoreByUser[key] = (scoreByUser[key] ?? 0) + row.count * XP.READ_PLANT;
      }
    }

    const rankedIds = Object.keys(scoreByUser);
    const userDocs = rankedIds.length
      ? await User.find({ _id: { $in: rankedIds }, banned: { $ne: true } })
          .select('name handle level xp')
          .lean<Array<{ _id: Types.ObjectId; name: string; handle: string; level?: number | null; xp?: number | null }>>()
      : [];
    const userById: Record<string, UserScore> = {};
    for (const user of userDocs) {
      userById[String(user._id)] = {
        name: user.name,
        handle: user.handle,
        level: user.level ?? 1,
        xp: user.xp ?? 0,
      };
    }

    // Ranks are assigned by hand over the sorted array so the tie rule is readable and testable:
    // equal scores keep the insertion order and share no position, because the next row's rank is
    // always its index + 1.
    const sorted = rankedIds
      .filter((id) => userById[id] !== undefined)
      .map((id) => ({ id, score: scoreByUser[id] ?? 0 }))
      .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));

    const rows = sorted.slice(0, limit).map((entry, index) => {
      const meta = userById[entry.id] as UserScore;
      return {
        rank: index + 1,
        user: { _id: entry.id, name: meta.name, handle: meta.handle, level: meta.level, xp: meta.xp },
        isCurrentUser: caller?.id === entry.id,
        score: entry.score,
      };
    });

    const currentIndex = caller ? sorted.findIndex((entry) => entry.id === caller.id) : -1;
    res.json({
      window: query.window,
      rows,
      currentUserRank: currentIndex >= 0 ? currentIndex + 1 : null,
    });
  }),
);

progressRouter.get(
  '/progress/plant/:plantId',
  requireAuth,
  route(async (req, res) => {
    const caller = req.user;
    if (!caller) return;
    const plant = await resolvePlantLite(req.params.plantId ?? '');
    const now = new Date();

    const row = await Progress.findOne({ userId: caller.id, plantId: plant._id }).lean<
      LeanProgress | null
    >();

    // A learner with no row for this plant still gets a usable card: a fresh SRS state, mastery 0,
    // unread.
    const srs = row ? srsStateOf(row) : newSrsState(now);
    const mastery = row?.mastery ?? 0;

    res.json({
      plantId: String(plant._id),
      plant,
      read: row?.read ?? false,
      mastery,
      srs,
      due: isDue(srs, now),
      previewIntervals: previewIntervals(srs, now),
      // The four grades' resulting mastery, so the rating buttons can label what each would do
      // without re-implementing `masteryFor`.
      masteryPreview: {
        again: masteryFor(mastery, 'again'),
        hard: masteryFor(mastery, 'hard'),
        good: masteryFor(mastery, 'good'),
        easy: masteryFor(mastery, 'easy'),
      },
    });
  }),
);
