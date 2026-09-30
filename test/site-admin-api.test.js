import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

// Exercise the actual Worker handlers and SiteGate without Cloudflare credentials.
async function fixture() {
  const gateSource = (await fs.readFile(new URL('../avalon/src/gate.js', import.meta.url), 'utf8'))
    .replace("import { DurableObject } from 'cloudflare:workers';", 'class DurableObject { constructor() {} }');
  const workerSource = (await fs.readFile(new URL('../avalon/src/index.js', import.meta.url), 'utf8'))
    .replace(/^export \{.*\} from .*;\n/gm, '');
  const { SiteGate } = await import('data:text/javascript;base64,' + Buffer.from(gateSource).toString('base64'));
  const { default: worker } = await import('data:text/javascript;base64,' + Buffer.from(workerSource).toString('base64'));
  const values = new Map();
  const ctx = { storage: { get: async (key) => structuredClone(values.get(key)), put: async (key, value) => values.set(key, structuredClone(value)) } };
  const gate = new SiteGate(ctx, {});
  const env = {
    SITE_ADMIN_PASSWORD: 'test-only-password',
    GATE: { idFromName: (s) => s, get: () => ({ fetch: (url, opts) => gate.fetch(new Request(url, opts)) }) },
    ASSETS: { fetch: async () => new Response('static content') },
  };
  const send = (path, options = {}) => worker.fetch(new Request('https://example.test/avalon' + path, options), env);
  const login = async () => {
    const res = await send('/api/admin/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: env.SITE_ADMIN_PASSWORD }) });
    assert.equal(res.status, 200);
    return res.headers.get('set-cookie').split(';')[0];
  };
  return { send, login, values };
}

test('API: guests cannot lock or unlock and no state is changed', async () => {
  const f = await fixture();
  for (const action of ['lock', 'unlock']) {
    const res = await f.send('/api/admin/' + action, { method: 'POST' });
    assert.equal(res.status, 401);
  }
  assert.equal(f.values.has('gate-state'), false);
});

test('API: same-origin administrator cookie supports unlock, relock, logout', async () => {
  const f = await fixture();
  const cookie = await f.login();
  const headers = { cookie };
  let res = await f.send('/api/admin/unlock', { method: 'POST', headers });
  assert.equal((await res.json()).locked, false);
  let status = await (await f.send('/api/site-status', { headers })).json();
  assert.equal(status.admin, true);
  assert.equal(status.locked, false);
  res = await f.send('/api/admin/lock', { method: 'POST', headers });
  assert.equal((await res.json()).locked, true);
  res = await f.send('/api/admin/logout', { method: 'POST', headers });
  assert.match(res.headers.get('set-cookie'), /Max-Age=0/);
  status = await (await f.send('/api/site-status', { headers })).json();
  assert.equal(status.admin, false);
  assert.equal(status.locked, true);
  res = await f.send('/api/admin/unlock', { method: 'POST', headers });
  assert.equal(res.status, 401);
});

test('API: relocking blocks new guest HTML and runtime requests', async () => {
  const f = await fixture();
  const cookie = await f.login();
  await f.send('/api/admin/unlock', { method: 'POST', headers: { cookie } });
  assert.equal((await f.send('/')).status, 200);
  await f.send('/api/admin/lock', { method: 'POST', headers: { cookie } });
  assert.equal((await f.send('/')).status, 423);
  assert.equal((await f.send('/config')).status, 423);
  assert.equal((await f.send('/api/rooms', { method: 'POST' })).status, 423);
  assert.equal((await f.send('/admin')).status, 200);
});

test('API: the existing administrator session lasts 12 hours and is scoped to the root', async () => {
  const f = await fixture();
  const cookie = await f.login();
  const token = decodeURIComponent(cookie.split('=')[1]);
  const sessions = f.values.get('admin-sessions');
  assert.ok(sessions[token] > Date.now() + 11 * 60 * 60 * 1000);
  sessions[token] = Date.now() - 1;
  f.values.set('admin-sessions', sessions);
  const res = await f.send('/api/admin/lock', { method: 'POST', headers: { cookie } });
  assert.equal(res.status, 401);
});
