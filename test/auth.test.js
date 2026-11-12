import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config/env.js';
import { createModules } from '../src/modules/index.js';
import { hashPassword, verifyPassword } from '../src/modules/auth/password.js';

const logger = { info() {}, error() {}, warn() {} };
const config = loadConfig({
  NODE_ENV: 'production', PORT: '0', DATABASE_URL: 'postgresql://u:p@localhost:5432/db', JWT_SECRET: 'x'.repeat(32),
});

// In-memory stand-in for the Prisma user model.
function fakePrisma() {
  const users = [];
  const duplicate = () => Object.assign(new Error('duplicate'), { code: 'P2002' });
  const missing = () => Object.assign(new Error('missing'), { code: 'P2025' });
  return {
    user: {
      async findUnique({ where }) { return users.find(u => u.id === where.id || u.email === where.email) ?? null; },
      async findMany() { return [...users]; },
      async create({ data }) {
        if (users.some(u => u.email === data.email)) throw duplicate();
        const user = { id: randomUUID(), role: 'user', created_at: new Date(), ...data };
        users.push(user);
        return user;
      },
      async update({ where, data }) {
        const user = users.find(u => u.id === where.id);
        if (!user) throw missing();
        return Object.assign(user, data);
      },
    },
  };
}

async function setup(t) {
  const prisma = fakePrisma();
  const server = createServer(createApp({ config, logger, modules: createModules({ prisma, config }) }));
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const base = `${origin}/api/v1`;
  const call = async (path, { method = 'GET', body, token } = {}) => {
    const response = await fetch(base + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
      body: body && JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
  };
  const addUser = (email, role, password = 'password123') =>
    prisma.user.create({ data: { email, role, password_hash: hashPassword(password) } });
  const login = async (email, password = 'password123') => (await call('/auth/login', { method: 'POST', body: { email, password } }));
  return { origin, call, addUser, login };
}

test('passwords are hashed with a salt and verified', () => {
  const stored = hashPassword('secret-password');
  assert.ok(!stored.includes('secret-password'));
  assert.notEqual(stored, hashPassword('secret-password'));
  assert.equal(verifyPassword('secret-password', stored), true);
  assert.equal(verifyPassword('wrong', stored), false);
});

test('JWT_SECRET is required (32+ chars) when a database is configured', () => {
  const env = { DATABASE_URL: 'postgresql://u:p@localhost:5432/db' };
  assert.throws(() => loadConfig(env), /^Error: Invalid JWT_SECRET/);
  assert.throws(() => loadConfig({ ...env, JWT_SECRET: 'short' }), /^Error: Invalid JWT_SECRET/);
  assert.equal(loadConfig({}).jwtSecret, undefined);
});

test('login returns a token; wrong credentials give 401', async t => {
  const { call, addUser, login } = await setup(t);
  await addUser('user@example.com', 'user');
  const ok = await login('USER@example.com');
  assert.equal(ok.status, 200);
  assert.equal(ok.body.data.user.email, 'user@example.com');
  assert.ok(ok.body.data.token);
  assert.ok(!JSON.stringify(ok.body).includes('password_hash'));
  assert.equal((await login('user@example.com', 'wrong-password')).status, 401);
  assert.equal((await login('nobody@example.com')).body.error.code, 'INVALID_CREDENTIALS');
  assert.equal((await call('/auth/login', { method: 'POST', body: { email: 'bad' } })).status, 422);
});

test('protected routes: no or bad token gives 401', async t => {
  const { call } = await setup(t);
  assert.equal((await call('/auth/me')).status, 401);
  assert.equal((await call('/users')).status, 401);
  assert.equal((await call('/users', { token: 'not-a-jwt' })).status, 401);
});

test('a user without the admin role gets 403 on user management', async t => {
  const { call, addUser, login } = await setup(t);
  await addUser('user@example.com', 'user');
  const { token } = (await login('user@example.com')).body.data;
  assert.equal((await call('/auth/me', { token })).body.data.role, 'user');
  assert.equal((await call('/users', { token })).status, 403);
  const create = await call('/users', { method: 'POST', token, body: { email: 'new@example.com', password: 'password123' } });
  assert.equal(create.status, 403);
  assert.equal(create.body.error.code, 'FORBIDDEN');
});

test('admin creates users with roles and changes roles', async t => {
  const { call, addUser, login } = await setup(t);
  await addUser('admin@example.com', 'admin');
  const { token } = (await login('admin@example.com')).body.data;

  const created = await call('/users', { method: 'POST', token, body: { email: 'New@Example.com', password: 'password123' } });
  assert.equal(created.status, 201);
  assert.equal(created.body.data.email, 'new@example.com');
  assert.equal(created.body.data.role, 'user');
  assert.ok(!JSON.stringify(created.body).includes('password'));
  assert.equal((await login('new@example.com')).status, 200);

  assert.equal((await call('/users', { method: 'POST', token, body: { email: 'new@example.com', password: 'password123' } })).status, 409);
  assert.equal((await call('/users', { method: 'POST', token, body: { email: 'x@example.com', password: 'short' } })).status, 422);
  assert.equal((await call('/users', { method: 'POST', token, body: { email: 'x@example.com', password: 'password123', role: 'boss' } })).status, 422);

  const list = await call('/users', { token });
  assert.equal(list.body.data.length, 2);

  const promoted = await call(`/users/${created.body.data.id}/role`, { method: 'PATCH', token, body: { role: 'admin' } });
  assert.equal(promoted.body.data.role, 'admin');
  assert.equal((await call(`/users/${randomUUID()}/role`, { method: 'PATCH', token, body: { role: 'user' } })).status, 404);
  assert.equal((await call('/users/not-a-uuid/role', { method: 'PATCH', token, body: { role: 'user' } })).status, 422);
  const own = (await call('/auth/me', { token })).body.data.id;
  assert.equal((await call(`/users/${own}/role`, { method: 'PATCH', token, body: { role: 'user' } })).status, 409);
});

test('a demoted admin loses access immediately', async t => {
  const { call, addUser, login } = await setup(t);
  await addUser('admin@example.com', 'admin');
  const other = await addUser('other@example.com', 'admin');
  const { token } = (await login('other@example.com')).body.data;
  const admin = (await login('admin@example.com')).body.data;
  assert.equal((await call('/users', { token })).status, 200);
  await call(`/users/${other.id}/role`, { method: 'PATCH', token: admin.token, body: { role: 'user' } });
  assert.equal((await call('/users', { token })).status, 403);
});

test('admin panel is served as static files', async t => {
  const { origin } = await setup(t);
  const page = await fetch(`${origin}/admin/`);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /<script src="app.js">/);
  const script = await fetch(`${origin}/admin/app.js`);
  assert.equal(script.status, 200);
  assert.match(script.headers.get('content-type'), /javascript/);
});
