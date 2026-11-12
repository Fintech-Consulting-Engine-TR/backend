import 'dotenv/config';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createDatabase } from '../src/database/client.js';
import { startServer } from '../src/server.js';
import { hashPassword } from '../src/modules/auth/password.js';
import { signToken } from '../src/modules/auth/middleware.js';
import { loadConfig } from '../src/config/env.js';

const enabled = process.env.RUN_DB_TESTS === '1';
const secret = 'integration-test-secret-32-characters';
const logger = { info() {}, warn() {}, error() {} };
async function fixture(t) {
  assert.ok(process.env.DATABASE_URL);
  const db = createDatabase(process.env.DATABASE_URL);
  await db.connect();
  const companies = new Set();
  const users = new Set();
  let running;
  t.after(async () => {
    await running?.stop();
    try {
      await db.client.contact.deleteMany({ where: { companyId: { in: [...companies] } } });
      await db.client.company.deleteMany({ where: { id: { in: [...companies] } } });
      await db.client.user.deleteMany({ where: { id: { in: [...users] } } });
    } finally { await db.disconnect(); }
  });
  const actor = await db.client.user.create({ data: { email: `${randomUUID()}@example.invalid`, password_hash: hashPassword('password123') } });
  users.add(actor.id);
  const token = signToken(actor, secret);
  running = await startServer({ config: loadConfig({ DATABASE_URL: process.env.DATABASE_URL, PORT: '0', JWT_SECRET: secret }), logger });
  const base = `http://127.0.0.1:${running.server.address().port}/api/v1`;
  async function request(path, method = 'GET', body, status = 200) {
    const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, ...(body !== undefined && {
      body: JSON.stringify(body),
    }) });
    const result = response.status === 204 ? null : await response.json();
    if (path === '/companies' && method === 'POST' && result?.data?.id) companies.add(result.data.id);
    assert.equal(response.status, status, JSON.stringify(result));
    if (status >= 400) {
      assert.ok(result.error.requestId);
      assert.ok(!JSON.stringify(result).includes('PrismaClient'));
    }
    return result;
  }
  async function user() {
    const value = await db.client.user.create({ data: { email: `${randomUUID()}@example.invalid`, password_hash: hashPassword('password123') } });
    users.add(value.id);
    return value;
  }
  return { db: db.client, request, user, actor, base, token };
}

test('company CRUD, search, pagination and ownership', { skip: !enabled }, async t => {
  const { request, user, db, actor } = await fixture(t);
  const owner = await user();
  const name = `Test-${randomUUID()}`;
  const { data: company } = await request('/companies', 'POST', { name: ` ${name} `, responsibleUserId: owner.id }, 201);
  assert.equal(company.name, name);
  assert.equal(company.createdById, actor.id);
  assert.equal(company.createdBy.id, actor.id);
  assert.deepEqual(company.responsibleUser, { id: owner.id, email: owner.email });
  assert.equal((await request(`/companies/${company.id}`)).data.id, company.id);
  assert.equal((await request(`/companies?search=${name.toUpperCase()}`)).data[0].id, company.id);
  assert.equal((await request(`/companies?search=${name}&limit=1&offset=1`)).data.length, 0);
  const special = (await request('/companies', 'POST', { name: `${name}_100%` }, 201)).data;
  await request('/companies', 'POST', { name: `${name}X100extra` }, 201);
  assert.deepEqual((await request(`/companies?search=${encodeURIComponent(`${name}_100%`)}`)).data.map(row => row.id), [special.id]);
  await request(`/companies/${company.id}`, 'PATCH', { createdById: owner.id }, 422);
  assert.equal((await db.company.findUnique({ where: { id: company.id } })).createdById, actor.id);
  // Simulate a future trusted server-side attribution, not an HTTP-provided identity.
  await db.company.update({ where: { id: company.id }, data: { createdById: owner.id } });
  const updated = await request(`/companies/${company.id}`, 'PATCH', { name: 'Renamed', responsibleUserId: null });
  assert.equal(updated.data.responsibleUser, null);
  assert.equal(updated.data.createdBy.id, owner.id);
  assert.equal(updated.data.name, 'Renamed');
  await request(`/companies/${company.id}`, 'DELETE', undefined, 204);
  for (const method of ['GET', 'PATCH', 'DELETE']) {
    await request(`/companies/${company.id}`, method, method === 'PATCH' ? { name } : undefined, 404);
  }
});

