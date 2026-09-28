import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { HttpError } from '../lib/http.ts';
import { isProd } from '../config/env.ts';

/** 404 fallback for unmatched /api routes. */
export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    error: { code: 'not_found', message: `No route for ${req.method} ${req.originalUrl}` },
  });
}

/**
 * Terminal error middleware. Every failure leaves the API as:
 *   { error: { code, message, details? } }
 * so the client can render one consistent error shape.
 */
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof ZodError) {
    res.status(422).json({
      error: {
        code: 'validation_error',
        message: 'Request failed validation',
        details: err.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      },
    });
    return;
  }

  if (err instanceof HttpError) {
    res.status(err.status).json({
      error: {
        code: err.code,
        message: err.message,
        ...(err.details === undefined ? {} : { details: err.details }),
      },
    });
    return;
  }

  // Mongoose duplicate key -> 409 so the client can show a field message.
  const mongoErr = err as { code?: number; keyValue?: Record<string, unknown> };
  if (mongoErr?.code === 11000) {
    res.status(409).json({
      error: {
        code: 'conflict',
        message: 'That value already exists',
        details: mongoErr.keyValue ?? null,
      },
    });
    return;
  }

  // A malformed percent-encoded path/query (e.g. `/api/regions/%FF/plants`) makes Express's
  // decoding throw a URIError. That is a bad request, not a server fault.
  if (err instanceof URIError) {
    res.status(400).json({
      error: { code: 'bad_request', message: 'Malformed URL encoding' },
    });
    return;
  }

  if (!isProd) console.error('[unhandled]', err);
  res.status(500).json({
    error: {
      code: 'internal_error',
      message: isProd ? 'Something went wrong' : String((err as Error)?.message ?? err),
    },
  });
}
