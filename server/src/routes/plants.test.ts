/**
 * Route-level tests for the plant encyclopedia.
 *
 * Runs against the local portable mongod (`mongodb://127.0.0.1:27017/herbal_garden_test`). The
 * suite namespaces itself by touching ONLY the collections it owns and clearing them in
 * `beforeEach()`; it never drops the database, so a sibling test file can run against the same
 * server without fighting over it.
 */
import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, beforeEach, describe, it } from 'node:test';
import express from 'express';
import { MAX_PAGE_SIZE } from '../lib/query.ts';

const TEST_URI = 'mongodb://127.0.0.1:27017/herbal_garden_test';

type PlantListResponse = {
  items: Array<{ slug: string; commonName: string; botanicalName: string; ailments: unknown[] }>;
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

type ErrorEnvelope = { error: { code: string; message: string } };

let server: Server;
let baseUrl: string;
let cleanup: Array<() => Promise<unknown>> = [];
let disconnect: () => Promise<void> = async () => {};
let createFixtures: () => Promise<void>;

async function requestJson<T>(path: string, init?: RequestInit): Promise<{ status: number; body: T }> {
  const res = await fetch(`${baseUrl}${path}`, init);
  const text = await res.text();
  const body = text ? (JSON.parse(text) as T) : (undefined as unknown as T);
  return { status: res.status, body };
}

before(async () => {
  // env.ts validates process.env at import time, so the imports happen after these fallbacks are
  // installed (a real .env, when present, still wins because of `??=`).
  process.env.MONGO_URI ??= TEST_URI;
  process.env.JWT_ACCESS_SECRET ??= 'test-access-secret-value';
  process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret-value';

  const [db, plantModule, ailmentModule, plantsModule, ailmentsModule, errorModule] = await Promise.all([
    import('../db.ts'),
    import('../models/Plant.ts'),
    import('../models/Ailment.ts'),
    import('./plants.ts'),
    import('./ailments.ts'),
    import('../middleware/error.ts'),
  ]);

  await db.connectDb(TEST_URI);
  disconnect = db.disconnectDb;

  const { Plant } = plantModule;
  const { Ailment } = ailmentModule;
  cleanup = [() => Plant.deleteMany({}), () => Ailment.deleteMany({})];

  createFixtures = async () => {
    const cough = await Ailment.create({
      slug: 'cough',
      name: 'Cough',
      system: 'respiratory',
      description: 'A cough.',
    });

    const [tulsi, mint] = await Plant.create([
      {
        slug: 'tulsi',
        commonName: 'Tulsi',
        botanicalName: 'Ocimum tenuiflorum',
        family: 'Lamiaceae',
        partsUsed: ['leaf'],
        preparations: ['infusion'],
        ailments: [cough._id],
        activeCompounds: ['Eugenol'],
        medicinalUses: 'Respiratory support',
        region: ['India'],
        toxicity: 'none',
      },
      {
        slug: 'mint',
        commonName: 'Mint',
        botanicalName: 'Mentha spicata',
        family: 'Lamiaceae',
        partsUsed: ['leaf'],
        preparations: ['infusion'],
        activeCompounds: ['Menthol'],
        medicinalUses: 'Respiratory support',
        region: ['India'],
        toxicity: 'none',
      },
      {
        slug: 'aconite',
        commonName: 'Aconite',
        botanicalName: 'Aconitum napellus',
        family: 'Ranunculaceae',
        partsUsed: ['root'],
        preparations: ['powder'],
        activeCompounds: ['Aconitine'],
        medicinalUses: 'Not for household use',
        region: ['Central Asia'],
        toxicity: 'high',
      },
    ]);

    await Plant.updateOne(
      { _id: tulsi?._id },
      { $set: { lookAlikes: [{ plantId: mint?._id, note: 'Similar leaf shape.' }] } },
    );
  };

  const app = express();
  app.use(express.json());
  app.use('/api/plants', plantsModule.plantsRouter);
  app.use('/api', ailmentsModule.ailmentsRouter);
  app.use(errorModule.errorHandler);

  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;
});

beforeEach(async () => {
  for (const clear of cleanup) await clear();
  await createFixtures();
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  for (const clear of cleanup) await clear();
  await disconnect();
});

describe('GET /api/plants', () => {
  it('returns the paginated envelope sorted by common name', async () => {
    const { status, body } = await requestJson<PlantListResponse>('/api/plants');

    assert.equal(status, 200);
    assert.equal(body.total, 3);
    assert.ok(body.totalPages >= 1);
    assert.deepEqual(
      body.items.map((plant) => plant.commonName),
      ['Aconite', 'Mint', 'Tulsi'],
    );
  });

  it('matches botanical names case-insensitively and escapes regex metacharacters', async () => {
    const match = await requestJson<PlantListResponse>('/api/plants?q=TENUIFLORUM');
    assert.equal(match.body.total, 1);
    assert.equal(match.body.items[0]?.slug, 'tulsi');

    const metacharacters = await requestJson<PlantListResponse>(
      `/api/plants?q=${encodeURIComponent('a+b(')}`,
    );
    assert.equal(metacharacters.status, 200);
    assert.equal(metacharacters.body.total, 0);
    assert.deepEqual(metacharacters.body.items, []);
  });

  it('filters by toxicity, part used and family', async () => {
    const toxic = await requestJson<PlantListResponse>('/api/plants?toxic=true');
    assert.deepEqual(
      toxic.body.items.map((plant) => plant.slug),
      ['aconite'],
    );

    const leaves = await requestJson<PlantListResponse>('/api/plants?part=leaf');
    assert.equal(leaves.body.total, 2);

    const family = await requestJson<PlantListResponse>('/api/plants?family=Lamiaceae');
    assert.equal(family.body.total, 2);
  });

  it('clamps pageSize to the maximum', async () => {
    const { body } = await requestJson<PlantListResponse>('/api/plants?pageSize=999');
    assert.equal(body.pageSize, MAX_PAGE_SIZE);
    assert.notEqual(body.pageSize, 999);
  });
});

describe('GET /api/plants/:slug', () => {
  it('returns the plant with populated ailments and resolved look-alike documents', async () => {
    const { status, body } = await requestJson<{
      _id: string;
      slug: string;
      ailments: Array<{ name: string }>;
      lookAlikePlants: Array<{ slug: string }>;
    }>('/api/plants/tulsi');

    assert.equal(status, 200);
    assert.equal(body.slug, 'tulsi');
    assert.equal(body.ailments[0]?.name, 'Cough');
    assert.deepEqual(
      body.lookAlikePlants.map((plant) => plant.slug),
      ['mint'],
    );

    // An admin screen links by id, so the same record must resolve through the ObjectId path.
    const byId = await requestJson<{ slug: string }>(`/api/plants/${body._id}`);
    assert.equal(byId.status, 200);
    assert.equal(byId.body.slug, 'tulsi');
  });

  it('404s with the not_found code for an unknown slug', async () => {
    const { status, body } = await requestJson<ErrorEnvelope>('/api/plants/does-not-exist');
    assert.equal(status, 404);
    assert.equal(body.error.code, 'not_found');
  });
});

describe('GET /api/plants/compare', () => {
  it('returns the plants in order with eight rows and one differing row', async () => {
    const { status, body } = await requestJson<{
      plants: Array<{ slug: string }>;
      rows: Array<{ label: string; values: Array<string | null>; differs: boolean }>;
    }>('/api/plants/compare?ids=tulsi,mint');

    assert.equal(status, 200);
    assert.deepEqual(
      body.plants.map((plant) => plant.slug),
      ['tulsi', 'mint'],
    );
    assert.deepEqual(
      body.rows.map((row) => row.label),
      [
        'Family',
        'Parts used',
        'Active compounds',
        'Medicinal uses',
        'Dosage',
        'Contraindications',
        'Toxicity',
        'Region',
      ],
    );
    assert.deepEqual(
      body.rows.map((row) => row.differs),
      [false, false, true, false, false, false, false, false],
    );
  });

  it('400s when only one id is supplied', async () => {
    const { status, body } = await requestJson<ErrorEnvelope>('/api/plants/compare?ids=tulsi');
    assert.equal(status, 400);
    assert.equal(body.error.code, 'bad_request');
  });
});

describe('POST /api/plants', () => {
  it('rejects an anonymous request with the error envelope', async () => {
    const { status, body } = await requestJson<ErrorEnvelope>('/api/plants', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ commonName: 'New', botanicalName: 'Novus', family: 'Testaceae' }),
    });

    assert.equal(status, 401);
    assert.equal(body.error.code, 'unauthorized');
    assert.ok(typeof body.error.message === 'string' && body.error.message.length > 0);
  });
});
