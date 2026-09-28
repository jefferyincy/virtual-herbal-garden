/**
 * The single writer of a learner's XP, level, badges and streak.
 *
 * Every other route records what happened (an Attempt, a Progress row, a Post) and then calls
 * into here; nothing outside this file may touch `User.xp`, `User.level`, `User.badges` or
 * `User.streak`. The point is that the award table (`xpForEvent`), the level curve
 * (`levelForXp`) and the badge matcher (`evaluateBadges`) each exist exactly once, in `xp.ts`,
 * and the persistence side of them exists exactly once, here.
 *
 * Idempotency is NOT a property of this service: `awardXp` is a pure award path and will add the
 * points every time it is called. The guard lives in the caller, in the shape of existing
 * document state - a `Progress` row being created for the first time (first-time bonus), `read`
 * flipping false -> true (the only +5), a `User.badges` key that is already present. Callers must
 * establish that state atomically before calling here.
 */
import { Types } from 'mongoose';
import { Attempt } from '../models/Attempt.ts';
import { Badge, type BadgeDoc } from '../models/Badge.ts';
import { Lesson } from '../models/Lesson.ts';
import { Plant } from '../models/Plant.ts';
import { Post } from '../models/Post.ts';
import { Progress } from '../models/Progress.ts';
import { User } from '../models/User.ts';
import { badRequest } from '../lib/http.ts';
import { notify } from '../routes/notifications.ts';
import {
  evaluateBadges,
  levelForXp,
  xpForEvent,
  type BadgeRule,
  type LearnerStats,
  type XpEvent,
} from './xp.ts';

/**
 * A quiz is "passed" at 70% of its questions answered correctly. Lives here because both the
 * learner stats below and the quiz lock rule in `quizzes.ts` compare a ratio against it.
 */
export const QUIZ_PASS_RATIO = 0.7;

const MS_PER_HOUR = 3_600_000;
/** A day's activity keeps the streak; a gap past this restarts it. */
const STREAK_KEEP_HOURS = 24;
const STREAK_BREAK_HOURS = 48;

/** One `$group` over `Attempt`: best ratio per quiz for one learner. */
type QuizBest = { _id: Types.ObjectId; best: number };

/**
 * The real numbers `evaluateBadges` scores a learner against, read straight from the documents
 * that recorded the activity. The attempts and lesson lookups are single queries (an aggregation
 * and a `$in`) rather than per-row loops, so this stays O(1) round trips as history grows.
 */
export async function buildLearnerStats(userId: string): Promise<LearnerStats> {
  const user = await User.findById(userId).select('streak followedPlants badges').lean<{
    streak?: { current?: number | null } | null;
    followedPlants?: Types.ObjectId[] | null;
    badges?: Array<{ key: string }> | null;
  } | null>();
  const uid = new Types.ObjectId(userId);

  const readRows = await Progress.find({ userId: uid, read: true })
    .select('plantId')
    .lean<Array<{ plantId: Types.ObjectId }>>();
  const plantIds = readRows.map((row) => row.plantId);

  const [domainBest, approvedPosts, lessonRows, plants] = await Promise.all([
    Attempt.aggregate<QuizBest>([
      { $match: { userId: uid } },
      // Guard against a malformed Attempt (total 0) before dividing, so one bad row cannot make
      // the whole `$max` NaN and silently zero out `bestQuizPct`.
      {
        $project: {
          quizId: 1,
          ratio: { $cond: [{ $gt: ['$total', 0] }, { $divide: ['$score', '$total'] }, 0] },
        },
      },
      { $group: { _id: '$quizId', best: { $max: '$ratio' } } },
    ]),
    Post.countDocuments({ userId: uid, status: 'approved' }),
    // Which of the learner's read plants actually have a lesson. The seed creates exactly one
    // lesson per plant, so "read plants whose plant has a lesson" is a faithful count of completed
    // lessons; this is the same figure the quiz-lock rule in `quizzes.ts` derives
    // (`completedLessonCount`), and the two must agree or a learner could unlock a quiz they
    // appear not to qualify for.
    Lesson.find({ plantId: { $in: plantIds } })
      .select('plantId')
      .lean<Array<{ plantId: Types.ObjectId | null }>>(),
    Plant.find({ _id: { $in: plantIds } })
      .select('family')
      .lean<Array<{ _id: Types.ObjectId; family?: string | null }>>(),
  ]);

  const plantsReadByFamily: Record<string, number> = {};
  const familyById = new Map<string, string>();
  for (const plant of plants) familyById.set(String(plant._id), plant.family ?? '');
  for (const row of readRows) {
    const family = familyById.get(String(row.plantId));
    if (!family) continue;
    plantsReadByFamily[family] = (plantsReadByFamily[family] ?? 0) + 1;
  }

  const lessonPlantIds = new Set<string>();
  for (const row of lessonRows) {
    if (row.plantId) lessonPlantIds.add(String(row.plantId));
  }
  let lessonsCompleted = 0;
  for (const row of readRows) {
    if (lessonPlantIds.has(String(row.plantId))) lessonsCompleted += 1;
  }

  const bestRatios = domainBest.map((row) => row.best);
  const quizzesPassed = bestRatios.filter((ratio) => ratio >= QUIZ_PASS_RATIO).length;
  const bestRatio = bestRatios.length > 0 ? Math.max(...bestRatios) : 0;

  return {
    plantsRead: readRows.length,
    plantsReadByFamily,
    lessonsCompleted,
    quizzesPassed,
    bestQuizPct: Math.round(bestRatio * 100),
    streakDays: user?.streak?.current ?? 0,
    postsApproved: approvedPosts,
    followedPlants: (user?.followedPlants ?? []).length,
    badgesEarned: (user?.badges ?? []).map((badge) => badge.key),
  };
}

