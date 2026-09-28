import { Router } from 'express';
import { dbState } from '../db.ts';
import { env } from '../config/env.ts';

export const healthRouter: Router = Router();

healthRouter.get('/health', (_req, res) => {
  res.json({
    ok: true,
    env: env.NODE_ENV,
    db: dbState(),
    uptimeSec: Math.round(process.uptime()),
  });
});
