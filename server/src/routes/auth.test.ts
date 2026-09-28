/**
 * Route tests for the auth surface.
 *
 * Real mongod, real Express, real cookies: the refresh cookie is pulled out of `set-cookie` and
 * replayed by hand, since Node's fetch has no cookie jar. That is exactly the shape the client's
 * single-retry rule exercises.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, beforeEach, describe, it } from 'node:test';
import express, { type Express } from 'express';
import { z } from 'zod';

// config/env.ts validates process.env the moment it is imported, and the runner starts without
// --env-file, so these keys must exist before any module in the graph reaches the config. Static
// imports would hoist above them, which is why every project module is imported with top-level
// `await import()` below; the specifiers themselves are fixed.
process.env.NODE_ENV = 'test';
process.env.MONGO_URI ??= 'mongodb://127.0.0.1:27017/herbal_garden_test';
process.env.JWT_ACCESS_SECRET ??= 'test-access-secret-0123456789';
process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret-0123456789';
process.env.CLIENT_ORIGIN ??= 'http://localhost:5173';

const { connectDb, disconnectDb } = await import('../db.ts');
const mongoose = (await import('mongoose')).default;
const { User } = await import('../models/User.ts');
const { RefreshToken } = await import('../models/RefreshToken.ts');
const { PasswordReset } = await import('../models/PasswordReset.ts');
const { authRouter } = await import('./auth.ts');
const { errorHandler, notFoundHandler } = await import('../middleware/error.ts');
const cookieParser = (await import('cookie-parser')).default;

/** Dedicated database. Read the override first, then default to the local portable mongod. */
const TEST_URI = process.env.MONGO_TEST_URI ?? 'mongodb://127.0.0.1:27017/herbal_garden_test';
const REFRESH_COOKIE = 'vhg_refresh';
const PASSWORD = 'Garden-42!';
const JSON_HEADERS = { 'content-type': 'application/json' };

type PublicUserBody = {
  _id: string;
  name: string;
  email: string;
  handle: string;
  xp: number;
  level: number;
  interests: string[];
  experience: string;
  followedPlants: string[];
  streak: { current: number; longest: number; lastActiveAt: string | null };
};
type AuthBody = { user: PublicUserBody; accessToken: string };
type ForgotBody = { ok: boolean; devToken?: string };
type RequestResult<T> = { status: number; body: T; setCookie: string[] };

/** The error contract every failure case is asserted against. Parsed, never cast. */
const ERROR_ENVELOPE = z.object({
  error: z.object({ code: z.string().min(1), message: z.string().min(1) }),
});
type ErrorEnvelope = z.infer<typeof ERROR_ENVELOPE>;

let server: Server;
let baseUrl: string;

/**
 * Each request claims a distinct client IP so the fixed-window auth limiter (40 per 15 minutes
 * per IP) cannot accumulate across this suite and turn into a cross-test 429.
 */
let clientCounter = 0;
function nextClientIp(): string {
  clientCounter += 1;
  return `10.0.${(clientCounter >> 8) & 255}.${clientCounter & 255}`;
}

async function request<T>(
  path: string,
  init: { method?: string; headers?: Record<string, string>; body?: string } = {},
): Promise<RequestResult<T>> {
  const res = await fetch(`${baseUrl}${path}`, {
    method: init.method ?? 'GET',
    headers: { 'x-forwarded-for': nextClientIp(), ...init.headers },
    ...(init.body === undefined ? {} : { body: init.body }),
  });
  const text = await res.text();
  return {
    status: res.status,
    body: (text ? JSON.parse(text) : undefined) as T,
    setCookie: res.headers.getSetCookie(),
  };
}

