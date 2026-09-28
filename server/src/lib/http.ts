import type { NextFunction, Request, Response } from 'express';

/** Error with an explicit HTTP status. Thrown by services/routes, translated by the error middleware. */
export class HttpError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, message: string, opts: { code?: string; details?: unknown } = {}) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = opts.code ?? defaultCode(status);
    this.details = opts.details;
  }
}

function defaultCode(status: number): string {
  switch (status) {
    case 400:
      return 'bad_request';
    case 401:
      return 'unauthorized';
    case 403:
      return 'forbidden';
    case 404:
      return 'not_found';
    case 409:
      return 'conflict';
    case 422:
      return 'validation_error';
    case 429:
      return 'rate_limited';
    default:
      return status >= 500 ? 'internal_error' : 'error';
  }
}

export const badRequest = (message: string, details?: unknown) =>
  new HttpError(400, message, { details });
export const unauthorized = (message = 'Authentication required') => new HttpError(401, message);
export const forbidden = (message = 'Not allowed') => new HttpError(403, message);
export const notFound = (message = 'Not found') => new HttpError(404, message);
export const conflict = (message: string) => new HttpError(409, message);
export const unprocessable = (message: string, details?: unknown) =>
  new HttpError(422, message, { details });

/** Wrap an async route handler so rejected promises reach the error middleware. */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}
