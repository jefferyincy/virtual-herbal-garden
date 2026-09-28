import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';

// config/env.ts validates process.env the moment it is imported, and `node --test` is run
// without --env-file, so these keys must exist before app.ts is evaluated. That ordering is
// impossible with a static import (ESM hoists and evaluates it first), so the app is loaded
// dynamically below - the specifier itself is fixed.
process.env.NODE_ENV ??= 'test';
process.env.MONGO_URI ??= 'mongodb://127.0.0.1:27017/herbal_garden_test';
process.env.JWT_ACCESS_SECRET ??= 'test-access-secret-0123456789';
process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret-0123456789';

const { createApp } = await import('../app.ts');

let server!: Server;
let baseUrl!: string;

before(async () => {
  server = createApp().listen(0, '127.0.0.1');
  await once(server, 'listening');
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
});

test('GET /api/health reports liveness and db state', async () => {
  const res = await fetch(`${baseUrl}/api/health`);
  assert.equal(res.status, 200);
  const body = (await res.json()) as { ok?: unknown; db?: unknown };
  assert.equal(body.ok, true);
  assert.equal(typeof body.db, 'string');
});

test('unknown route returns the not_found envelope', async () => {
  const res = await fetch(`${baseUrl}/api/does-not-exist`);
  assert.equal(res.status, 404);
  const body = (await res.json()) as { error?: { code?: unknown } };
  assert.equal(body.error?.code, 'not_found');
});

test('wrong method on an existing path is not a 200', async () => {
  const res = await fetch(`${baseUrl}/api/health`, { method: 'POST' });
  assert.notEqual(res.status, 200);
});

test('unparseable JSON body still leaves the error envelope', async () => {
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{"email": oops',
  });
  const body = (await res.json()) as { error?: { code?: unknown; message?: unknown } };
  assert.equal(typeof body.error?.code, 'string');
  assert.equal(typeof body.error?.message, 'string');
});
