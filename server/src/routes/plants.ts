/**
 * Routes for the plant encyclopedia.
 *
 * Mounted by the orchestrator at `/api/plants`, so every path here is relative to that.
 * `/compare` MUST stay above `/:slug` or the slug route swallows it.
 */

import { Router } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';
import { route } from '../lib/asyncRoute.ts';
import { badRequest, notFound } from '../lib/http.ts';
import { paginated, pagination, searchFilter } from '../lib/query.ts';
import { optionalAuth, requireAuth, requireRole } from '../middleware/auth.ts';
import { validate } from '../middleware/validate.ts';
import { Ailment, MEDICAL_SYSTEMS, PLANT_PARTS, PREPARATIONS, Plant, TOXICITY_LEVELS } from '../models/index.ts';

export const plantsRouter: Router = Router();

const OBJECT_ID = /^[0-9a-f]{24}$/i;

/** Read-only projection of a plant document; populated refs stay `unknown` on purpose. */
type LeanPlant = {
  _id: Types.ObjectId;
  slug: string;
  commonName: string;
  botanicalName: string;
  family: string;
  partsUsed?: readonly string[] | null;
  preparations?: readonly string[] | null;
  ailments?: readonly unknown[] | null;
  activeCompounds?: readonly string[] | null;
  description?: string | null;
  medicinalUses?: string | null;
  dosage?: string | null;
  contraindications?: string | null;
  toxicity?: string | null;
  lookAlikes?: ReadonlyArray<{ plantId?: unknown; note: string }> | null;
  region?: readonly string[] | null;
  systemsMentioned?: readonly string[] | null;
  images?: readonly unknown[] | null;
  tags?: readonly string[] | null;
  sources?: readonly unknown[] | null;
  verified?: boolean;
  unverified?: boolean;
  publishedAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
};

/** Lowercase, hyphenated, collision-free slug; `plants.slug` is unique. */
async function uniqueSlug(commonName: string): Promise<string> {
  const base =
    commonName
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'plant';

  let candidate = base;
  let suffix = 2;
  while (await Plant.exists({ slug: candidate })) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

/** "whole plant" / "none" -> "Whole plant" / "None" for the human-readable compare values. */
function titleCaseEnum(value: string): string {
  const spaced = value.replace(/_/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function joinOrNull(values: readonly string[] | null | undefined): string | null {
  if (!values || values.length === 0) return null;
  return values.join(', ');
}

function textOrNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export type CompareRow = { label: string; values: Array<string | null>; differs: boolean };

/** Columns of the compare table; only the attributes the screen documents. */
type ComparePlant = Pick<
  LeanPlant,
  | 'family'
  | 'partsUsed'
  | 'activeCompounds'
  | 'medicinalUses'
  | 'dosage'
  | 'contraindications'
  | 'toxicity'
  | 'region'
>;

/**
 * The compare table: exactly eight rows in this order. `differs` drives the client's row
 * accent and dimming. Pure so it can be unit-tested without a database.
 */
export function compareRows(plants: ComparePlant[]): CompareRow[] {
  const definitions: Array<{ label: string; pick: (plant: ComparePlant) => string | null }> = [
    { label: 'Family', pick: (plant) => textOrNull(plant.family) },
    { label: 'Parts used', pick: (plant) => joinOrNull(plant.partsUsed?.map(titleCaseEnum)) },
    { label: 'Active compounds', pick: (plant) => joinOrNull(plant.activeCompounds) },
    { label: 'Medicinal uses', pick: (plant) => textOrNull(plant.medicinalUses) },
    { label: 'Dosage', pick: (plant) => textOrNull(plant.dosage) },
    { label: 'Contraindications', pick: (plant) => textOrNull(plant.contraindications) },
    { label: 'Toxicity', pick: (plant) => (plant.toxicity ? titleCaseEnum(plant.toxicity) : null) },
    { label: 'Region', pick: (plant) => joinOrNull(plant.region) },
  ];

  return definitions.map(({ label, pick }) => {
    const values = plants.map(pick);
    const first = values[0] ?? null;
    return { label, values, differs: values.some((value) => value !== first) };
  });
}

/** Accept a 24-hex id or a slug, in either position. */
function identifierFilter(identifier: string): Record<string, unknown>[] {
  const conditions: Record<string, unknown>[] = [{ slug: identifier }];
  if (OBJECT_ID.test(identifier)) conditions.push({ _id: new Types.ObjectId(identifier) });
  return conditions;
}

/** Query params arrive as `''` when a form clears an input; treat that as "not set". */
function optionalEnum<T extends readonly [string, ...string[]]>(values: T) {
  return z.preprocess((value) => (value === '' ? undefined : value), z.enum(values).optional());
}

const listQuerySchema = z.object({
  q: z.string().optional(),
  family: z.string().optional(),
  part: optionalEnum(PLANT_PARTS),
  ailment: z.string().optional(),
  region: z.string().optional(),
  system: optionalEnum(MEDICAL_SYSTEMS),
  toxic: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.enum(['true', 'false']).transform((value) => value === 'true').optional(),
  ),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).optional(),
  sort: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.enum(['name', 'recent', 'family']).default('name'),
  ),
});

