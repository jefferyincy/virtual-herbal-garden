import type { NextFunction, Request, Response } from 'express';
import type { ZodTypeAny, z } from 'zod';
import { unprocessable } from '../lib/http.ts';

type Schemas<TBody extends ZodTypeAny, TQuery extends ZodTypeAny, TParams extends ZodTypeAny> = {
  body?: TBody;
  query?: TQuery;
  params?: TParams;
};

/**
 * Validate + coerce request input with zod and replace the raw values with parsed ones.
 * Controllers can then trust `req.body`/`req.query` completely.
 */
export function validate<
  TBody extends ZodTypeAny = ZodTypeAny,
  TQuery extends ZodTypeAny = ZodTypeAny,
  TParams extends ZodTypeAny = ZodTypeAny,
>(schemas: Schemas<TBody, TQuery, TParams>) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      if (schemas.params) req.params = schemas.params.parse(req.params) as Request['params'];
      if (schemas.query) {
        // Express 4 exposes a live getter; assign onto a plain writable copy.
        const parsed = schemas.query.parse(req.query);
        Object.defineProperty(req, 'query', { value: parsed, writable: true, configurable: true });
      }
      if (schemas.body) req.body = schemas.body.parse(req.body) as Request['body'];
      next();
    } catch (err) {
      next(err instanceof Error ? err : unprocessable('Invalid request'));
    }
  };
}

/** Narrow helper for controllers that need the parsed query type explicitly. */
export type Infer<T extends ZodTypeAny> = z.infer<T>;
