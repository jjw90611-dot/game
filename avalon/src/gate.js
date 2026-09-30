import { DurableObject } from 'cloudflare:workers';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
  });
}

const SESSION_MS = 12 * 60 * 60 * 1000;
const currentPeriod = () => new Date().toISOString().slice(0, 7);

export class SiteGate extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.ctx = ctx;
    this.env = env;
  }

  async readState() {
    const saved = await this.ctx.storage.get('gate-state');
    if (saved?.scope === 'media-features-v2') return saved;
    // Preserve the manual state from the previous shared-media patch. Older Avalon-only
    // state had no scope, so it is intentionally migrated to a safe locked default.
    const state = {
      locked: saved?.scope === 'media-games-v1' ? saved.locked !== false : true,
      usageBlocked: !!saved?.usageBlocked,
      usagePeriod: String(saved?.usagePeriod || ''),
      usageGB: Number(saved?.usageGB || 0),
      capGB: Number(saved?.capGB || 0),
      updatedAt: Date.now(),
      scope: 'media-features-v2'
    };
    await this.ctx.storage.put('gate-state', state);
    return state;
  }

  effectiveState(state) {
    const usageBlocked = !!state.usageBlocked && state.usagePeriod === currentPeriod();
    return { ...state, usageBlocked, mediaLocked: !!state.locked || usageBlocked };
  }

  async readSessions() {
    const now = Date.now();
    const saved = (await this.ctx.storage.get('admin-sessions')) || {};
    let changed = false;
    for (const [token, expiresAt] of Object.entries(saved)) {
      if (Number(expiresAt) <= now) { delete saved[token]; changed = true; }
    }
    if (changed) await this.ctx.storage.put('admin-sessions', saved);
    return saved;
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/internal/status') {
      const state = await this.readState();
      return json(this.effectiveState(state));
    }
    if (url.pathname === '/internal/grant' && request.method === 'POST') {
      const sessions = await this.readSessions();
      const token = `${crypto.randomUUID().replaceAll('-', '')}${crypto.randomUUID().replaceAll('-', '')}`;
      const expiresAt = Date.now() + SESSION_MS;
      sessions[token] = expiresAt;
      await this.ctx.storage.put('admin-sessions', sessions);
      return json({ ok: true, token, expiresAt });
    }
    if (url.pathname === '/internal/validate') {
      const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || '';
      const sessions = await this.readSessions();
      return json({ ok: !!(token && Number(sessions[token]) > Date.now()) });
    }
    if (url.pathname === '/internal/revoke' && request.method === 'POST') {
      const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || '';
      const sessions = await this.readSessions();
      if (token && sessions[token]) delete sessions[token];
      await this.ctx.storage.put('admin-sessions', sessions);
      return json({ ok: true });
    }
    if (url.pathname === '/internal/login-check') {
      const key = String(request.headers.get('x-client-key') || '').slice(0, 160);
      const guards = (await this.ctx.storage.get('login-guards')) || {};
      const now = Date.now();
      const item = key ? guards[key] : null;
      const blockedUntil = Number(item?.blockedUntil || 0);
      return json({ allowed: blockedUntil <= now, retryAfter: Math.max(0, Math.ceil((blockedUntil - now) / 1000)) });
    }
    if (url.pathname === '/internal/login-result' && request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const key = String(body.key || '').slice(0, 160);
      const success = body.success === true;
      if (!key) return json({ ok: true });
      const guards = (await this.ctx.storage.get('login-guards')) || {};
      const now = Date.now();
      if (success) {
        delete guards[key];
      } else {
        const old = guards[key] || { failures: 0, windowStart: now, blockedUntil: 0 };
        const reset = now - Number(old.windowStart || 0) > 10 * 60 * 1000;
        const failures = (reset ? 0 : Number(old.failures || 0)) + 1;
        guards[key] = {
          failures,
          windowStart: reset ? now : Number(old.windowStart || now),
          blockedUntil: failures >= 5 ? now + 15 * 60 * 1000 : Number(old.blockedUntil || 0)
        };
      }
      await this.ctx.storage.put('login-guards', guards);
      return json({ ok: true });
    }
    if (url.pathname === '/internal/state' && request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const old = await this.readState();
      const state = { ...old, locked: body.locked !== false, updatedAt: Date.now(), scope: 'media-features-v2' };
      await this.ctx.storage.put('gate-state', state);
      return json({ ok: true, ...this.effectiveState(state) });
    }
    if (url.pathname === '/internal/usage-state' && request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const old = await this.readState();
      const next = {
        ...old,
        usageBlocked: body.blocked === true,
        usagePeriod: String(body.period || currentPeriod()).slice(0, 7),
        usageGB: Math.max(0, Number(body.usageGB || 0)),
        capGB: Math.max(0, Number(body.capGB || 0)),
        updatedAt: Date.now(),
        scope: 'media-features-v2'
      };
      const unchanged = old.usageBlocked === next.usageBlocked && old.usagePeriod === next.usagePeriod && old.usageGB === next.usageGB && old.capGB === next.capGB;
      if (!unchanged) await this.ctx.storage.put('gate-state', next);
      return json({ ok: true, ...this.effectiveState(unchanged ? old : next) });
    }
    return json({ ok: false, error: 'not-found' }, 404);
  }
}
