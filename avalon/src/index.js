export { AvalonRoom } from './room.js';
export { SiteGate } from './gate.js';

// 보드게임 모음집 안에서 /avalon 경로로 동작합니다.
export const BASE = '/avalon';
const DEFAULT_TURN_CAP_GB = 800;
const TURN_USAGE_CACHE_MS = 30 * 1000;
let usageCache = null;

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers }
  });
}

function html(body, status = 200, headers = {}) {
  return new Response(body, {
    status,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'x-frame-options': 'DENY',
      'referrer-policy': 'same-origin',
      ...headers
    }
  });
}

function randomRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = new Uint8Array(5);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => chars[b % chars.length]).join('');
}

function capGB(env) {
  const parsed = Number(env.TURN_MONTHLY_CAP_GB || DEFAULT_TURN_CAP_GB);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TURN_CAP_GB;
}

function dateRangeUTC(now = new Date()) {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const start = new Date(Date.UTC(y, m, 1));
  const end = now;
  return {
    from: start.toISOString().slice(0, 10),
    to: end.toISOString().slice(0, 10),
    period: `${start.toISOString().slice(0, 7)}`
  };
}

function gateStub(env) {
  if (!env.GATE) return null;
  return env.GATE.get(env.GATE.idFromName('AVALON_GLOBAL_GATE'));
}

async function getGateStatus(env) {
  const stub = gateStub(env);
  if (!stub) return { locked: true, updatedAt: 0, reason: 'gate-not-configured' };
  try {
    const res = await stub.fetch('https://gate/internal/status');
    if (!res.ok) throw new Error(`gate status ${res.status}`);
    return await res.json();
  } catch (err) {
    console.error('site gate status failed', err);
    return { locked: true, updatedAt: 0, reason: 'gate-check-failed' };
  }
}

function cookieValue(request, key) {
  const cookie = request.headers.get('cookie') || '';
  for (const part of cookie.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === key) return decodeURIComponent(rest.join('='));
  }
  return '';
}

async function isAdmin(request, env) {
  const token = cookieValue(request, 'avalon_admin');
  const stub = gateStub(env);
  if (!token || !stub) return false;
  try {
    const res = await stub.fetch('https://gate/internal/validate', { headers: { authorization: `Bearer ${token}` } });
    const data = await res.json();
    return !!data.ok;
  } catch (_) { return false; }
}

function adminCookie(token, maxAge = 43200) {
  return `avalon_admin=${encodeURIComponent(token)}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Strict`;
}

