import { Router, type Express, type RequestHandler } from 'express';
import { HttpError } from '../lib/http.ts';
import { route } from '../lib/asyncRoute.ts';

/** Every phase router mounts onto this one instance, which app.ts exposes under `/api`. */
export const apiRouter: Router = Router();

/** Paths already registered, so a double mount is caught instead of silently shadowing. */
export const mountedRouterPaths: string[] = [];

/** Called once from app.ts. Phase files must use `registerRouter` instead. */
export function mountApiRouter(app: Express): void {
  app.use('/api', apiRouter);
}

export function registerRouter(path: string, router: Router): void {
  if (mountedRouterPaths.includes(path)) {
    console.warn(`[routes] "${path}" is already mounted, ignoring duplicate registration`);
    return;
  }
  mountedRouterPaths.push(path);
  apiRouter.use(path, router);
}

/** Placeholder for endpoints that land in a later phase: fails with a real 501, not a 404. */
export function notImplemented(feature: string): RequestHandler {
  return route(async () => {
    throw new HttpError(501, `${feature} is not implemented yet`);
  });
}
