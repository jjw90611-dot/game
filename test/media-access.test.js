import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { GAMES, isMeteredGame } from '../public/js/catalog.js';

const root = new URL('../', import.meta.url);
const dataUrl = source => 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
const baseClass = 'class DurableObject { constructor(ctx, env) { this.ctx = ctx; this.env = env; } }';
class Storage {
  values = new Map();
  async get(key) { return structuredClone(this.values.get(key)); }
  async put(key, value) { this.values.set(key, structuredClone(value)); }
  async delete(key) { this.values.delete(key); }
  async list({prefix = ''} = {}) { return new Map([...this.values].filter(([key]) => key.startsWith(prefix))); }
}
class Socket {
  sent = []; att = null; closed = false;
  serializeAttachment(value) { this.att = structuredClone(value); }
  deserializeAttachment() { return structuredClone(this.att); }
  send(value) { this.sent.push(JSON.parse(value)); }
  close() { this.closed = true; }
}
async function fixture(t) {
  let source = await fs.readFile(new URL('avalon/src/index.js', root), 'utf8');
  source = source.replace(/^export \{.*\} from .*;\n/gm, '') + '\n// isolated ' + crypto.randomUUID();
  const accessUrl = dataUrl(source);
  const access = await import(accessUrl);
  const gateSource = (await fs.readFile(new URL('avalon/src/gate.js', root), 'utf8')).replace("import { DurableObject } from 'cloudflare:workers';", baseClass);
  const { SiteGate } = await import(dataUrl(gateSource));
  const gateStorage = new Storage();
  const env = { SITE_ADMIN_PASSWORD: 'test-password', ASSETS: { fetch: async () => new Response('static') } };
  const gate = new SiteGate({storage: gateStorage}, env);
  let gateFailure = false;
  env.GATE = { idFromName: n => n, get: () => ({ fetch: (url, options) => {
    if (gateFailure) throw new Error('Gate unavailable');
    return gate.fetch(new Request(url, options));
  } }) };
  let hubSource = await fs.readFile(new URL('src/hub.js', root), 'utf8');
  hubSource = hubSource.replace("import { DurableObject } from 'cloudflare:workers';", baseClass)
    .replace("'./games/index.js'", JSON.stringify(new URL('src/games/index.js', root).href))
    .replace("'../public/js/catalog.js'", JSON.stringify(new URL('public/js/catalog.js', root).href))
    .replace("'../avalon/src/index.js'", JSON.stringify(accessUrl));
  const { Hub } = await import(dataUrl(hubSource));
  let ready;
  const sockets = [];
  const ctx = { storage: new Storage(), getWebSockets: () => sockets, setWebSocketAutoResponse() {},
    blockConcurrencyWhile(fn) { ready = fn(); }, acceptWebSocket(ws) { sockets.push(ws); } };
  const hub = new Hub(ctx, env);
  env.HUB = { idFromName: n => n, get: () => ({ fetch: (url, options) => hub.fetch(new Request(url, options)) }) };
  await ready;
  t.after(() => {
    for (const timer of [hub.saveTimer, hub.lobbyTimer, hub.kickTimer, hub.mediaGuardTimer, ...hub.timers.values()]) clearTimeout(timer);
  });
  let workerSource = await fs.readFile(new URL('src/worker.js', root), 'utf8');
  workerSource = workerSource.replace(/^export \{.*\} from .*;\n/gm, '')
    .replace("'../avalon/src/index.js'", JSON.stringify(accessUrl))
    .replace("'../public/js/catalog.js'", JSON.stringify(new URL('public/js/catalog.js', root).href));
  const {default: worker} = await import(dataUrl(workerSource));
  const request = (path, options = {}) => worker.fetch(new Request('https://game.test' + path, options), env);
  const lockState = locked => gate.fetch(new Request('https://gate/internal/state', {method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({locked})}));
  const send = (socket, message) => hub.webSocketMessage(socket, JSON.stringify(message));
  let seq = 0;
  async function user() {
    const socket = new Socket(); sockets.push(socket);
    const sid = 'test_session_unique_' + (++seq);
    await send(socket, {t:'hello', sid, name:'Tester ' + seq});
    const uid = socket.sent.findLast(m => m.t === 'welcome').uid;
    return { socket, sid, uid, send: message => send(socket, message) };
  }
  async function admin() {
    const res = await request('/avalon/api/admin/login', {method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({password:env.SITE_ADMIN_PASSWORD})});
    assert.equal(res.status, 200);
    return res.headers.get('set-cookie').split(';')[0];
  }
  return {env, hub, gate, gateStorage, access, request, lockState, user, admin, gateFail: () => {gateFailure=true;} };
}

