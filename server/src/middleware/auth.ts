import type { NextFunction, Request, RequestHandler, Response } from 'express';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { env } from '../config/env.ts';
import { forbidden, unauthorized } from '../lib/http.ts';

export type AuthUser = { id: string; role: 'student' | 'expert' | 'admin' };

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

const BEARER = /^Bearer\s+(\S+)$/i;

function isRole(value: unknown): value is AuthUser['role'] {
  return value === 'student' || value === 'expert' || value === 'admin';
}

/** Sign a short-lived access token. The client keeps it in memory only. */
export function signAccessToken(payload: AuthUser): string {
  return jwt.sign({ sub: payload.id, role: payload.role }, env.JWT_ACCESS_SECRET, {
    algorithm: 'HS256',
    expiresIn: env.ACCESS_TTL as SignOptions['expiresIn'],
  });
}

/** Verify an access token. The underlying jwt error is never surfaced to the client. */
export function verifyAccessToken(token: string): AuthUser {
  let decoded: unknown;
  try {
    decoded = jwt.verify(token, env.JWT_ACCESS_SECRET, { algorithms: ['HS256'] });
  } catch (err) {
    throw err instanceof jwt.TokenExpiredError
      ? unauthorized('Session expired')
      : unauthorized('Invalid token');
  }

  if (typeof decoded !== 'object' || decoded === null) throw unauthorized('Invalid token');
  const claims = decoded as { sub?: unknown; role?: unknown };
  if (typeof claims.sub !== 'string' || !isRole(claims.role)) throw unauthorized('Invalid token');
  return { id: claims.sub, role: claims.role };
}

/** Reject the request unless it carries a valid `Authorization: Bearer <token>` header. */
export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const token = BEARER.exec(req.headers.authorization?.trim() ?? '')?.[1] ?? null;
  if (!token) {
    next(unauthorized('Authentication required'));
    return;
  }
  try {
    req.user = verifyAccessToken(token);
  } catch (err) {
    next(err);
    return;
  }
  next();
}

/** Populate `req.user` when a valid token is present, but never reject (public read routes). */
export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  const token = BEARER.exec(req.headers.authorization?.trim() ?? '')?.[1] ?? null;
  if (token) {
    try {
      req.user = verifyAccessToken(token);
    } catch {
      // An unusable token degrades to anonymous rather than failing the request.
    }
  }
  next();
}

/** Runs after `requireAuth`; allows only the listed roles. */
export function requireRole(...roles: AuthUser['role'][]): RequestHandler {
  return (req, _res, next) => {
    const user = req.user;
    if (!user) {
      next(unauthorized());
      return;
    }
    if (!roles.includes(user.role)) {
      next(forbidden(`Requires role: ${roles.join(' or ')}`));
      return;
    }
    next();
  };
}

/** Allows the resource owner (`req.params[paramName]` === caller id) or one of the listed roles. */
export function requireSelfOrRole(paramName: string, ...roles: AuthUser['role'][]): RequestHandler {
  return (req, _res, next) => {
    const user = req.user;
    if (!user) {
      next(unauthorized());
      return;
    }
    if (req.params[paramName] === user.id || roles.includes(user.role)) {
      next();
      return;
    }
    next(forbidden());
  };
}
