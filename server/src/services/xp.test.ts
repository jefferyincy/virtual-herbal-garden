/**
 * Behavioural tests for the XP / level / badge service. Pure module: every case builds an explicit
 * stats snapshot and event, then pins the exact award, level or rule set - the level curve and the
 * no-double-award rule are read back by the progress and notification screens.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BADGE_ACTIONS } from '../models/enums.ts';
import {
  XP,
  evaluateBadges,
  levelForXp,
  levelProgress,
  xpForEvent,
  xpForLevel,
  type BadgeRule,
  type LearnerStats,
  type XpEvent,
} from './xp.ts';

function makeStats(overrides: Partial<LearnerStats> = {}): LearnerStats {
  return {
    plantsRead: 0,
    plantsReadByFamily: {},
    lessonsCompleted: 0,
    quizzesPassed: 0,
    bestQuizPct: 0,
    streakDays: 0,
    postsApproved: 0,
    followedPlants: 0,
    badgesEarned: [],
    ...overrides,
  };
}

function rule(overrides: Partial<BadgeRule> & Pick<BadgeRule, 'key' | 'action'>): BadgeRule {
  return { target: 1, xpReward: 25, ...overrides };
}

describe('level curve', () => {
  it('maps xp thresholds to levels', () => {
    assert.equal(levelForXp(0), 1);
    assert.equal(levelForXp(99), 1);
    assert.equal(levelForXp(100), 2);
    assert.equal(levelForXp(399), 2);
    assert.equal(levelForXp(400), 3);
    assert.equal(levelForXp(899), 3);
    assert.equal(levelForXp(900), 4);
  });

  it('has xpForLevel as the inverse at each boundary', () => {
    assert.equal(xpForLevel(1), 0);
    assert.equal(xpForLevel(2), 100);
    assert.equal(xpForLevel(3), 400);
    assert.equal(xpForLevel(4), 900);
    for (const level of [1, 2, 3, 4, 5]) {
      assert.equal(levelForXp(xpForLevel(level)), level);
    }
  });

  it('keeps xp inside its level band across a spread of values', () => {
    for (let x = 0; x <= 1200; x += 7) {
      const level = levelForXp(x);
      assert.ok(
        xpForLevel(level) <= x && x < xpForLevel(level + 1),
        `xp ${x} escaped level ${level}`,
      );
    }
  });

  it('clamps negative and non-finite xp to level 1 without NaN', () => {
    for (const bad of [-1, -1000, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      const level = levelForXp(bad);
      assert.equal(level, 1);
      assert.equal(Number.isNaN(level), false);
    }
    assert.equal(xpForLevel(Number.NaN), 0);
    assert.equal(xpForLevel(-3), 0);
    assert.equal(xpForLevel(Number.POSITIVE_INFINITY), 0);
  });
});

describe('levelProgress', () => {
  it('reports the band and a fractional position', () => {
    // Level 1 spans 0..99 (span = 100 - 0 = 100); level 2 spans 100..399 (400 - 100 = 300).
    assert.deepEqual(levelProgress(0), { level: 1, intoLevel: 0, span: 100, pct: 0 });
    assert.deepEqual(levelProgress(100), { level: 2, intoLevel: 0, span: 300, pct: 0 });
    assert.deepEqual(levelProgress(250), { level: 2, intoLevel: 150, span: 300, pct: 0.5 });
    assert.deepEqual(levelProgress(400), { level: 3, intoLevel: 0, span: 500, pct: 0 });
    // One point before the next boundary: the bar is essentially full but still inside the band.
    const nearTop = levelProgress(399);
    assert.equal(nearTop.level, 2);
    assert.equal(nearTop.intoLevel, 299);
    assert.equal(nearTop.pct, 299 / 300);
  });

  it('keeps intoLevel + xpForLevel(level) === xp and pct within 0..1', () => {
    for (const xp of [0, 1, 99, 100, 250, 399, 400, 900, 1234, 10_000]) {
      const progress = levelProgress(xp);
      assert.equal(progress.intoLevel + xpForLevel(progress.level), xp);
      assert.ok(progress.pct >= 0 && progress.pct <= 1, `pct ${progress.pct} out of range`);
      assert.ok(progress.span > 0);
    }
  });

  it('clamps negative and non-finite xp to the bottom of level 1', () => {
    for (const bad of [-5, Number.NaN, Number.POSITIVE_INFINITY]) {
      const progress = levelProgress(bad);
      assert.equal(progress.level, 1);
      assert.equal(progress.intoLevel, 0);
      assert.equal(progress.pct, 0);
      assert.equal(Number.isNaN(progress.pct), false);
    }
  });

  it('never returns a pct above 1 even for huge xp', () => {
    const progress = levelProgress(1_000_000);
    assert.ok(progress.pct <= 1);
    assert.equal(progress.intoLevel + xpForLevel(progress.level), 1_000_000);
  });
});

describe('xpForEvent', () => {
  it('awards read-plant xp, with the first-time bonus once', () => {
    const base = { kind: 'read_plant', plantId: 'p1', plantFamily: 'lamiaceae' } as const;
    assert.equal(xpForEvent({ ...base, firstTime: true }), XP.READ_PLANT + XP.FIRST_TIME_BONUS);
    assert.equal(xpForEvent({ ...base, firstTime: true }), 15);
    assert.equal(xpForEvent({ ...base, firstTime: false }), XP.READ_PLANT);
    assert.equal(xpForEvent({ ...base, firstTime: false }), 5);
  });

  it('awards lesson xp, with the first-time bonus once', () => {
    const base = { kind: 'complete_lesson', lessonId: 'l1' } as const;
    assert.equal(xpForEvent({ ...base, firstTime: true }), 30);
    assert.equal(xpForEvent({ ...base, firstTime: false }), 20);
  });

  it('awards nothing for a failed quiz', () => {
    assert.equal(
      xpForEvent({
        kind: 'quiz_attempt',
        quizId: 'q1',
        correctCount: 4,
        totalCount: 10,
        passed: false,
        firstPass: false,
        previousBestPct: null,
        scorePct: 40,
      }),
      0,
    );
  });

  it('awards one xp per correct answer on a pass', () => {
    assert.equal(
      xpForEvent({
        kind: 'quiz_attempt',
        quizId: 'q1',
        correctCount: 7,
        totalCount: 10,
        passed: true,
        firstPass: false,
        previousBestPct: 60,
        scorePct: 70,
      }),
      7,
    );
    assert.equal(XP.QUIZ_CORRECT, 1);
  });

  it('adds the bonus on a first pass', () => {
    assert.equal(
      xpForEvent({
        kind: 'quiz_attempt',
        quizId: 'q1',
        correctCount: 7,
        totalCount: 10,
        passed: true,
        firstPass: true,
        previousBestPct: 60,
        scorePct: 70,
      }),
      17,
    );
  });

  it('awards a flat amount for an approved contribution', () => {
    assert.equal(xpForEvent({ kind: 'contribute_post', postId: 'post1' }), 10);
    assert.equal(XP.READ_PLANT, 5);
    assert.equal(XP.LESSON_COMPLETE, 20);
    assert.equal(XP.FIRST_TIME_BONUS, 10);
    assert.equal(XP.CONTRIBUTE_POST, 10);
  });
});

describe('evaluateBadges - triggers', () => {
  const readPlants = rule({ key: 'reader_10', action: 'read_plant', target: 10, xpReward: 50 });

  it('awards at exactly the target and not one below', () => {
    assert.deepEqual(evaluateBadges([readPlants], makeStats({ plantsRead: 10 }), null), [readPlants]);
    assert.deepEqual(evaluateBadges([readPlants], makeStats({ plantsRead: 9 }), null), []);
    assert.deepEqual(evaluateBadges([readPlants], makeStats({ plantsRead: 11 }), null), [readPlants]);
  });

  it('applies the same boundary to lesson completion', () => {
    const lessons = rule({ key: 'scholar_5', action: 'complete_lesson', target: 5 });
    assert.deepEqual(evaluateBadges([lessons], makeStats({ lessonsCompleted: 5 }), null), [lessons]);
    assert.deepEqual(evaluateBadges([lessons], makeStats({ lessonsCompleted: 4 }), null), []);
  });

  it('compares quiz counters and the pass rate against their own stats', () => {
    const quizzes = rule({ key: 'quiz_3', action: 'complete_quiz', target: 3 });
    assert.deepEqual(evaluateBadges([quizzes], makeStats({ quizzesPassed: 3 }), null), [quizzes]);
    assert.deepEqual(evaluateBadges([quizzes], makeStats({ quizzesPassed: 2 }), null), []);

    const rate = rule({ key: 'ace', action: 'quiz_pass_rate', target: 80 });
    assert.deepEqual(evaluateBadges([rate], makeStats({ bestQuizPct: 80 }), null), [rate]);
    assert.deepEqual(evaluateBadges([rate], makeStats({ bestQuizPct: 79.9 }), null), []);
  });

  it('compares streak, approved posts and followed plants', () => {
    const streak = rule({ key: 'streak_7', action: 'streak_days', target: 7 });
    assert.deepEqual(evaluateBadges([streak], makeStats({ streakDays: 7 }), null), [streak]);
    assert.deepEqual(evaluateBadges([streak], makeStats({ streakDays: 6 }), null), []);

    const posts = rule({ key: 'contributor', action: 'contribute_post', target: 3 });
    assert.deepEqual(evaluateBadges([posts], makeStats({ postsApproved: 3 }), null), [posts]);
    assert.deepEqual(evaluateBadges([posts], makeStats({ postsApproved: 2 }), null), []);

    const follower = rule({ key: 'follower', action: 'follow_plant', target: 5 });
    assert.deepEqual(evaluateBadges([follower], makeStats({ followedPlants: 5 }), null), [follower]);
    assert.deepEqual(evaluateBadges([follower], makeStats({ followedPlants: 4 }), null), []);
  });

  it('counts only the named family for read_plant_family', () => {
    const stats = makeStats({
      plantsReadByFamily: { lamiaceae: 4, fabaceae: 9 },
    });
    const lamiaceae = rule({
      key: 'mint_fan',
      action: 'read_plant_family',
      target: 4,
      param: 'lamiaceae',
    });
    const apiaceae = rule({
      key: 'carrot_fan',
      action: 'read_plant_family',
      target: 4,
      param: 'apiaceae',
    });
    const tooMany = rule({
      key: 'bean_fan',
      action: 'read_plant_family',
      target: 10,
      param: 'fabaceae',
    });

    assert.deepEqual(evaluateBadges([lamiaceae], stats, null), [lamiaceae]);
    assert.deepEqual(evaluateBadges([apiaceae], stats, null), []);
    assert.deepEqual(evaluateBadges([tooMany], stats, null), []);
  });

  it('never matches a family rule without a usable param', () => {
    const stats = makeStats({ plantsReadByFamily: { '': 5, lamiaceae: 5 } });
    for (const param of [null, undefined, ''] as const) {
      const bad = rule({ key: `bad_${String(param)}`, action: 'read_plant_family', target: 1, param });
      assert.deepEqual(evaluateBadges([bad], stats, null), []);
    }
  });

  it('never matches earn_badge, which needs cross-badge state', () => {
    const meta = rule({ key: 'collector', action: 'earn_badge', target: 1 });
    const stats = makeStats({ badgesEarned: ['other'] });
    assert.deepEqual(evaluateBadges([meta], stats, null), []);
    assert.deepEqual(evaluateBadges([meta], makeStats({ badgesEarned: [] }), null), []);
  });

  it('recognises every action in the badge vocabulary', () => {
    for (const action of BADGE_ACTIONS) {
      const candidate = rule({ key: `k_${action}`, action, target: 1, param: 'lamiaceae' });
      const stats = makeStats({
        plantsRead: 1,
        plantsReadByFamily: { lamiaceae: 1 },
        lessonsCompleted: 1,
        quizzesPassed: 1,
        bestQuizPct: 1,
        streakDays: 1,
        postsApproved: 1,
        followedPlants: 1,
      });
      const matched = evaluateBadges([candidate], stats, null);
      assert.equal(matched.length, action === 'earn_badge' ? 0 : 1, `action ${action}`);
    }
  });
});

describe('evaluateBadges - no double award', () => {
  const readPlants = rule({ key: 'reader_10', action: 'read_plant', target: 10, xpReward: 50 });

  it('withholds a rule whose key is already earned', () => {
    const stats = makeStats({ plantsRead: 10 });
    assert.deepEqual(evaluateBadges([readPlants], stats, null), [readPlants]);
    assert.deepEqual(
      evaluateBadges([readPlants], makeStats({ ...stats, badgesEarned: ['reader_10'] }), null),
      [],
    );
  });

  it('still awards the rules that are not in badgesEarned', () => {
    const lessons = rule({ key: 'scholar_5', action: 'complete_lesson', target: 5 });
    const stats = makeStats({
      plantsRead: 10,
      lessonsCompleted: 5,
      badgesEarned: ['reader_10'],
    });
    const matched = evaluateBadges([readPlants, lessons], stats, null);
    assert.deepEqual(matched, [lessons]);
  });
});

describe('evaluateBadges - purity', () => {
  it('does not mutate its inputs and is deterministic', () => {
    const rules: BadgeRule[] = Object.freeze([
      rule({ key: 'reader_10', action: 'read_plant', target: 10 }),
      rule({ key: 'scholar_5', action: 'complete_lesson', target: 5 }),
    ]) as BadgeRule[];
    const stats: LearnerStats = Object.freeze(makeStats({ plantsRead: 12, lessonsCompleted: 5 }));
    const event: XpEvent = { kind: 'read_plant', plantId: 'p1', plantFamily: 'lamiaceae', firstTime: true };

    const first = evaluateBadges(rules, stats, event);
    const second = evaluateBadges(rules, stats, event);
    assert.deepEqual(first.map((r) => r.key), ['reader_10', 'scholar_5']);
    assert.deepEqual(second, first);
    assert.deepEqual(rules.map((r) => r.key), ['reader_10', 'scholar_5']);
    assert.deepEqual(stats.badgesEarned, []);
    assert.equal(stats.plantsRead, 12);
    // Returned rules are copies: a caller editing one cannot rewrite the stored rule.
    assert.notEqual(first[0], rules[0]);
    assert.deepEqual(first[0], rules[0]);
  });

  it('accepts a null event and answers from stats alone', () => {
    const readPlants = rule({ key: 'reader_10', action: 'read_plant', target: 10 });
    assert.deepEqual(evaluateBadges([readPlants], makeStats({ plantsRead: 10 }), null), [readPlants]);
  });
});
