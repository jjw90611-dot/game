import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

async function loadGateClass() {
  const projectRoot = path.resolve(new URL('..', import.meta.url).pathname);
  const sourcePath = path.join(projectRoot, 'src', 'gate.js');
  let src = await fs.readFile(sourcePath, 'utf8');
  src = src.replace("import { DurableObject } from 'cloudflare:workers';", "class DurableObject { constructor(ctx, env) { this.ctx = ctx; this.env = env; } }");
  const temp = path.join(os.tmpdir(), `avalon-gate-${Date.now()}-${Math.random()}.mjs`);
  await fs.writeFile(temp, src);
  const mod = await import(pathToFileURL(temp).href);
  await fs.unlink(temp).catch(() => {});
  return mod.SiteGate;
}

class MockStorage {
  constructor() { this.values = new Map(); }
  async get(k) { return this.values.get(k); }
  async put(k, v) { this.values.set(k, structuredClone(v)); }
}

function ctx() { return { storage: new MockStorage() }; }

test('Site gate defaults to locked', async () => {
  const SiteGate = await loadGateClass();
  const gate = new SiteGate(ctx(), {});
  const res = await gate.fetch(new Request('https://gate/internal/status'));
  const data = await res.json();
  assert.equal(data.locked, true);
});

test('Site gate can be unlocked and locked again', async () => {
  const SiteGate = await loadGateClass();
  const gate = new SiteGate(ctx(), {});
  await gate.fetch(new Request('https://gate/internal/state', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ locked: false }) }));
  let data = await (await gate.fetch(new Request('https://gate/internal/status'))).json();
  assert.equal(data.locked, false);
  await gate.fetch(new Request('https://gate/internal/state', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ locked: true }) }));
  data = await (await gate.fetch(new Request('https://gate/internal/status'))).json();
  assert.equal(data.locked, true);
});

test('Site gate grants and validates opaque admin sessions', async () => {
  const SiteGate = await loadGateClass();
  const gate = new SiteGate(ctx(), {});
  const grant = await (await gate.fetch(new Request('https://gate/internal/grant', { method: 'POST' }))).json();
  assert.equal(grant.ok, true);
  assert.ok(grant.token.length > 40);
  const valid = await (await gate.fetch(new Request('https://gate/internal/validate', { headers: { authorization: `Bearer ${grant.token}` } }))).json();
  assert.equal(valid.ok, true);
  await gate.fetch(new Request('https://gate/internal/revoke', { method: 'POST', headers: { authorization: `Bearer ${grant.token}` } }));
  const revoked = await (await gate.fetch(new Request('https://gate/internal/validate', { headers: { authorization: `Bearer ${grant.token}` } }))).json();
  assert.equal(revoked.ok, false);
});

test('Site gate rate-limits repeated admin password failures per client key', async () => {
  const SiteGate = await loadGateClass();
  const gate = new SiteGate(ctx(), {});
  const key = '203.0.113.10';
  for (let i = 0; i < 5; i += 1) {
    const res = await gate.fetch(new Request('https://gate/internal/login-result', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ key, success: false })
    }));
    assert.equal(res.status, 200);
  }
  const check = await (await gate.fetch(new Request('https://gate/internal/login-check', { headers: { 'x-client-key': key } }))).json();
  assert.equal(check.allowed, false);
  assert.ok(check.retryAfter > 0);
});
