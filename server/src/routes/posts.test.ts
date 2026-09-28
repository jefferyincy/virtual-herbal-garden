/**
 * Route tests for the community surface: post visibility, upvote toggling, comment counts,
 * moderation authority, XP idempotency and the public profile projection.
 *
 * Real mongod, real Express, real signed tokens: every case goes through the HTTP layer the
 * client calls, so a projection leak (an email, a raw `upvotes` array, a pending body) would show
 * up here as a body assertion rather than as a passing unit test of a helper.
 *
 * The env keys MUST exist before anything that reads `config/env.ts` is imported, because that
 * module validates `process.env` at import time and the runner starts without `--env-file`.
 * Static imports are hoisted above any assignment, so every project module is pulled in with a
 * dynamic `await import()` after the assignment block below.
 */
import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, beforeEach, test } from 'node:test';
import express, { type Express } from 'express';

process.env.NODE_ENV = 'test';
process.env.MONGO_URI ??= 'mongodb://127.0.0.1:27017/herbal_garden_test';
process.env.JWT_ACCESS_SECRET ??= 'test-access-secret-0123456789';
process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret-0123456789';

const { connectDb, disconnectDb } = await import('../db.ts');
const { Badge, Comment, Garden, Notification, Plant, Post, Progress, User } = await import(
  '../models/index.ts'
);
const { signAccessToken } = await import('../middleware/auth.ts');
const { errorHandler, notFoundHandler } = await import('../middleware/error.ts');
const { postsRouter } = await import('./posts.ts');

let server!: Server;
let baseUrl!: string;