const protectedIds = Object.keys(GAMES).filter(isMeteredGame);
const voiceIds = protectedIds.filter(id => !GAMES[id].external);
test('Catalog policy protects exactly 23 games; only song and chosung remain public', () => {
  assert.equal(protectedIds.length, 23);
  assert.equal(voiceIds.length, 22);
  assert.deepEqual(Object.keys(GAMES).filter(id => !isMeteredGame(id)), ['song','chosung']);
  for (const id of ['not-a-game', '__proto__', 'constructor', 'toString']) assert.equal(isMeteredGame(id), false);
});

test('First deployment does not inherit an old unlocked Avalon-only state', async t => {
  const f=await fixture(t);
  await f.gateStorage.put('gate-state', {locked:false, updatedAt:1});
  const response=await f.request('/api/media-status');
  assert.equal((await response.json()).locked, true);
  assert.equal((await f.gateStorage.get('gate-state')).scope,'media-games-v1');
});

test('Every protected main game rejects create and quick-start on an existing socket while locked', async t => {
  const f=await fixture(t);
  for (const game of voiceIds) {
    const u=await f.user();
    for (const command of ['create','quick']) {
      await u.send({t:command, game});
      assert.equal(f.hub.roomOf(u.uid), null, game + ' must not admit');
      assert.equal(u.socket.sent.at(-1).t, 'err');
    }
  }
  const visitor=await f.user();
  for (const game of ['song','chosung']) {
    await visitor.send({t:'create',game});
    assert.equal(f.hub.roomOf(visitor.uid)?.game,game);
  }
});

test('Unlocked policy admits each of the 22 main voice games', async t => {
  const f=await fixture(t); await f.lockState(false); const u=await f.user();
  for (const game of voiceIds) {
    await u.send({t:'create',game});
    assert.equal(f.hub.roomOf(u.uid)?.game,game);
  }
});

test('Admin relock closes existing media rooms, keeps public rooms, and cannot be bypassed by admin cookies', async t => {
  const f=await fixture(t); await f.lockState(false); const media=await f.user(); const normal=await f.user();
  await media.send({t:'create',game:'omok'}); await normal.send({t:'create',game:'song'});
  const oldId=f.hub.roomOf(media.uid).id; const cookie=await f.admin();
  const res=await f.request('/avalon/api/admin/lock',{method:'POST',headers:{cookie}});
  assert.equal((await res.json()).locked,true);
  assert.equal(f.hub.roomOf(media.uid),null);
  assert.equal(f.hub.roomOf(normal.uid).game,'song');
  assert.ok(media.socket.sent.some(m=>m.t==='media-closed'));
  await normal.send({t:'join',id:oldId,watch:true});
  assert.equal(f.hub.roomOf(normal.uid).game,'song');
  for(const path of ['/api/ice?game=omok','/avalon/config','/avalon/api/rooms','/avalon/ws/ABCDE']) {
    const r=await f.request(path,{method:path.endsWith('rooms')?'POST':'GET',headers:{cookie,'x-game-session':media.sid}});
    assert.equal(r.status,423,path);
  }
});

test('Guest cannot change common gate; cross-origin administrative writes are rejected', async t => {
  const f=await fixture(t);
  for(const action of ['lock','unlock']) assert.equal((await f.request('/avalon/api/admin/'+action,{method:'POST'})).status,401);
  const cookie=await f.admin();
  assert.equal((await f.request('/avalon/api/admin/unlock',{method:'POST',headers:{cookie,origin:'https://other.test'}})).status,403);
});

