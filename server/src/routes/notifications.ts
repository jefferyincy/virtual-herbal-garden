/**
 * Notification inbox: the write side used by other services (`notify`) and the three read/
 * mutation endpoints the inbox screen calls.
 *
 * `notify` lives here rather than in a service module because the ticket fixes this file as its
 * home and because the inbox is the only reader of what it writes. It is deliberately exported
 * for other routes/services to call after a successful action.
 */

import { Router } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';
import { Notification } from '../models/Notification.ts';
import { NOTIFICATION_TYPES } from '../models/enums.ts';
import { route } from '../lib/asyncRoute.ts';
import { paginated, pagination } from '../lib/query.ts';
import { requireAuth } from '../middleware/auth.ts';
import { validate } from '../middleware/validate.ts';

export const notificationsRouter: Router = Router();

const OBJECT_ID = /^[0-9a-f]{24}$/i;

/**
 * Write one unread notification.
 *
 * This NEVER fails the caller's request: a notification is a side effect of an action that
 * already succeeded (a badge unlock, a moderation outcome), so a failed write here must not turn
 * a 200 into a 500. The error is logged and the promise resolves either way.
 */
export async function notify(
  userId: string,
  input: {
    type: 'badge' | 'reply' | 'streak' | 'moderation' | 'system';
    title: string;
    body: string;
    href?: string;
    badgeKey?: string;
  },
): Promise<void> {
  try {
    await Notification.create({
      userId,
      type: input.type,
      title: input.title,
      body: input.body,
      read: false,
      href: input.href ?? null,
      badgeKey: input.badgeKey ?? null,
    });
  } catch (err) {
    // A failed notification must not fail a successful action.
    console.error('[notify] could not write notification', err);
  }
}

const listQuerySchema = z.object({
  // `unread` is tri-state on purpose: absent means "no read filter", `true` narrows to unread
  // rows and `false` narrows to already-read rows. Keeping the transform (rather than a boolean
  // default) is what lets the route tell "absent" apart from "false".
  unread: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.enum(['true', 'false']).transform((value) => value === 'true').optional(),
  ),
  type: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.enum(NOTIFICATION_TYPES).optional(),
  ),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).optional(),
});

notificationsRouter.get(
  '/notifications',
  requireAuth,
  validate({ query: listQuerySchema }),
  route(async (req, res) => {
    const caller = req.user;
    if (!caller) return;
    const query = req.query as unknown as z.infer<typeof listQuerySchema>;
    const window = pagination(query, { defaultSize: 30, maxSize: 100 });

    const filter: Record<string, unknown> = { userId: caller.id };
    if (query.type) filter.type = query.type;
    if (query.unread !== undefined) filter.read = !query.unread;

    const [items, total, unreadCount] = await Promise.all([
      Notification.find(filter)
        .sort({ createdAt: -1 })
        .skip(window.skip)
        .limit(window.limit)
        .lean(),
      Notification.countDocuments(filter),
      Notification.countDocuments({ userId: caller.id, read: false }),
    ]);

    res.json({ ...paginated(items, total, window.page, window.pageSize), unreadCount });
  }),
);

const readBodySchema = z.object({
  ids: z.array(z.string().regex(OBJECT_ID, 'Invalid notification id')).max(200).optional(),
});

notificationsRouter.post(
  '/notifications/read',
  requireAuth,
  validate({ body: readBodySchema }),
  route(async (req, res) => {
    const caller = req.user;
    if (!caller) return;
    const { ids } = req.body as z.infer<typeof readBodySchema>;

    // Always scoped to the caller's own rows: the id filter can only ever narrow, never widen,
    // what the ownership clause already allows.
    const filter: Record<string, unknown> = { userId: caller.id, read: false };
    if (ids && ids.length > 0) filter._id = { $in: ids.map((id) => new Types.ObjectId(id)) };

    const result = await Notification.updateMany(filter, { $set: { read: true } });
    res.json({ updated: result.modifiedCount });
  }),
);

notificationsRouter.get(
  '/notifications/count',
  requireAuth,
  route(async (req, res) => {
    const caller = req.user;
    if (!caller) return;
    const unread = await Notification.countDocuments({ userId: caller.id, read: false });
    res.json({ unread });
  }),
);
