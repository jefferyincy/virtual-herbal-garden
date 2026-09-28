import type { NextFunction, Request, RequestHandler, Response } from 'express';

/**
 * Wrap an async route handler so a rejected promise reaches the error middleware.
 * Express 4 does not catch rejections, so every async handler MUST go through this.
 *
 * This is the canonical wrapper for all new code. `asyncHandler` in `lib/http.ts` is the
 * earlier equivalent kept for modules already using it; the two differ only in typing
 * (this one infers the caller's own parameter list, so the `next` argument stays optional).
 */
export function route<T extends RequestHandler>(handler: T): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    void Promise.resolve(handler(req, res, next)).catch(next);
  };
}
