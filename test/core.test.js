import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { Router } from 'express';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config/env.js';
import { AppError } from '../src/http/errors.js';
import { z } from 'zod';
import { validate } from '../src/http/validate.js';
import { startServer } from '../src/server.js';

const logger = { info() {}, error() {}, warn() {} };
const config = loadConfig({ NODE_ENV: 'production', PORT: '0', CORS_ORIGINS: 'http://localhost:5173' });
async function fixture(t, modules = []) {
  const server = createServer(createApp({ config, logger, modules }));
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  return `http://127.0.0.1:${server.address().port}`;
}
function checkError(body, response, code) {
  assert.deepEqual(Object.keys(body), ['error']);
  assert.deepEqual(Object.keys(body.error).sort(), ['code', 'message', 'requestId']);
  assert.equal(body.error.code, code);
  assert.equal(body.error.requestId, response.headers.get('x-request-id'));
  assert.match(body.error.requestId, /^[0-9a-f-]{36}$/);
}

test('health returns process liveness JSON and security headers', async t => {
  const base = await fixture(t);
  const response = await fetch(`${base}/api/health`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /application\/json/);
  assert.equal(response.headers.get('x-powered-by'), null);
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const body = await response.json();
  assert.deepEqual(Object.keys(body), ['data']);
  assert.deepEqual(Object.keys(body.data).sort(), ['status', 'timestamp', 'uptimeSeconds']);
  assert.equal(body.data.status, 'ok');
  assert.ok(body.data.uptimeSeconds >= 0);
  assert.ok(Number.isFinite(Date.parse(body.data.timestamp)));
});

test('unknown paths and unsupported methods return structured 404', async t => {
  const base = await fixture(t);
  for (const [path, method] of [['/missing', 'GET'], ['/api/banks', 'GET'], ['/api/health', 'POST']]) {
    const response = await fetch(base + path, { method });
    assert.equal(response.status, 404);
    checkError(await response.json(), response, 'NOT_FOUND');
  }
});

test('module registration, expected errors and rejected async handlers', async t => {
  const router = Router();
  router.get('/invalid', () => { throw new AppError(422, 'VALIDATION_ERROR', 'Invalid input'); });
  router.get('/known', () => { throw new AppError(409, 'CONFLICT', 'Conflict'); });
  router.get('/unexpected', async () => { throw new Error('secret-password'); });
  router.post('/echo', (req, res) => res.json({ data: req.body }));
  const base = await fixture(t, [{ path: '/test', router }]);
  for (const [path, status, code] of [['invalid', 422, 'VALIDATION_ERROR'], ['known', 409, 'CONFLICT'], ['unexpected', 500, 'INTERNAL_ERROR']]) {
    const response = await fetch(`${base}/api/test/${path}`);
    assert.equal(response.status, status);
    const body = await response.json();
    checkError(body, response, code);
    assert.ok(!JSON.stringify(body).includes('secret-password'));
    assert.ok(!JSON.stringify(body).includes('stack'));
  }
  const response = await fetch(`${base}/api/test/echo`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"value":42}' });
  assert.deepEqual(await response.json(), { data: { value: 42 } });
});