function lockedPage() {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#080b10"><title>아발론 · 왕국 봉인</title><style>
  *{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:radial-gradient(circle at 50% 20%,#1b2940 0,#0b111a 35%,#05070a 75%);color:#eee2c6;font-family:Georgia,'Noto Serif KR',serif}.card{width:min(620px,100%);padding:42px 30px;border:1px solid #79613a;border-radius:22px;background:linear-gradient(180deg,rgba(24,31,42,.96),rgba(8,12,18,.98));box-shadow:0 30px 90px #000;text-align:center}.seal{width:86px;height:86px;margin:0 auto 20px;border-radius:50%;display:grid;place-items:center;border:2px solid #b5914e;color:#e7c87e;font-size:42px;background:#16120c;box-shadow:inset 0 0 0 7px #281f11}h1{font-size:32px;margin:0 0 12px;color:#f2d99c}p{font-size:18px;line-height:1.75;color:#bcb39f;margin:0 0 24px}.status{padding:14px;border:1px solid #5a4527;border-radius:12px;background:#0c1118;color:#d6c194;font-size:16px}.admin{display:inline-block;margin-top:24px;color:#d7bd80;font-size:15px;text-decoration:none;border-bottom:1px solid #7d663a}</style></head><body><main class="card"><div class="seal">♜</div><h1>왕국의 문이 잠겨 있습니다</h1><p>현재 관리자가 아발론 게임 사이트를 잠금 상태로 두었습니다.<br>관리자가 잠금을 해제한 뒤 다시 접속해 주세요.</p><div class="status">SITE LOCKED · 새 방 / 입장 / 영상 연결 차단</div><a class="admin" href="${BASE}/admin">관리자 페이지</a></main></body></html>`;
}

function adminPage() {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#080b10"><title>아발론 사이트 관리</title><style>
  *{box-sizing:border-box}body{margin:0;min-height:100vh;background:radial-gradient(circle at 50% 0,#26344b,#0a0e14 46%,#05070a);color:#eee2c6;font-family:system-ui,'Noto Sans KR',sans-serif;padding:24px}.wrap{width:min(720px,100%);margin:5vh auto}.panel{border:1px solid #755c33;border-radius:20px;padding:28px;background:rgba(11,16,23,.96);box-shadow:0 25px 80px #000}.eyebrow{font-size:12px;letter-spacing:.18em;color:#ba9d63;font-weight:800}h1{font-family:Georgia,'Noto Serif KR',serif;font-size:31px;margin:7px 0 10px;color:#f0d79d}p{font-size:16px;line-height:1.7;color:#aaa89f}.status{margin:20px 0;padding:18px;border-radius:14px;background:#111a24;border:1px solid #2b3644;font-size:18px;font-weight:800}.status.locked{border-color:#743c3c;color:#efb7b7}.status.open{border-color:#3e6f59;color:#afe0c7}input{width:100%;font-size:20px;padding:15px 16px;background:#090d13;color:#fff;border:1px solid #5f5138;border-radius:12px;outline:none}button,.link{display:flex;align-items:center;justify-content:center;width:100%;min-height:52px;margin-top:10px;border-radius:12px;border:1px solid #7c6238;font-size:17px;font-weight:800;cursor:pointer;text-decoration:none}.primary{background:linear-gradient(#d2b16c,#9f7839);color:#171007}.danger{background:#35191a;color:#f0c0bd;border-color:#743b3d}.secondary{background:#111923;color:#d9c599}.grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.hidden{display:none}.msg{min-height:26px;margin-top:12px;color:#e7c77f;font-size:14px}@media(max-width:560px){.panel{padding:22px 17px}.grid{grid-template-columns:1fr}h1{font-size:27px}}</style></head><body><div class="wrap"><section class="panel"><div class="eyebrow">AVALON · SITE KEEPER</div><h1>왕국 출입 관리</h1><p>게임을 할 때만 <b>잠금 해제</b>하고, 끝나면 다시 <b>사이트 잠금</b>을 누르세요. 잠금 상태에서는 새 방 생성·입장·TURN 자격증명 발급이 차단됩니다.</p><div id="status" class="status">상태 확인 중…</div><div id="loginBox"><input id="pw" type="password" inputmode="numeric" autocomplete="current-password" placeholder="관리 비밀번호"><button id="login" class="primary">관리자 로그인</button></div><div id="adminBox" class="hidden"><div class="grid"><button id="unlock" class="primary">🔓 사이트 잠금 해제</button><button id="lock" class="danger">🔒 사이트 잠금</button></div><a href="${BASE}/" class="link secondary">게임 사이트 열기</a><button id="logout" class="secondary">관리자 로그아웃</button></div><div id="msg" class="msg"></div></section></div><script>
  const $=id=>document.getElementById(id); let admin=false;
  async function refresh(){const r=await fetch('${BASE}/api/site-status',{cache:'no-store'});const d=await r.json();admin=!!d.admin;$('status').textContent=d.locked?'🔒 현재 사이트 잠금 상태':'🔓 현재 사이트 잠금 해제 상태';$('status').className='status '+(d.locked?'locked':'open');$('loginBox').classList.toggle('hidden',admin);$('adminBox').classList.toggle('hidden',!admin);if(!d.passwordConfigured)$('msg').textContent='Cloudflare Secret SITE_ADMIN_PASSWORD가 아직 설정되지 않았습니다.';}
  $('login').onclick=async()=>{const r=await fetch('${BASE}/api/admin/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({password:$('pw').value})});const d=await r.json();$('msg').textContent=d.error||'로그인했습니다.';if(r.ok){$('pw').value='';await refresh();}};
  async function setLock(locked){const r=await fetch(locked?'${BASE}/api/admin/lock':'${BASE}/api/admin/unlock',{method:'POST'});const d=await r.json();$('msg').textContent=d.error||(locked?'사이트를 잠갔습니다.':'사이트 잠금을 해제했습니다.');await refresh();}
  $('lock').onclick=()=>setLock(true);$('unlock').onclick=()=>setLock(false);$('logout').onclick=async()=>{await fetch('${BASE}/api/admin/logout',{method:'POST'});await refresh();}; refresh();
  </script></body></html>`;
}

async function getTurnUsageStatus(env, force = false) {
  const limitGB = capGB(env);
  const base = {
    capGB: limitGB,
    usageGB: 0,
    percent: 0,
    blocked: false,
    turnConfigured: !!(env.TURN_KEY_ID && env.TURN_KEY_API_TOKEN),
    guardConfigured: !!(env.CF_ACCOUNT_ID && env.CF_ANALYTICS_API_TOKEN),
    turnAllowed: false,
    checkedAt: new Date().toISOString(),
    period: dateRangeUTC().period
  };

  if (!base.turnConfigured) return { ...base, reason: 'turn-not-configured' };
  if (!base.guardConfigured) return { ...base, reason: 'usage-guard-not-configured' };

  const now = Date.now();
  if (!force && usageCache?.expiresAt > now && usageCache?.keyId === env.TURN_KEY_ID) return usageCache.value;

  const range = dateRangeUTC();
  const account = JSON.stringify(String(env.CF_ACCOUNT_ID));
  const keyId = JSON.stringify(String(env.TURN_KEY_ID));
  const dateFrom = JSON.stringify(range.from);
  const dateTo = JSON.stringify(range.to);
  const query = `query { viewer { accounts(filter: { accountTag: ${account} }) { callsTurnUsageAdaptiveGroups(limit: 1, filter: { keyId: ${keyId}, date_geq: ${dateFrom}, date_leq: ${dateTo} }) { sum { egressBytes } } } } }`;

  try {
    const res = await fetch('https://api.cloudflare.com/client/v4/graphql', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.CF_ANALYTICS_API_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query })
    });
    if (!res.ok) throw new Error(`GraphQL HTTP ${res.status}`);
    const data = await res.json();
    if (Array.isArray(data.errors) && data.errors.length) throw new Error(data.errors[0]?.message || 'GraphQL error');
    const groups = data?.data?.viewer?.accounts?.[0]?.callsTurnUsageAdaptiveGroups || [];
    const bytes = Number(groups[0]?.sum?.egressBytes || 0);
    const usageGB = bytes / 1_000_000_000;
    const blocked = usageGB >= limitGB;
    const value = { ...base, usageGB: Number(usageGB.toFixed(3)), percent: Number(Math.min(100, (usageGB / limitGB) * 100).toFixed(2)), blocked, turnAllowed: !blocked, reason: blocked ? 'monthly-turn-cap-reached' : 'ok', checkedAt: new Date().toISOString(), period: range.period };
    usageCache = { keyId: env.TURN_KEY_ID, expiresAt: now + TURN_USAGE_CACHE_MS, value };
    return value;
  } catch (err) {
    console.error('TURN usage guard query failed; TURN is disabled fail-closed', err);
    const value = { ...base, reason: 'usage-check-failed', error: String(err?.message || err), turnAllowed: false };
    usageCache = { keyId: env.TURN_KEY_ID, expiresAt: now + 10 * 1000, value };
    return value;
  }
}

async function getIceServers(env, usage) {
  const fallback = [{ urls: ['stun:stun.cloudflare.com:3478'] }];
  if (!usage?.turnAllowed || !env.TURN_KEY_ID || !env.TURN_KEY_API_TOKEN) return fallback;
  try {
    const res = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(env.TURN_KEY_ID)}/credentials/generate-ice-servers`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.TURN_KEY_API_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ttl: 600 })
    });
    if (!res.ok) throw new Error(`TURN credential response ${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data.iceServers) || !data.iceServers.length) throw new Error('TURN response has no iceServers');
    return data.iceServers;
  } catch (err) {
    console.error('TURN credential generation failed; using STUN only', err);
    return fallback;
  }
}

// 보드게임 모음집 음성 채팅도 같은 TURN 키와 월 사용량 제한을 함께 써요
export async function iceConfig(env) {
  const usage = await getTurnUsageStatus(env).catch(() => null);
  return getIceServers(env, usage);
}

function blockedResponse(usage) {
  return json({ ok: false, blocked: true, error: `이번 달 TURN 안전 한도 ${usage?.capGB || 800}GB에 도달해 게임 서비스를 자동 일시정지했습니다.`, turnUsage: usage }, 503);
}

function siteLockedResponse() {
  return json({ ok: false, locked: true, error: '관리자가 현재 아발론 사이트를 잠가 두었습니다.' }, 423);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === BASE) return Response.redirect(`${url.origin}${BASE}/${url.search}`, 301);
    const path = url.pathname.startsWith(`${BASE}/`) ? url.pathname.slice(BASE.length) : url.pathname;

    if (path === '/health') return json({ ok: true, platform: 'cloudflare-workers', now: new Date().toISOString() });
    if (path === '/admin') return html(adminPage());

    const isStaticAsset = request.method === 'GET' && (path.startsWith('/assets/') || ['/styles.css','/app.js','/socket-client.js','/favicon.ico'].includes(path));
    if (isStaticAsset) return env.ASSETS.fetch(request);

    if (path === '/api/admin/login' && request.method === 'POST') {
      if (!env.SITE_ADMIN_PASSWORD) return json({ ok: false, error: 'SITE_ADMIN_PASSWORD Secret을 먼저 설정해주세요.' }, 503);
      const stub = gateStub(env);
      if (!stub) return json({ ok: false, error: '사이트 잠금 Durable Object가 설정되지 않았습니다.' }, 503);
      const clientKey = String(request.headers.get('CF-Connecting-IP') || 'unknown').slice(0, 160);
      const guardRes = await stub.fetch('https://gate/internal/login-check', { headers: { 'x-client-key': clientKey } });
      const guard = await guardRes.json();
      if (!guard.allowed) return json({ ok: false, error: `비밀번호 시도가 너무 많습니다. ${guard.retryAfter || 60}초 후 다시 시도해주세요.` }, 429);
      const body = await request.json().catch(() => ({}));
      const passwordOk = String(body.password || '') === String(env.SITE_ADMIN_PASSWORD);
      await stub.fetch('https://gate/internal/login-result', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ key: clientKey, success: passwordOk }) });
      if (!passwordOk) return json({ ok: false, error: '관리 비밀번호가 올바르지 않습니다.' }, 401);
      const res = await stub.fetch('https://gate/internal/grant', { method: 'POST' });
      const data = await res.json();
      return json({ ok: true }, 200, { 'set-cookie': adminCookie(data.token) });
    }

    if (path === '/api/admin/logout' && request.method === 'POST') {
      const token = cookieValue(request, 'avalon_admin');
      const stub = gateStub(env);
      if (stub && token) await stub.fetch('https://gate/internal/revoke', { method: 'POST', headers: { authorization: `Bearer ${token}` } }).catch(() => {});
      return json({ ok: true }, 200, { 'set-cookie': adminCookie('', 0) });
    }

    if ((path === '/api/admin/lock' || path === '/api/admin/unlock') && request.method === 'POST') {
      if (!(await isAdmin(request, env))) return json({ ok: false, error: '관리자 로그인이 필요합니다.' }, 401);
      const stub = gateStub(env);
      const locked = path.endsWith('/lock');
      const res = await stub.fetch('https://gate/internal/state', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ locked }) });
      return json(await res.json(), res.status);
    }

    const gate = await getGateStatus(env);
    const admin = await isAdmin(request, env);
    if (path === '/api/site-status') return json({ ok: true, locked: !!gate.locked, admin, passwordConfigured: !!env.SITE_ADMIN_PASSWORD, updatedAt: gate.updatedAt || 0 });

    const isProtectedRuntime = path === '/config' || path === '/api/usage' || path === '/api/rooms' || path.startsWith('/ws/');
    const wantsHtml = request.method === 'GET' && (path === '/' || request.headers.get('accept')?.includes('text/html'));
    if (gate.locked && !admin) {
      if (isProtectedRuntime) return siteLockedResponse();
      if (wantsHtml) return html(lockedPage(), 423);
    }

    if (path === '/api/usage') {
      const usage = await getTurnUsageStatus(env, url.searchParams.get('refresh') === '1');
      return json({ ok: true, turnUsage: usage });
    }

    if (path === '/config') {
      const usage = await getTurnUsageStatus(env);
      return json({ iceServers: await getIceServers(env, usage), turnUsage: usage });
    }

    const guardedRoute = (path === '/api/rooms' && request.method === 'POST') || /^\/ws\/[A-Z2-9]{5}$/i.test(path);
    if (guardedRoute) {
      const usage = await getTurnUsageStatus(env);
      if (usage.blocked) return blockedResponse(usage);
    }

    if (path === '/api/rooms' && request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const clientId = String(body.clientId || '').slice(0, 80);
      const name = String(body.name || '').replace(/\s+/g, ' ').trim().slice(0, 18);
      if (!clientId || !name) return json({ ok: false, error: '이름과 기기 식별 정보가 필요합니다.' }, 400);

      for (let attempt = 0; attempt < 12; attempt += 1) {
        const code = randomRoomCode();
        const id = env.ROOMS.idFromName(code);
        const stub = env.ROOMS.get(id);
        const res = await stub.fetch('https://room/internal/create', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code, clientId, name }) });
        if (res.status === 409) continue;
        const data = await res.json();
        return json(data, res.status);
      }
      return json({ ok: false, error: '방 코드를 만들 수 없습니다. 다시 시도해주세요.' }, 503);
    }

    const wsMatch = path.match(/^\/ws\/([A-Z2-9]{5})$/i);
    if (wsMatch) {
      if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return new Response('WebSocket upgrade required', { status: 426 });
      const code = wsMatch[1].toUpperCase();
      const id = env.ROOMS.idFromName(code);
      return env.ROOMS.get(id).fetch(request);
    }

    if (path.startsWith('/api/') || path.startsWith('/ws/')) return json({ ok: false, error: 'Not found' }, 404);
    return env.ASSETS.fetch(request);
  }
};
