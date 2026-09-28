/**
 * Spaced-repetition scheduler (SM-2 variant; build spec section 2.6).
 *
 * Pure module: no database, no ambient clock beyond the explicit `now` argument, no I/O. The
 * flashcards route owns persistence; everything here is value-in/value-out so it can be unit
 * tested and reused (progress summaries, the four rating buttons' interval previews).
 */

export type SrsRating = 'again' | 'hard' | 'good' | 'easy';

export type SrsState = {
  ease: number;
  intervalDays: number;
  dueAt: Date;
  reps: number;
  lapses: number;
};

/** Ease floor: a lapse can never push a card below this (spec 2.6). */
export const SRS_EASE_FLOOR = 1.3;
/** Ease a freshly introduced card starts at. */
export const SRS_DEFAULT_EASE = 2.5;
/** A failed card is booked back into the same session after this many minutes. */
export const SRS_RELEARN_MINUTES = 10;

const MS_PER_DAY = 86_400_000;
const MS_PER_MINUTE = 60_000;
const MINUTES_PER_DAY = 1440;
const DAYS_PER_MONTH = 30.44;

/** Ease delta per rating. `again` also takes the lapse multiplier below. */
const EASE_DELTA: Record<SrsRating, number> = { again: -0.2, hard: -0.15, good: 0, easy: 0.15 };
/** Applied to a lapse on top of its -0.20 delta; see `nextEase` for the locked order. */
const LAPSE_EASE_MULTIPLIER = 0.8;

/** A card that has just been introduced: due immediately, at the default ease, with no history. */
export function newSrsState(now: Date = new Date()): SrsState {
  return { ease: SRS_DEFAULT_EASE, intervalDays: 0, dueAt: now, reps: 0, lapses: 0 };
}

/**
 * Ease for the next review: apply the rating's delta, then - for a lapse only - scale by 0.8,
 * then clamp to the floor.
 *
 * The composition order is the contract: delta first, multiplier second, clamp last. That is what
 * the spec's "a lapse multiplies ease by 0.8" reads as when combined with its -0.20 delta, and it
 * keeps the floor absolute because the clamp runs after both steps.
 */
function nextEase(ease: number, rating: SrsRating): number {
  const adjusted = ease + EASE_DELTA[rating];
  const scaled = rating === 'again' ? adjusted * LAPSE_EASE_MULTIPLIER : adjusted;
  return Math.max(SRS_EASE_FLOOR, scaled);
}

/**
 * Interval length for a passing review. `reps` counts the prior consecutive passes, so 0 means
 * this is the first correct review (1 day), 1 means the second (6 days), and from the third on
 * the interval compounds: previous interval times ease.
 *
 * The ease multiplied in is the POST-update one (`schedule` runs `nextEase` first) - the ordering
 * the spec fixes, and the reason this helper takes `ease` as an argument rather than reading it
 * off the state.
 */
function nextInterval(state: SrsState, ease: number): number {
  if (state.reps <= 0) return 1;
  if (state.reps === 1) return 6;
  return state.intervalDays * ease;
}

/**
 * Absolute due date a whole number of days out - plain arithmetic on days.
 *
 * The sub-day relearn case is deliberately NOT here: it is `schedule`'s special case, so this
 * function keeps one unambiguous meaning (days in, date out) for every other caller.
 */
export function dueAtFrom(intervalDays: number, now: Date): Date {
  return new Date(now.getTime() + intervalDays * MS_PER_DAY);
}

/**
 * Next state for a graded card. Pure: the returned object is always new and the input is never
 * touched.
 *
 * A lapse (`again`) resets the streak, records the lapse and books a same-day relearn: the
 * interval drops to 0 and the due date lands exactly `SRS_RELEARN_MINUTES` after `now`. That
 * minute-level choice is made here because the spec leaves the relearn step open; counting it as
 * an interval of "0 days plus a fixed due date" keeps `dueAtFrom` purely day-based.
 */
export function schedule(state: SrsState, rating: SrsRating, now: Date = new Date()): SrsState {
  const ease = nextEase(state.ease, rating);
  if (rating === 'again') {
    return {
      ease,
      intervalDays: 0,
      dueAt: new Date(now.getTime() + SRS_RELEARN_MINUTES * MS_PER_MINUTE),
      reps: 0,
      lapses: state.lapses + 1,
    };
  }
  const intervalDays = nextInterval(state, ease);
  return {
    ease,
    intervalDays,
    dueAt: dueAtFrom(intervalDays, now),
    reps: state.reps + 1,
    lapses: state.lapses,
  };
}

/** A card is due as soon as its due instant has arrived (inclusive). */
export function isDue(state: SrsState, now: Date = new Date()): boolean {
  return state.dueAt.getTime() <= now.getTime();
}

/**
 * Review-interval copy: minutes below a day, whole days below a month, otherwise months at 30.44
 * days each. The `Math.max(1, ...)` guard stops a sub-minute interval (only the relearn's interval
 * 0 reaches it) from rendering as "0m".
 */
export function intervalLabel(intervalDays: number): string {
  if (intervalDays < 1) return `${Math.max(1, Math.round(intervalDays * MINUTES_PER_DAY))}m`;
  if (intervalDays < 30) return `${Math.round(intervalDays)}d`;
  return `${(intervalDays / DAYS_PER_MONTH).toFixed(1)}mo`;
}

/** The label each of the four rating buttons would show for this card, right now. */
export function previewIntervals(state: SrsState, now: Date = new Date()): Record<SrsRating, string> {
  return {
    again: intervalLabel(schedule(state, 'again', now).intervalDays),
    hard: intervalLabel(schedule(state, 'hard', now).intervalDays),
    good: intervalLabel(schedule(state, 'good', now).intervalDays),
    easy: intervalLabel(schedule(state, 'easy', now).intervalDays),
  };
}

/**
 * Mastery (0..5) after a self-rated review: a lapse steps back one, `hard` holds, `good`/`easy`
 * advance one. Lives here so the flashcards route and the progress view share one rule.
 */
export function masteryFor(mastery: number, rating: SrsRating): number {
  if (rating === 'again') return Math.max(0, mastery - 1);
  if (rating === 'hard') return mastery;
  return Math.min(5, mastery + 1);
}