type ListQuery = z.infer<typeof listQuerySchema>;

const SORT_BY: Record<ListQuery['sort'], Record<string, 1 | -1>> = {
  name: { commonName: 1 },
  recent: { publishedAt: -1 },
  family: { family: 1, commonName: 1 },
};

plantsRouter.get(
  '/',
  optionalAuth,
  validate({ query: listQuerySchema }),
  route(async (req, res) => {
    // validate() replaced req.query with the parsed object; express types it as ParsedQs, which
    // is wider than the schema output, so this reads the values the middleware installed.
    const query = req.query as unknown as ListQuery;
    const window = pagination(query);

    const filter: Record<string, unknown> = {
      ...searchFilter(query.q, ['commonName', 'botanicalName', 'tags']),
    };
    if (query.family) filter.family = query.family;
    if (query.part) filter.partsUsed = query.part;
    if (query.system) filter.systemsMentioned = query.system;
    if (query.region) filter.region = query.region;
    if (query.toxic === true) filter.toxicity = { $ne: 'none' };
    if (query.toxic === false) filter.toxicity = 'none';

    if (query.ailment) {
      // An unknown ailment slug is an empty result set, not an error: the client links by slug
      // and a stale link must not surface as a 404.
      const ailment = await Ailment.findOne({ slug: query.ailment }).select('_id').lean();
      if (!ailment) {
        res.json(paginated<LeanPlant>([], 0, window.page, window.pageSize));
        return;
      }
      filter.ailments = ailment._id;
    }

    const [items, total] = await Promise.all([
      Plant.find(filter)
        .sort(SORT_BY[query.sort])
        .skip(window.skip)
        .limit(window.limit)
        .populate({ path: 'ailments', select: 'name system' })
        .lean<LeanPlant[]>(),
      Plant.countDocuments(filter),
    ]);

    res.json(paginated(items, total, window.page, window.pageSize));
  }),
);

const compareQuerySchema = z.object({ ids: z.string() });

plantsRouter.get(
  '/compare',
  optionalAuth,
  validate({ query: compareQuerySchema }),
  route(async (req, res) => {
    const { ids } = req.query as unknown as z.infer<typeof compareQuerySchema>;
    const tokens = ids
      .split(',')
      .map((token) => token.trim())
      .filter(Boolean);

    if (tokens.length < 2 || tokens.length > 3) {
      throw badRequest('Provide 2 or 3 comma-separated plant ids');
    }

    const conditions: Record<string, unknown>[] = [];
    for (const token of tokens) conditions.push(...identifierFilter(token));

    const found = await Plant.find({ $or: conditions }).lean<LeanPlant[]>();
    const byKey = new Map<string, LeanPlant>();
    for (const plant of found) {
      byKey.set(String(plant._id), plant);
      byKey.set(plant.slug, plant);
    }

    // Preserve the order the client asked for; duplicates and misses are dropped.
    const ordered: LeanPlant[] = [];
    for (const token of tokens) {
      const plant = byKey.get(token);
      if (plant && !ordered.includes(plant)) ordered.push(plant);
    }

    if (ordered.length < 2) throw notFound('Could not resolve at least two of those plants');

    res.json({ plants: ordered, rows: compareRows(ordered) });
  }),
);

plantsRouter.get(
  '/:slug',
  optionalAuth,
  route(async (req, res) => {
    const identifier = req.params.slug ?? '';

    const plant = await Plant.findOne({ $or: identifierFilter(identifier) })
      .populate({ path: 'ailments', select: 'name system slug' })
      .populate({ path: 'lookAlikes.plantId', select: 'slug commonName botanicalName images' })
      .lean<LeanPlant | null>();

    if (!plant) throw notFound('Plant not found');

    // The detail page renders its warning band from these documents, so resolve them here
    // rather than making it issue a second request per look-alike.
    const lookAlikeIds: Types.ObjectId[] = [];
    for (const entry of plant.lookAlikes ?? []) {
      const target = entry.plantId;
      if (target instanceof Types.ObjectId) {
        lookAlikeIds.push(target);
      } else if (target && typeof target === 'object' && '_id' in target && target._id instanceof Types.ObjectId) {
        lookAlikeIds.push(target._id);
      }
    }

    const lookAlikePlants = lookAlikeIds.length
      ? await Plant.find({ _id: { $in: lookAlikeIds } })
          .select('slug commonName botanicalName images')
          .lean<LeanPlant[]>()
      : [];

    res.json({ ...plant, lookAlikePlants });
  }),
);

