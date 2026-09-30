import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { initSiteAdmin } from '../public/js/site-admin.js';

class Element extends EventTarget {
  hidden = false;
  disabled = false;
  textContent = '';
  title = '';
  attributes = {};
  setAttribute(name, value) { this.attributes[name] = value; }
}
const tick = () => new Promise((resolve) => setImmediate(resolve));
function deferred() {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
}
function fixture({ admin = true, locked = false, confirmed = true } = {}) {
  const server = { admin, locked };
  const els = Object.fromEntries(['avalon-lock', 'avalon-lock-label', 'avalon-admin-link'].map((id) => [id, new Element()]));
  const doc = new EventTarget();
  doc.visibilityState = 'visible';
  doc.getElementById = (id) => els[id];
  const win = new EventTarget();
  let confirmations = 0;
  win.confirm = () => { confirmations++; return confirmed; };
  const calls = [], notices = [];
  let handler = null;
  const request = async (url, options) => {
    calls.push({ url, options });
    if (handler) {
      const value = await handler(url, options);
      if (value !== undefined) return value;
    }
    if (url.endsWith('/site-status')) return Response.json({ ok: true, ...server });
    if (url.endsWith('/lock')) {
      if (!server.admin) return Response.json({ ok: false, error: 'unauthorized' }, { status: 401 });
      server.locked = true;
      return Response.json({ ok: true, locked: true });
    }
    if (url.endsWith('/logout')) { server.admin = false; return Response.json({ ok: true }); }
    throw new Error('Unexpected endpoint: ' + url);
  };
  const control = initSiteAdmin({ doc, win, request, notify: (text, kind) => notices.push({ text, kind }) });
  return { control, server, els, doc, win, calls, notices, get confirmations() { return confirmations; }, set handler(value) { handler = value; } };
}

