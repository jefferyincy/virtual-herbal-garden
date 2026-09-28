/**
 * Ailment and region browse endpoints.
 *
 * Mounted by the orchestrator at `/api`, so these paths are absolute from the API root.
 */

import { Router } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';
import { route } from '../lib/asyncRoute.ts';
import { notFound } from '../lib/http.ts';
import { escapeRegExp, paginated, pagination } from '../lib/query.ts';
import { optionalAuth } from '../middleware/auth.ts';
import { validate } from '../middleware/validate.ts';
import { Ailment, Plant } from '../models/index.ts';

export const ailmentsRouter: Router = Router();

const OBJECT_ID = /^[0-9a-f]{24}$/i;

type LeanAilment = {
  _id: Types.ObjectId;
  slug: string;
  name: string;
  system: string;
  description: string;
};

const pageQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).optional(),
});

/** Accept a 24-hex id or a slug in either position. */
function identifierFilter(identifier: string): Record<string, unknown>[] {
  const conditions: Record<string, unknown>[] = [{ slug: identifier }];
  if (OBJECT_ID.test(identifier)) conditions.push({ _id: new Types.ObjectId(identifier) });
  return conditions;
}

ailmentsRouter.get(
  '/ailments',
  optionalAuth,
  route(async (_req, res) => {
    // One aggregation gives every plant count at once; `$lookup` per ailment would be N queries.
    const counts = await Plant.aggregate<{ _id: Types.ObjectId; count: number }>([
      { $unwind: '$ailments' },
      { $group: { _id: '$ailments', count: { $sum: 1 } } },
    ]);
    const countByAilment = new Map(counts.map((row) => [String(row._id), row.count]));

    const ailments = await Ailment.find().sort({ system: 1, name: 1 }).lean<LeanAilment[]>();

    res.json({
      items: ailments.map((ailment) => ({
        ...ailment,
        plantCount: countByAilment.get(String(ailment._id)) ?? 0,
      })),
    });
  }),
);

ailmentsRouter.get(
  '/ailments/:id/plants',
  optionalAuth,
  validate({ query: pageQuerySchema }),
  route(async (req, res) => {
    const identifier = req.params.id ?? '';
    const window = pagination(req.query as unknown as z.infer<typeof pageQuerySchema>);

    const ailment = await Ailment.findOne({ $or: identifierFilter(identifier) }).select('_id').lean();
    if (!ailment) throw notFound('Ailment not found');

    const filter = { ailments: ailment._id };
    const [items, total] = await Promise.all([
      Plant.find(filter).sort({ commonName: 1 }).skip(window.skip).limit(window.limit).lean(),
      Plant.countDocuments(filter),
    ]);

    res.json(paginated(items, total, window.page, window.pageSize));
  }),
);

ailmentsRouter.get(
  '/regions/:region/plants',
  optionalAuth,
  validate({ query: pageQuerySchema }),
  route(async (req, res) => {
    const region = req.params.region ?? '';
    const window = pagination(req.query as unknown as z.infer<typeof pageQuerySchema>);

    // `region` is an array of strings, so `$elemMatch` with an anchored, escaped regex matches
    // one element exactly (case-insensitively) without treating the value as free text.
    const filter = {
      region: { $elemMatch: { $regex: `^${escapeRegExp(region)}$`, $options: 'i' } },
    };

    // An unknown region is an empty page by design: the map screen shows its empty state and
    // a stale link must not fail.
    const [items, total] = await Promise.all([
      Plant.find(filter).sort({ commonName: 1 }).skip(window.skip).limit(window.limit).lean(),
      Plant.countDocuments(filter),
    ]);

    res.json(paginated(items, total, window.page, window.pageSize));
  }),
);
