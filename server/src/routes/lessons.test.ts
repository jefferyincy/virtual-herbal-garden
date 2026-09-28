/**
 * Route-level tests for the lesson and quiz endpoints, including the anti-cheat invariants.
 *
 * Runs against the local portable mongod (`mongodb://127.0.0.1:27017/herbal_garden_test`). The
 * suite clears ONLY the collections it writes, in `beforeEach`, and never drops the shared
 * database, so a sibling test file can run against the same server.
 */
import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, beforeEach, describe, it } from 'node:test';
import express, { type Express } from 'express';

const TEST_URI = 'mongodb://127.0.0.1:27017/herbal_garden_test';

// config/env.ts validates process.env at import time, and the router graph reaches it (transitively
// through award.ts), so every required key must be set BEFORE any dynamic import below - the test
// runner is launched without --env-file, and a static import would be hoisted past this seed.
process.env.NODE_ENV ??= 'test';
process.env.MONGO_URI ??= TEST_URI;
process.env.JWT_ACCESS_SECRET ??= 'test-access-secret-0123456789';
process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret-0123456789';

const { connectDb, disconnectDb } = await import('../db.ts');
const { Attempt, Badge, Lesson, Notification, Plant, Progress, Quiz, User } = await import(
  '../models/index.ts'
);
const { signAccessToken } = await import('../middleware/auth.ts');
const { errorHandler, notFoundHandler } = await import('../middleware/error.ts');
const { lessonsRouter } = await import('./lessons.ts');
const { quizzesRouter } = await import('./quizzes.ts');
const { XP } = await import('../services/xp.ts');
const { QUIZ_PASS_RATIO } = await import('../services/award.ts');

/** Distinctive text that must never appear in a served (pre-grading) quiz response. */
const EXPLANATION_CANARY = 'EXPLANATION-LEAK-CANARY-ALPHA';

const LESSON_SECTION = 'Foundations';
const QUIZ_A_TIME_LIMIT_SEC = 60;

type ErrorEnvelope = { error: { code: string; message: string } };

type LessonsBody = {
  sections: Array<{ name: string; lessonCount: number }>;
  groups: Array<{ section: string; lessons: Array<{ slug: string; completed: boolean }> }>;
  nextLesson: { slug: string; title: string } | null;
};

type LessonDetailBody = {
  lesson: { slug: string };
  plant: { slug: string; sources: unknown[]; toxicity: string } | null;
  position: { index: number; total: number };
  completed: boolean;
};

type QuizDetailBody = {
  quiz: { _id: string; questionCount: number };
  questions: Array<{ _id: string; stem: string; options: string[] }>;
  attempts: number;
  bestPct: number | null;
};

type AttemptBody = {
  attempt: { _id: string; score: number; total: number; secondsTaken: number; xpAwarded: number };
  results: Array<{ questionId: string; chosenIndex: number; correct: boolean; answerIndex: number }>;
  passed: boolean;
  level: number;
  levelUp: boolean;
  badgesEarned: unknown[];
};

type AttemptsBody = {
  items: Array<{ _id: string; score: number; total: number; xpAwarded: number }>;
  page: number;
  total: number;
  bestPct: number | null;
  passed: boolean;
};

type CompleteBody = { completed: boolean; xpAwarded: number; level: number; levelUp: boolean; badgesEarned: unknown[] };

type QuizListBody = {
  groups: Array<{
    family: string;
    quizzes: Array<{
      _id: string;
      locked: boolean;
      attempts: number;
      bestPct: number | null;
      passed: boolean;
      questionCount: number;
      unlockProgress: { lessonsNeeded: number; lessonsCompleted: number } | null;
    }>;
  }>;
};

let server: Server;
let baseUrl: string;
let token: string;
let otherToken: string;
let learnerUserId: string;
let lessonBySlug: Record<string, string>;
let quizAId: string;
let quizAQuestionIds: string[];
let quizBQuestionIds: string[];

