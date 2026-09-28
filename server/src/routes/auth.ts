import { compare, hash } from 'bcrypt';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { isProd } from '../config/env.ts';
import { conflict, notFound, unauthorized } from '../lib/http.ts';
import { route } from '../lib/asyncRoute.ts';
import { requireAuth, signAccessToken } from '../middleware/auth.ts';
import { authLimiter } from '../middleware/rateLimit.ts';
import { validate } from '../middleware/validate.ts';
import { User, type UserDoc } from '../models/User.ts';
import { PasswordReset } from '../models/PasswordReset.ts';
import {
  REFRESH_COOKIE_NAME,
  issueRefreshToken,
  refreshCookieOptions,
  revokeAllForUser,
  revokeRefreshToken,
  rotateRefreshToken,
} from '../services/token.ts';

export const authRouter: Router = Router();

const BCRYPT_ROUNDS = 12;
const RESET_TTL_MS = 30 * 60_000;
const DAY_MS = 86_400_000;

const PASSWORD_SCHEMA = z
  .string()
  .min(8, 'Use at least 8 characters')
  .regex(/\d/, 'Include at least one number')
  .regex(/[^A-Za-z0-9]/, 'Include at least one symbol');

const registerSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(80),
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
  password: PASSWORD_SCHEMA,
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
  password: z.string().min(1, 'Enter your password'),
});

const forgotSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
});

const resetSchema = z.object({
  token: z.string().min(8, 'Reset token is missing'),
  password: PASSWORD_SCHEMA,
});

const onboardingSchema = z.object({
  interests: z.array(z.string().trim().min(1)).max(12).optional(),
  experience: z.enum(['beginner', 'intermediate', 'advanced']).optional(),
  followedPlants: z
    .array(z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid plant id'))
    .max(200)
    .optional(),
  name: z.string().trim().min(2).max(80).optional(),
});

type RegisterInput = z.infer<typeof registerSchema>;
type LoginInput = z.infer<typeof loginSchema>;
type ForgotInput = z.infer<typeof forgotSchema>;
type ResetInput = z.infer<typeof resetSchema>;
type OnboardingInput = z.infer<typeof onboardingSchema>;

/** Public JSON shape of a user. Secrets are absent by construction, not by deletion. */
type PublicUser = {
  _id: string;
  name: string;
  email: string;
  role: string;
  xp: number;
  level: number;
  streak: { current: number; longest: number; lastActiveAt: Date | null };
  badges: Array<{ key: string; earnedAt: Date }>;
  followedPlants: string[];
  interests: string[];
  experience: string;
  handle: string;
  bio: string;
  banned: boolean;
  createdAt: Date;
};

/**
 * The only shape a user leaves this API in, so `passwordHash` (and every future secret field)
 * cannot be leaked by a route that forgets to strip it.
 *
 * The parameter accepts a plain document, a lean result, or a hydrated mongoose document: the
 * inferred document type omits `_id`, which only appears on hydrated/lean results, so typing the
 * argument as `UserDoc & { _id?: unknown }` keeps both call styles compiling without a cast.
 */
export function toPublicUser(doc: UserDoc & { _id?: unknown }): PublicUser {
  return {
    _id: String(doc._id ?? ''),
    name: doc.name,
    email: doc.email,
    role: doc.role,
    xp: doc.xp,
    level: doc.level,
    streak: {
      current: doc.streak?.current ?? 0,
      longest: doc.streak?.longest ?? 0,
      lastActiveAt: doc.streak?.lastActiveAt ?? null,
    },
    badges: (doc.badges ?? []).map((badge) => ({ key: badge.key, earnedAt: badge.earnedAt })),
    followedPlants: (doc.followedPlants ?? []).map((id) => String(id)),
    interests: [...(doc.interests ?? [])],
    experience: doc.experience,
    handle: doc.handle,
    bio: doc.bio,
    banned: doc.banned,
    createdAt: (doc.createdAt as Date | undefined) ?? new Date(0),
  };
}

/**
 * A fixed hash compared against when no user matched. Without it, an unknown email returns
 * measurably faster than a wrong password, which is a user-enumeration oracle. The compared
 * value is random and is nobody's password.
 */
let timingEqualizerHash: string | null = null;
async function equalizeLoginTiming(): Promise<void> {
  timingEqualizerHash ??= await hash(`vhg::${randomUUID()}::timing-equalizer`, BCRYPT_ROUNDS);
  await compare('not-a-real-password', timingEqualizerHash);
}

/** sha256 hex of a raw token; the only form ever stored or looked up. */
function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** Cookie values are attacker-controlled strings; only a non-empty string is usable. */
function readRefreshCookie(req: Request): string | undefined {
  const cookies: Record<string, unknown> = req.cookies ?? {};
  const value = cookies[REFRESH_COOKIE_NAME];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/** Clear with the same path/security flags the cookie was set with; a path mismatch clears nothing. */
function clearRefreshCookie(res: Response): void {
  const { path, httpOnly, sameSite, secure } = refreshCookieOptions();
  res.clearCookie(REFRESH_COOKIE_NAME, { path, httpOnly, sameSite, secure });
}

/**
 * Resolve a collision-free handle, which is the key behind the stable public `/u/:handle` route.
 * A name that strips to fewer than 3 alphanumerics (or one already taken) gets a random suffix.
 */
async function allocateHandle(name: string): Promise<string> {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 24);
  const candidate = base.length >= 3 ? base : `${base}${Math.floor(100 + Math.random() * 900)}`;
  if (!(await User.exists({ handle: candidate }))) return candidate;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const suffixed = `${candidate.slice(0, 20)}${randomBytes(3).toString('hex')}`;
    if (!(await User.exists({ handle: suffixed }))) return suffixed;
  }
  return `${candidate.slice(0, 16)}${randomUUID().replace(/-/g, '').slice(0, 10)}`;
}

