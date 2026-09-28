/**
 * Behavioural tests for the award service, against the real local mongod.
 *
 * These call `awardXp` / `awardBadgesIfEarned` / `buildLearnerStats` directly - no HTTP, no
 * Express - because the contract under test is the persistence of XP, levels, badges and the
 * streak, plus the no-double-award rule that lives in the callers' document state.
 *
 * `config/env.ts` validates `process.env` the moment it is imported, and the runner starts
 * without `--env-file`, so the secrets are seeded as plain statements BEFORE the dynamic
 * `await import()` calls below. Static imports would hoist above those assignments and the
 * import graph (award.ts -> routes/notifications.ts -> middleware/auth.ts -> config/env.ts) would
 * throw on load; dynamic imports execute in order, which is why they are used here.
 */
import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { Types } from 'mongoose';

process.env.NODE_ENV ??= 'test';
process.env.MONGO_URI ??= 'mongodb://127.0.0.1:27017/herbal_garden_test';
process.env.JWT_ACCESS_SECRET ??= 'test-access-secret-0123456789';
process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret-0123456789';

const { connectDb, disconnectDb } = await import('../db.ts');
const { Attempt, Badge, Lesson, Notification, Plant, Post, Progress, Quiz, User } = await import(
  '../models/index.ts'
);
const { HttpError } = await import('../lib/http.ts');
const { XP } = await import('../services/xp.ts');
const { awardBadgesIfEarned, awardXp, buildLearnerStats } = await import('./award.ts');
const { notify } = await import('../routes/notifications.ts');

let userSeq = 0;

before(async () => {
  await connectDb('mongodb://127.0.0.1:27017/herbal_garden_test');
});

after(async () => {
  await disconnectDb();
});

// Only the collections THIS suite writes are cleared - other suites share this mongod, so the
// database itself is never dropped.
beforeEach(async () => {
  await Promise.all([
    User.deleteMany({}),
    Badge.deleteMany({}),
    Progress.deleteMany({}),
    Plant.deleteMany({}),
    Attempt.deleteMany({}),
    Post.deleteMany({}),
    Lesson.deleteMany({}),
    Quiz.deleteMany({}),
    Notification.deleteMany({}),
  ]);
});

async function makeUser(overrides: { xp?: number; level?: number; lastNameActiveAt?: Date | null } = {}) {
  userSeq += 1;
  return User.create({
    name: `Learner ${userSeq}`,
    email: `learner${userSeq}@example.com`,
    passwordHash: 'x'.repeat(20),
    handle: `learner-${userSeq}`,
    xp: overrides.xp ?? 0,
    level: overrides.level ?? 1,
    streak: {
      current: 0,
      longest: 0,
      lastActiveAt: overrides.lastNameActiveAt ?? null,
    },
  });
}

async function makePlant(slug: string, family: string) {
  return Plant.create({
    slug,
    commonName: slug,
    botanicalName: `${slug} officinalis`,
    family,
    publishedAt: new Date(),
  });
}

async function makeReadProgress(userId: Types.ObjectId, plantId: Types.ObjectId) {
  return Progress.create({ userId, plantId, read: true, mastery: 0 });
}

async function readUser(id: Types.ObjectId) {
  const user = await User.findById(id).select('xp level streak badges').lean();
  assert.ok(user, 'user should exist');
  return user;
}

