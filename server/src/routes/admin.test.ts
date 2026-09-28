/**
 * Route tests for the admin surface.
 *
 * Runs against the real local mongod (`herbal_garden_test`), like the other route suites. The app is
 * built here instead of imported so the suite mounts only `adminRouter`, independent of the
 * orchestrator's wiring.
 */

import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, beforeEach, describe, it } from 'node:test';
import express, { type Express } from 'express';

// config/env.ts validates process.env at import time and the runner starts without --env-file, so
// these keys must be set BEFORE any module in the graph reaches the config. That is also why every
// project module below is loaded with top-level `await import()`: static imports hoist above this.
process.env.NODE_ENV = 'test';
process.env.MONGO_URI ??= 'mongodb://127.0.0.1:27017/herbal_garden_test';
process.env.JWT_ACCESS_SECRET ??= 'test-access-secret-0123456789';
process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret-0123456789';
process.env.CLIENT_ORIGIN ??= 'http://localhost:5173';

const { connectDb, disconnectDb } = await import('../db.ts');
const { Types } = await import('mongoose');
const { Attempt, Badge, Comment, Lesson, Plant, Post, Progress, Quiz, User } = await import(
  '../models/index.ts'
);
const { signAccessToken } = await import('../middleware/auth.ts');
const { errorHandler, notFoundHandler } = await import('../middleware/error.ts');
const { adminRouter, diffLines } = await import('./admin.ts');

const TEST_URI = process.env.MONGO_TEST_URI ?? 'mongodb://127.0.0.1:27017/herbal_garden_test';

let server: Server;
let baseUrl: string;

type CallOpts = { method?: string; token?: string; body?: unknown };
type CallResult = { status: number; body: unknown };