function post<T>(
  path: string,
  body?: unknown,
  headers: Record<string, string> = {},
): Promise<RequestResult<T>> {
  return request<T>(path, {
    method: 'POST',
    headers: { ...JSON_HEADERS, ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** The `vhg_refresh=<value>` pair, ready to send back as a Cookie header. */
function refreshPair(setCookie: string[]): string {
  for (const header of setCookie) {
    const pair = header.split(';')[0] ?? '';
    if (pair.startsWith(`${REFRESH_COOKIE}=`)) return pair;
  }
  throw new Error(`no ${REFRESH_COOKIE} cookie in: ${setCookie.join(' | ')}`);
}

function refreshValue(setCookie: string[]): string {
  return refreshPair(setCookie).slice(REFRESH_COOKIE.length + 1);
}

function cookieHeader(setCookie: string[]): Record<string, string> {
  return { cookie: refreshPair(setCookie) };
}

/** Assert the documented `{ error: { code, message } }` envelope, not merely the status code. */
function expectError(body: unknown, code: string): { code: string; message: string } {
  const parsed = ERROR_ENVELOPE.safeParse(body);
  assert.ok(parsed.success, `expected an error envelope, got ${JSON.stringify(body)}`);
  assert.equal(parsed.data.error.code, code);
  return parsed.data.error;
}

function registerUser(email = 'ada@example.com', name = 'Ada Green'): Promise<RequestResult<AuthBody>> {
  return post<AuthBody>('/api/auth/register', { name, email, password: PASSWORD });
}

function loginUser(email = 'ada@example.com'): Promise<RequestResult<AuthBody>> {
  return post<AuthBody>('/api/auth/login', { email, password: PASSWORD });
}

before(async () => {
  await connectDb(TEST_URI);
  // The unique and TTL indexes are what the duplicate-email and reset lookups rely on.
  await Promise.all([User.init(), RefreshToken.init(), PasswordReset.init()]);

  // Minimal app: cookieParser (the refresh flow reads req.cookies), json body, the router under
  // test and the shared error middleware. Deliberately independent of the orchestrator's wiring.
  const app: Express = express();
  // The limiter keys on req.ip; trusting the forwarded header lets each test request claim its
  // own bucket so the fixed window never 429s across the suite.
  app.set('trust proxy', true);
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api', authRouter);
  app.use(notFoundHandler);
  app.use(errorHandler);

  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

beforeEach(async () => {
  await Promise.all([
    User.deleteMany({}),
    RefreshToken.deleteMany({}),
    PasswordReset.deleteMany({}),
  ]);
});

after(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
  await mongoose.connection.dropDatabase();
  await disconnectDb();
});

describe('POST /api/auth/register', () => {
  it('returns 201 with the user and an access token, and never the password hash', async () => {
    const { status, body, setCookie } = await registerUser();

    assert.equal(status, 201);
    assert.equal(typeof body.accessToken, 'string');
    assert.equal(body.user.email, 'ada@example.com');
    assert.equal(body.user.xp, 0);
    assert.equal(body.user.level, 1);
    assert.equal(body.user.experience, 'beginner');
    assert.deepEqual(body.user.interests, []);
    assert.ok(body.user.handle.length >= 3, 'handle must be usable at /u/:handle');

    for (const secret of ['passwordHash', 'resetTokenHash', 'resetTokenExpiresAt']) {
      assert.equal(JSON.stringify(body).includes(secret), false, `response leaked ${secret}`);
    }

    // The hash exists in the database; the raw password never does.
    const stored = await User.findOne({ email: 'ada@example.com' }).select('+passwordHash');
    assert.ok(stored?.passwordHash);
    assert.notEqual(stored.passwordHash, PASSWORD);
    assert.match(stored.passwordHash, /^\$2[aby]\$\d{2}\$/);

    const cookie = setCookie.find((value) => value.startsWith(`${REFRESH_COOKIE}=`));
    assert.ok(cookie, 'register must set the refresh cookie');
    assert.match(cookie, /HttpOnly/i);
    assert.match(cookie, /Path=\/api\/auth/i);
  });

  it('rejects a duplicate email with 409 while treating emails case-insensitively', async () => {
    await registerUser();
    const { status, body } = await post<ErrorEnvelope>('/api/auth/register', {
      name: 'Ada Again',
      email: 'ADA@example.com',
      password: PASSWORD,
    });

    assert.equal(status, 409);
    expectError(body, 'conflict');
    assert.equal(await User.countDocuments({}), 1);
  });
});

describe('POST /api/auth/login', () => {
  it('answers a wrong password and an unknown email with the identical 401 envelope', async () => {
    await registerUser();

    const wrongPassword = await post<ErrorEnvelope>('/api/auth/login', {
      email: 'ada@example.com',
      password: 'Wrong-123!',
    });
    const unknownEmail = await post<ErrorEnvelope>('/api/auth/login', {
      email: 'nobody@example.com',
      password: PASSWORD,
    });

    assert.equal(wrongPassword.status, 401);
    assert.equal(unknownEmail.status, 401);
    expectError(wrongPassword.body, 'unauthorized');
    expectError(unknownEmail.body, 'unauthorized');
    assert.deepEqual(wrongPassword.body, unknownEmail.body);
  });

  it('sets the streak on a first login, grows it after a day and resets it after a lapse', async () => {
    await registerUser();
    const first = await loginUser();
    assert.equal(first.status, 200);
    assert.equal(first.body.user.streak.current, 1);
    assert.equal(first.body.user.streak.longest, 1);

    // 30 hours is inside the 24h..48h consecutive-day window.
    await User.updateOne(
      { email: 'ada@example.com' },
      { $set: { 'streak.lastActiveAt': new Date(Date.now() - 30 * 3_600_000) } },
    );
    const second = await loginUser();
    assert.equal(second.body.user.streak.current, 2);
    assert.equal(second.body.user.streak.longest, 2);

    // 3 days apart is a broken streak: current restarts at 1, longest is retained.
    await User.updateOne(
      { email: 'ada@example.com' },
      { $set: { 'streak.lastActiveAt': new Date(Date.now() - 3 * 86_400_000) } },
    );
    const third = await loginUser();
    assert.equal(third.body.user.streak.current, 1);
    assert.equal(third.body.user.streak.longest, 2);
  });
});

describe('GET /api/auth/me', () => {
  it('requires a bearer token and returns the current user with one', async () => {
    await registerUser();
    const { body } = await loginUser();

    const anonymous = await request<ErrorEnvelope>('/api/auth/me');
    assert.equal(anonymous.status, 401);
    expectError(anonymous.body, 'unauthorized');

    const authenticated = await request<{ user: PublicUserBody }>('/api/auth/me', {
      headers: { authorization: `Bearer ${body.accessToken}` },
    });
    assert.equal(authenticated.status, 200);
    assert.equal(authenticated.body.user.email, 'ada@example.com');
    assert.equal(JSON.stringify(authenticated.body).includes('passwordHash'), false);
  });

  it('rejects a tampered access token', async () => {
    await registerUser();
    const { body } = await loginUser();
    const res = await request<ErrorEnvelope>('/api/auth/me', {
      headers: { authorization: `Bearer ${body.accessToken.slice(0, -3)}xyz` },
    });
    assert.equal(res.status, 401);
    expectError(res.body, 'unauthorized');
  });
});

describe('POST /api/auth/refresh', () => {
  it('rotates to a new access token and a different refresh cookie that works again', async () => {
    await registerUser();
    const login = await loginUser();
    const firstCookie = refreshValue(login.setCookie);

    const rotated = await post<AuthBody>('/api/auth/refresh', undefined, cookieHeader(login.setCookie));
    assert.equal(rotated.status, 200);

    // The rotated access token is fresh and usable. Its bytes are not compared against the login
    // token: an access JWT carries only sub/role/iat/exp, so two issued in the same second are
    // legitimately identical - asserting a difference would be a flaky test, not a stronger one.
    assert.equal(typeof rotated.body.accessToken, 'string');
    const me = await request<{ user: PublicUserBody }>('/api/auth/me', {
      headers: { authorization: `Bearer ${rotated.body.accessToken}` },
    });
    assert.equal(me.status, 200);
    assert.equal(me.body.user.email, 'ada@example.com');

    const secondCookie = refreshValue(rotated.setCookie);
    assert.notEqual(secondCookie, firstCookie);

    // Every persisted row stores only a hash: the raw cookie value must not be readable.
    const records = await RefreshToken.find({}).lean();
    for (const record of records) {
      assert.match(record.tokenHash, /^[0-9a-f]{64}$/);
      assert.notEqual(record.tokenHash, firstCookie);
      assert.notEqual(record.tokenHash, secondCookie);
    }

    // Rotation links the two tokens of the login family: the presented row is revoked and points
    // at its replacement, and the replacement is live in the same family. Registration issued a
    // token of its own family, so assertions are scoped to the family under test rather than to
    // the whole collection.
    const firstRecord = records.find((record) => record.tokenHash === sha256(firstCookie));
    const secondRecord = records.find((record) => record.tokenHash === sha256(secondCookie));
    assert.ok(firstRecord, 'the login refresh token should be persisted');
    assert.ok(secondRecord, 'the rotated refresh token should be persisted');
    assert.ok(firstRecord.revokedAt, 'the presented token should be marked revoked');
    assert.equal(firstRecord.replacedByHash, secondRecord.tokenHash);
    assert.equal(secondRecord.revokedAt, null);
    assert.equal(firstRecord.familyId, secondRecord.familyId);

    // The newest cookie keeps working.
    const again = await post<AuthBody>('/api/auth/refresh', undefined, cookieHeader(rotated.setCookie));
    assert.equal(again.status, 200);
    assert.notEqual(refreshValue(again.setCookie), secondCookie);
    assert.equal(again.body.user.email, 'ada@example.com');
  });

  it('detects reuse: replaying a rotated token kills the whole family', async () => {
    await registerUser();
    const login = await loginUser();
    const rotated = await post<AuthBody>('/api/auth/refresh', undefined, cookieHeader(login.setCookie));
    assert.equal(rotated.status, 200);

    // The original cookie was already rotated away; presenting it again is a replay.
    const replay = await post<ErrorEnvelope>('/api/auth/refresh', undefined, cookieHeader(login.setCookie));
    assert.equal(replay.status, 401);
    assert.match(expectError(replay.body, 'unauthorized').message, /reuse/i);
    // The dead cookie is cleared so the browser stops replaying it.
    assert.match(replay.setCookie.join(' | '), new RegExp(`${REFRESH_COOKIE}=;`));

    // The family is burned: the token minted by the rotation is rejected as well.
    const newest = await post<ErrorEnvelope>(
      '/api/auth/refresh',
      undefined,
      cookieHeader(rotated.setCookie),
    );
    assert.equal(newest.status, 401);
    expectError(newest.body, 'unauthorized');

    // The whole rotation family is burned, not just the replayed token. Scoped to the login
    // family because registration opened a separate family of its own.
    const loginFamily = (await RefreshToken.findOne({ tokenHash: sha256(refreshValue(login.setCookie)) }).lean())
      ?.familyId;
    assert.ok(loginFamily, 'the login token should be persisted');
    assert.equal(await RefreshToken.countDocuments({ familyId: loginFamily, revokedAt: null }), 0);
  });

  it('rejects a refresh with no cookie and with a forged one', async () => {
    const missing = await post<ErrorEnvelope>('/api/auth/refresh');
    assert.equal(missing.status, 401);
    expectError(missing.body, 'unauthorized');

    const forged = await post<ErrorEnvelope>('/api/auth/refresh', undefined, {
      cookie: `${REFRESH_COOKIE}=not-a-jwt`,
    });
    assert.equal(forged.status, 401);
    expectError(forged.body, 'unauthorized');
  });
});

describe('POST /api/auth/logout', () => {
  it('returns 204, clears the cookie and stops that cookie refreshing', async () => {
    await registerUser();
    const login = await loginUser();

    const loggedOut = await post<void>('/api/auth/logout', undefined, cookieHeader(login.setCookie));
    assert.equal(loggedOut.status, 204);
    assert.match(loggedOut.setCookie.join(' | '), new RegExp(`${REFRESH_COOKIE}=;`));

    const afterLogout = await post<ErrorEnvelope>(
      '/api/auth/refresh',
      undefined,
      cookieHeader(login.setCookie),
    );
    assert.equal(afterLogout.status, 401);
    expectError(afterLogout.body, 'unauthorized');
  });

  it('is idempotent without a cookie', async () => {
    const res = await post<void>('/api/auth/logout');
    assert.equal(res.status, 204);
  });
});

describe('forgot and reset', () => {
  it('answers 202 identically for a known and an unknown email', async () => {
    await registerUser();

    const known = await post<ForgotBody>('/api/auth/forgot', { email: 'ada@example.com' });
    const unknown = await post<ForgotBody>('/api/auth/forgot', { email: 'nobody@example.com' });

    assert.equal(known.status, 202);
    assert.equal(unknown.status, 202);
    assert.equal(known.body.ok, true);
    assert.equal(unknown.body.ok, true);
    assert.equal(typeof known.body.devToken, 'string');
    assert.equal(unknown.body.devToken, undefined);
    // Same shape and same `ok`; the only difference is the dev-only token. No enumeration.
    assert.equal(known.body.ok, true);
    assert.equal(unknown.body.ok, true);
    assert.deepEqual(Object.keys(known.body).sort(), ['devToken', 'ok']);
    assert.deepEqual(Object.keys(unknown.body), ['ok']);

    const stored = await PasswordReset.find({}).lean();
    assert.equal(stored.length, 1);
    assert.equal(stored[0]?.tokenHash, sha256(known.body.devToken ?? ''));
    assert.notEqual(stored[0]?.tokenHash, known.body.devToken);
  });

  it('resets the password, kills the old one and revokes every session', async () => {
    const registered = await registerUser();
    const preResetCookie = refreshValue(registered.setCookie);

    const forgot = await post<ForgotBody>('/api/auth/forgot', { email: 'ada@example.com' });
    const token = forgot.body.devToken;
    assert.ok(token);

    const reset = await post<{ ok: boolean }>('/api/auth/reset', { token, password: 'NewGarden-9!' });
    assert.equal(reset.status, 200);
    assert.equal(reset.body.ok, true);

    // The old password is gone, the new one works.
    const oldPassword = await post<ErrorEnvelope>('/api/auth/login', {
      email: 'ada@example.com',
      password: PASSWORD,
    });
    assert.equal(oldPassword.status, 401);
    expectError(oldPassword.body, 'unauthorized');

    const newPassword = await post<AuthBody>('/api/auth/login', {
      email: 'ada@example.com',
      password: 'NewGarden-9!',
    });
    assert.equal(newPassword.status, 200);

    // Every session that predates the reset is revoked, including the one issued at register.
    const preResetRefresh = await post<ErrorEnvelope>('/api/auth/refresh', undefined, {
      cookie: `${REFRESH_COOKIE}=${preResetCookie}`,
    });
    assert.equal(preResetRefresh.status, 401);
    expectError(preResetRefresh.body, 'unauthorized');

    // The reset token is single use.
    const reused = await post<ErrorEnvelope>('/api/auth/reset', { token, password: 'Another-9!' });
    assert.equal(reused.status, 401);
    expectError(reused.body, 'unauthorized');
  });

  it('rejects an invented reset token', async () => {
    const res = await post<ErrorEnvelope>('/api/auth/reset', {
      token: 'f'.repeat(64),
      password: 'NewGarden-9!',
    });
    assert.equal(res.status, 401);
    expectError(res.body, 'unauthorized');
  });
});

describe('PATCH /api/auth/onboarding', () => {
  it('persists the onboarding choices for the caller', async () => {
    await registerUser();
    const { body } = await loginUser();
    const plantId = '0123456789abcdef01234567';

    const res = await request<{ user: PublicUserBody }>('/api/auth/onboarding', {
      method: 'PATCH',
      headers: { ...JSON_HEADERS, authorization: `Bearer ${body.accessToken}` },
      body: JSON.stringify({
        interests: ['Ayurveda', 'Just curious'],
        experience: 'advanced',
        followedPlants: [plantId],
      }),
    });

    assert.equal(res.status, 200);
    assert.deepEqual(res.body.user.interests, ['Ayurveda', 'Just curious']);
    assert.equal(res.body.user.experience, 'advanced');
    assert.deepEqual(res.body.user.followedPlants, [plantId]);

    const stored = await User.findOne({ email: 'ada@example.com' });
    assert.deepEqual(stored?.interests, ['Ayurveda', 'Just curious']);
    assert.equal(stored?.experience, 'advanced');
  });

  it('requires authentication', async () => {
    const res = await request<ErrorEnvelope>('/api/auth/onboarding', {
      method: 'PATCH',
      headers: JSON_HEADERS,
      body: JSON.stringify({ interests: ['Ayurveda'] }),
    });
    assert.equal(res.status, 401);
    expectError(res.body, 'unauthorized');
  });
});

describe('validation', () => {
  it('rejects a password without a number or a symbol, and a short one, with 422', async () => {
    const cases = ['passwordonly!', 'password1234', 'Ab1!'];
    for (const password of cases) {
      const res = await post<ErrorEnvelope>('/api/auth/register', {
        name: 'Ada Green',
        email: 'ada@example.com',
        password,
      });
      assert.equal(res.status, 422, `expected 422 for "${password}"`);
      expectError(res.body, 'validation_error');
    }
    // A rejected registration must not have created an account.
    assert.equal(await User.countDocuments({}), 0);
  });

  it('rejects a malformed email and a too-short name with 422', async () => {
    const badEmail = await post<ErrorEnvelope>('/api/auth/register', {
      name: 'Ada Green',
      email: 'not-an-email',
      password: PASSWORD,
    });
    const shortName = await post<ErrorEnvelope>('/api/auth/register', {
      name: 'A',
      email: 'ada@example.com',
      password: PASSWORD,
    });

    assert.equal(badEmail.status, 422);
    assert.equal(shortName.status, 422);
    expectError(badEmail.body, 'validation_error');
    expectError(shortName.body, 'validation_error');
  });
});
