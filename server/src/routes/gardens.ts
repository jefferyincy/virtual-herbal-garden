/**
 * Garden routes: the caller's own gardens, plot placement and visit tracking.
 *
 * Mounted by the orchestrator at `/api/gardens`, so every path here is relative to that.
 * The anonymous public read lives in `publicGarden.ts` because `/api/g/:slug` is a different
 * mount point.
 *
 * Ambience (time of day, season, weather, quality, shadows, sound, volume) is deliberately NOT
 * part of the garden document: it only changes what the *viewer* sees, it is a device-local view
 * preference, and it has no field in the Garden schema, so `PATCH /:id` accepts only the fields
 * that can actually be persisted (`name`, `isPublic`). The client keeps the ambience block in
 * localStorage and the public shared-garden page renders with the owner-independent default
 * ambience, so a visitor never inherits the owner's device settings.
 */

import { Router, type Request } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';
import { Garden } from '../models/Garden.ts';
import { Plant } from '../models/Plant.ts';
import { route } from '../lib/asyncRoute.ts';
import { conflict, forbidden, notFound, unauthorized } from '../lib/http.ts';
import { paginated, pagination } from '../lib/query.ts';
import { requireAuth } from '../middleware/auth.ts';
import { validate } from '../middleware/validate.ts';

export const gardensRouter: Router = Router();

const OBJECT_ID = /^[0-9a-fA-F]{24}$/;

/**
 * The placement grid is a small square (the mockup shows a hand-sized glowing grid on the soil,
 * not an arbitrary plane), so a tile is an integer pair inside `0..GARDEN_GRID-1`.
 */
export const GARDEN_GRID = 6;

/** Plant fields a garden plot renders with. */
const PLANT_PLOT_FIELDS = 'slug commonName botanicalName family images modelUrl modelScale toxicity';
/** Fewer fields for the list thumbnails; the card only shows an image. */
const PLANT_THUMB_FIELDS = 'slug images';

type Caller = { id: string; role: 'student' | 'expert' | 'admin' };

type GardenPlotRecord = {
  _id: Types.ObjectId;
  x: number;
  z: number;
  plantId: Types.ObjectId | string;
  plantedAt: Date;
  stage: string;
};

type GardenRecord = {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  name: string;
  slug: string;
  isPublic: boolean;
  plots: GardenPlotRecord[];
  lastVisitedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type PlantView = {
  _id: Types.ObjectId;
  slug: string;
  commonName: string;
  botanicalName: string;
  family: string;
  images?: Array<{ url?: string }>;
  modelUrl?: string | null;
  modelScale?: number | null;
  toxicity?: string;
};

type PlotView = Omit<GardenPlotRecord, 'plantId'> & { plantId: PlantView | null };

/** Lowercase, hyphenated slug. Falls back to "garden" so an all-symbol name still yields a key. */
export function slugifyGardenName(name: string): string {
  const base = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base || 'garden';
}

/**
 * Slug uniqueness is global (not per user) because `/g/:slug` is the public share URL: two users
 * naming a garden "My herb garden" must still get distinct public addresses. Appends `-2`, `-3`,
 * ... until free. `excludeId` lets a future rename-check ignore the garden being saved.
 */
export async function uniqueGardenSlug(
  name: string,
  opts: { excludeId?: string } = {},
): Promise<string> {
  const base = slugifyGardenName(name);
  let candidate = base;
  let suffix = 2;
  for (;;) {
    const clash = await Garden.exists(
      opts.excludeId ? { slug: candidate, _id: { $ne: opts.excludeId } } : { slug: candidate },
    );
    if (!clash) return candidate;
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
}

function callerOf(req: Request): Caller {
  const user = req.user;
  if (!user) throw unauthorized('Authentication required');
  return user;
}

/** `$or` of [id, slug] so a route can accept whichever identifier the client holds. */
function identifierFilter(identifier: string): Record<string, unknown>[] {
  const conditions: Record<string, unknown>[] = [{ slug: identifier }];
  if (OBJECT_ID.test(identifier)) conditions.unshift({ _id: new Types.ObjectId(identifier) });
  return conditions;
}

async function findGarden(identifier: string): Promise<GardenRecord | null> {
  return Garden.findOne({ $or: identifierFilter(identifier) }).lean<GardenRecord | null>();
}

/**
 * Load a garden and enforce ownership. The route param is a GARDEN id, not a user id, so
 * `requireSelfOrRole` cannot express "owner of this garden" — the check is explicit here.
 * A missing garden is 404, but a garden that exists and belongs to someone else is 403: the
 * caller is authenticated and already knows the id, so hiding it behind a 404 buys nothing and
 * would just look like a bug to the owner's own client.
 */
async function loadGardenForWrite(identifier: string, caller: Caller): Promise<GardenRecord> {
  const garden = await findGarden(identifier);
  if (!garden) throw notFound('Garden not found');
  if (String(garden.userId) !== caller.id && caller.role !== 'admin') {
    throw forbidden('You do not own this garden');
  }
  return garden;
}

/**
 * Resolve the plants referenced by a plot list with a single `$in` query, then substitute them
 * onto the plots. Doing it by hand (rather than mongoose populate) keeps the plot projection
 * explicit and identical for the detail, list and create responses.
 */
async function attachPlants(plots: GardenPlotRecord[]): Promise<PlotView[]> {
  const ids = plots.map((plot) => String(plot.plantId));
  const uniqueIds = [...new Set(ids)];
  const plants = uniqueIds.length
    ? await Plant.find({ _id: { $in: uniqueIds } }).select(PLANT_PLOT_FIELDS).lean<PlantView[]>()
    : [];
  const byId: Record<string, PlantView> = {};
  for (const plant of plants) byId[String(plant._id)] = plant;
  return plots.map((plot) => ({ ...plot, plantId: byId[String(plot.plantId)] ?? null }));
}

/** Duplicate-tile failures: the model validator, or a unique index, both surface as 409. */
function isDuplicatePlotError(err: unknown): boolean {
  if (err instanceof Error && err.name === 'ValidationError') {
    return err.message.includes('same garden tile');
  }
  if (typeof err === 'object' && err !== null && 'code' in err) {
    return err.code === 11000;
  }
  return false;
}

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).optional(),
});

const createGardenSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(80),
  isPublic: z.boolean().optional(),
});

/**
 * Only the persisted fields, and `.strict()` so an unknown key is a 422 instead of being
 * silently stripped. `settings` is absent on purpose — see the file header: ambience is a
 * device-local preference, so accepting it here would pretend to save something we cannot.
 */
const updateGardenSchema = z
  .object({
    name: z.string().trim().min(1, 'Name is required').max(80).optional(),
    isPublic: z.boolean().optional(),
  })
  .strict();

const plotBodySchema = z.object({
  x: z.number().int().min(0).max(GARDEN_GRID - 1),
  z: z.number().int().min(0).max(GARDEN_GRID - 1),
  plantId: z.string().trim().min(1),
});

const gardenParamsSchema = z.object({ id: z.string().trim().min(1) });
const plotParamsSchema = z.object({
  id: z.string().trim().min(1),
  plotId: z.string().trim().min(1),
});

gardensRouter.get(
  '/',
  requireAuth,
  validate({ query: listQuerySchema }),
  route(async (req, res) => {
    const caller = callerOf(req);
    const window = pagination(req.query as unknown as z.infer<typeof listQuerySchema>);
    const filter = { userId: caller.id };

    const [gardens, total] = await Promise.all([
      Garden.find(filter)
        .sort({ createdAt: -1 })
        .skip(window.skip)
        .limit(window.limit)
        .lean<GardenRecord[]>(),
      Garden.countDocuments(filter),
    ]);

    // The list card shows one thumbnail and a count, so sending every plot would be wasted bytes
    // on a page that shows a dozen gardens. Only the plants needed for the thumbnails are read.
    const plotPlantIds = [...new Set(gardens.flatMap((garden) => garden.plots.map((plot) => String(plot.plantId))))];
    const plants = plotPlantIds.length
      ? await Plant.find({ _id: { $in: plotPlantIds } }).select(PLANT_THUMB_FIELDS).lean<PlantView[]>()
      : [];
    const byId: Record<string, PlantView> = {};
    for (const plant of plants) byId[String(plant._id)] = plant;

    const items = gardens.map((garden) => {
      const thumbnails: string[] = [];
      for (const plot of garden.plots) {
        if (thumbnails.length >= 4) break;
        const url = byId[String(plot.plantId)]?.images?.[0]?.url;
        if (url && !thumbnails.includes(url)) thumbnails.push(url);
      }
      return {
        _id: garden._id,
        name: garden.name,
        slug: garden.slug,
        isPublic: garden.isPublic,
        plantCount: garden.plots.length,
        thumbnails,
        lastVisitedAt: garden.lastVisitedAt ?? null,
        createdAt: garden.createdAt,
      };
    });

    res.json(paginated(items, total, window.page, window.pageSize));
  }),
);

gardensRouter.post(
  '/',
  requireAuth,
  validate({ body: createGardenSchema }),
  route(async (req, res) => {
    const caller = callerOf(req);
    const { name, isPublic } = req.body as z.infer<typeof createGardenSchema>;

    const garden = await Garden.create({
      userId: caller.id,
      name,
      slug: await uniqueGardenSlug(name),
      isPublic: isPublic ?? false,
      plots: [],
      lastVisitedAt: null,
    });

    res.status(201).json({ garden });
  }),
);

