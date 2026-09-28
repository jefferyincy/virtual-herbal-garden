/**
 * Badge catalogue: the learner-facing list/mine reads and the admin CRUD.
 *
 * Mounted at the api root by the orchestrator, so every path here is full (`/badges`,
 * `/badges/mine`, ...). `/badges/mine` MUST be registered before `/badges/:id` or the dynamic
 * segment would swallow it.
 *
 * Badge criteria are evaluated in `services/xp.ts`; this file only stores the rules, counts how
 * many learners hold each one, and keeps the catalogue honest (no unreachable rules, no orphaned
 * key left on a user after its badge is deleted).
 */

import { Router } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';
import { BADGE_ACTIONS, Badge, User, type BadgeDoc } from '../models/index.ts';
import { route } from '../lib/asyncRoute.ts';
import { conflict, notFound } from '../lib/http.ts';
import { optionalAuth, requireAuth, requireRole } from '../middleware/auth.ts';
import { validate } from '../middleware/validate.ts';

export const badgesRouter: Router = Router();

/**
 * Icon names the badge builder may use. MUST stay in sync with `client/src/components/icons.tsx`
 * (`IconName`): the server cannot import from the client tree, so this is a hand-maintained
 * mirror. A value outside this tuple is rejected at validation time instead of rendering as a
 * blank tile.
 */
export const BADGE_ICON_NAMES = [
  'leaf',
  'book',
  'book-open',
  'award',
  'flame',
  'users',
  'message',
  'star',
  'trophy',
  'check-circle',
  'sparkles',
  'compass',
  'layers',
  'shield',
  'home',
  'chart',
  'hexagon',
  'clock',
  'list',
  'globe',
  'map',
  'grid',
  'search',
  'dot',
  'calendar',
] as const;

export type BadgeIconName = (typeof BADGE_ICON_NAMES)[number];

const OBJECT_ID = /^[0-9a-f]{24}$/i;

type BadgeView = BadgeDoc & {
  _id: Types.ObjectId;
  earnedBy: number;
  earnedAt?: string | null;
};

/** Per-key holder counts across all users, from one aggregation. */
async function earnedByKey(): Promise<Record<string, number>> {
  const rows = await User.aggregate<{ _id: string; count: number }>([
    { $unwind: '$badges' },
    { $group: { _id: '$badges.key', count: { $sum: 1 } } },
  ]);
  const counts: Record<string, number> = {};
  for (const row of rows) counts[row._id] = row.count;
  return counts;
}

/** key -> earnedAt for one learner, read from their own `badges` array. */
async function earnedAtByKey(userId: string): Promise<Record<string, string>> {
  const user = await User.findById(userId).select('badges').lean<{
    badges?: Array<{ key: string; earnedAt: Date }> | null;
  } | null>();
  const earned: Record<string, string> = {};
  for (const badge of user?.badges ?? []) earned[badge.key] = badge.earnedAt.toISOString();
  return earned;
}

badgesRouter.get(
  '/badges',
  optionalAuth,
  route(async (req, res) => {
    const caller = req.user;
    const [badges, counts, earned] = await Promise.all([
      Badge.find({ active: true }).sort({ name: 1 }).lean<Array<BadgeDoc & { _id: Types.ObjectId }>>(),
      earnedByKey(),
      caller ? earnedAtByKey(caller.id) : Promise.resolve<Record<string, string>>({}),
    ]);

    const items: BadgeView[] = badges.map((badge) => ({
      ...badge,
      earnedBy: counts[badge.key] ?? 0,
      earnedAt: earned[badge.key] ?? null,
    }));
    res.json({ items });
  }),
);

badgesRouter.get(
  '/badges/mine',
  requireAuth,
  route(async (req, res) => {
    const caller = req.user;
    if (!caller) return;
    const earned = await earnedAtByKey(caller.id);
    const keys = Object.keys(earned);
    if (keys.length === 0) {
      res.json({ items: [] });
      return;
    }

    const badges = await Badge.find({ key: { $in: keys } }).lean<
      Array<BadgeDoc & { _id: Types.ObjectId }>
    >();
    // Most recently earned first, so the progress screen leads with the learner's latest unlock.
    const items = badges
      .map((badge) => ({ ...badge, earnedAt: earned[badge.key] as string }))
      .sort((a, b) => b.earnedAt.localeCompare(a.earnedAt));
    res.json({ items });
  }),
);

