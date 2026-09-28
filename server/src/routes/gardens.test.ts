import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, beforeEach, test } from 'node:test';
import express, { type Express } from 'express';

// config/env.ts validates process.env at import time and the test runner is launched without
// --env-file, so seed the required keys before any module pulls the config in.
process.env.NODE_ENV ??= 'test';
process.env.MONGO_URI ??= 'mongodb://127.0.0.1:27017/herbal_garden_test';
process.env.JWT_ACCESS_SECRET ??= 'test-access-secret-0123456789';
process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret-0123456789';

// Static imports cannot work here: config/env.ts validates process.env at import time, so the
// seed values must be set before any module graph reaches it. node:test loads this file first.
const { connectDb, disconnectDb } = await import('../db.ts');
const { Garden, Plant, User } = await import('../models/index.ts');
const { signAccessToken } = await import('../middleware/auth.ts');
const { errorHandler, notFoundHandler } = await import('../middleware/error.ts');
const { gardensRouter } = await import('./gardens.ts');
const { publicGardenRouter } = await import('./publicGarden.ts');

let server!: Server;
let baseUrl!: string;

before(async () => {
  await connectDb('mongodb://127.0.0.1:27017/herbal_garden_test');
  const app: Express = express();
  app.use(express.json());
  app.use('/api/gardens', gardensRouter);
  app.use('/api', publicGardenRouter);
  app.use(notFoundHandler);
  app.use(errorHandler);
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
  await disconnectDb();
});

// Only this suite's collections are cleared: other suites share this mongod.
beforeEach(async () => {
  await Promise.all([Garden.deleteMany({}), Plant.deleteMany({}), User.deleteMany({})]);
});

type FetchOpts = { method?: string; token?: string; body?: unknown };

