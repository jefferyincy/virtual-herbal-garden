/**
 * XP, levels and badge triggers (build spec section 2.6).
 *
 * Pure module: no database, no I/O, no ambient clock. Routes pass in the event they just recorded
 * plus a stats snapshot and persist whatever comes back; identical inputs always produce identical
 * output and nothing here mutates its arguments.
 */
import type { BadgeAction } from '../models/enums.ts';

/** Award table for XP-earning actions. */
export const XP = {
  READ_PLANT: 5,
  LESSON_COMPLETE: 20,
  QUIZ_CORRECT: 1,
  FIRST_TIME_BONUS: 10,
  CONTRIBUTE_POST: 10,
} as const;

export type XpEvent =
  | { kind: 'read_plant'; plantId: string; plantFamily: string; firstTime: boolean }
  | { kind: 'complete_lesson'; lessonId: string; firstTime: boolean }
  | {
      kind: 'quiz_attempt';
      quizId: string;
      correctCount: number;
      totalCount: number;
      passed: boolean;
      firstPass: boolean;
      previousBestPct: number | null;
      scorePct: number;
    }
  | { kind: 'contribute_post'; postId: string };

export type BadgeRule = {
  key: string;
  action: BadgeAction;
  target: number;
  param?: string | null;
  xpReward: number;
};

export type LearnerStats = {
  plantsRead: number;
  plantsReadByFamily: Record<string, number>;
  lessonsCompleted: number;
  quizzesPassed: number;
  bestQuizPct: number;
  streakDays: number;
  postsApproved: number;
  followedPlants: number;
  badgesEarned: string[];
};

/**
 * Level curve `floor(sqrt(xp / 100)) + 1`: 0 -> 1, 100 -> 2, 400 -> 3, 900 -> 4.
 *
 * Negative and non-finite input is clamped to level 1 rather than producing NaN, so a corrupt or
 * not-yet-computed xp value can never leak into a response or a badge calculation.
 */
export function levelForXp(xp: number): number {
  if (!Number.isFinite(xp) || xp < 0) return 1;
  return Math.floor(Math.sqrt(xp / 100)) + 1;
}

/** Total xp needed to reach `level`, the inverse of `levelForXp` at each boundary. */
export function xpForLevel(level: number): number {
  if (!Number.isFinite(level) || level <= 1) return 0;
  return 100 * (level - 1) ** 2;
}

/** Where `xp` sits inside its level's band, for the progress bar. */
export function levelProgress(xp: number): { level: number; intoLevel: number; span: number; pct: number } {
  const safeXp = Number.isFinite(xp) && xp > 0 ? xp : 0;
  const level = levelForXp(safeXp);
  const floor = xpForLevel(level);
  const span = xpForLevel(level + 1) - floor;
  const intoLevel = safeXp - floor;
  const pct = Math.min(1, Math.max(0, intoLevel / span));
  return { level, intoLevel, span, pct };
}

/** XP awarded for a single event, before any badge rewards. */
export function xpForEvent(event: XpEvent): number {
  switch (event.kind) {
    case 'read_plant':
      return XP.READ_PLANT + (event.firstTime ? XP.FIRST_TIME_BONUS : 0);
    case 'complete_lesson':
      return XP.LESSON_COMPLETE + (event.firstTime ? XP.FIRST_TIME_BONUS : 0);
    case 'quiz_attempt':
      if (!event.passed) return 0;
      return event.correctCount * XP.QUIZ_CORRECT + (event.firstPass ? XP.FIRST_TIME_BONUS : 0);
    case 'contribute_post':
      return XP.CONTRIBUTE_POST;
  }
}

/** Whether one rule's criteria are already satisfied by `stats`. */
function ruleSatisfied(rule: BadgeRule, stats: LearnerStats): boolean {
  switch (rule.action) {
    case 'read_plant':
      return stats.plantsRead >= rule.target;
    case 'complete_lesson':
      return stats.lessonsCompleted >= rule.target;
    case 'complete_quiz':
      return stats.quizzesPassed >= rule.target;
    case 'quiz_pass_rate':
      return stats.bestQuizPct >= rule.target;
    case 'streak_days':
      return stats.streakDays >= rule.target;
    // A family rule without a usable param can never match: an empty family name would otherwise
    // read `plantsReadByFamily['']`, which is 0 for everyone and would silently award the badge.
    case 'read_plant_family':
      if (rule.param === undefined || rule.param === null || rule.param === '') return false;
      return (stats.plantsReadByFamily[rule.param] ?? 0) >= rule.target;
    case 'contribute_post':
      return stats.postsApproved >= rule.target;
    case 'follow_plant':
      return stats.followedPlants >= rule.target;
    // `earn_badge` is a meta criterion (N badges already earned), which this function does not
    // receive; it is evaluated by the badge route and never matches here.
    case 'earn_badge':
      return false;
  }
}

/**
 * Rules newly satisfied by this learner, excluding any whose key is already in
 * `stats.badgesEarned` - the no-double-award rule. `event` is accepted for callers that grade a
 * badge against the action just recorded; the criteria themselves all live in `stats`, so the
 * result stays a pure function of the snapshot.
 */
export function evaluateBadges(rules: BadgeRule[], stats: LearnerStats, event: XpEvent | null): BadgeRule[] {
  // `event` is part of the call contract so a route can pass the action it just recorded, but no
  // criterion is evaluated against it: every threshold lives in `stats`, which is what keeps the
  // result a pure function of the snapshot. (Marked used rather than dropped so the signature the
  // spec names stays intact under `noUnusedParameters`.)
  void event;
  const earned = new Set(stats.badgesEarned);
  const matched: BadgeRule[] = [];
  for (const rule of rules) {
    if (earned.has(rule.key)) continue;
    if (!ruleSatisfied(rule, stats)) continue;
    matched.push({ ...rule });
  }
  return matched;
}