const criteriaSchema = z
  .object({
    action: z.enum(BADGE_ACTIONS),
    target: z.number().int().min(1),
    param: z.string().trim().min(1).max(80).nullable().optional(),
  })
  // `earn_badge` ("N badges already earned") can never match in `evaluateBadges`: that rule needs
  // cross-badge state the stats snapshot deliberately does not carry, so a badge built on it would
  // be permanently unreachable. Reject it at the door rather than storing a dead rule.
  .refine((criteria) => criteria.action !== 'earn_badge', {
    message: 'Badges cannot be earned from other badges',
    path: ['action'],
  });

const createBodySchema = z.object({
  key: z.string().trim().min(2).max(64),
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(400).optional(),
  criteria: criteriaSchema,
  xpReward: z.number().int().min(0).max(10_000),
  icon: z.enum(BADGE_ICON_NAMES),
  active: z.boolean().optional(),
});

const updateBodySchema = createBodySchema.partial();

const idParamsSchema = z.object({ id: z.string().trim().regex(OBJECT_ID, 'Invalid badge id') });

badgesRouter.post(
  '/badges',
  // `requireRole` reads `req.user`, which only `requireAuth` populates: the pair is required, in
  // this order, or an authenticated admin would still be rejected as anonymous.
  requireAuth,
  requireRole('admin'),
  validate({ body: createBodySchema }),
  route(async (req, res) => {
    const body = req.body as z.infer<typeof createBodySchema>;

    // `badges.key` is unique; checking here gives a clear 409 instead of a raw duplicate-key
    // error, and is safe because key is immutable after creation.
    if (await Badge.exists({ key: body.key })) {
      throw conflict(`A badge with the key "${body.key}" already exists`);
    }

    const badge = await Badge.create({
      key: body.key,
      name: body.name,
      description: body.description ?? '',
      criteria: { action: body.criteria.action, target: body.criteria.target, param: body.criteria.param ?? null },
      xpReward: body.xpReward,
      icon: body.icon,
      active: body.active ?? true,
    });
    res.status(201).json({ badge });
  }),
);

badgesRouter.patch(
  '/badges/:id',
  requireAuth,
  requireRole('admin'),
  validate({ params: idParamsSchema, body: updateBodySchema }),
  route(async (req, res) => {
    const body = req.body as z.infer<typeof updateBodySchema>;
    const patch: Record<string, unknown> = {};
    if (body.key !== undefined) patch.key = body.key;
    if (body.name !== undefined) patch.name = body.name;
    if (body.description !== undefined) patch.description = body.description;
    if (body.xpReward !== undefined) patch.xpReward = body.xpReward;
    if (body.icon !== undefined) patch.icon = body.icon;
    if (body.active !== undefined) patch.active = body.active;
    if (body.criteria !== undefined) {
      patch.criteria = {
        action: body.criteria.action,
        target: body.criteria.target,
        param: body.criteria.param ?? null,
      };
    }

    const badge = await Badge.findByIdAndUpdate(req.params.id, { $set: patch }, {
      new: true,
      runValidators: true,
    }).lean<BadgeDoc | null>();
    if (!badge) throw notFound('Badge not found');
    res.json({ badge });
  }),
);

badgesRouter.delete(
  '/badges/:id',
  requireAuth,
  requireRole('admin'),
  validate({ params: idParamsSchema }),
  route(async (req, res) => {
    const badge = await Badge.findById(req.params.id).lean<BadgeDoc | null>();
    if (!badge) throw notFound('Badge not found');

    await Badge.deleteOne({ _id: badge._id });
    // A deleted badge must not linger on learner profiles as a dangling key: one updateMany pulls
    // it from every user's `badges` array by key, in a single write.
    await User.updateMany({ 'badges.key': badge.key }, { $pull: { badges: { key: badge.key } } });

    res.status(204).end();
  }),
);
