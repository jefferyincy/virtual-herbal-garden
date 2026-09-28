import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express } from 'express';
import { env } from './config/env.ts';
import { errorHandler, notFoundHandler } from './middleware/error.ts';
import { healthRouter } from './routes/health.ts';
import { ailmentsRouter } from './routes/ailments.ts';
import { adminRouter } from './routes/admin.ts';
import { authRouter } from './routes/auth.ts';
import { badgesRouter } from './routes/badges.ts';
import { flashcardsRouter } from './routes/flashcards.ts';
import { gardensRouter } from './routes/gardens.ts';
import { lessonsRouter } from './routes/lessons.ts';
import { notificationsRouter } from './routes/notifications.ts';
import { plantsRouter } from './routes/plants.ts';
import { postsRouter } from './routes/posts.ts';
import { progressRouter } from './routes/progress.ts';
import { publicGardenRouter } from './routes/publicGarden.ts';
import { quizzesRouter } from './routes/quizzes.ts';
import { apiRouter, mountApiRouter, registerRouter } from './routes/index.ts';

/**
 * Express application factory. Middleware order (cors -> cookies -> body -> routes -> 404 -> errors)
 * and the whole router register live in this one function so the API surface is auditable at a glance.
 *
 * Two mounting styles coexist deliberately:
 *   - `registerRouter(prefix, router)` for routers written prefix-relative (they declare '/', '/:id')
 *   - `apiRouter.use(router)` for routers that declare their own full paths ('/posts', '/lessons')
 *     These cannot go through registerRouter because it keys its duplicate guard on the mount path.
 */
export function createApp(): Express {
  const app = express();

  app.disable('x-powered-by');
  // Trust exactly the configured number of proxy hops so `req.ip` is the real client behind a
  // hosting proxy (the rate limiter buckets per IP); 0 by default so `X-Forwarded-For` cannot be
  // spoofed when the app is reached directly.
  if (env.TRUST_PROXY > 0) app.set('trust proxy', env.TRUST_PROXY);
  app.use(cors({ origin: env.CLIENT_ORIGIN, credentials: true }));
  app.use(cookieParser());
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Health answers before anything else can fail.
  app.use('/api', healthRouter);
  mountApiRouter(app);

  // Prefix-relative routers.
  registerRouter('/gardens', gardensRouter);
  registerRouter('/plants', plantsRouter);
  registerRouter('/admin', adminRouter);

  // Full-path routers.
  for (const router of [
    publicGardenRouter,
    ailmentsRouter,
    lessonsRouter,
    quizzesRouter,
    flashcardsRouter,
    progressRouter,
    notificationsRouter,
    badgesRouter,
    postsRouter,
    authRouter,
  ]) {
    apiRouter.use(router);
  }

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