async function call<T>(
  path: string,
  opts: { method?: string; token?: string; body?: unknown } = {},
): Promise<{ status: number; body: T }> {
  const headers: Record<string, string> = {};
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  const res = await fetch(`${baseUrl}${path}`, {
    method: opts.method ?? 'GET',
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const text = await res.text();
  return { status: res.status, body: (text ? JSON.parse(text) : null) as T };
}

async function makeUser(name: string): Promise<{ token: string; id: string }> {
  const user = await User.create({
    name,
    email: `${name.toLowerCase()}@example.com`,
    passwordHash: 'x'.repeat(20),
    handle: name.toLowerCase(),
    role: 'student',
  });
  return {
    token: signAccessToken({ id: String(user._id), role: 'student' }),
    id: String(user._id),
  };
}

async function makePlant(slug: string, commonName: string) {
  return Plant.create({
    slug,
    commonName,
    botanicalName: `Botanica ${slug}`,
    family: 'Lamiaceae',
    partsUsed: ['leaf'],
    toxicity: 'low',
    sources: [{ label: 'WHO monograph', url: 'https://example.org/who' }],
    images: [{ url: 'https://example.org/a.png', alt: 'A leaf', credit: 'Test' }],
  });
}

before(async () => {
  await connectDb(TEST_URI);
  const app: Express = express();
  app.use(express.json());
  app.use('/api', lessonsRouter);
  app.use('/api', quizzesRouter);
  app.use(notFoundHandler);
  app.use(errorHandler);
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
  await Promise.all([
    Attempt.deleteMany({}),
    Badge.deleteMany({}),
    Lesson.deleteMany({}),
    Notification.deleteMany({}),
    Plant.deleteMany({}),
    Progress.deleteMany({}),
    Quiz.deleteMany({}),
    User.deleteMany({}),
  ]);
  await disconnectDb();
});

beforeEach(async () => {
  await Promise.all([
    Attempt.deleteMany({}),
    Badge.deleteMany({}),
    Lesson.deleteMany({}),
    Notification.deleteMany({}),
    Plant.deleteMany({}),
    Progress.deleteMany({}),
    Quiz.deleteMany({}),
    User.deleteMany({}),
  ]);

  const learner = await makeUser('learner');
  token = learner.token;
  learnerUserId = learner.id;
  otherToken = (await makeUser('other')).token;

  const [tulsi, mint, sage] = await Promise.all([
    makePlant('tulsi', 'Tulsi'),
    makePlant('mint', 'Mint'),
    makePlant('sage', 'Sage'),
  ]);

  // Exactly one lesson per plant, all in one section: the seed creates the same 1:1 shape, which
  // is what lets completion be stored on the plant's Progress row.
  const lessons = await Lesson.create([
    {
      plantId: tulsi._id,
      slug: 'tulsi-fundamentals',
      title: 'Tulsi fundamentals',
      body: 'Body',
      section: LESSON_SECTION,
      order: 0,
      estMinutes: 5,
      published: true,
    },
    {
      plantId: mint._id,
      slug: 'mint-fundamentals',
      title: 'Mint fundamentals',
      body: 'Body',
      section: LESSON_SECTION,
      order: 1,
      estMinutes: 6,
      published: true,
    },
    {
      plantId: sage._id,
      slug: 'sage-fundamentals',
      title: 'Sage fundamentals',
      body: 'Body',
      section: LESSON_SECTION,
      order: 2,
      estMinutes: 7,
      published: true,
    },
  ]);

  lessonBySlug = {};
  for (const lesson of lessons) lessonBySlug[lesson.slug] = String(lesson._id);

  const quizA = await Quiz.create({
    family: 'Lamiaceae',
    title: 'Lamiaceae identification',
    difficulty: 'easy',
    plantIds: [tulsi._id, mint._id, sage._id],
    timeLimitSec: QUIZ_A_TIME_LIMIT_SEC,
    questions: [
      { stem: 'Q1', options: ['A', 'B', 'C'], answerIndex: 0, explanation: EXPLANATION_CANARY },
      { stem: 'Q2', options: ['A', 'B', 'C'], answerIndex: 2, explanation: EXPLANATION_CANARY },
      { stem: 'Q3', options: ['A', 'B', 'C'], answerIndex: 1, explanation: EXPLANATION_CANARY },
    ],
    published: true,
  });
  quizAId = String(quizA._id);
  quizAQuestionIds = quizA.questions.map((question) => String(question._id));

  const quizB = await Quiz.create({
    family: 'Asteraceae',
    title: 'Asteraceae identification',
    difficulty: 'medium',
    plantIds: [],
    timeLimitSec: 0,
    questions: [
      { stem: 'B1', options: ['A', 'B'], answerIndex: 0, explanation: 'other' },
      { stem: 'B2', options: ['A', 'B'], answerIndex: 1, explanation: 'other' },
      { stem: 'B3', options: ['A', 'B'], answerIndex: 0, explanation: 'other' },
    ],
    published: true,
  });
  quizBQuestionIds = quizB.questions.map((question) => String(question._id));
});

async function storedAnswerKey(quizId: string): Promise<Array<{ questionId: string; chosenIndex: number }>> {
  const quiz = await Quiz.findById(quizId).lean<{ questions: Array<{ _id: unknown; answerIndex: number }> } | null>();
  assert.ok(quiz, 'quiz fixture must exist');
  return quiz.questions.map((question) => ({
    questionId: String(question._id),
    chosenIndex: question.answerIndex,
  }));
}

describe('GET /api/lessons', () => {
  it('returns sections, groups and nextLesson, with completed false for an anonymous caller', async () => {
    const { status, body } = await call<LessonsBody>('/api/lessons');

    assert.equal(status, 200);
    assert.deepEqual(body.sections, [{ name: LESSON_SECTION, lessonCount: 3 }]);
    assert.equal(body.groups.length, 1);
    assert.equal(body.groups[0]?.section, LESSON_SECTION);
    assert.deepEqual(
      body.groups[0]?.lessons.map((lesson) => lesson.slug),
      ['tulsi-fundamentals', 'mint-fundamentals', 'sage-fundamentals'],
    );
    for (const lesson of body.groups[0]?.lessons ?? []) assert.equal(lesson.completed, false);
    assert.equal(body.nextLesson?.slug, 'tulsi-fundamentals');
  });
});

describe('GET /api/lessons/:slug', () => {
  it('returns the plant inline with sources and toxicity, and position.total for the section', async () => {
    const { status, body } = await call<LessonDetailBody>('/api/lessons/mint-fundamentals');

    assert.equal(status, 200);
    assert.equal(body.lesson.slug, 'mint-fundamentals');
    assert.ok(body.plant, 'plant must be inlined for the reader card');
    assert.equal(body.plant?.slug, 'mint');
    assert.ok(Array.isArray(body.plant?.sources) && body.plant.sources.length > 0);
    assert.equal(body.plant?.toxicity, 'low');
    assert.deepEqual(body.position, { index: 2, total: 3 });
  });
});

describe('GET /api/quizzes/:id (no answer leak)', () => {
  it('never serialises answerIndex or any stored explanation text', async () => {
    const { status, body } = await call<QuizDetailBody>(`/api/quizzes/${quizAId}`);

    assert.equal(status, 200);
    assert.equal(body.quiz.questionCount, 3);
    assert.equal(body.questions.length, 3);
    assert.deepEqual(body.questions[0]?.options, ['A', 'B', 'C']);

    const serialised = JSON.stringify(body);
    assert.ok(!serialised.includes('answerIndex'), 'served quiz must not contain answerIndex');
    assert.ok(
      !serialised.includes(EXPLANATION_CANARY),
      'served quiz must not contain explanation text',
    );
  });
});

describe('POST /api/quizzes/:id/attempt (server-side grading)', () => {
  it('scores 0 for wrong indices, then total for the stored key', async () => {
    const key = await storedAnswerKey(quizAId);
    // Shift each stored answer one option along: guaranteed wrong, derived from stored data only.
    const shifted = key.map((entry) => ({ ...entry, chosenIndex: (entry.chosenIndex + 1) % 3 }));

    const failed = await call<AttemptBody>(`/api/quizzes/${quizAId}/attempt`, {
      method: 'POST',
      token,
      body: { answers: shifted, secondsTaken: 10 },
    });
    assert.equal(failed.status, 201);
    assert.equal(failed.body.attempt.score, 0);
    assert.equal(failed.body.passed, false);
    assert.equal(failed.body.results.length, 3);
    for (const result of failed.body.results) assert.equal(result.correct, false);

    const correct = await call<AttemptBody>(`/api/quizzes/${quizAId}/attempt`, {
      method: 'POST',
      token,
      body: { answers: key, secondsTaken: 10 },
    });
    assert.equal(correct.status, 201);
    assert.equal(correct.body.attempt.score, correct.body.attempt.total);
    assert.equal(correct.body.passed, true);
    // The result rows are the only place the key is exposed, and only after grading.
    assert.deepEqual(
      correct.body.results.map((result) => result.answerIndex),
      key.map((entry) => entry.chosenIndex),
    );
  });

  it('rejects a foreign question id with 400 and writes no attempt', async () => {
    const answers = [
      { questionId: quizBQuestionIds[0] ?? '', chosenIndex: 0 },
      { questionId: quizAQuestionIds[1] ?? '', chosenIndex: 0 },
      { questionId: quizAQuestionIds[2] ?? '', chosenIndex: 0 },
    ];
    const { status, body } = await call<ErrorEnvelope>(`/api/quizzes/${quizAId}/attempt`, {
      method: 'POST',
      token,
      body: { answers, secondsTaken: 10 },
    });

    assert.equal(status, 400);
    assert.equal(body.error.code, 'bad_request');
    // The offending id is named in the message so a client can debug a stale question set.
    assert.ok(body.error.message.includes(quizBQuestionIds[0] ?? ''), body.error.message);
    assert.ok(body.error.message.includes(quizAQuestionIds[0] ?? ''), body.error.message);
    assert.equal(await Attempt.countDocuments({}), 0);
  });

  it('rejects an attempt with fewer answers than questions', async () => {
    const { status, body } = await call<ErrorEnvelope>(`/api/quizzes/${quizAId}/attempt`, {
      method: 'POST',
      token,
      body: {
        answers: [
          { questionId: quizAQuestionIds[0] ?? '', chosenIndex: 0 },
          { questionId: quizAQuestionIds[1] ?? '', chosenIndex: 1 },
        ],
        secondsTaken: 10,
      },
    });

    assert.equal(status, 400);
    assert.equal(body.error.code, 'bad_request');
    assert.equal(await Attempt.countDocuments({}), 0);
  });

  it('rejects an attempt over the timer limit with grace, and accepts one inside it', async () => {
    const key = await storedAnswerKey(quizAId);

    const tooSlow = await call<ErrorEnvelope>(`/api/quizzes/${quizAId}/attempt`, {
      method: 'POST',
      token,
      body: { answers: key, secondsTaken: 600 },
    });
    assert.equal(tooSlow.status, 400);
    assert.equal(tooSlow.body.error.code, 'bad_request');
    assert.ok(tooSlow.body.error.message.length > 0);
    assert.equal(await Attempt.countDocuments({}), 0);

    const inTime = await call<AttemptBody>(`/api/quizzes/${quizAId}/attempt`, {
      method: 'POST',
      token,
      body: { answers: key, secondsTaken: 50 },
    });
    assert.equal(inTime.status, 201);
  });
});

describe('XP arithmetic', () => {
  it('awards the first-pass bonus once, then only the per-correct xp', async () => {
    const key = await storedAnswerKey(quizAId);

    const first = await call<AttemptBody>(`/api/quizzes/${quizAId}/attempt`, {
      method: 'POST',
      token,
      body: { answers: key, secondsTaken: 10 },
    });
    const correctCount = first.body.attempt.score;
    const total = first.body.attempt.total;
    assert.equal(first.body.passed, true);
    assert.equal(first.body.attempt.xpAwarded, correctCount * XP.QUIZ_CORRECT + XP.FIRST_TIME_BONUS);

    const second = await call<AttemptBody>(`/api/quizzes/${quizAId}/attempt`, {
      method: 'POST',
      token,
      body: { answers: key, secondsTaken: 10 },
    });
    assert.equal(second.body.attempt.score, correctCount);
    assert.equal(second.body.attempt.xpAwarded, correctCount * XP.QUIZ_CORRECT);
    assert.equal(total, 3);
  });
});

describe('attempt history', () => {
  it('records a failing attempt with xpAwarded 0 and reports it as not passed', async () => {
    const key = await storedAnswerKey(quizAId);
    const shifted = key.map((entry) => ({ ...entry, chosenIndex: (entry.chosenIndex + 1) % 3 }));

    const failed = await call<AttemptBody>(`/api/quizzes/${quizAId}/attempt`, {
      method: 'POST',
      token,
      body: { answers: shifted, secondsTaken: 10 },
    });
    assert.equal(failed.body.attempt.xpAwarded, 0);
    assert.equal(failed.body.passed, false);

    const history = await call<AttemptsBody>(`/api/quizzes/${quizAId}/attempts`, { token });
    assert.equal(history.status, 200);
    assert.equal(history.body.total, 1);
    assert.equal(history.body.items[0]?.xpAwarded, 0);
    assert.equal(history.body.passed, false);
    assert.ok(history.body.bestPct === null || history.body.bestPct < QUIZ_PASS_RATIO * 100);
  });

  it('only ever lists the caller own attempts', async () => {
    const key = await storedAnswerKey(quizAId);
    await call<AttemptBody>(`/api/quizzes/${quizAId}/attempt`, {
      method: 'POST',
      token,
      body: { answers: key, secondsTaken: 10 },
    });

    const other = await call<AttemptsBody>(`/api/quizzes/${quizAId}/attempts`, { token: otherToken });
    assert.equal(other.body.total, 0);
    assert.deepEqual(other.body.items, []);
  });
});

describe('lesson completion idempotency', () => {
  it('awards the first-time bonus exactly once', async () => {
    const first = await call<CompleteBody>(`/api/lessons/${lessonBySlug['tulsi-fundamentals'] ?? ''}/complete`, {
      method: 'POST',
      token,
    });
    assert.equal(first.status, 200);
    assert.equal(first.body.completed, true);
    assert.equal(first.body.xpAwarded, XP.LESSON_COMPLETE + XP.FIRST_TIME_BONUS);

    const second = await call<CompleteBody>(`/api/lessons/tulsi-fundamentals/complete`, {
      method: 'POST',
      token,
    });
    assert.equal(second.status, 200);
    assert.equal(first.body.xpAwarded - second.body.xpAwarded, XP.FIRST_TIME_BONUS);
    assert.equal(second.body.xpAwarded, XP.LESSON_COMPLETE);
    // The completion signal is the plant Progress row, and it was created once.
    assert.equal(await Progress.countDocuments({ read: true }), 1);
  });
});

/** Find the quiz row for one quiz id across the family groups. */
function findQuizRow(body: QuizListBody, quizId: string) {
  for (const group of body.groups) {
    for (const quiz of group.quizzes) {
      if (quiz._id === quizId) return quiz;
    }
  }
  return undefined;
}

describe('GET /api/quizzes (lock rule)', () => {
  it('locks an untouched quiz until three lessons are complete, then unlocks it', async () => {
    const locked = await call<QuizListBody>('/api/quizzes', { token });
    const lockedRow = findQuizRow(locked.body, quizAId);
    assert.equal(lockedRow?.locked, true);
    assert.deepEqual(lockedRow?.unlockProgress, { lessonsNeeded: 3, lessonsCompleted: 0 });
    assert.equal(lockedRow?.attempts, 0);
    assert.equal(lockedRow?.bestPct, null);

    // Mark the three lesson plants read: exactly the write completing each lesson performs.
    for (const slug of ['tulsi-fundamentals', 'mint-fundamentals', 'sage-fundamentals']) {
      const lesson = await Lesson.findOne({ slug }).lean<{ plantId: unknown } | null>();
      assert.ok(lesson, 'lesson fixture must exist');
      await Progress.create({ userId: learnerUserId, plantId: lesson.plantId, read: true });
    }

    const unlocked = await call<QuizListBody>('/api/quizzes', { token });
    const unlockedRow = findQuizRow(unlocked.body, quizAId);
    assert.equal(unlockedRow?.locked, false);
    assert.equal(unlockedRow?.unlockProgress, null);
  });

  it('groups rows under their family heading', async () => {
    const { body } = await call<QuizListBody>('/api/quizzes', { token });
    assert.deepEqual(
      body.groups.map((group) => group.family),
      ['Asteraceae', 'Lamiaceae'],
    );
  });
});