test('contact CRUD, company filtering, FK restrictions and reassignment', { skip: !enabled }, async t => {
  const { request, user, db, actor } = await fixture(t);
  const owner = await user();
  const a = (await request('/companies', 'POST', { name: 'A' }, 201)).data;
  const b = (await request('/companies', 'POST', { name: 'B' }, 201)).data;
  const email = `${randomUUID()}@example.invalid`;
  const contact = (await request('/contacts', 'POST', {
    firstName: ' Anna ', lastName: 'Smith', email: email.toUpperCase(), phone: '+380123456789',
    companyId: a.id, responsibleUserId: owner.id,
  }, 201)).data;
  assert.equal(contact.firstName, 'Anna');
  assert.equal(contact.email, email);
  assert.equal(contact.createdById, actor.id);
  assert.equal(contact.responsibleUser.id, owner.id);
  assert.equal(contact.company.id, a.id);
  assert.equal((await request(`/contacts/${contact.id}`)).data.id, contact.id);
  assert.ok((await request('/contacts?limit=100')).data.some(row => row.id === contact.id));
  assert.deepEqual((await request(`/companies/${a.id}/contacts`)).data.map(row => row.id), [contact.id]);
  assert.equal((await request(`/companies/${b.id}/contacts`)).data.length, 0);
  await request(`/companies/${a.id}`, 'DELETE', undefined, 409);
  await assert.rejects(db.company.delete({ where: { id: a.id } }), { code: 'P2003' });
  await assert.rejects(db.user.delete({ where: { id: owner.id } }), { code: 'P2003' });
  assert.equal((await request(`/contacts/${contact.id}`)).data.companyId, a.id);
  await request(`/contacts/${contact.id}`, 'PATCH', { createdById: owner.id }, 422);
  await db.contact.update({ where: { id: contact.id }, data: { createdById: owner.id } });
  const edited = (await request(`/contacts/${contact.id}`, 'PATCH', {
    firstName: 'Olena', companyId: b.id, email: null, phone: null, responsibleUserId: null,
  })).data;
  assert.equal(edited.id, contact.id);
  assert.equal(edited.createdBy.id, owner.id);
  assert.equal(edited.firstName, 'Olena');
  assert.equal(edited.email, null);
  assert.equal(edited.phone, null);
  assert.equal(edited.responsibleUser, null);
  assert.equal((await request(`/companies/${a.id}/contacts`)).data.length, 0);
  assert.equal((await request(`/companies/${b.id}/contacts`)).data[0].id, contact.id);
  await request(`/companies/${a.id}`, 'DELETE', undefined, 204);
  await request(`/contacts/${contact.id}`, 'DELETE', undefined, 204);
  for (const method of ['GET', 'PATCH', 'DELETE']) {
    await request(`/contacts/${contact.id}`, method, method === 'PATCH' ? { firstName: 'Absent' } : undefined, 404);
  }
  await request(`/companies/${b.id}`, 'DELETE', undefined, 204);
});

test('missing relations, invalid requests and author spoofing are rejected', { skip: !enabled }, async t => {
  const { request, db } = await fixture(t);
  const company = (await request('/companies', 'POST', { name: 'Validation' }, 201)).data;
  const missing = randomUUID();
  for (const body of [{}, { name: ' ' }, { name: 'x', createdById: missing }, { name: 'x', id: missing }]) {
    await request('/companies', 'POST', body, 422);
  }
  await request('/companies', 'POST', { name: 'x', responsibleUserId: missing }, 422);
  await request(`/companies/${company.id}`, 'PATCH', { responsibleUserId: missing }, 422);
  await request(`/companies/${company.id}`, 'PATCH', {}, 422);
  await request('/companies/not-uuid', 'GET', undefined, 422);
  await request('/companies?limit=101', 'GET', undefined, 422);
  await request('/companies?offset=-1', 'GET', undefined, 422);
  await request('/companies?unknown=1', 'GET', undefined, 422);
  await request(`/companies/${missing}/contacts`, 'GET', undefined, 404);
  const body = { firstName: 'A', lastName: 'B', companyId: company.id };
  await request('/contacts', 'POST', { ...body, companyId: missing }, 404);
  await request('/contacts', 'POST', { ...body, responsibleUserId: missing }, 422);
  for (const patch of [{ createdById: missing }, { email: 'invalid' }, { firstName: '' }, { companyId: null }]) {
    await request('/contacts', 'POST', { ...body, ...patch }, 422);
  }
  const contact = (await request('/contacts', 'POST', body, 201)).data;
  await request(`/contacts/${contact.id}`, 'PATCH', { companyId: missing }, 404);
  await request(`/contacts/${contact.id}`, 'PATCH', { responsibleUserId: missing }, 422);
  await request(`/contacts/${contact.id}`, 'PATCH', {}, 422);
  await request('/contacts/not-uuid', 'GET', undefined, 422);
  await assert.rejects(db.contact.create({ data: { ...body, full_name: 'A B', companyId: missing } }), { code: 'P2003' });
  assert.equal((await request(`/contacts/${contact.id}`)).data.companyId, company.id);
});

