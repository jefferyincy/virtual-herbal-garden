/**
 * Behavioural tests for the SM-2 scheduler. Pure module, so every case drives an explicit `now`
 * and asserts exact numbers rather than "it grew" - the interval ladder, the ease composition on
 * a lapse and the relearn due instant are all contracts other code reads back.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  SRS_DEFAULT_EASE,
  SRS_EASE_FLOOR,
  SRS_RELEARN_MINUTES,
  dueAtFrom,
  intervalLabel,
  isDue,
  masteryFor,
  newSrsState,
  previewIntervals,
  schedule,
  type SrsRating,
  type SrsState,
} from './srs.ts';

const NOW = new Date('2026-01-01T00:00:00.000Z');
const MS_PER_DAY = 86_400_000;

describe('newSrsState', () => {
  it('starts due now, at the default ease, with no history', () => {
    const state = newSrsState(NOW);
    assert.deepEqual(state, {
      ease: SRS_DEFAULT_EASE,
      intervalDays: 0,
      dueAt: NOW,
      reps: 0,
      lapses: 0,
    });
    assert.equal(state.ease, 2.5);
    assert.equal(state.intervalDays, 0);
    assert.equal(state.reps, 0);
    assert.equal(state.lapses, 0);
    // Same instant: a brand-new card is immediately reviewable.
    assert.equal(isDue(state, NOW), true);
  });

  it('defaults `now` to the current instant', () => {
    const before = Date.now();
    const state = newSrsState();
    const after = Date.now();
    assert.ok(state.dueAt.getTime() >= before && state.dueAt.getTime() <= after);
  });
});

describe('schedule - correct streak', () => {
  it('walks 1 day, 6 days, then previous * post-update ease', () => {
    let state = newSrsState(NOW);

    state = schedule(state, 'good', NOW);
    assert.equal(state.intervalDays, 1);
    assert.equal(state.ease, 2.5);
    assert.equal(state.reps, 1);
    assert.equal(state.dueAt.getTime(), NOW.getTime() + MS_PER_DAY);

    state = schedule(state, 'good', NOW);
    assert.equal(state.intervalDays, 6);
    assert.equal(state.ease, 2.5);
    assert.equal(state.reps, 2);
    assert.equal(state.dueAt.getTime(), NOW.getTime() + 6 * MS_PER_DAY);

    // Third pass compounds: 6 * 2.5 = 15.
    state = schedule(state, 'good', NOW);
    assert.equal(state.intervalDays, 15);
    assert.equal(state.reps, 3);

    // Fourth: 15 * 2.5 = 37.5.
    state = schedule(state, 'good', NOW);
    assert.equal(state.intervalDays, 37.5);
    assert.equal(state.reps, 4);
    assert.equal(state.lapses, 0);
  });

  it('uses the post-update ease when compounding', () => {
    // Two passes at default ease, then an `easy` third: interval = 6 * (2.5 + 0.15) = 15.9.
    let state = newSrsState(NOW);
    state = schedule(state, 'good', NOW);
    state = schedule(state, 'good', NOW);
    state = schedule(state, 'easy', NOW);
    assert.equal(state.ease, 2.65);
    assert.equal(state.intervalDays, 6 * 2.65);
  });
});

describe('schedule - ease movement', () => {
  it('moves ease in the documented direction per rating', () => {
    const base = newSrsState(NOW);
    assert.equal(schedule(base, 'good', NOW).ease, 2.5);
    assert.equal(schedule(base, 'hard', NOW).ease, 2.35);
    assert.equal(schedule(base, 'easy', NOW).ease, 2.65);
    // Lapse: (-0.20 delta, then * 0.8) = 2.5 - 0.2 = 2.3, * 0.8 = 1.84. Compared at 4 dp
    // because the multiplication lands on 1.8399999999999999 in binary floating point.
    assert.equal(Number(schedule(base, 'again', NOW).ease.toFixed(4)), 1.84);
  });

  it('never lets repeated lapses push ease below the floor', () => {
    let state = newSrsState(NOW);
    const values: number[] = [];
    for (let i = 0; i < 4; i += 1) {
      state = schedule(state, 'again', NOW);
      values.push(Number(state.ease.toFixed(4)));
    }
    // 2.5 -> 1.84 -> 1.312 -> floor(1.3) -> floor(1.3).
    assert.deepEqual(values, [1.84, 1.312, SRS_EASE_FLOOR, SRS_EASE_FLOOR]);
    assert.equal(state.ease, 1.3);
    assert.equal(state.ease >= SRS_EASE_FLOOR, true);
  });

  it('clamps a hard rating to the floor too', () => {
    let state: SrsState = { ease: SRS_EASE_FLOOR, intervalDays: 3, dueAt: NOW, reps: 4, lapses: 0 };
    state = schedule(state, 'hard', NOW);
    assert.equal(state.ease, SRS_EASE_FLOOR);
  });
});

describe('schedule - lapse', () => {
  it('resets reps, records the lapse and books a same-day relearn', () => {
    const mature: SrsState = {
      ease: 2.5,
      intervalDays: 15,
      dueAt: dueAtFrom(15, NOW),
      reps: 5,
      lapses: 2,
    };
    const next = schedule(mature, 'again', NOW);
    assert.equal(next.reps, 0);
    assert.equal(next.lapses, 3);
    assert.equal(next.intervalDays, 0);
    assert.equal(next.dueAt.getTime(), NOW.getTime() + SRS_RELEARN_MINUTES * 60_000);
    assert.equal(SRS_RELEARN_MINUTES, 10);
  });

  it('restarts the ladder after a lapse', () => {
    let state = newSrsState(NOW);
    state = schedule(state, 'good', NOW);
    state = schedule(state, 'good', NOW);
    assert.equal(state.intervalDays, 6);

    state = schedule(state, 'again', NOW);
    assert.equal(state.intervalDays, 0);

    state = schedule(state, 'good', NOW);
    assert.equal(state.intervalDays, 1);
    state = schedule(state, 'good', NOW);
    assert.equal(state.intervalDays, 6);
  });

  it('labels the relearn interval as minutes', () => {
    const lapsed = schedule(newSrsState(NOW), 'again', NOW);
    assert.equal(intervalLabel(lapsed.intervalDays), '1m');
  });
});

describe('dueAtFrom / isDue', () => {
  it('adds whole days to the instant', () => {
    assert.equal(dueAtFrom(0, NOW).getTime(), NOW.getTime());
    assert.equal(dueAtFrom(6, NOW).getTime(), NOW.getTime() + 6 * MS_PER_DAY);
    assert.equal(dueAtFrom(0.5, NOW).getTime(), NOW.getTime() + MS_PER_DAY / 2);
  });

  it('rolls over exactly at the due instant', () => {
    const state = schedule(newSrsState(NOW), 'good', NOW);
    const sixDays = schedule(state, 'good', NOW);
    assert.equal(sixDays.intervalDays, 6);

    const justBefore = new Date(sixDays.dueAt.getTime() - 1000);
    assert.equal(isDue(sixDays, justBefore), false);
    assert.equal(isDue(sixDays, sixDays.dueAt), true);
  });

  it('defaults `now` to the current instant', () => {
    const past = new Date(Date.now() - 1000);
    assert.equal(isDue({ ...newSrsState(past), dueAt: past }), true);
    const future = new Date(Date.now() + 60_000);
    assert.equal(isDue({ ...newSrsState(future), dueAt: future }), false);
  });
});

describe('purity', () => {
  it('never mutates the input state', () => {
    const state: SrsState = Object.freeze({
      ease: 2.5,
      intervalDays: 15,
      dueAt: dueAtFrom(15, NOW),
      reps: 5,
      lapses: 2,
    });
    const snapshot = { ...state, dueAt: new Date(state.dueAt.getTime()) };

    const pass = schedule(state, 'good', NOW);
    const lapse = schedule(state, 'again', NOW);
    assert.equal(pass.intervalDays, 37.5);
    assert.equal(lapse.intervalDays, 0);

    assert.notEqual(pass, state);
    assert.notEqual(lapse, state);
    assert.deepEqual(state, snapshot);
    assert.notEqual(pass.dueAt, state.dueAt);
  });

  it('is deterministic for identical inputs', () => {
    const state = newSrsState(NOW);
    assert.deepEqual(schedule(state, 'easy', NOW), schedule(state, 'easy', NOW));
  });
});

describe('previewIntervals', () => {
  it('returns one label per rating, each matching a direct schedule', () => {
    const ratings: SrsRating[] = ['again', 'hard', 'good', 'easy'];
    const state = newSrsState(NOW);
    const preview = previewIntervals(state, NOW);

    assert.deepEqual(Object.keys(preview).sort(), [...ratings].sort());
    for (const rating of ratings) {
      assert.equal(preview[rating], intervalLabel(schedule(state, rating, NOW).intervalDays));
    }
    // New card: every review is a first review, so all three passes land on "1d".
    assert.deepEqual(preview, { again: '1m', hard: '1d', good: '1d', easy: '1d' });
  });

  it('does not mutate the state it previews', () => {
    const state: SrsState = Object.freeze({
      ease: 2.5,
      intervalDays: 6,
      dueAt: dueAtFrom(6, NOW),
      reps: 2,
      lapses: 0,
    });
    const preview = previewIntervals(state, NOW);
    // 6 * 2.35 = 14.1 -> "14d"; 6 * 2.5 = 15 -> "15d"; 6 * 2.65 = 15.9 -> "16d".
    assert.equal(preview.hard, '14d');
    assert.equal(preview.good, '15d');
    assert.equal(preview.easy, '16d');
    assert.equal(state.intervalDays, 6);
    assert.equal(state.reps, 2);
  });
});

describe('intervalLabel', () => {
  it('formats minutes, days and months at their boundaries', () => {
    assert.equal(intervalLabel(0.007), '10m');
    assert.equal(intervalLabel(0), '1m');
    assert.equal(intervalLabel(0.9999), '1440m');
    assert.equal(intervalLabel(1), '1d');
    assert.equal(intervalLabel(29), '29d');
    assert.equal(intervalLabel(30), '1.0mo');
    assert.equal(intervalLabel(60), '2.0mo');
    assert.equal(intervalLabel(365), '12.0mo');
  });
});

describe('masteryFor', () => {
  it('floors at 0, caps at 5 and holds on hard', () => {
    assert.equal(masteryFor(0, 'again'), 0);
    assert.equal(masteryFor(3, 'again'), 2);
    assert.equal(masteryFor(5, 'again'), 4);
    assert.equal(masteryFor(5, 'good'), 5);
    assert.equal(masteryFor(5, 'easy'), 5);
    assert.equal(masteryFor(3, 'hard'), 3);
    assert.equal(masteryFor(3, 'good'), 4);
    assert.equal(masteryFor(3, 'easy'), 4);
    assert.equal(masteryFor(0, 'good'), 1);
  });
});
