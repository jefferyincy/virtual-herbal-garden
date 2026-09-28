/**
 * Public read-only garden page at `/api/g/:slug`.
 *
 * Mounted at `/api` (not `/api/gardens`) because the URL is the shareable address, not a
 * sub-resource of the authenticated garden API.
 *
 * Projection rule: this endpoint is served to anonymous visitors, so it exposes ONLY the
 * public display fields. The owner's `name` and `handle` are public identity (they appear on
 * posts and the /u/:handle profile), so they are allowed; `email`, `_id`, `xp`, `streak` and
 * `badges` are never included. No garden owner is exposed as an ObjectId.
 */

import { Router } from 'express';
import { z } from 'zod';
import { Garden } from '../models/Garden.ts';
import { Plant } from '../models/Plant.ts';
import { User } from '../models/User.ts';
import { route } from '../lib/asyncRoute.ts';
import { notFound } from '../lib/http.ts';
import { optionalAuth } from '../middleware/auth.ts';
import { validate } from '../middleware/validate.ts';

export const publicGardenRouter: Router = Router();

const OBJECT_ID = /^[0-9a-fA-F]{24}$/;

type PublicPlant = {
  _id: unknown;
  slug: string;
  commonName: string;
  botanicalName: string;
  family: string;
  images?: Array<{ url?: string }>;
  toxicity?: string;
};

type PublicGardenRecord = {
  _id: unknown;
  userId: unknown;
  name: string;
  slug: string;
  isPublic: boolean;
  plots: Array<{
    _id: unknown;
    x: number;
    z: number;
    plantId: unknown;
    stage: string;
  }>;
};

const paramsSchema = z.object({ slug: z.string().trim().min(1) });

publicGardenRouter.get(
  '/g/:slug',
  optionalAuth,
  validate({ params: paramsSchema }),
  route(async (req, res) => {
    const { slug } = req.params as z.infer<typeof paramsSchema>;
    const viewer = req.user;

    // Slugs are unique, so an id-shaped path cannot collide with a real slug.
    const garden = await Garden.findOne(
      OBJECT_ID.test(slug) ? { $or: [{ slug }, { _id: slug }] } : { slug },
    ).lean<PublicGardenRecord | null>();

    // A missing garden and a private garden read by a non-owner are both 404, so the existence
    // of private gardens cannot be enumerated by probing slugs. Only the owner (or an admin
    // previewing) sees a private garden through this route.
    const isOwner = viewer !== undefined && String(garden?.userId) === viewer.id;
    const isAdmin = viewer?.role === 'admin';
    if (!garden || (!garden.isPublic && !isOwner && !isAdmin)) {
      throw notFound('Garden not found');
    }

    const plantIds = [...new Set(garden.plots.map((plot) => String(plot.plantId)))];
    const plants = plantIds.length
      ? await Plant.find({ _id: { $in: plantIds } })
          .select('slug commonName botanicalName family images toxicity')
          .lean<PublicPlant[]>()
      : [];
    const byId: Record<string, PublicPlant> = {};
    for (const plant of plants) byId[String(plant._id)] = plant;

    const owner = await User.findById(garden.userId).select('name handle').lean<{
      name?: string;
      handle?: string;
    } | null>();

    const plots = garden.plots.map((plot) => {
      const plant = byId[String(plot.plantId)];
      return {
        id: String(plot._id),
        x: plot.x,
        z: plot.z,
        stage: plot.stage,
        // The mockup marks curated plants with a star, but no curated-note field exists anywhere
        // in the schema, so this stays null rather than inventing content.
        curatedNote: null as string | null,
        plant: plant
          ? {
              slug: plant.slug,
              commonName: plant.commonName,
              botanicalName: plant.botanicalName,
              family: plant.family,
              image: plant.images?.[0]?.url ?? null,
              toxicity: plant.toxicity ?? 'none',
            }
          : null,
      };
    });

    res.json({
      garden: {
        name: garden.name,
        slug: garden.slug,
        isPublic: garden.isPublic,
        plantCount: garden.plots.length,
        plots,
      },
      owner: owner ? { name: owner.name ?? '', handle: owner.handle ?? '' } : null,
    });
  }),
);
