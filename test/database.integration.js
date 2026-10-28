import 'dotenv/config';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createDatabase } from '../src/database/client.js';
import { startServer } from '../src/server.js';
import { loadConfig } from '../src/config/env.js';

const enabled = process.env.RUN_DB_TESTS === '1';
const logger = { info() {}, warn() {}, error() {} };

test('PostgreSQL migration, User persistence and unique email', { skip: !enabled }, async () => {
  assert.ok(process.env.DATABASE_URL, 'Use a dedicated test database');
  const database = createDatabase(process.env.DATABASE_URL);
  const email = `test-${randomUUID()}@example.invalid`;
  try {
    await database.connect();
    const user = await database.client.user.create({ data: { email } });
    assert.match(user.id, /^[0-9a-f-]{36}$/);
    assert.ok(user.created_at instanceof Date);
    await assert.rejects(database.client.user.create({ data: { email } }), { code: 'P2002' });
    await database.disconnect();
    await database.connect();
    assert.equal((await database.client.user.findUnique({ where: { email } })).id, user.id);
  } finally {
    await database.client.user.deleteMany({ where: { email } });
    await database.disconnect();
  }
});

test('real server connects to PostgreSQL, serves HTTP and shuts down', { skip: !enabled }, async () => {
  const { server, stop } = await startServer({ config: loadConfig({ DATABASE_URL: process.env.DATABASE_URL, PORT: '0' }), logger });
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    for (const path of ['/api/health', '/api/v1/health', '/api/docs/', '/api/openapi.json']) {
      assert.equal((await fetch(base + path)).status, 200);
    }
  } finally { await stop(); }
});

test('unreachable PostgreSQL fails startup with a safe error', { skip: !enabled }, async () => {
  await assert.rejects(startServer({
    config: loadConfig({ DATABASE_URL: 'postgresql://test:secret-marker@127.0.0.1:1/test', PORT: '0' }), logger,
  }), error => {
    assert.match(error.message, /Database connection failed/);
    assert.ok(!error.message.includes('secret-marker'));
    return true;
  });
});