authRouter.post(
  '/auth/register',
  authLimiter,
  validate({ body: registerSchema }),
  route(async (req, res) => {
    // validate() already parsed and replaced req.body; the annotation restores the static type.
    const input: RegisterInput = req.body;

    if (await User.exists({ email: input.email })) {
      throw conflict('That email is already registered');
    }

    const passwordHash = await hash(input.password, BCRYPT_ROUNDS);
    const handle = await allocateHandle(input.name);

    let doc: UserDoc;
    try {
      doc = await User.create({
        name: input.name,
        email: input.email,
        passwordHash,
        handle,
        interests: [],
        experience: 'beginner',
        xp: 0,
        level: 1,
      });
    } catch (err) {
      // The exists() check is racy; the unique indexes are the real guarantee.
      if ((err as { code?: number }).code === 11000) {
        throw conflict('That email is already registered');
      }
      throw err;
    }

    const refresh = await issueRefreshToken({
      userId: String(doc._id),
      userAgent: req.get('user-agent'),
    });
    res.cookie(REFRESH_COOKIE_NAME, refresh.token, refreshCookieOptions());
    res.status(201).json({
      user: toPublicUser(doc),
      accessToken: signAccessToken({ id: String(doc._id), role: doc.role }),
    });
  }),
);

authRouter.post(
  '/auth/login',
  authLimiter,
  validate({ body: loginSchema }),
  route(async (req, res) => {
    const input: LoginInput = req.body;

    // passwordHash is `select: false`, so it has to be asked for explicitly.
    const doc = await User.findOne({ email: input.email }).select('+passwordHash');

    // Identical message and comparable work on both branches: no user enumeration.
    if (!doc?.passwordHash) {
      await equalizeLoginTiming();
      throw unauthorized('Email or password is incorrect');
    }
    if (!(await compare(input.password, doc.passwordHash))) {
      throw unauthorized('Email or password is incorrect');
    }

    // Streak window, applied to every login:
    //  - no prior activity    -> current = 1
    //  - under 24h since last -> unchanged (same day of practice)
    //  - 24h to 48h since last-> consecutive day, current + 1
    //  - over 48h since last  -> the streak broke, current = 1
    // `longest` ratchets to the highest `current` ever reached.
    const previous = doc.streak.lastActiveAt;
    const gapMs = previous ? Date.now() - previous.getTime() : null;
    if (gapMs === null) {
      doc.streak.current = 1;
      doc.streak.longest = Math.max(doc.streak.longest, 1);
    } else if (gapMs > 2 * DAY_MS) {
      doc.streak.current = 1;
    } else if (gapMs > DAY_MS) {
      doc.streak.current += 1;
      doc.streak.longest = Math.max(doc.streak.longest, doc.streak.current);
    }
    doc.streak.lastActiveAt = new Date();
    await doc.save();

    const refresh = await issueRefreshToken({
      userId: String(doc._id),
      userAgent: req.get('user-agent'),
    });
    res.cookie(REFRESH_COOKIE_NAME, refresh.token, refreshCookieOptions());
    res.status(200).json({
      user: toPublicUser(doc),
      accessToken: signAccessToken({ id: String(doc._id), role: doc.role }),
    });
  }),
);