test('duplicate email is normalized and concurrent creates cannot bypass uniqueness', { skip: !enabled }, async t => {
  const { request } = await fixture(t);
  const company = (await request('/companies', 'POST', { name: 'Duplicates' }, 201)).data;
  const body = { firstName: 'A', lastName: 'B', companyId: company.id, email: `${randomUUID()}@example.invalid` };
  const first = await request('/contacts', 'POST', body, 201);
  await request('/contacts', 'POST', { ...body, email: ` ${body.email.toUpperCase()} ` }, 409);
  const second = await request('/contacts', 'POST', { ...body, email: null }, 201);
  await request(`/contacts/${second.data.id}`, 'PATCH', { email: body.email }, 409);
  assert.equal((await request(`/contacts/${first.data.id}`)).data.email, body.email);
  const raceEmail = `${randomUUID()}@example.invalid`;
  // Both HTTP calls run concurrently; exactly one must succeed.
  const outcomes = await Promise.allSettled([
    request('/contacts', 'POST', { ...body, email: raceEmail }, 201),
    request('/contacts', 'POST', { ...body, email: raceEmail }, 201),
  ]);
  assert.equal(outcomes.filter(result => result.status === 'fulfilled').length, 1);
  assert.match(outcomes.find(result => result.status === 'rejected').reason.message, /DUPLICATE_RECORD/);
});

test('merged auth protects CRUD, attributes creators and supports real admin management', { skip: !enabled }, async t => {
  const { db, actor, base, request, user } = await fixture(t);
  for (const path of ['/companies', '/contacts']) {
    assert.equal((await fetch(base + path)).status, 401);
    assert.equal((await fetch(base + path, { headers: { Authorization: 'Bearer invalid' } })).status, 401);
  }
  const login = await fetch(base + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: actor.email, password: 'password123' }) });
  assert.equal(login.status, 200);
  const { data } = await login.json();
  assert.ok(!JSON.stringify(data).includes('password_hash'));
  const headers = { Authorization: `Bearer ${data.token}` };
  assert.equal((await fetch(base + '/companies', { headers })).status, 200);
  assert.equal((await fetch(base + '/users', { headers })).status, 403);
  await db.user.update({ where: { id: actor.id }, data: { role: 'admin' } });
  const list = await fetch(base + '/users', { headers });
  assert.equal(list.status, 200);
  assert.ok(!(await list.text()).includes('password_hash'));
  const company = (await request('/companies', 'POST', { name: 'Attributed' }, 201)).data;
  assert.equal(company.createdById, actor.id);
  const disabled = await user();
  await db.user.update({ where: { id: disabled.id }, data: { password_hash: '' } });
  const rejected = await fetch(base + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: disabled.email, password: 'anything' }) });
  assert.equal(rejected.status, 401);
});

test('Vlad fields and legacy full names survive CRUD edits', { skip: !enabled }, async t => {
  const { db, request } = await fixture(t);
  const company = (await request('/companies', 'POST', {
    name: 'Legacy-compatible', industry: 'Finance', website: 'https://example.invalid', custom: { region: 'UA' },
  }, 201)).data;
  assert.equal(company.industry, 'Finance');
  assert.deepEqual(company.custom, { region: 'UA' });
  const legacy = await db.contact.create({ data: {
    companyId: company.id, full_name: 'Ім’я без надійного поділу', position: 'Director', custom: { imported: true },
  } });
  const edited = (await request(`/contacts/${legacy.id}`, 'PATCH', { phone: '+380123456789' })).data;
  assert.equal(edited.full_name, legacy.full_name);
  assert.equal(edited.firstName, null);
  assert.equal(edited.lastName, null);
  assert.equal(edited.position, 'Director');
  assert.deepEqual(edited.custom, { imported: true });
  assert.equal(edited.createdById, null);
  const created = (await request('/contacts', 'POST', {
    firstName: 'Anna', lastName: 'Smith', companyId: company.id, position: 'Manager', custom: { team: 'A' },
  }, 201)).data;
  assert.equal(created.full_name, 'Anna Smith');
  const updated = (await request(`/contacts/${created.id}`, 'PATCH', { lastName: 'Jones' })).data;
  assert.equal(updated.full_name, 'Anna Jones');
  assert.equal(updated.position, 'Manager');
  assert.deepEqual(updated.custom, { team: 'A' });
});