/**
 * Streak after activity at `now`. A gap of up to 48h continues the run (so one missed day still
 * counts), past 48h it restarts, and with no prior activity it starts at 1.
 */
function nextStreak(
  streak: { current?: number | null; longest?: number | null; lastActiveAt?: Date | null } | null | undefined,
  now: Date,
): { current: number; longest: number } {
  const prior = streak?.current ?? 0;
  const last = streak?.lastActiveAt ? new Date(streak.lastActiveAt).getTime() : null;
  if (last === null) return { current: 1, longest: 1 };

  const gapHours = (now.getTime() - last) / MS_PER_HOUR;
  let current: number;
  if (gapHours > STREAK_BREAK_HOURS) current = 1;
  else if (gapHours > STREAK_KEEP_HOURS) current = prior + 1;
  else current = Math.max(1, prior);

  return { current, longest: Math.max(streak?.longest ?? 0, current) };
}

/**
 * Award the XP an event is worth and advance the level and streak in the same write. Returns the
 * points added, the new totals and whether the call crossed a level boundary.
 */
export async function awardXp(params: {
  userId: string;
  event: XpEvent;
  now?: Date;
}): Promise<{ xpAwarded: number; xp: number; level: number; levelUp: boolean }> {
  const now = params.now ?? new Date();
  const xpAwarded = xpForEvent(params.event);
  if (!Number.isFinite(xpAwarded) || xpAwarded < 0) {
    throw badRequest('Computed XP award must be a non-negative finite number');
  }

  const uid = new Types.ObjectId(params.userId);
  const current = await User.findById(uid).select('xp level streak').lean<{
    xp?: number | null;
    level?: number | null;
    streak?: { current?: number | null; longest?: number | null; lastActiveAt?: Date | null } | null;
  } | null>();
  if (!current) throw badRequest('User not found');

  const priorXp = current.xp ?? 0;
  const newXp = priorXp + xpAwarded;
  const level = levelForXp(newXp);
  const { current: currentStreak, longest } = nextStreak(current.streak, now);
  const streak = { current: currentStreak, longest, lastActiveAt: now };

  // `$inc` and a recomputed level in the SAME update is what keeps the pair consistent under
  // concurrency: the increments are applied atomically by mongod, and the level is derived from
  // the document's own new total, so two simultaneous awards cannot leave `level` trailing `xp`.
  await User.updateOne(
    { _id: uid },
    {
      $inc: { xp: xpAwarded },
      $set: { level, streak },
    },
  );

  return { xpAwarded, xp: newXp, level, levelUp: level > (current.level ?? levelForXp(priorXp)) };
}

/**
 * Evaluate the active badge rules against the learner's current stats and persist any newly
 * earned ones. Returns the rules that were earned by this call.
 *
 * Badge evaluation runs AFTER the XP write in a request (callers call `awardXp` first), so a badge
 * can never be granted against stale stats - the stats read here already include the action that
 * just happened.
 */
export async function awardBadgesIfEarned(params: {
  userId: string;
  event: XpEvent | null;
  now?: Date;
}): Promise<BadgeRule[]> {
  const now = params.now ?? new Date();
  const badges = await Badge.find({ active: true }).lean<Array<BadgeDoc & { _id: Types.ObjectId }>>();
  if (badges.length === 0) return [];

  // `criteria` is required by the schema (`action` and `target` are required paths), but mongoose
  // types the nested subdocument as possibly absent, so a document that somehow lacks it is
  // skipped rather than poisoning the whole evaluation with a crash.
  const rules: BadgeRule[] = [];
  for (const badge of badges) {
    const criteria = badge.criteria;
    if (!criteria) continue;
    rules.push({
      key: badge.key,
      action: criteria.action,
      target: criteria.target,
      param: criteria.param ?? null,
      xpReward: badge.xpReward ?? 0,
    });
  }
  const stats = await buildLearnerStats(params.userId);
  const earned = evaluateBadges(rules, stats, params.event);
  if (earned.length === 0) return [];

  const byKey = new Map(badges.map((badge) => [badge.key, badge]));
  const uid = new Types.ObjectId(params.userId);

  for (const rule of earned) {
    const badge = byKey.get(rule.key);
    if (!badge) continue;

    // `$addToSet` on the badge key IS the no-double-award guarantee: two concurrent requests for
    // the same learner both run this update, but only the first actually adds the element. The
    // `badges.key` predicate then makes the reward fire exactly once - the second request matches
    // no document, so its `$inc` is a no-op.
    const rewarded = await User.findOneAndUpdate(
      { _id: uid, 'badges.key': { $ne: rule.key } },
      { $addToSet: { badges: { key: rule.key, earnedAt: now } }, $inc: { xp: rule.xpReward } },
      { new: true, projection: 'xp' },
    ).lean<{ xp?: number | null } | null>();
    if (!rewarded) continue;

    // Level is derived from the post-increment total returned by the same atomic write, so the
    // `xp`/`level` pair stays consistent even when two badges land at once.
    await User.updateOne({ _id: uid }, { $set: { level: levelForXp(rewarded.xp ?? 0) } });

    await notify(params.userId, {
      type: 'badge',
      title: `Badge earned: ${badge.name}`,
      body: badge.description || `You earned the ${badge.name} badge.`,
      href: '/progress',
      badgeKey: badge.key,
    });
  }

  return earned;
}