describe('awardXp', () => {
  it('1. adds READ_PLANT + FIRST_TIME_BONUS for a fresh user and stays level 1', async () => {
    const user = await makeUser();
    const result = await awardXp({
      userId: String(user._id),
      event: { kind: 'read_plant', plantId: 'p1', plantFamily: 'Lamiaceae', firstTime: true },
    });

    const expected = XP.READ_PLANT + XP.FIRST_TIME_BONUS;
    assert.equal(result.xpAwarded, expected);
    assert.equal(result.xp, expected);
    assert.equal(result.level, 1);
    assert.equal(result.levelUp, false);

    const persisted = await readUser(user._id);
    assert.equal(persisted.xp, expected);
    assert.equal(persisted.level, 1);
    // The first award also starts the streak clock.
    assert.equal(persisted.streak?.current, 1);
  });

  it('2. crossing a level threshold flips level and levelUp', async () => {
    // 99 xp is the top of level 1; a 5 xp award crosses into 100 -> level 2.
    const user = await makeUser({ xp: 99, level: 1 });
    const result = await awardXp({
      userId: String(user._id),
      event: { kind: 'read_plant', plantId: 'p2', plantFamily: 'Lamiaceae', firstTime: false },
    });

    assert.equal(result.xpAwarded, XP.READ_PLANT);
    assert.equal(result.xp, 104);
    assert.equal(result.level, 2);
    assert.equal(result.levelUp, true);
    assert.equal((await readUser(user._id)).level, 2);
  });

  it('8. rejects a non-finite award and writes nothing', async () => {
    // `awardXp` is a pure award path; the only way a non-finite value can appear is a malformed
    // event (a NaN correct count on a quiz attempt), so that is what is simulated here.
    const user = await makeUser({ xp: 50, level: 1 });
    const before = await readUser(user._id);

    await assert.rejects(
      awardXp({
        userId: String(user._id),
        event: {
          kind: 'quiz_attempt',
          quizId: 'q1',
          correctCount: Number.NaN,
          totalCount: 10,
          passed: true,
          firstPass: false,
          previousBestPct: null,
          scorePct: Number.NaN,
        },
      }),
      (err: unknown) => {
        assert.ok(err instanceof HttpError);
        assert.equal(err.status, 400);
        return true;
      },
    );

    const after = await readUser(user._id);
    assert.equal(after.xp, before.xp);
    assert.equal(after.level, before.level);
    assert.equal(after.streak?.current, before.streak?.current);
  });
});

describe('idempotency', () => {
  it('3. the no-double-award guard is honoured where it lives (badges)', async () => {
    // NOTE: `awardXp` itself performs no idempotency check - calling it twice adds the points
    // twice, on purpose. The guard is the caller's existing document state. For badges that state
    // is `User.badges`, so the rule is proven here by calling the badge matcher twice against
    // identical qualifying stats.
    const user = await makeUser();
    const plant = await makePlant('tulsi', 'Lamiaceae');
    await makeReadProgress(user._id, plant._id);
    await Badge.create({
      key: 'first-read',
      name: 'First read',
      description: 'Read your first monograph',
      criteria: { action: 'read_plant', target: 1, param: null },
      xpReward: 20,
      icon: 'book',
      active: true,
    });

    const first = await awardBadgesIfEarned({ userId: String(user._id), event: null });
    assert.equal(first.length, 1);
    assert.equal(first[0]?.key, 'first-read');

    const second = await awardBadgesIfEarned({ userId: String(user._id), event: null });
    assert.deepEqual(second, []);

    const persisted = await readUser(user._id);
    assert.equal(persisted.badges?.filter((badge) => badge.key === 'first-read').length, 1);
    // The reward landed once, not twice.
    assert.equal(persisted.xp, 20);
    // And the unlock produced exactly one inbox row.
    assert.equal(await Notification.countDocuments({ userId: user._id, type: 'badge' }), 1);
  });

  it('4. a badge reward can itself push the learner over a level boundary', async () => {
    // Parked one point of the reward short of level 2 (100 xp); the 20 xp badge crosses it.
    const user = await makeUser({ xp: 95, level: 1 });
    const plant = await makePlant('ashwagandha', 'Solanaceae');
    await makeReadProgress(user._id, plant._id);
    await Badge.create({
      key: 'reader',
      name: 'Reader',
      criteria: { action: 'read_plant', target: 1, param: null },
      xpReward: 20,
      icon: 'book',
      active: true,
    });

    const earned = await awardBadgesIfEarned({ userId: String(user._id), event: null });
    assert.equal(earned.length, 1);

    const persisted = await readUser(user._id);
    assert.equal(persisted.xp, 115);
    assert.equal(persisted.level, 2);
    assert.ok(persisted.level > 1, 'badge reward should have raised the level');
  });
});