gardensRouter.post(
  '/:id/plots',
  requireAuth,
  validate({ params: gardenParamsSchema, body: plotBodySchema }),
  route(async (req, res) => {
    const caller = callerOf(req);
    const { x, z, plantId } = req.body as z.infer<typeof plotBodySchema>;
    const garden = await loadGardenForWrite(req.params.id ?? '', caller);

    const plant = await Plant.findOne({ $or: identifierFilter(plantId) }).lean<PlantView | null>();
    if (!plant) throw notFound('Plant not found');

    // Fail fast with a clear message before touching the document; the atomic guard below makes
    // the same check race-safe.
    if (garden.plots.some((plot) => plot.x === x && plot.z === z)) {
      throw conflict('That plot is already planted');
    }

    const update = {
      $push: {
        plots: { x, z, plantId: plant._id, plantedAt: new Date(), stage: 'seedling' },
      },
    };
    // The `$not $elemMatch` predicate makes "this tile is free" part of the update predicate, so
    // two concurrent placements cannot both match and both push. Verified against this mongoose
    // version: the Garden model's duplicate-(x, z) array validator does NOT run on `$push` even
    // with `runValidators: true`, so this predicate is the guard that turns a stale read into a
    // losing update (null -> 409) instead of a silent double plant. `isDuplicatePlotError` still
    // maps the validator/duplicate-index paths to 409 in case the model ever gains an index.
    let updated: GardenRecord | null;
    try {
      updated = await Garden.findOneAndUpdate(
        { _id: garden._id, plots: { $not: { $elemMatch: { x, z } } } },
        update,
        { new: true, runValidators: true },
      ).lean<GardenRecord | null>();
    } catch (err) {
      if (isDuplicatePlotError(err)) throw conflict('That plot is already planted');
      throw err;
    }
    if (!updated) throw conflict('That plot is already planted');

    const views = await attachPlants(updated.plots);
    const created = views[views.length - 1] ?? null;

    // Both the created plot and the whole grid come back so the client can re-render the garden
    // without a refetch.
    res.status(201).json({ plot: created, plots: views });
  }),
);

gardensRouter.delete(
  '/:id/plots/:plotId',
  requireAuth,
  validate({ params: plotParamsSchema }),
  route(async (req, res) => {
    const caller = callerOf(req);
    const garden = await loadGardenForWrite(req.params.id ?? '', caller);
    const plotId = req.params.plotId ?? '';

    if (!garden.plots.some((plot) => String(plot._id) === plotId)) {
      throw notFound('Plot not found');
    }

    await Garden.updateOne({ _id: garden._id }, { $pull: { plots: { _id: plotId } } });
    res.status(204).end();
  }),
);

gardensRouter.post(
  '/:id/visit',
  requireAuth,
  validate({ params: gardenParamsSchema }),
  route(async (req, res) => {
    const caller = callerOf(req);
    const garden = await loadGardenForWrite(req.params.id ?? '', caller);
    await Garden.updateOne({ _id: garden._id }, { $set: { lastVisitedAt: new Date() } });
    res.status(204).end();
  }),
);

gardensRouter.get(
  '/:id',
  requireAuth,
  validate({ params: gardenParamsSchema }),
  route(async (req, res) => {
    const caller = callerOf(req);
    const garden = await loadGardenForWrite(req.params.id ?? '', caller);
    const plots = await attachPlants(garden.plots);
    res.json({ garden: { ...garden, plots } });
  }),
);

gardensRouter.patch(
  '/:id',
  requireAuth,
  validate({ params: gardenParamsSchema, body: updateGardenSchema }),
  route(async (req, res) => {
    const caller = callerOf(req);
    const garden = await loadGardenForWrite(req.params.id ?? '', caller);
    const { name, isPublic } = req.body as z.infer<typeof updateGardenSchema>;

    const changes: Record<string, unknown> = {};
    if (name !== undefined) changes.name = name;
    if (isPublic !== undefined) changes.isPublic = isPublic;

    // Public-URL stability: the slug is the shareable `/g/:slug` address, so renaming MUST NOT
    // re-derive it or every existing link would 404. The slug is fixed at creation.
    if (Object.keys(changes).length === 0) {
      const plots = await attachPlants(garden.plots);
      res.json({ garden: { ...garden, plots } });
      return;
    }

    const updated = await Garden.findOneAndUpdate(
      { _id: garden._id },
      { $set: changes },
      { new: true, runValidators: true },
    ).lean<GardenRecord | null>();
    if (!updated) throw notFound('Garden not found');

    const plots = await attachPlants(updated.plots);
    res.json({ garden: { ...updated, plots } });
  }),
);

gardensRouter.delete(
  '/:id',
  requireAuth,
  validate({ params: gardenParamsSchema }),
  route(async (req, res) => {
    const caller = callerOf(req);
    const garden = await loadGardenForWrite(req.params.id ?? '', caller);
    await Garden.deleteOne({ _id: garden._id });
    res.status(204).end();
  }),
);