test('schema validation failures return 422 with field details', async t => {
  const router = Router();
  router.post('/users', validate({ body: z.object({ email: z.email() }) }), (req, res) => res.status(201).json({ data: req.body }));
  const base = await fixture(t, [{ path: '/test', router }]);
  const send = body => fetch(`${base}/api/test/users`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const bad = await send({ email: 'not-an-email' });
  assert.equal(bad.status, 422);
  const body = await bad.json();
  assert.equal(body.error.code, 'VALIDATION_ERROR');
  assert.equal(body.error.details[0].path, 'email');
  assert.equal(body.error.requestId, bad.headers.get('x-request-id'));
  assert.equal((await send({ email: 'a@b.com' })).status, 201);
});

test('invalid JSON, oversized payloads and unsupported charset are safe errors', async t => {
  const base = await fixture(t);
  for (const [body, type, status, code] of [
    ['{"secret":', 'application/json', 400, 'INVALID_JSON'],
    [JSON.stringify({ data: 'x'.repeat(103000) }), 'application/json', 413, 'PAYLOAD_TOO_LARGE'],
    ['{}', 'application/json; charset=invalid', 415, 'UNSUPPORTED_ENCODING'],
  ]) {
    const response = await fetch(`${base}/api/health`, { method: 'POST', headers: { 'Content-Type': type }, body });
    assert.equal(response.status, status);
    checkError(await response.json(), response, code);
  }
});

test('CORS permits configured origins and preflight, denies other origins', async t => {
  const base = await fixture(t);
  const allowed = await fetch(`${base}/api/health`, { headers: { Origin: 'http://localhost:5173' } });
  assert.equal(allowed.headers.get('access-control-allow-origin'), 'http://localhost:5173');
  const denied = await fetch(`${base}/api/health`, { headers: { Origin: 'https://evil.example' } });
  assert.equal(denied.status, 403);
  assert.equal(denied.headers.get('access-control-allow-origin'), null);
  checkError(await denied.json(), denied, 'ORIGIN_NOT_ALLOWED');
  const preflight = await fetch(`${base}/api/health`, { method: 'OPTIONS', headers: { Origin: 'http://localhost:5173', 'Access-Control-Request-Method': 'GET' } });
  assert.equal(preflight.status, 204);
});

test('configuration validates without exposing input values', () => {
  for (const env of [{ PORT: '12oops' }, { PORT: '65536' }, { NODE_ENV: 'oops' }, { LOG_LEVEL: 'oops' }, { HOST: '' }, { CORS_ORIGINS: '*' }, { CORS_ORIGINS: 'https://user:secret@example.com' }, { SHUTDOWN_TIMEOUT_MS: '0' }]) {
    assert.throws(() => loadConfig(env), /^Error: Invalid /);
  }
  assert.equal(loadConfig({}).port, 3000);
  assert.deepEqual(loadConfig({ CORS_ORIGINS: `chrome-extension://${'a'.repeat(32)}` }).corsOrigins, [`chrome-extension://${'a'.repeat(32)}`]);
});

test('HTTP server starts, serves requests and stops idempotently', async () => {
  const { server, stop } = await startServer({ config, logger });
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/health`);
    assert.equal(response.status, 200);
  } finally { await Promise.all([stop(), stop()]); }
  assert.equal(server.listening, false);
});

for (const shutdownSignal of ['SIGINT', 'SIGTERM']) {
  test(`production entrypoint serves HTTP and exits cleanly on ${shutdownSignal}`, { timeout: 10000 }, async t => {
    const child = spawn(process.execPath, ['src/server.js'], {
      env: { ...process.env, NODE_ENV: 'production', HOST: '127.0.0.1', PORT: '0', LOG_LEVEL: 'info', DATABASE_URL: '' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    t.after(() => { if (child.exitCode === null) child.kill('SIGKILL'); });
    const exited = once(child, 'exit');
    let output = '';
    let stderr = '';
    child.stderr.on('data', chunk => { stderr += chunk; });
    const address = await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', () => reject(new Error('Exited before listening')));
      child.stdout.on('data', chunk => {
        output += chunk;
        for (const line of output.split('\n').filter(Boolean)) {
          try {
            const event = JSON.parse(line);
            if (event.msg === 'Server listening') resolve(event.address);
          } catch { /* Wait for a complete log line. */ }
        }
      });
    });
    const response = await fetch(`http://127.0.0.1:${address.port}/api/health`);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).data.status, 'ok');
    child.kill(shutdownSignal);
    const [code, signal] = await exited;
    assert.equal(code, 0);
    assert.equal(signal, null);
    assert.equal(stderr, '');
    assert.ok(output.includes('Shutting down'));
  });
}

test('startup rejects an occupied port', async () => {
  const first = await startServer({ config, logger });
  try {
    await assert.rejects(startServer({ config: { ...config, port: first.server.address().port }, logger }), { code: 'EADDRINUSE' });
  } finally { await first.stop(); }
});

test('shutdown drains active requests and bounds a stalled response', { timeout: 5000 }, async () => {
  for (const stalled of [false, true]) {
    const { server, stop } = await startServer({ config: { ...config, shutdownTimeoutMs: 100 }, logger });
    let entered;
    const started = new Promise(resolve => { entered = resolve; });
    server.removeAllListeners('request');
    server.on('request', (req, res) => {
      entered();
      if (!stalled) setTimeout(() => res.end('finished'), 20);
    });
    const response = fetch(`http://127.0.0.1:${server.address().port}`).then(r => r.text());
    const checked = stalled ? assert.rejects(response) : response.then(body => assert.equal(body, 'finished'));
    try {
      await started;
      await stop();
      await checked;
      assert.equal(server.listening, false);
    } finally { await stop(); }
  }
});

test('late exceptions abort the response without forwarding secret-bearing errors', async () => {
  const { errorHandler } = await import('../src/http/errors.js');
  const records = [];
  let destroyed = false;
  let forwarded = false;
  errorHandler({ error: (...args) => records.push(args) })(
    new Error('secret-token'), { requestId: 'test-id' },
    { headersSent: true, destroy() { destroyed = true; } },
    () => { forwarded = true; },
  );
  assert.equal(destroyed, true);
  assert.equal(forwarded, false);
  assert.equal(records[0][0].code, 'RESPONSE_ABORTED');
  assert.ok(!JSON.stringify(records).includes('secret-token'));
});

test('application environment follows validated config', () => {
  assert.equal(createApp({ config, logger }).get('env'), 'production');
});


test('versioned health and Swagger/OpenAPI describe actual routes', async t => {
  const base = await fixture(t);
  const health = await fetch(`${base}/api/v1/health`);
  assert.equal(health.status, 200);
  assert.equal((await health.json()).data.status, 'ok');
  const response = await fetch(`${base}/api/openapi.json`);
  assert.equal(response.status, 200);
  const document = await response.json();
  assert.equal(document.openapi, '3.0.3');
  for (const path of Object.keys(document.paths)) {
    assert.equal((await fetch(base + path)).status, 200);
    assert.ok(document.paths[path].get.responses['200']);
  }
  const ui = await fetch(`${base}/api/docs/`);
  assert.equal(ui.status, 200);
  assert.match(await ui.text(), /swagger-ui/);
  for (const asset of ['swagger-ui-init.js', 'swagger-ui-bundle.js', 'swagger-ui.css']) {
    assert.equal((await fetch(`${base}/api/docs/${asset}`)).status, 200);
  }
});

test('database URL validation is safe', () => {
  for (const url of ['not-a-url', 'https://example.com/db', 'postgresql://localhost']) {
    assert.throws(() => loadConfig({ DATABASE_URL: url }), /Invalid DATABASE_URL/);
  }
});