const objectIdString = z.string().trim().regex(OBJECT_ID, 'Expected a 24 character id');

const plantFields = {
  slug: z.string().trim().min(1),
  commonName: z.string().trim().min(1),
  botanicalName: z.string().trim().min(1),
  family: z.string().trim().min(1),
  partsUsed: z.array(z.enum(PLANT_PARTS)),
  preparations: z.array(z.enum(PREPARATIONS)),
  ailments: z.array(objectIdString),
  activeCompounds: z.array(z.string().trim().min(1)),
  description: z.string(),
  medicinalUses: z.string(),
  dosage: z.string().nullable(),
  contraindications: z.string().nullable(),
  toxicity: z.enum(TOXICITY_LEVELS),
  lookAlikes: z.array(z.object({ plantId: objectIdString, note: z.string().trim().min(1) })),
  region: z.array(z.string().trim().min(1)),
  systemsMentioned: z.array(z.enum(MEDICAL_SYSTEMS)),
  images: z.array(
    z.object({
      url: z.string().trim().min(1),
      alt: z.string().trim().min(1),
      credit: z.string().trim().min(1),
    }),
  ),
  modelUrl: z.string().nullable(),
  modelScale: z.number().positive(),
  tags: z.array(z.string().trim().min(1)),
  sources: z.array(z.object({ label: z.string().trim().min(1), url: z.string().trim().min(1) })),
  verified: z.boolean(),
  unverified: z.boolean(),
  // `z.coerce.date()` alone turns null into the epoch, so match null before coercing.
  publishedAt: z.union([z.null(), z.coerce.date()]),
};

const createPlantSchema = z
  .object(plantFields)
  .partial()
  .required({ commonName: true, botanicalName: true, family: true });

const updatePlantSchema = z.object(plantFields).partial();

type PlantInput = z.infer<typeof updatePlantSchema>;

plantsRouter.post(
  '/',
  requireAuth,
  requireRole('admin'),
  validate({ body: createPlantSchema }),
  route(async (req, res) => {
    const input = req.body as z.infer<typeof createPlantSchema>;
    const slug = input.slug ?? (await uniqueSlug(input.commonName));

    const dosage = input.dosage ?? null;
    const contraindications = input.contraindications ?? null;
    const verified = input.verified ?? false;
    // Data honesty: a null dosage or contraindications means no citable source was found, so
    // the record cannot claim to be verified no matter what the client sent.
    const unverified = dosage === null || contraindications === null ? true : (input.unverified ?? false);

    const created = await Plant.create({
      ...input,
      slug,
      dosage,
      contraindications,
      unverified,
      publishedAt: input.publishedAt ?? (verified ? new Date() : null),
    });

    res.status(201).json(created.toObject());
  }),
);

plantsRouter.patch(
  '/:id',
  requireAuth,
  requireRole('admin'),
  validate({ params: z.object({ id: objectIdString }), body: updatePlantSchema }),
  route(async (req, res) => {
    const { id } = req.params as unknown as { id: string };
    const input = req.body as PlantInput;

    const existing = await Plant.findById(id).lean<LeanPlant | null>();
    if (!existing) throw notFound('Plant not found');

    const update: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input)) {
      if (value !== undefined) update[key] = value;
    }

    // Re-derive the two coupled fields against the merged record rather than the patch alone.
    const dosage = input.dosage !== undefined ? input.dosage : (existing.dosage ?? null);
    const contraindications =
      input.contraindications !== undefined ? input.contraindications : (existing.contraindications ?? null);
    const verified = input.verified ?? existing.verified ?? false;

    update.dosage = dosage;
    update.contraindications = contraindications;
    update.unverified = dosage === null || contraindications === null ? true : (input.unverified ?? existing.unverified ?? false);
    if (verified && !existing.publishedAt && update.publishedAt === undefined) update.publishedAt = new Date();

    const updated = await Plant.findByIdAndUpdate(id, update, { new: true, runValidators: true }).lean<LeanPlant | null>();
    if (!updated) throw notFound('Plant not found');

    res.json(updated);
  }),
);

plantsRouter.delete(
  '/:id',
  requireAuth,
  requireRole('admin'),
  validate({ params: z.object({ id: objectIdString }) }),
  route(async (req, res) => {
    const { id } = req.params as unknown as { id: string };

    const removed = await Plant.findByIdAndDelete(id).lean<LeanPlant | null>();
    if (!removed) throw notFound('Plant not found');

    // A hard delete would leave other plants pointing at a document that no longer exists, so
    // the detail page could render a broken look-alike. Pull those entries in the same request.
    await Plant.updateMany(
      { 'lookAlikes.plantId': removed._id },
      { $pull: { lookAlikes: { plantId: removed._id } } },
    );

    res.status(204).end();
  }),
);
