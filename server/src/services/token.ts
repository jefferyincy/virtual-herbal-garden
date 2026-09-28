import { createHash, randomUUID } from 'node:crypto';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { env } from '../config/env.ts';
import { unauthorized } from '../lib/http.ts';
import { RefreshToken } from '../models/RefreshToken.ts';

/** One access token (memory, client-side) plus one refresh token (httpOnly cookie). */
export type TokenPair = { accessToken: string; refreshToken: string };

export type IssuedRefresh = { token: string; expiresAt: Date; familyId: string };

export const REFRESH_COOKIE_NAME = 'vhg_refresh';

const REFRESH_PATH = '/api/auth';
const UNIT_MS: Record<string, number> = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };

/**
 * Parse a JWT-style duration (`7d`, `12h`, `30m`, `90s`) or a bare number of seconds into
 * milliseconds. Exported behaviour, not a formality: the refresh cookie's `maxAge` and the
 * stored `expiresAt` must agree with the JWT's own expiry.
 */
export function durationToMs(value: string): number {
  const match = /^(\d+)([smhd])?$/i.exec(value.trim());
  if (!match?.[1]) {
    throw new Error(`Unparseable duration "${value}" (expected forms like 7d, 12h, 30m)`);
  }
  const unit = (match[2] ?? 's').toLowerCase();
  const factor = UNIT_MS[unit];
  if (factor === undefined) throw new Error(`Unsupported duration unit in "${value}"`);
  return Number(match[1]) * factor;
}

/** Lifetime of a refresh token in milliseconds, derived from `env.REFRESH_TTL`. */
export function refreshTtlMs(): number {
  return durationToMs(env.REFRESH_TTL);
}

/** sha256 hex of a raw refresh token; the only form ever written to the database. */
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Sign a refresh JWT. Claims: `sub` = user id, `fam` = rotation family, `jti` = token id. */
export function signRefreshToken(payload: { userId: string; familyId: string; jti: string }): {
  token: string;
  expiresAt: Date;
} {
  const token = jwt.sign(
    { sub: payload.userId, fam: payload.familyId, jti: payload.jti },
    env.JWT_REFRESH_SECRET,
    { algorithm: 'HS256', expiresIn: env.REFRESH_TTL as SignOptions['expiresIn'] },
  );
  return { token, expiresAt: new Date(Date.now() + refreshTtlMs()) };
}

/** Verify a refresh JWT. Any signature/expiry/shape problem is a generic 401 - no details leak. */
export function verifyRefreshToken(token: string): { userId: string; familyId: string; jti: string } {
  let decoded: unknown;
  try {
    decoded = jwt.verify(token, env.JWT_REFRESH_SECRET, { algorithms: ['HS256'] });
  } catch {
    throw unauthorized('Invalid refresh token');
  }
  if (typeof decoded !== 'object' || decoded === null) throw unauthorized('Invalid refresh token');
  const claims = decoded as { sub?: unknown; fam?: unknown; jti?: unknown };
  if (
    typeof claims.sub !== 'string' ||
    typeof claims.fam !== 'string' ||
    typeof claims.jti !== 'string'
  ) {
    throw unauthorized('Invalid refresh token');
  }
  return { userId: claims.sub, familyId: claims.fam, jti: claims.jti };
}

/** Issue (and store) a refresh token. Without `familyId` this starts a brand new family. */
export async function issueRefreshToken(params: {
  userId: string;
  familyId?: string;
  userAgent?: string;
}): Promise<IssuedRefresh> {
  const familyId = params.familyId ?? randomUUID();
  const jti = randomUUID();
  const { token, expiresAt } = signRefreshToken({ userId: params.userId, familyId, jti });
  await RefreshToken.create({
    userId: params.userId,
    tokenHash: hashToken(token),
    familyId,
    expiresAt,
    revokedAt: null,
    replacedByHash: null,
    userAgent: params.userAgent ?? '',
  });
  return { token, expiresAt, familyId };
}