async function call(path: string, opts: FetchOpts = {}): Promise<{ status: number; body: unknown }> {
  const headers: Record<string, string> = {};
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  const res = await fetch(`${baseUrl}${path}`, {
    method: opts.method ?? 'GET',
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

async function makeUser(name: string, role: 'student' | 'expert' | 'admin' = 'student') {
  const user = await User.create({
    name,
    email: `${name.toLowerCase().replace(/\s+/g, '.')}@example.com`,
    passwordHash: 'x'.repeat(20),
    handle: name.toLowerCase().replace(/\s+/g, '-'),
    role,
  });
  return { user, token: signAccessToken({ id: String(user._id), role }) };
}

async function makePlant(slug: string) {
  return Plant.create({
    slug,
    commonName: 'Tulsi',
    botanicalName: 'Ocimum tenuiflorum',
    family: 'Lamiaceae',
    images: [{ url: `https://cdn.example.com/${slug}.png`, alt: 'Tulsi', credit: 'Test' }],
    publishedAt: new Date(),
  });
}

test('1. create a garden, then the list shows plantCount 0 and no plots key', async () => {
  const { token } = await makeUser('Ann');
  const created = await call('/api/gardens', { method: 'POST', token, body: { name: 'My herb garden' } });
  assert.equal(created.status, 201);
  const { garden } = created.body as { garden: { _id: string; slug: string } };
  assert.ok(garden._id);

  const list = await call('/api/gardens', { token });
  assert.equal(list.status, 200);
  const body = list.body as { items: Array<Record<string, unknown>>; total: number };
  assert.equal(body.total, 1);
  const row = body.items[0]!;
  assert.equal(row.plantCount, 0);
  assert.equal('plots' in row, false);
  assert.deepEqual(row.thumbnails, []);
});

test('2. two gardens with the same name get different slugs', async () => {
  const { token } = await makeUser('Bea');
  const first = await call('/api/gardens', { method: 'POST', token, body: { name: 'Herb patch' } });
  const second = await call('/api/gardens', { method: 'POST', token, body: { name: 'Herb patch' } });
  const a = (first.body as { garden: { slug: string } }).garden.slug;
  const b = (second.body as { garden: { slug: string } }).garden.slug;
  assert.equal(a, 'herb-patch');
  assert.equal(b, 'herb-patch-2');
  assert.notEqual(a, b);
});

test('3. planting an occupied tile is a 409, not a 500', async () => {
  const { token } = await makeUser('Cara');
  const plant = await makePlant('tulsi');
  const created = await call('/api/gardens', { method: 'POST', token, body: { name: 'Grid' } });
  const id = (created.body as { garden: { _id: string } }).garden._id;

  const first = await call(`/api/gardens/${id}/plots`, {
    method: 'POST',
    token,
    body: { x: 1, z: 2, plantId: String(plant._id) },
  });
  assert.equal(first.status, 201);
  const withPlot = first.body as { plot: { _id: string; x: number; z: number; stage: string }; plots: unknown[] };
  assert.equal(withPlot.plot.x, 1);
  assert.equal(withPlot.plot.stage, 'seedling');
  assert.equal(withPlot.plots.length, 1);

  const clash = await call(`/api/gardens/${id}/plots`, {
    method: 'POST',
    token,
    body: { x: 1, z: 2, plantId: String(plant._id) },
  });
  assert.equal(clash.status, 409);
  assert.equal((clash.body as { error: { code: string } }).error.code, 'conflict');
});

test('4. planting a non-existent plant is 404', async () => {
  const { token } = await makeUser('Dee');
  const created = await call('/api/gardens', { method: 'POST', token, body: { name: 'Ghost' } });
  const id = (created.body as { garden: { _id: string } }).garden._id;
  const res = await call(`/api/gardens/${id}/plots`, {
    method: 'POST',
    token,
    body: { x: 0, z: 0, plantId: '000000000000000000000000' },
  });
  assert.equal(res.status, 404);
  assert.equal((res.body as { error: { code: string } }).error.code, 'not_found');
});

test('5. out-of-grid coordinates fail validation', async () => {
  const { token } = await makeUser('Eve');
  const plant = await makePlant('mint');
  const created = await call('/api/gardens', { method: 'POST', token, body: { name: 'Bounds' } });
  const id = (created.body as { garden: { _id: string } }).garden._id;
  const res = await call(`/api/gardens/${id}/plots`, {
    method: 'POST',
    token,
    body: { x: 99, z: 0, plantId: String(plant._id) },
  });
  assert.ok(res.status === 400 || res.status === 422, `unexpected ${res.status}`);
  const code = (res.body as { error: { code: string } }).error.code;
  assert.ok(code === 'bad_request' || code === 'validation_error', `unexpected code ${code}`);
});

test('6. a second user cannot read, plant into, or delete someone else garden', async () => {
  const owner = await makeUser('Fern');
  const intruder = await makeUser('Gil');
  const created = await call('/api/gardens', { method: 'POST', token: owner.token, body: { name: 'Private' } });
  const id = (created.body as { garden: { _id: string } }).garden._id;

  const read = await call(`/api/gardens/${id}`, { token: intruder.token });
  assert.equal(read.status, 403);
  assert.equal((read.body as { error: { code: string } }).error.code, 'forbidden');

  const plant = await makePlant('sage');
  const place = await call(`/api/gardens/${id}/plots`, {
    method: 'POST',
    token: intruder.token,
    body: { x: 0, z: 0, plantId: String(plant._id) },
  });
  assert.equal(place.status, 403);

  const del = await call(`/api/gardens/${id}`, { method: 'DELETE', token: intruder.token });
  assert.equal(del.status, 403);
});

test('7. deleting a plot is owner-only and removes it', async () => {
  const owner = await makeUser('Hana');
  const intruder = await makeUser('Ivo');
  const plant = await makePlant('basil');
  const created = await call('/api/gardens', { method: 'POST', token: owner.token, body: { name: 'Plots' } });
  const id = (created.body as { garden: { _id: string } }).garden._id;
  const placed = await call(`/api/gardens/${id}/plots`, {
    method: 'POST',
    token: owner.token,
    body: { x: 3, z: 3, plantId: String(plant._id) },
  });
  const plotId = (placed.body as { plot: { _id: string } }).plot._id;

  const denied = await call(`/api/gardens/${id}/plots/${plotId}`, { method: 'DELETE', token: intruder.token });
  assert.equal(denied.status, 403);

  const ok = await call(`/api/gardens/${id}/plots/${plotId}`, { method: 'DELETE', token: owner.token });
  assert.equal(ok.status, 204);

  const after = await call(`/api/gardens/${id}`, { token: owner.token });
  const garden = (after.body as { garden: { plots: unknown[] } }).garden;
  assert.equal(garden.plots.length, 0);
});

test('8. public read exposes only the public projection', async () => {
  const { user, token } = await makeUser('Prajol');
  const plant = await makePlant('ashwagandha');
  const created = await call('/api/gardens', {
    method: 'POST',
    token,
    body: { name: 'Public garden', isPublic: true },
  });
  const garden = (created.body as { garden: { _id: string; slug: string } }).garden;
  await call(`/api/gardens/${garden._id}/plots`, {
    method: 'POST',
    token,
    body: { x: 0, z: 1, plantId: String(plant._id) },
  });

  const anon = await call(`/api/g/${garden.slug}`);
  assert.equal(anon.status, 200);
  const payload = anon.body as {
    garden: { name: string; plantCount: number; plots: Array<{ curatedNote: unknown; plant: { commonName: string } | null }> };
    owner: { name: string; handle: string };
  };
  assert.equal(payload.garden.name, 'Public garden');
  assert.equal(payload.garden.plantCount, 1);
  assert.equal(payload.garden.plots[0]!.plant?.commonName, 'Tulsi');
  assert.equal(payload.garden.plots[0]!.curatedNote, null);
  assert.equal(payload.owner.handle, 'prajol');
  const serialized = JSON.stringify(anon.body);
  assert.equal(serialized.includes(user.email), false);
  assert.equal(serialized.includes('passwordHash'), false);

  // A private garden is invisible to an anonymous caller, but its owner can preview it.
  const priv = await call('/api/gardens', { method: 'POST', token, body: { name: 'Secret' } });
  const privSlug = (priv.body as { garden: { slug: string } }).garden.slug;
  const hidden = await call(`/api/g/${privSlug}`);
  assert.equal(hidden.status, 404);
  const own = await call(`/api/g/${privSlug}`, { token });
  assert.equal(own.status, 200);
});

test('9. renaming a garden updates the name and keeps the slug', async () => {
  const { token } = await makeUser('Kim');
  const created = await call('/api/gardens', { method: 'POST', token, body: { name: 'Original' } });
  const garden = (created.body as { garden: { _id: string; slug: string } }).garden;

  const patched = await call(`/api/gardens/${garden._id}`, {
    method: 'PATCH',
    token,
    body: { name: 'Renamed' },
  });
  assert.equal(patched.status, 200);
  const updated = (patched.body as { garden: { name: string; slug: string } }).garden;
  assert.equal(updated.name, 'Renamed');
  assert.equal(updated.slug, garden.slug);
});