describe('buildLearnerStats', () => {
  it('5. reads real numbers from Progress, Attempt and Post', async () => {
    const user = await makeUser();
    const tulsi = await makePlant('tulsi', 'Lamiaceae');
    const mint = await makePlant('mint', 'Lamiaceae');
    const yarrow = await makePlant('yarrow', 'Asteraceae');
    // Three read plants across two families, plus a lesson on one of them.
    await makeReadProgress(user._id, tulsi._id);
    await makeReadProgress(user._id, mint._id);
    await makeReadProgress(user._id, yarrow._id);
    await Lesson.create({ plantId: yarrow._id, slug: 'yarrow-lesson', title: 'Yarrow', body: 'Body' });

    // Two distinct quizzes: an 80% pass and a 50% fail.
    const quizPass = await Quiz.create({
      family: 'Lamiaceae',
      title: 'Passed quiz',
      difficulty: 'easy',
      published: true,
    });
    const quizFail = await Quiz.create({
      family: 'Asteraceae',
      title: 'Failed quiz',
      difficulty: 'hard',
      published: true,
    });
    await Attempt.create({ userId: user._id, quizId: quizPass._id, score: 4, total: 5 });
    await Attempt.create({ userId: user._id, quizId: quizFail._id, score: 1, total: 2 });

    await Post.create({ userId: user._id, type: 'note', title: 'Note', body: 'Body', status: 'approved' });

    const stats = await buildLearnerStats(String(user._id));
    assert.equal(stats.plantsRead, 3);
    assert.equal(stats.lessonsCompleted, 1);
    assert.equal(stats.quizzesPassed, 1);
    assert.equal(stats.bestQuizPct, 80);
    assert.equal(stats.postsApproved, 1);
    assert.deepEqual(stats.plantsReadByFamily, { Lamiaceae: 2, Asteraceae: 1 });
    assert.deepEqual(stats.badgesEarned, []);
    assert.equal(stats.followedPlants, 0);
  });
});

describe('streak window', () => {
  it('6. continues within 48h and restarts past it', async () => {
    // `now` is parameterised precisely so a streak can be walked through a window in a test.
    const user = await makeUser();
    const t = new Date('2026-01-01T00:00:00.000Z');
    const readEvent = {
      kind: 'read_plant',
      plantId: 'p',
      plantFamily: 'Lamiaceae',
      firstTime: false,
    } as const;

    await awardXp({ userId: String(user._id), event: readEvent, now: t });
    assert.equal((await readUser(user._id)).streak?.current, 1);

    // 30h later: past the 24h keep window but inside the 48h break window -> +1.
    await awardXp({ userId: String(user._id), event: readEvent, now: new Date(t.getTime() + 30 * 3_600_000) });
    assert.equal((await readUser(user._id)).streak?.current, 2);

    // 80h after the start, i.e. 50h after the last activity -> restart at 1.
    await awardXp({ userId: String(user._id), event: readEvent, now: new Date(t.getTime() + 80 * 3_600_000) });
    const persisted = await readUser(user._id);
    assert.equal(persisted.streak?.current, 1);
    assert.equal(persisted.streak?.longest, 2);
  });
});

describe('notify', () => {
  it('7. resolves instead of throwing when the write fails', async () => {
    // A userId that cannot cast to an ObjectId makes the insert throw; `notify` must swallow it so
    // a failed notification never fails the action that triggered it.
    await notify('not-an-object-id', {
      type: 'system',
      title: 'Heads up',
      body: 'This write cannot succeed',
    });

    assert.equal(await Notification.countDocuments({}), 0);
  });
});