test('Voice-off games reject forged voice and RTC messages on the server', async t => {
  const f=await fixture(t); await f.lockState(false); const a=await f.user(); const b=await f.user();
  for (const game of ['song','chosung']) {
    await a.send({t:'create',game}); const room=f.hub.roomOf(a.uid);
    await b.send({t:'join',id:room.id}); await a.send({t:'voice',on:true,mic:true});
    assert.equal(!!room.members[a.uid].voice,false);
    room.members[a.uid].voice=true; room.members[b.uid].voice=true; // corrupt old state cannot enable signalling
    const before=b.socket.sent.filter(m=>m.t==='rtc').length;
    await a.send({t:'rtc',to:b.uid,d:{offer:{type:'offer',sdp:'fake'}}});
    assert.equal(b.socket.sent.filter(m=>m.t==='rtc').length,before);
  }
});

test('TURN endpoint requires a real connected member and refuses non-media games', async t => {
  const f=await fixture(t); await f.lockState(false); const u=await f.user();
  assert.equal((await f.request('/api/ice?game=omok')).status,403);
  const headers={'x-game-session':u.sid};
  assert.equal((await f.request('/api/ice?game=omok',{headers})).status,403);
  await u.send({t:'create',game:'song'});
  assert.equal((await f.request('/api/ice?game=song',{headers})).status,403);
  await u.send({t:'create',game:'omok'});
  const response=await f.request('/api/ice?game=omok',{headers});
  assert.equal(response.status,200);
  const data=await response.json(); assert.equal(data.ok,true); assert.ok(data.iceServers.length);
  assert.equal((await f.request('/api/ice?game=mafia',{headers})).status,403);
  assert.equal((await f.request('/api/ice?game=omok',{headers:{...headers,origin:'https://other.test'}})).status,403);
});

test('800GB cap stops all protected rooms and fresh credentials but leaves voice-off games available', async t => {
  const f=await fixture(t); await f.lockState(false);
  Object.assign(f.env,{TURN_KEY_ID:'cap-test-key',TURN_KEY_API_TOKEN:'fake',CF_ACCOUNT_ID:'fake',CF_ANALYTICS_API_TOKEN:'fake'});
  let bytes=0, generated=0;
  const original=globalThis.fetch;
  globalThis.fetch=async url => {
    if(String(url).includes('graphql')) return Response.json({data:{viewer:{accounts:[{callsTurnUsageAdaptiveGroups:[{sum:{egressBytes:bytes}}]}]}}});
    ++generated; return Response.json({iceServers:[{urls:'turn:test.invalid',username:'test',credential:'test'}]});
  };
  t.after(()=>{globalThis.fetch=original;});
  const a=await f.user(); const b=await f.user();
  await a.send({t:'create',game:'omok'}); await b.send({t:'create',game:'song'});
  assert.ok(f.hub.roomOf(a.uid));
  bytes=800_000_000_000;
  const usage=await f.access.getTurnUsageStatus(f.env,true); assert.equal(usage.blocked,true);
  await f.hub.refreshMediaAccess(true);
  assert.equal(f.hub.roomOf(a.uid),null); assert.equal(f.hub.roomOf(b.uid).game,'song');
  await a.send({t:'create',game:'mafia'}); assert.equal(f.hub.roomOf(a.uid),null);
  assert.equal((await f.request('/api/ice?game=omok',{headers:{'x-game-session':a.sid}})).status,503);
  assert.equal((await f.request('/avalon/api/rooms',{method:'POST'})).status,503);
  assert.equal((await f.request('/avalon/config')).status,503);
  assert.equal(generated,0);
});

test('Gate outage fails closed for protected games without blocking public games', async t => {
  const f=await fixture(t); await f.lockState(false); const u=await f.user();
  f.gateFail(); await u.send({t:'create',game:'omok'}); assert.equal(f.hub.roomOf(u.uid),null);
  await u.send({t:'create',game:'chosung'}); assert.equal(f.hub.roomOf(u.uid).game,'chosung');
  assert.equal((await f.request('/api/ice?game=omok')).status,423);
});