/**
 * Rotate a presented refresh token: revoke it, mint a successor in the same family.
 *
 * Reuse detection is the point of the whole structure. A token that was already rotated or
 * revoked means either an attacker replaying a stolen cookie or a race; in both cases the only
 * safe answer is to burn the family the token belongs to and force a fresh login. An unknown
 * hash is treated the same way: the signature is valid but this server never issued it.
 */
export async function rotateRefreshToken(params: {
  presentedToken: string;
  userAgent?: string;
}): Promise<{ userId: string; refresh: IssuedRefresh }> {
  const payload = verifyRefreshToken(params.presentedToken);
  const tokenHash = hashToken(params.presentedToken);

  const record = await RefreshToken.findOne({ tokenHash });
  if (!record) {
    await revokeFamily(payload.familyId);
    throw unauthorized('Refresh token reuse detected');
  }

  if (record.revokedAt || record.replacedByHash) {
    await revokeFamily(payload.familyId);
    throw unauthorized('Refresh token reuse detected');
  }

  if (record.expiresAt.getTime() <= Date.now()) throw unauthorized('Refresh token expired');

  // Mint the successor first so `replacedByHash` can be written in the same atomic update.
  const jti = randomUUID();
  const { token: nextToken, expiresAt: nextExpiresAt } = signRefreshToken({
    userId: payload.userId,
    familyId: payload.familyId,
    jti,
  });
  const nextHash = hashToken(nextToken);

  // The `revokedAt: null` filter is the concurrency guard: exactly one of two simultaneous
  // refreshes can match this document. The loser gets null and falls into the reuse branch,
  // which is what makes a double-refresh of one cookie impossible.
  const claimed = await RefreshToken.findOneAndUpdate(
    { tokenHash, revokedAt: null, replacedByHash: null },
    { $set: { revokedAt: new Date(), replacedByHash: nextHash } },
  );
  if (!claimed) {
    await revokeFamily(payload.familyId);
    throw unauthorized('Refresh token reuse detected');
  }

  await RefreshToken.create({
    userId: payload.userId,
    tokenHash: nextHash,
    familyId: payload.familyId,
    expiresAt: nextExpiresAt,
    revokedAt: null,
    replacedByHash: null,
    userAgent: params.userAgent ?? '',
  });

  return {
    userId: payload.userId,
    refresh: { token: nextToken, expiresAt: nextExpiresAt, familyId: payload.familyId },
  };
}

/** Revoke a single presented token (logout). Unknown or malformed tokens are a no-op. */
export async function revokeRefreshToken(token: string): Promise<void> {
  await RefreshToken.updateOne(
    { tokenHash: hashToken(token), revokedAt: null },
    { $set: { revokedAt: new Date() } },
  );
}

/** Revoke every token in a rotation family. Returns how many records changed. */
export async function revokeFamily(familyId: string): Promise<number> {
  const result = await RefreshToken.updateMany(
    { familyId, revokedAt: null },
    { $set: { revokedAt: new Date() } },
  );
  return result.modifiedCount;
}

/** Revoke every token a user holds, across all families (password reset, ban). */
export async function revokeAllForUser(userId: string): Promise<number> {
  const result = await RefreshToken.updateMany(
    { userId, revokedAt: null },
    { $set: { revokedAt: new Date() } },
  );
  return result.modifiedCount;
}

/**
 * Cookie flags for the refresh token. httpOnly keeps it out of JS reach (XSS cannot exfiltrate
 * it), `sameSite: 'lax'` still lets the SPA call the API cross-port in dev while blocking
 * cross-site POSTs, `secure` only in production so local http works, and the `path` scope keeps
 * the cookie off every request except the auth endpoints.
 */
export function refreshCookieOptions(): {
  httpOnly: true;
  sameSite: 'lax';
  secure: boolean;
  path: string;
  maxAge: number;
} {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.NODE_ENV === 'production',
    path: REFRESH_PATH,
    maxAge: refreshTtlMs(),
  };
}