async function call(path: string, opts: CallOpts = {}): Promise<CallResult> {
  const headers: Record<string, string> = {};
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  const res = await fetch(`${baseUrl}${path}`, {
    method: opts.method ?? 'GET',
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

/** Mint a token for a user that does not have to exist, which is all `requireAuth` inspects. */
function tokenFor(id: string, role: 'student' | 'expert' | 'admin'): string {
  return signAccessToken({ id, role });
}

let adminId: string;
let studentId: string;
let adminToken: string;
let studentToken: string;
let expertToken: string;

async function makeUser(
  name: string,
  role: 'student' | 'expert' | 'admin',
  extra: Record<string, unknown> = {},
) {
  const handle = name.toLowerCase().replace(/\s+/g, '-');
  return User.create({
    name,
    email: `${handle}@example.com`,
    passwordHash: 'x'.repeat(20),
    handle,
    role,
    ...extra,
  });
}

function expectError(body: unknown, code: string): void {
  const envelope = body as { error?: { code?: unknown; message?: unknown } } | null;
  assert.ok(envelope?.error, `expected an error envelope, got ${JSON.stringify(body)}`);
  assert.equal(envelope.error.code, code);
  assert.equal(typeof envelope.error.message, 'string');
}

before(async () => {
  await connectDb(TEST_URI);

  const app: Express = express();
  app.use(express.json());
  app.use('/api/admin', adminRouter);
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
  await disconnectDb();
});

// Only this suite's collections are cleared: other suites share this mongod, so the shared
// database is never dropped.
beforeEach(async () => {
  await Promise.all([
    User.deleteMany({}),
    Plant.deleteMany({}),
    Post.deleteMany({}),
    Comment.deleteMany({}),
    Progress.deleteMany({}),
    Attempt.deleteMany({}),
    Quiz.deleteMany({}),
    Badge.deleteMany({}),
    Lesson.deleteMany({}),
  ]);

  const admin = await makeUser('Ada Admin', 'admin');
  const student = await makeUser('Sam Student', 'student');
  const expert = await makeUser('Eve Expert', 'expert');
  adminId = String(admin._id);
  studentId = String(student._id);
  adminToken = tokenFor(adminId, 'admin');
  studentToken = tokenFor(studentId, 'student');
  expertToken = tokenFor(String(expert._id), 'expert');
});

describe('router-level authorisation', () => {
  it('1. rejects a student token with 403 on every endpoint, including the GETs', async () => {
    const calls: Array<[string, CallOpts]> = [
      ['/api/admin/stats', {}],
      ['/api/admin/users', {}],
      ['/api/admin/moderation/queue', {}],
      ['/api/admin/plants', {}],
      ['/api/admin/quizzes', {}],
      ['/api/admin/badges', {}],
      ['/api/admin/plants/bulk', { method: 'POST', body: { ids: [studentId], action: 'publish' } }],
      ['/api/admin/users/000000000000000000000000/ban', { method: 'POST', body: { banned: true } }],
      ['/api/admin/posts/000000000000000000000000', { method: 'DELETE' }],
    ];

    for (const [path, opts] of calls) {
      const res = await call(path, { ...opts, token: studentToken });
      assert.equal(res.status, 403, `expected 403 for ${opts.method ?? 'GET'} ${path}`);
      expectError(res.body, 'forbidden');
    }

    // An expert is not an admin either; the guard is role-exact.
    const asExpert = await call('/api/admin/stats', { token: expertToken });
    assert.equal(asExpert.status, 403);
    expectError(asExpert.body, 'forbidden');
  });

  it('2. rejects an anonymous request with 401', async () => {
    const res = await call('/api/admin/stats');
    assert.equal(res.status, 401);
    expectError(res.body, 'unauthorized');
  });
});

describe('GET /api/admin/stats', () => {
  it('3. returns every documented key with the documented type', async () => {
    const quiz = await Quiz.create({
      family: 'Lamiaceae',
      title: 'Mint basics',
      difficulty: 'easy',
      questions: [
        {
          stem: 'Which family is tulsi in?',
          options: ['Lamiaceae', 'Fabaceae'],
          answerIndex: 0,
          explanation: 'Tulsi is a mint.',
        },
      ],
    });
    await Attempt.create({ userId: adminId, quizId: quiz._id, score: 1, total: 1 });

    const { status, body } = await call('/api/admin/stats', { token: adminToken });
    assert.equal(status, 200);

    const stats = body as Record<string, unknown>;
    for (const key of [
      'totalUsers',
      'userDeltaPct',
      'publishedPlants',
      'plantDelta',
      'dau',
      'dauSparkline',
      'pendingModeration',
      'activeUsers30d',
      'topPlants',
      'quizPassRate',
      'recentModeration',
    ]) {
      assert.ok(key in stats, `missing key ${key}`);
    }

    for (const numeric of ['totalUsers', 'userDeltaPct', 'publishedPlants', 'plantDelta', 'dau', 'pendingModeration']) {
      assert.equal(typeof stats[numeric], 'number', `${numeric} must be a number`);
    }
    for (const list of ['dauSparkline', 'activeUsers30d', 'topPlants', 'quizPassRate', 'recentModeration']) {
      assert.ok(Array.isArray(stats[list]), `${list} must be an array`);
    }

    assert.equal((stats.dauSparkline as number[]).length, 14);
    assert.equal((stats.activeUsers30d as number[]).length, 30);
    assert.equal(stats.totalUsers, 3);

    const passRates = stats.quizPassRate as Array<{ family: string; passRate: number }>;
    assert.ok(passRates.length > 0, 'the seeded attempt must produce one family row');
    for (const row of passRates) {
      assert.equal(typeof row.family, 'string');
      assert.ok(Number.isInteger(row.passRate), 'passRate must be a whole percent');
      assert.ok(row.passRate >= 0 && row.passRate <= 100, `passRate out of range: ${row.passRate}`);
    }
  });

  it('4. pendingModeration is the real pending-post count', async () => {
    await Post.create({ userId: adminId, type: 'note', title: 'First', body: 'a', status: 'pending' });
    await Post.create({ userId: adminId, type: 'note', title: 'Second', body: 'b', status: 'pending' });
    await Post.create({ userId: adminId, type: 'note', title: 'Third', body: 'c', status: 'approved' });

    const { body } = await call('/api/admin/stats', { token: adminToken });
    assert.equal((body as { pendingModeration: number }).pendingModeration, 2);
  });
});

describe('GET /api/admin/users', () => {
  it('7. tolerates a regex-metacharacter query and clamps pageSize', async () => {
    await makeUser('Regex Risk', 'student', { name: 'a+b(' });

    const searched = await call('/api/admin/users?q=a%2Bb(', { token: adminToken });
    assert.equal(searched.status, 200, JSON.stringify(searched.body));

    const clamped = await call('/api/admin/users?pageSize=999', { token: adminToken });
    assert.equal(clamped.status, 200);
    const page = clamped.body as { pageSize: number; totalUsers: number; activeToday: number };
    assert.ok(page.pageSize <= 50, `pageSize must be clamped, got ${page.pageSize}`);
    // Three seeded users plus the one this test just created.
    assert.equal(page.totalUsers, 4);
    assert.equal(typeof page.activeToday, 'number');
  });
});

describe('admin self-protection', () => {
  it('5. refuses to demote or ban the calling admin', async () => {
    const demote = await call(`/api/admin/users/${adminId}/role`, {
      method: 'PATCH',
      token: adminToken,
      body: { role: 'student' },
    });
    assert.equal(demote.status, 400);
    expectError(demote.body, 'bad_request');

    const ban = await call(`/api/admin/users/${adminId}/ban`, {
      method: 'POST',
      token: adminToken,
      body: { banned: true },
    });
    assert.equal(ban.status, 400);
    expectError(ban.body, 'bad_request');

    // Neither attempt changed the stored row.
    const stored = await User.findById(adminId).lean<{ role: string; banned?: boolean } | null>();
    assert.equal(stored?.role, 'admin');
    assert.notEqual(stored?.banned, true);
  });

  it('6. refuses the change that would leave zero admins', async () => {
    // The only admin in the database is the target. The caller holds an admin token whose user row
    // is not stored, so the self-guard cannot mask the last-admin guard: with no caller row there is
    // still exactly one admin left, and demoting them must fail on the count alone.
    await User.deleteMany({ role: 'admin' });
    const target = await makeUser('Solo Admin', 'admin');
    const callerToken = tokenFor(String(new Types.ObjectId()), 'admin');
    assert.equal(await User.countDocuments({ role: 'admin' }), 1);

    const res = await call(`/api/admin/users/${String(target._id)}/role`, {
      method: 'PATCH',
      token: callerToken,
      body: { role: 'student' },
    });
    assert.equal(res.status, 400);
    expectError(res.body, 'bad_request');

    const stored = await User.findById(target._id).lean<{ role: string } | null>();
    assert.equal(stored?.role, 'admin');
    assert.equal(await User.countDocuments({ role: 'admin' }), 1);
  });
});

describe('line diff', () => {
  it('8. reports the changed line indices of a real LCS diff', () => {
    const result = diffLines('a\nb\nc', 'a\nc\nd');
    // 'b' is dropped from the submitted text, 'd' is appended: one removal and one addition.
    assert.deepEqual(result.removed, [1]);
    assert.deepEqual(result.added, [2]);

    assert.deepEqual(diffLines('same\ntext', 'same\ntext'), { added: [], removed: [] });
    assert.deepEqual(diffLines('one\ntwo', 'one\ntwo\nthree'), { added: [2], removed: [] });
  });

  it('8b. serves changedLines as an array from /moderation/:id/diff', async () => {
    const post = await Post.create({
      userId: adminId,
      type: 'note',
      title: 'A note',
      body: 'first line\nsecond line',
      status: 'pending',
    });

    const { status, body } = await call(`/api/admin/moderation/${String(post._id)}/diff`, {
      token: adminToken,
    });
    assert.equal(status, 200);
    const diff = body as { submitted: { body: string }; current: unknown; changedLines: unknown };
    assert.equal(diff.submitted.body, 'first line\nsecond line');
    assert.ok(Array.isArray(diff.changedLines), 'changedLines must be an array');
  });
});

describe('plant bulk actions', () => {
  it('9. rejects an empty ids array', async () => {
    const res = await call('/api/admin/plants/bulk', {
      method: 'POST',
      token: adminToken,
      body: { ids: [], action: 'publish' },
    });
    assert.ok(res.status === 400 || res.status === 422, `unexpected status ${res.status}`);
    const envelope = res.body as { error?: { code?: unknown } };
    assert.ok(
      envelope?.error?.code === 'bad_request' || envelope?.error?.code === 'validation_error',
      JSON.stringify(res.body),
    );
  });
});

describe('DELETE /api/admin/posts/:id', () => {
  it('10. removes the post and its comments', async () => {
    const post = await Post.create({
      userId: adminId,
      type: 'remedy',
      title: 'Tulsi tea',
      body: 'Steep the leaves.',
      sources: ['https://example.org/tulsi'],
      status: 'approved',
    });
    await Comment.create({ postId: post._id, userId: studentId, body: 'Thanks for this.' });
    await Comment.create({ postId: post._id, userId: adminId, body: 'Second comment.' });

    const res = await call(`/api/admin/posts/${String(post._id)}`, {
      method: 'DELETE',
      token: adminToken,
    });
    assert.equal(res.status, 204);

    assert.equal(await Post.countDocuments({ _id: post._id }), 0);
    assert.equal(await Comment.countDocuments({ postId: post._id }), 0);
  });
});