before(async () => {
  await connectDb('mongodb://127.0.0.1:27017/herbal_garden_test');
  const app: Express = express();
  app.use(express.json());
  // The orchestrator mounts this router at the API root; the paths inside it are absolute.
  app.use('/api', postsRouter);
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

// Only this suite's collections are cleared. The mongod is shared with the other suites, so
// dropping the database would delete their fixtures mid-run.
beforeEach(async () => {
  await Promise.all([
    Post.deleteMany({}),
    Comment.deleteMany({}),
    User.deleteMany({}),
    Plant.deleteMany({}),
    Notification.deleteMany({}),
    Badge.deleteMany({}),
    Progress.deleteMany({}),
    Garden.deleteMany({}),
  ]);
});

type FetchOpts = { method?: string; token?: string; body?: unknown };

type ErrorBody = { error: { code: string; message: string } };
type FeedRow = {
  _id: string;
  type: string;
  title: string;
  body: string;
  status: string;
  upvoteCount: number;
  commentCount: number;
  expertApproved: boolean;
  upvotes?: unknown;
  reviewerId?: unknown;
  author: { handle: string; name: string } | null;
};
type FeedBody = { items: FeedRow[]; total: number };

async function call(
  path: string,
  opts: FetchOpts = {},
): Promise<{ status: number; body: unknown }> {
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

type Role = 'student' | 'expert' | 'admin';

async function makeUser(name: string, role: Role = 'student') {
  const handle = name.toLowerCase().replace(/\s+/g, '-');
  const email = `${handle}@example.com`;
  const user = await User.create({
    name,
    email,
    passwordHash: 'x'.repeat(20),
    handle,
    role,
  });
  return { user, handle, email, token: signAccessToken({ id: String(user._id), role }) };
}

/** A body that clears the 20-character minimum without any fixture coupling. */
const POST_BODY = 'A note long enough to pass the twenty character minimum.';

/** Create a post through the API and return its id. */
async function createPost(
  token: string,
  overrides: Record<string, unknown> = {},
): Promise<string> {
  const created = await call('/api/posts', {
    method: 'POST',
    token,
    body: { type: 'note', title: 'A garden note', body: POST_BODY, ...overrides },
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const { post } = created.body as { post: { _id: string } };
  return post._id;
}

async function approve(postId: string, token: string, note?: string) {
  const res = await call(`/api/posts/${postId}/moderate`, {
    method: 'PATCH',
    token,
    body: note === undefined ? { action: 'approve' } : { action: 'approve', note },
  });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return res;
}

test('1. a new post is pending: hidden from the anonymous feed, visible to its author', async () => {
  const { handle, token } = await makeUser('Ann');
  const postId = await createPost(token);

  const stored = await Post.findById(postId).lean<{ status: string } | null>();
  assert.equal(stored?.status, 'pending');

  const anonymous = await call('/api/posts');
  assert.equal(anonymous.status, 200);
  assert.deepEqual((anonymous.body as FeedBody).items, []);

  const own = await call(`/api/posts?author=${handle}`, { token });
  assert.equal(own.status, 200);
  const items = (own.body as FeedBody).items;
  assert.equal(items.length, 1);
  assert.equal(items[0]?._id, postId);
  assert.equal(items[0]?.status, 'pending');
});

test('2. a remedy with no source is refused; one source is accepted', async () => {
  const { token } = await makeUser('Ann');

  const uncited = await call('/api/posts', {
    method: 'POST',
    token,
    body: { type: 'remedy', title: 'Tulsi for a cough', body: POST_BODY },
  });
  assert.ok(uncited.status === 422 || uncited.status === 400, String(uncited.status));
  assert.match(JSON.stringify(uncited.body), /Remedies must cite at least one source/);

  const cited = await call('/api/posts', {
    method: 'POST',
    token,
    body: {
      type: 'remedy',
      title: 'Tulsi for a cough',
      body: POST_BODY,
      sources: ['https://example.org/tulsi'],
    },
  });
  assert.equal(cited.status, 201, JSON.stringify(cited.body));
});

test('3. a moderator sees pending posts in the feed', async () => {
  const author = await makeUser('Ann');
  const admin = await makeUser('Root', 'admin');
  await createPost(author.token);

  const anonymous = await call('/api/posts');
  assert.deepEqual((anonymous.body as FeedBody).items, []);

  const asModerator = await call('/api/posts', { token: admin.token });
  const items = (asModerator.body as FeedBody).items;
  assert.equal(items.length, 1);
  assert.equal(items[0]?.status, 'pending');
});

test('4. approving publishes the post to the anonymous feed', async () => {
  const author = await makeUser('Ann');
  const expert = await makeUser('Dr Green', 'expert');
  const postId = await createPost(author.token);

  await approve(postId, expert.token);

  const anonymous = await call('/api/posts');
  const items = (anonymous.body as FeedBody).items;
  assert.equal(items.length, 1);
  assert.equal(items[0]?._id, postId);
  assert.equal(items[0]?.status, 'approved');
  // The approver is an expert, so the row carries the expert-approved marker.
  assert.equal(items[0]?.expertApproved, true);
  // The raw vote array and the reviewer id never leave the API.
  assert.equal(items[0]?.upvotes, undefined);
  assert.equal(items[0]?.reviewerId, undefined);
});

test('5. upvoting twice toggles the vote off again', async () => {
  const author = await makeUser('Ann');
  const voter = await makeUser('Bo');
  const admin = await makeUser('Root', 'admin');
  const postId = await createPost(author.token);
  await approve(postId, admin.token);

  const first = await call(`/api/posts/${postId}/upvote`, { method: 'POST', token: voter.token });
  assert.equal(first.status, 200, JSON.stringify(first.body));
  assert.deepEqual(first.body, { upvoteCount: 1, upvoted: true });

  const second = await call(`/api/posts/${postId}/upvote`, { method: 'POST', token: voter.token });
  assert.equal(second.status, 200, JSON.stringify(second.body));
  assert.deepEqual(second.body, { upvoteCount: 0, upvoted: false });
});

test('6. a user cannot upvote their own post', async () => {
  const author = await makeUser('Ann');
  const admin = await makeUser('Root', 'admin');
  const postId = await createPost(author.token);
  await approve(postId, admin.token);

  const res = await call(`/api/posts/${postId}/upvote`, { method: 'POST', token: author.token });
  assert.equal(res.status, 400, JSON.stringify(res.body));
});

test('7. the feed reports a real comment count', async () => {
  const author = await makeUser('Ann');
  const first = await makeUser('Bo');
  const second = await makeUser('Cy');
  const admin = await makeUser('Root', 'admin');
  const postId = await createPost(author.token);
  await approve(postId, admin.token);

  for (const commenter of [first, second]) {
    const res = await call(`/api/posts/${postId}/comments`, {
      method: 'POST',
      token: commenter.token,
      body: { body: `Comment from ${commenter.handle}` },
    });
    assert.equal(res.status, 201, JSON.stringify(res.body));
  }

  const anonymous = await call('/api/posts');
  const items = (anonymous.body as FeedBody).items;
  assert.equal(items.length, 1);
  assert.equal(items[0]?.commentCount, 2);
});

test('8. only an expert or admin may moderate; the author is notified', async () => {
  const author = await makeUser('Ann');
  const student = await makeUser('Bo');
  const expert = await makeUser('Dr Green', 'expert');
  const postId = await createPost(author.token);

  const denied = await call(`/api/posts/${postId}/moderate`, {
    method: 'PATCH',
    token: student.token,
    body: { action: 'approve' },
  });
  assert.equal(denied.status, 403, JSON.stringify(denied.body));

  await approve(postId, expert.token);

  const rows = await Notification.find({ userId: author.user._id, type: 'moderation' }).lean();
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.read, false);
});

test('9. the public profile is 404 for an unknown handle and never leaks an email', async () => {
  const author = await makeUser('Ann');

  const missing = await call('/api/users/nobody-here/profile');
  assert.equal(missing.status, 404, JSON.stringify(missing.body));

  const found = await call('/api/users/ann/profile');
  assert.equal(found.status, 200, JSON.stringify(found.body));
  assert.equal(found.body !== null, true);
  // One assertion over the whole serialised body: a leak anywhere in the payload fails this.
  assert.equal(JSON.stringify(found.body).includes(author.email), false);
});

test('10. a reply to a comment on another post is rejected', async () => {
  const author = await makeUser('Ann');
  const admin = await makeUser('Root', 'admin');
  const firstPost = await createPost(author.token);
  const secondPost = await createPost(author.token, { title: 'A second garden note' });
  await approve(firstPost, admin.token);
  await approve(secondPost, admin.token);

  const parent = await call(`/api/posts/${secondPost}/comments`, {
    method: 'POST',
    token: author.token,
    body: { body: 'Parent comment on the second post' },
  });
  assert.equal(parent.status, 201, JSON.stringify(parent.body));
  const { comment } = parent.body as { comment: { _id: string } };

  const reply = await call(`/api/posts/${firstPost}/comments`, {
    method: 'POST',
    token: author.token,
    body: { body: 'A reply that points across posts', parentId: comment._id },
  });
  assert.equal(reply.status, 400, JSON.stringify(reply.body));
  assert.match((reply.body as ErrorBody).error.message, /different post/);
});

test('11. approval awards the contribution XP once, never twice', async () => {
  const author = await makeUser('Ann');
  const expert = await makeUser('Dr Green', 'expert');
  const postId = await createPost(author.token);

  assert.equal((await User.findById(author.user._id).lean<{ xp: number } | null>())?.xp, 0);

  await approve(postId, expert.token);
  const afterFirst = await User.findById(author.user._id).lean<{ xp: number } | null>();
  assert.ok((afterFirst?.xp ?? 0) > 0, 'the first approve must award contribution XP');
  const awarded = afterFirst?.xp ?? 0;

  await approve(postId, expert.token);
  const afterSecond = await User.findById(author.user._id).lean<{ xp: number } | null>();
  assert.equal(afterSecond?.xp, awarded);
});