test('main header and footer expose management; relock is hidden until authorized', async () => {
  const html = await fs.readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  const app = await fs.readFile(new URL('../public/js/app.js', import.meta.url), 'utf8');
  assert.match(html, /id="avalon-lock"[^>]*hidden/);
  assert.equal((html.match(/href="\/avalon\/admin"/g) || []).length, 2);
  assert.match(app, /import \{ initSiteAdmin \} from '\.\/site-admin\.js'/);
  assert.match(app, /initSiteAdmin\(\{ notify:/);
});

test('guests have management access but no relock button', async () => {
  const f = fixture({ admin: false });
  await f.control.refresh();
  assert.equal(f.els['avalon-lock'].hidden, true);
  assert.equal(f.els['avalon-admin-link'].hidden, false);
  await f.control.lock();
  assert.equal(f.confirmations, 0);
});

test('an authenticated administrator sees relock when Avalon is open', async () => {
  const f = fixture();
  await f.control.refresh();
  assert.equal(f.els['avalon-lock'].hidden, false);
  assert.equal(f.els['avalon-lock'].disabled, false);
  assert.equal(f.calls[0].options.credentials, 'same-origin');
  assert.equal(f.calls[0].options.cache, 'no-store');
  assert.equal(f.calls.some((c) => /ice|config|usage/.test(c.url)), false);
});

test('already locked Avalon hides the redundant lock action', async () => {
  const f = fixture({ locked: true });
  await f.control.refresh();
  assert.equal(f.els['avalon-lock'].hidden, true);
});

test('focus refresh discovers a session created in the admin tab', async () => {
  const f = fixture({ admin: false });
  await f.control.refresh();
  f.server.admin = true;
  f.win.dispatchEvent(new Event('focus'));
  await f.control.refresh();
  assert.equal(f.els['avalon-lock'].hidden, false);
});

test('hidden tabs do not refresh, while visibility return and pageshow do', async () => {
  const f = fixture();
  await f.control.refresh();
  f.doc.visibilityState = 'hidden';
  const before = f.calls.length;
  f.doc.dispatchEvent(new Event('visibilitychange'));
  assert.equal(f.calls.length, before);
  f.doc.visibilityState = 'visible';
  f.doc.dispatchEvent(new Event('visibilitychange'));
  await f.control.refresh();
  f.win.dispatchEvent(new Event('pageshow'));
  await f.control.refresh();
  assert.equal(f.calls.length, before + 2);
});

test('concurrent state refreshes share one request', async () => {
  const f = fixture();
  await f.control.refresh();
  const wait = deferred();
  f.handler = (url) => url.endsWith('/site-status') ? wait.promise : undefined;
  const before = f.calls.length;
  const a = f.control.refresh(), b = f.control.refresh();
  assert.equal(a, b);
  assert.equal(f.calls.length, before + 1);
  wait.resolve(Response.json({ ok: true, admin: true, locked: false }));
  await a;
});

test('canceling confirmation makes no writes', async () => {
  const f = fixture({ confirmed: false });
  await f.control.refresh();
  await f.control.lock();
  assert.equal(f.confirmations, 1);
  assert.equal(f.calls.filter((c) => c.options.method === 'POST').length, 0);
});

test('successful relock locks first, then logs out, without navigating away', async () => {
  const f = fixture();
  await f.control.refresh();
  await f.control.lock();
  assert.deepEqual(f.calls.filter((c) => c.options.method === 'POST').map((c) => c.url), ['/avalon/api/admin/lock', '/avalon/api/admin/logout']);
  assert.deepEqual(f.server, { admin: false, locked: true });
  assert.equal(f.els['avalon-lock'].hidden, true);
  assert.equal(f.notices[0].kind, 'good');
  assert.equal(f.win.location, undefined);
});

test('failed lock is reported, does not log out, and restores the button', async () => {
  const f = fixture();
  await f.control.refresh();
  f.handler = (url) => url.endsWith('/lock') ? Response.json({ ok: false, error: 'storage unavailable' }, { status: 503 }) : undefined;
  await f.control.lock();
  assert.equal(f.calls.some((c) => c.url.endsWith('/logout')), false);
  assert.equal(f.els['avalon-lock'].disabled, false);
  assert.equal(f.els['avalon-lock'].hidden, false);
  assert.equal(f.notices[0].text, 'storage unavailable');
});

test('expired sessions are rejected and the relock action disappears', async () => {
  const f = fixture();
  await f.control.refresh();
  f.server.admin = false;
  await f.control.lock();
  assert.equal(f.els['avalon-lock'].hidden, true);
  assert.equal(f.server.locked, false);
  assert.equal(f.notices[0].text, 'unauthorized');
});

test('logout failure is distinguished from lock failure', async () => {
  const f = fixture();
  await f.control.refresh();
  f.handler = (url) => url.endsWith('/logout') ? Response.json({ ok: false }, { status: 503 }) : undefined;
  await f.control.lock();
  assert.deepEqual(f.server, { admin: true, locked: true });
  assert.equal(f.els['avalon-lock'].hidden, true);
  assert.equal(f.notices.length, 1);
  assert.equal(f.notices[0].kind, 'err');
  assert.match(f.notices[0].text, /\ub85c\uadf8\uc544\uc6c3/);
});

test('double-clicks are deduplicated while a lock is pending', async () => {
  const f = fixture();
  await f.control.refresh();
  const wait = deferred();
  f.handler = (url) => url.endsWith('/lock') ? wait.promise : undefined;
  const first = f.control.lock();
  assert.equal(f.els['avalon-lock'].disabled, true);
  await f.control.lock();
  assert.equal(f.confirmations, 1);
  assert.equal(f.calls.filter((c) => c.url.endsWith('/lock')).length, 1);
  wait.resolve(Response.json({ ok: true, locked: true }));
  await first;
});

test('an old state response cannot re-show the button after locking', async () => {
  const f = fixture();
  await f.control.refresh();
  const wait = deferred();
  f.handler = (url) => url.endsWith('/site-status') ? wait.promise : undefined;
  const refresh = f.control.refresh();
  await f.control.lock();
  wait.resolve(Response.json({ ok: true, admin: true, locked: false }));
  await refresh;
  assert.equal(f.els['avalon-lock'].hidden, true);
});

test('unverified lock success never logs out or claims success', async () => {
  const f = fixture();
  await f.control.refresh();
  f.handler = (url) => url.endsWith('/lock') ? Response.json({ ok: true, locked: false }) : undefined;
  await f.control.lock();
  assert.equal(f.calls.some((c) => c.url.endsWith('/logout')), false);
  assert.equal(f.notices[0].kind, 'err');
});

test('bad status JSON and network errors hide stale administrator controls', async () => {
  const f = fixture();
  await f.control.refresh();
  f.handler = () => Response.json({ ok: true, admin: 'yes', locked: false });
  await f.control.refresh();
  assert.equal(f.els['avalon-lock'].hidden, true);
  f.handler = () => { throw new Error('offline'); };
  await f.control.refresh();
  assert.equal(f.els['avalon-lock'].hidden, true);
  assert.equal(f.els['avalon-admin-link'].hidden, false);
});

test('destroy removes state listeners and click handlers', async () => {
  const f = fixture();
  await f.control.refresh();
  const before = f.calls.length;
  f.control.destroy();
  f.win.dispatchEvent(new Event('focus'));
  f.els['avalon-lock'].dispatchEvent(new Event('click'));
  await tick();
  assert.equal(f.calls.length, before);
});
