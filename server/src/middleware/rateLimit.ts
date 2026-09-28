import type { NextFunction, Request, RequestHandler, Response } from 'express';

type RateLimitOptions = {
  windowMs: number;
  max: number;
  keyPrefix?: string;
  by?: 'ip' | 'user';
};

type WindowEntry = { count: number; resetAt: number };

const MAX_TRACKED_KEYS = 10_000;
const SWEEP_INTERVAL_MS = 5 * 60_000;

/**
 * Fixed-window in-memory limiter. Deliberately dependency-free and per-process: good enough
 * to blunt credential stuffing on a single node, not a substitute for an edge limiter.
 *
 * `by: 'user'` keys on the authenticated user id and falls back to the client IP for
 * anonymous or unauthenticated requests.
 */
export function rateLimit({
  windowMs,
  max,
  keyPrefix = 'rl',
  by = 'ip',
}: RateLimitOptions): RequestHandler {
  const hits = new Map<string, WindowEntry>();

  const sweep = () => {
    const now = Date.now();
    for (const [key, entry] of hits) {
      if (entry.resetAt <= now) hits.delete(key);
    }
  };

  // Never hold the process open for a sweeper thread; a referenced interval would block shutdown.
  setInterval(sweep, SWEEP_INTERVAL_MS).unref();

  return (req: Request, res: Response, next: NextFunction): void => {
    const now = Date.now();
    const identity = by === 'user' ? (req.user?.id ?? req.ip) : req.ip;
    const key = `${keyPrefix}:${identity ?? 'unknown'}`;

    let entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      if (!entry && hits.size >= MAX_TRACKED_KEYS) {
        sweep();
        // Still full: drop the oldest key so a burst of unique IPs cannot grow the map forever.
        const oldest = hits.keys().next();
        if (!oldest.done) hits.delete(oldest.value);
      }
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(key, entry);
    }

    entry.count += 1;
    if (entry.count > max) {
      res.setHeader('Retry-After', String(Math.max(1, Math.ceil((entry.resetAt - now) / 1000))));
      res.status(429).json({
        error: { code: 'rate_limited', message: 'Too many requests, try again shortly' },
      });
      return;
    }

    next();
  };
}

export const authLimiter = rateLimit({ windowMs: 15 * 60_000, max: 40, keyPrefix: 'auth' });
export const writeLimiter = rateLimit({ windowMs: 60_000, max: 60, keyPrefix: 'write' });