authRouter.post(
  '/auth/refresh',
  route(async (req, res) => {
    const presented = readRefreshCookie(req);
    if (!presented) throw unauthorized('Invalid refresh token');

    let rotated: Awaited<ReturnType<typeof rotateRefreshToken>>;
    try {
      rotated = await rotateRefreshToken({ presentedToken: presented, userAgent: req.get('user-agent') });
    } catch (err) {
      // A dead or replayed token must not linger in the browser, or every later call replays it.
      clearRefreshCookie(res);
      throw err;
    }

    const doc = await User.findById(rotated.userId);
    if (!doc) {
      clearRefreshCookie(res);
      throw unauthorized('Invalid refresh token');
    }

    res.cookie(REFRESH_COOKIE_NAME, rotated.refresh.token, refreshCookieOptions());
    res.status(200).json({
      user: toPublicUser(doc),
      accessToken: signAccessToken({ id: String(doc._id), role: doc.role }),
    });
  }),
);

authRouter.post(
  '/auth/logout',
  route(async (req, res) => {
    const presented = readRefreshCookie(req);
    if (presented) await revokeRefreshToken(presented);
    clearRefreshCookie(res);
    // Idempotent: no cookie, unknown cookie and already-revoked cookie all end in 204.
    res.status(204).end();
  }),
);

authRouter.post(
  '/auth/forgot',
  authLimiter,
  validate({ body: forgotSchema }),
  route(async (req, res) => {
    const input: ForgotInput = req.body;
    const doc = await User.findOne({ email: input.email });

    // Always 202 with the same body: whether an account exists must not be observable.
    if (!doc) {
      res.status(202).json({ ok: true });
      return;
    }

    const token = randomBytes(32).toString('hex');
    await PasswordReset.create({
      userId: doc._id,
      tokenHash: sha256(token),
      expiresAt: new Date(Date.now() + RESET_TTL_MS),
      usedAt: null,
    });

    if (isProd) {
      // No mail provider exists yet; log instead of sending, and never return the token in prod.
      console.log('[auth] password reset requested; mail delivery is not configured');
      res.status(202).json({ ok: true });
      return;
    }

    // Development only: with no mail provider the token travels in the response so the reset
    // flow is smoke-testable end to end. Delete with the `isProd` branch once mail exists.
    res.status(202).json({ ok: true, devToken: token });
  }),
);

authRouter.post(
  '/auth/reset',
  authLimiter,
  validate({ body: resetSchema }),
  route(async (req, res) => {
    const input: ResetInput = req.body;

    // Single-use and unexpired: this filter is the whole guarantee, and it is atomic, so two
    // simultaneous resets cannot both succeed.
    const record = await PasswordReset.findOneAndUpdate(
      { tokenHash: sha256(input.token), usedAt: null, expiresAt: { $gt: new Date() } },
      { $set: { usedAt: new Date() } },
    );
    if (!record) throw unauthorized('That reset link is invalid or has expired');

    const doc = await User.findById(record.userId);
    if (!doc) throw notFound('Account not found');

    doc.passwordHash = await hash(input.password, BCRYPT_ROUNDS);
    await doc.save();

    // A reset logs every session out: a stolen refresh token dies with the old password.
    await revokeAllForUser(String(doc._id));
    res.status(200).json({ ok: true });
  }),
);

authRouter.get(
  '/auth/me',
  requireAuth,
  route(async (req, res) => {
    const caller = req.user;
    if (!caller) throw unauthorized('Authentication required');

    const doc = await User.findById(caller.id);
    if (!doc) throw unauthorized('Session expired');

    // `{ user }` rather than the bare object: the client's hydrate path reads `{user, accessToken}`
    // from /auth/refresh, so one field name covers both responses.
    res.status(200).json({ user: toPublicUser(doc) });
  }),
);

authRouter.patch(
  '/auth/onboarding',
  requireAuth,
  validate({ body: onboardingSchema }),
  route(async (req, res) => {
    const caller = req.user;
    if (!caller) throw unauthorized('Authentication required');
    const input: OnboardingInput = req.body;

    const doc = await User.findByIdAndUpdate(caller.id, { $set: { ...input } }, { new: true });
    if (!doc) throw unauthorized('Session expired');
    res.status(200).json({ user: toPublicUser(doc) });
  }),
);
