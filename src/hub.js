// 보드게임 모음집 실시간 서버 (Cloudflare Durable Object)
// 하나의 Hub가 로비, 채팅, 모든 게임방을 관리합니다.
import { DurableObject } from 'cloudflare:workers';
import { createHash } from 'node:crypto';
import { MODULES } from './games/index.js';
import { GAMES as META, defaultOptions, isMeteredGame } from '../public/js/catalog.js';

import { getMediaAccess } from '../avalon/src/index.js';

const ROOM_CHAT_MAX = 80;
const LOBBY_CHAT_MAX = 60;
const SAVE_DELAY = 4000;
const WAIT_KICK_MS = 60_000;
const PLAY_KICK_MS = 180_000;
const MAX_ROOMS = 500;

const BOT_NAMES = ['알파봇', '베타봇', '감마봇', '델타봇', '시그마봇', '오메가봇', '제타봇'];
const ADJ = ['행복한', '용감한', '졸린', '배고픈', '신나는', '수줍은', '똑똑한', '느긋한', '엉뚱한', '씩씩한', '귀여운', '멋진'];
const ANIMAL = ['판다', '고양이', '펭귄', '토끼', '여우', '곰', '수달', '다람쥐', '햄스터', '부엉이', '강아지', '코알라'];
const TITLES = ['즐겁게 한 판!', '초보 환영해요', '아무나 들어오세요', '한 판 하실 분~', '매너 게임해요', '같이 놀아요'];

const rnd = (a) => a[Math.floor(Math.random() * a.length)];
const randomName = () => `${rnd(ADJ)}${rnd(ANIMAL)}${Math.floor(Math.random() * 90 + 10)}`;

function uidFromSid(sid) {
  return createHash('sha256').update(`boardgame:${sid}`).digest('base64url').slice(0, 12);
}

function cleanText(s, max) {
  return String(s ?? '')
    .replace(/[\u0000-\u001f\u007f\u200b-\u200f\u2028-\u202e]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function cleanName(s) {
  const n = cleanText(s, 12);
  return n.length >= 1 ? n : '';
}

class UserError extends Error {
  constructor(msg) {
    super(msg);
    this.user = true;
  }
}
const fail = (msg) => {
  throw new UserError(msg);
};

function attachment(ws) {
  try {
    return ws.deserializeAttachment() || null;
  } catch {
    return null;
  }
}

export class Hub extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.mediaAccess = { open: false, locked: true, error: '관리자가 음성·화상 게임을 잠갔습니다. 잠금 해제 후 입장해 주세요.' };
    this.mediaCheckedAt = 0;
    this.mediaGeneration = 0;
    this.mediaGuardTimer = null;
    this.users = new Map(); // uid -> { uid, name, sockets:Set, rl }
    this.rooms = new Map(); // id -> room
    this.memberRoom = new Map(); // uid -> roomId
    this.timers = new Map(); // roomId -> timeout
    this.vols = new Map(); // roomId -> 저장하지 않는 데이터(그림 등)
    this.dirtyRooms = new Set();
    this.pushRooms = new Set();
    this.lobbyDirty = false;
    this.lobbyTimer = null;
    this.saveTimer = null;
    this.kickTimer = null;
    this.lobbyChat = [];
    this.lobbyChatDirty = false;
    this.nextNo = 1;
    this.chatSeq = 1;
    try {
      ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
    } catch {}
    ctx.blockConcurrencyWhile(() => this.load());
  }

  async load() {
    const stored = await this.ctx.storage.list({ prefix: 'room:' });
    for (const room of stored.values()) {
      if (!room || !MODULES[room.game] || !META[room.game]) continue;
      this.rooms.set(room.id, room);
      for (const m of Object.values(room.members)) if (!m.bot) this.memberRoom.set(m.uid, room.id);
      for (const c of room.chat || []) this.chatSeq = Math.max(this.chatSeq, (c.id || 0) + 1);
    }
    this.lobbyChat = (await this.ctx.storage.get('lobbyChat')) || [];
    for (const c of this.lobbyChat) this.chatSeq = Math.max(this.chatSeq, (c.id || 0) + 1);
    this.nextNo = (await this.ctx.storage.get('nextNo')) || 1;
    for (const ws of this.ctx.getWebSockets()) {
      const a = attachment(ws);
      if (!a?.uid) continue;
      let u = this.users.get(a.uid);
      if (!u) {
        u = this.newUser(a.uid, a.name);
        this.users.set(a.uid, u);
      }
      u.sockets.add(ws);
    }
    const t = Date.now();
    for (const room of this.rooms.values()) {
      for (const m of Object.values(room.members)) {
        if (m.bot) continue;
        if (this.users.has(m.uid)) {
          m.online = true;
          m.offAt = 0;
        } else if (m.online || !m.offAt) {
          m.online = false;
          m.offAt = t;
        }
      }
      this.schedule(room);
    }
    this.scheduleKick();
    if (this.hasMediaRooms()) await this.refreshMediaAccess(true);
    this.scheduleMediaGuard();
  }

  hasMediaRooms() {
    return [...this.rooms.values()].some(room => isMeteredGame(room.game));
  }

  async refreshMediaAccess(force = false) {
    if (!force && Date.now() - this.mediaCheckedAt < 5000) return this.mediaAccess;
    const generation = ++this.mediaGeneration;
    let access;
    try { access = await getMediaAccess(this.env); }
    catch (error) { access = { open: false, locked: true, reason: 'gate-check-failed', error: '관리자가 음성·화상 게임을 잠갔습니다. 잠금 해제 후 입장해 주세요.' }; }
    // Ignore a slow read started before a newer authoritative lock notification.
    if (generation !== this.mediaGeneration) return this.mediaAccess;
    this.mediaAccess = access;
    this.mediaCheckedAt = Date.now();
    if (!access.open) this.closeMediaRooms(access.error || '관리자가 음성·화상 게임을 잠갔습니다. 잠금 해제 후 입장해 주세요.');
    return access;
  }

  assertMediaOpen(game) {
    if (isMeteredGame(game) && !this.mediaAccess.open) fail(this.mediaAccess.error || '관리자가 음성·화상 게임을 잠갔습니다. 잠금 해제 후 입장해 주세요.');
  }

  closeMediaRooms(message) {
    for (const room of [...this.rooms.values()]) {
      if (!isMeteredGame(room.game)) continue;
      for (const member of Object.values(room.members)) {
        if (member.bot) continue;
        this.sendUser(member.uid, { t: 'media-closed', msg: message });
        this.sendUser(member.uid, { t: 'left', why: 'media-closed' });
      }
      this.deleteRoom(room);
    }
  }

  scheduleMediaGuard() {
    if (this.mediaGuardTimer || !this.hasMediaRooms()) return;
    this.mediaGuardTimer = setTimeout(async () => {
      this.mediaGuardTimer = null;
      try { await this.refreshMediaAccess(true); this.flush(); }
      finally { this.scheduleMediaGuard(); }
    }, 5000);
  }

  newUser(uid, name) {
    return { uid, name: name || randomName(), sockets: new Set(), rl: {} };
  }

  // ─── 연결 ────────────────────────────────────────────────
  async fetch(request) {
    const path = new URL(request.url).pathname;
    if (path === '/internal/media-refresh' && request.method === 'POST') {
      await this.refreshMediaAccess(true);
      this.flush();
      return Response.json({ ok: true });
    }
    if (path === '/internal/voice-access' && request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const uid = uidFromSid(String(body.sid || ''));
      const user = this.users.get(uid);
      const room = this.roomOf(uid);
      const access = await this.refreshMediaAccess(true);
      const ok = !!(access.open && user?.sockets.size && room && this.rooms.has(room.id) && room.game === body.game && isMeteredGame(room.game));
      return Response.json({ ok }, { status: ok ? 200 : 403 });
    }
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('websocket only', { status: 426 });
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, raw) {
    if (typeof raw !== 'string' || raw.length > 300_000) return;
    let m;
    try {
      m = JSON.parse(raw);
    } catch {
      return;
    }
    if (!m || typeof m !== 'object') return;
    try {
      if (m.t === 'hello') {
        // Do not spend gate lookups on repeated or malformed greetings.
        if (attachment(ws)?.uid) return;
        if (/^[A-Za-z0-9_-]{16,64}$/.test(String(m.sid || ''))) await this.refreshMediaAccess(true);
        this.onHello(ws, m);
      }
      else {
        const a = attachment(ws);
        const u = a && this.users.get(a.uid);
        if (!u || !u.sockets.has(ws)) return;
        if (!this.rateOk(u, m.t)) {
          if (m.t !== 'draw' && m.t !== 'rtc') this.send(ws, { t: 'err', msg: '너무 빨라요! 잠시 후 다시 시도해 주세요.' });
        } else {
          // Authenticate and apply the existing rate limit before costly gate checks.
          await this.refreshMediaAccess(['create', 'join', 'quick', 'voice'].includes(m.t));
          this.handle(u, m);
        }
      }
    } catch (e) {
      if (!e.user) console.error('message error', m?.t, e?.stack || e);
      this.send(ws, { t: 'err', msg: e.user ? e.message : '문제가 생겼어요. 다시 시도해 주세요.' });
    }
    this.flush();
    this.scheduleMediaGuard();
  }

  async webSocketClose(ws) {
    this.detachSocket(ws);
    try {
      ws.close(1000, 'bye');
    } catch {}
    this.flush();
  }

  async webSocketError(ws) {
    this.detachSocket(ws);
    this.flush();
  }

  rateOk(u, t) {
    const kind = t === 'draw' ? 'draw' : t === 'rtc' ? 'rtc' : t === 'chat' || t === 'lchat' ? 'chat' : 'gen';
    const [cap, perSec] = { draw: [120, 60], rtc: [240, 80], chat: [6, 1.5], gen: [30, 12] }[kind];
    const now = Date.now();
    const b = (u.rl[kind] ||= { tokens: cap, at: now });
    b.tokens = Math.min(cap, b.tokens + ((now - b.at) / 1000) * perSec);
    b.at = now;
    if (b.tokens < 1) return false;
    b.tokens -= 1;
    return true;
  }

  onHello(ws, m) {
    const sid = String(m.sid || '');
    if (!/^[A-Za-z0-9_-]{16,64}$/.test(sid)) {
      this.send(ws, { t: 'err', msg: '접속 정보가 올바르지 않아요.' });
      return;
    }
    const uid = uidFromSid(sid);
    const prev = attachment(ws);
    if (prev?.uid && prev.uid !== uid) this.detachSocket(ws);
    const name = cleanName(m.name) || randomName();
    let u = this.users.get(uid);
    if (!u) {
      u = this.newUser(uid, name);
      this.users.set(uid, u);
    }
    for (const old of u.sockets) {
      if (old === ws) continue;
      this.send(old, { t: 'dup' });
      try {
        old.close(4000, 'dup');
      } catch {}
    }
    u.sockets = new Set([ws]);
    u.name = name;
    ws.serializeAttachment({ uid, name });
    this.send(ws, { t: 'welcome', uid, name, now: Date.now(), games: Object.keys(MODULES) });
    const room = this.roomOf(uid);
    if (room) {
      this.assertMediaOpen(room.game);
      const mem = room.members[uid];
      mem.online = true;
      mem.offAt = 0;
      mem.name = name;
      this.touchRoom(room);
      this.sendRoomFull(uid, room);
      this.scheduleKick();
    } else {
      this.sendLobby(u);
      if (m.room) {
        try {
          this.onJoin(u, String(m.room), false);
        } catch (e) {
          this.send(ws, { t: 'err', msg: e.user ? e.message : '방에 들어갈 수 없어요.' });
          this.send(ws, { t: 'left', why: 'gone' });
        }
      }
    }
    this.lobbyDirty = true;
  }

  detachSocket(ws) {
    const a = attachment(ws);
    if (!a?.uid) return;
    const u = this.users.get(a.uid);
    if (!u || !u.sockets.has(ws)) return;
    u.sockets.delete(ws);
    if (u.sockets.size) return;
    this.users.delete(u.uid);
    const room = this.roomOf(u.uid);
    if (room) {
      const mem = room.members[u.uid];
      if (mem) {
        mem.online = false;
        mem.offAt = Date.now();
        mem.voice = false;
      }
      this.touchRoom(room);
      this.scheduleKick();
    }
    this.lobbyDirty = true;
  }

  handle(u, m) {
    switch (m.t) {
      case 'name': return this.onName(u, m.name);
      case 'lchat': return this.onLobbyChat(u, m.text);
      case 'lobby': return this.sendLobby(u);
      case 'create': return this.onCreate(u, m);
      case 'join': return this.onJoin(u, String(m.id ?? ''), !!m.watch);
      case 'quick': return this.onQuick(u, String(m.game ?? ''));
      case 'leave': return this.leaveRoom(u.uid, 'leave');
      case 'chat': return this.onChat(u, m.text);
      case 'start': return this.onStart(u);
      case 'opts': return this.onOpts(u, m.opts);
      case 'bot': return this.onBot(u, !!m.add);
      case 'kick': return this.onKick(u, String(m.uid ?? ''));
      case 'seat': return this.onSeat(u, !!m.sit);
      case 'title': return this.onTitle(u, m.title);
      case 'act': return this.onAct(u, m.a);
      case 'draw': return this.onDraw(u, m.d);
      case 'fetch': return this.onFetch(u, m.key);
      case 'voice': return this.onVoice(u, m);
      case 'rtc': return this.onRtc(u, m);
    }
  }

  // ─── 보내기 ──────────────────────────────────────────────
  send(ws, obj) {
    try {
      ws.send(typeof obj === 'string' ? obj : JSON.stringify(obj));
    } catch {}
  }

  sendUser(uid, obj) {
    const u = this.users.get(uid);
    if (!u) return;
    const s = JSON.stringify(obj);
    for (const ws of u.sockets) this.send(ws, s);
  }

  // ─── 로비 ────────────────────────────────────────────────
  lobbySnapshot() {
    const rooms = [];
    const playing = {};
    for (const r of this.rooms.values()) {
      const humans = Object.values(r.members).filter((m) => !m.bot).length;
      playing[r.game] = (playing[r.game] || 0) + humans;
      if (r.private) continue;
      rooms.push({
        id: r.id, no: r.no, game: r.game, title: r.title, status: r.status, seats: r.seats.length,
        max: META[r.game].max, members: Object.keys(r.members).length, host: r.members[r.host]?.name || '',
      });
    }
    rooms.sort((a, b) => (a.status === b.status ? a.no - b.no : a.status === 'waiting' ? -1 : 1));
    const users = [];
    for (const u of this.users.values()) {
      if (users.length >= 150) break;
      const rid = this.memberRoom.get(u.uid);
      users.push({ uid: u.uid, name: u.name, game: rid ? this.rooms.get(rid)?.game || null : null });
    }
    return { online: this.users.size, rooms: rooms.slice(0, 300), playing, users };
  }

  sendLobby(u) {
    this.sendUser(u.uid, { t: 'lobby', ...this.lobbySnapshot(), chat: this.lobbyChat });
  }

  broadcastLobby() {
    const s = JSON.stringify({ t: 'lobby', ...this.lobbySnapshot() });
    for (const u of this.users.values()) for (const ws of u.sockets) this.send(ws, s);
  }

  onName(u, name) {
    const n = cleanName(name);
    if (!n) fail('닉네임을 입력해 주세요.');
    u.name = n;
    for (const ws of u.sockets) ws.serializeAttachment({ uid: u.uid, name: n });
    const room = this.roomOf(u.uid);
    if (room) {
      room.members[u.uid].name = n;
      this.touchRoom(room);
    }
    this.sendUser(u.uid, { t: 'name', name: n });
    this.lobbyDirty = true;
  }

  onLobbyChat(u, text) {
    const x = cleanText(text, 200);
    if (!x) return;
    const msg = { id: this.chatSeq++, uid: u.uid, name: u.name, text: x, ts: Date.now() };
    this.lobbyChat.push(msg);
    if (this.lobbyChat.length > LOBBY_CHAT_MAX) this.lobbyChat.splice(0, this.lobbyChat.length - LOBBY_CHAT_MAX);
    this.lobbyChatDirty = true;
    const s = JSON.stringify({ t: 'lchat', msg });
    for (const usr of this.users.values()) for (const ws of usr.sockets) this.send(ws, s);
    this.requestSave();
  }

  // ─── 방 ──────────────────────────────────────────────────
  roomOf(uid) {
    const id = this.memberRoom.get(uid);
    return id ? this.rooms.get(id) || null : null;
  }

  requireRoom(u) {
    const room = this.roomOf(u.uid);
    if (!room) fail('방에 있지 않아요.');
    return room;
  }

  requireHost(u) {
    const room = this.requireRoom(u);
    if (room.host !== u.uid) fail('방장만 할 수 있어요.');
    return room;
  }

  allocNo() {
    const used = new Set([...this.rooms.values()].map((r) => r.no));
    for (let k = 0; k < 10000; k++) {
      const no = this.nextNo;
      this.nextNo = this.nextNo >= 9999 ? 1 : this.nextNo + 1;
      if (!used.has(no)) return no;
    }
    fail('방이 너무 많아요. 잠시 후 다시 시도해 주세요.');
  }

  onCreate(u, m) {
    const game = String(m.game ?? '');
    this.assertMediaOpen(game);
    if (!Object.hasOwn(META, game) || !Object.hasOwn(MODULES, game)) fail('아직 준비 중인 게임이에요.');
    if (this.rooms.size >= MAX_ROOMS) fail('방이 너무 많아요. 잠시 후 다시 시도해 주세요.');
    this.leaveRoom(u.uid, 'switch');
    const no = this.allocNo();
    const room = {
      id: String(no), no, game, title: cleanText(m.title, 24) || rnd(TITLES), private: !!m.private,
      host: u.uid, status: 'waiting', members: {}, seats: [], opts: defaultOptions(game), state: null,
      result: null, created: Date.now(), chat: [], botSeq: 0, ver: 0,
    };
    this.rooms.set(room.id, room);
    this.addMember(room, u, false);
    this.sysChat(room, `${u.name}님이 방을 만들었어요. 친구를 초대해 보세요!`);
    this.sendRoomFull(u.uid, room);
  }

  addMember(room, u, watch) {
    const meta = META[room.game];
    room.members[u.uid] = { uid: u.uid, name: u.name, bot: false, online: true, offAt: 0, joined: Date.now(), watch: !!watch };
    this.memberRoom.set(u.uid, room.id);
    if (!watch && room.status === 'waiting' && room.seats.length < meta.max) room.seats.push(u.uid);
    this.touchRoom(room);
  }

  onJoin(u, id, watch) {
    const room = this.rooms.get(id);
    if (!room) fail('방이 없어졌어요.');
    this.assertMediaOpen(room.game);
    if (this.memberRoom.get(u.uid) === id) {
      this.sendRoomFull(u.uid, room);
      return;
    }
    if (Object.keys(room.members).length >= META[room.game].max + 12) fail('방이 꽉 찼어요.');
    this.leaveRoom(u.uid, 'switch');
    this.addMember(room, u, watch);
    const seated = room.seats.includes(u.uid);
    this.sysChat(room, `${u.name}님이 ${seated ? '들어왔어요' : '관전하러 왔어요'}.`);
    this.sendRoomFull(u.uid, room);
  }

  onQuick(u, game) {
    this.assertMediaOpen(game);
    if (!Object.hasOwn(META, game) || !Object.hasOwn(MODULES, game)) fail('아직 준비 중인 게임이에요.');
    const cur = this.roomOf(u.uid);
    if (cur && cur.game === game && cur.status === 'waiting') {
      this.sendRoomFull(u.uid, cur);
      return;
    }
    const max = META[game].max;
    let best = null;
    for (const r of this.rooms.values()) {
      if (r.game !== game || r.private || r.status !== 'waiting' || r.seats.length >= max) continue;
      if (!Object.values(r.members).some((m) => !m.bot && m.online)) continue;
      if (!best || r.seats.length > best.seats.length) best = r;
    }
    if (best) this.onJoin(u, best.id, false);
    else this.onCreate(u, { game });
  }

  fillSeats(room) {
    const max = META[room.game].max;
    const waiting = Object.values(room.members)
      .filter((m) => !room.seats.includes(m.uid) && !m.watch && !m.bot)
      .sort((a, b) => a.joined - b.joined);
    for (const m of waiting) {
      if (room.seats.length >= max) break;
      room.seats.push(m.uid);
    }
  }

  leaveRoom(uid, why) {
    const id = this.memberRoom.get(uid);
    if (!id) return;
    this.memberRoom.delete(uid);
    const room = this.rooms.get(id);
    if (!room) return;
    const mem = room.members[uid];
    delete room.members[uid];
    room.seats = room.seats.filter((x) => x !== uid);
    if (why !== 'switch') this.sendUser(uid, { t: 'left', why });
    const humans = Object.values(room.members).filter((m) => !m.bot);
    if (!humans.length) {
      this.deleteRoom(room);
      return;
    }
    const name = mem?.name || '누군가';
    const reason = { kick: '님이 강퇴되었어요.', offline: '님이 연결이 끊겨 나갔어요.' }[why] || '님이 나갔어요.';
    this.sysChat(room, `${name}${reason}`);
    if (room.host === uid) {
      const next = humans.sort((a, b) => (b.online - a.online) || a.joined - b.joined)[0];
      room.host = next.uid;
      this.sysChat(room, `👑 ${next.name}님이 방장이 되었어요.`);
    }
    if (room.status === 'playing' && room.state?.players?.some((p) => p.id === uid)) {
      const mod = MODULES[room.game];
      try {
        this.applyGame(room, (ctx) => mod.leave?.(room.state, uid, ctx));
      } catch (e) {
        console.error('leave error', e);
        this.afterChange(room);
      }
    } else if (room.status === 'waiting') this.fillSeats(room);
    this.touchRoom(room);
    if (why !== 'switch') {
      const u = this.users.get(uid);
      if (u) this.sendLobby(u);
    }
  }

  deleteRoom(room) {
    const t = this.timers.get(room.id);
    if (t) clearTimeout(t);
    this.timers.delete(room.id);
    this.vols.delete(room.id);
    this.rooms.delete(room.id);
    for (const m of Object.values(room.members)) if (this.memberRoom.get(m.uid) === room.id) this.memberRoom.delete(m.uid);
    this.dirtyRooms.add(room.id);
    this.lobbyDirty = true;
    this.requestSave();
  }

  onSeat(u, sit) {
    const room = this.requireRoom(u);
    if (room.status !== 'waiting') fail('게임이 끝난 뒤에 바꿀 수 있어요.');
    const mem = room.members[u.uid];
    if (sit) {
      if (room.seats.includes(u.uid)) return;
      if (room.seats.length >= META[room.game].max) fail('자리가 꽉 찼어요.');
      room.seats.push(u.uid);
      mem.watch = false;
    } else {
      room.seats = room.seats.filter((x) => x !== u.uid);
      mem.watch = true;
    }
    this.touchRoom(room);
  }

  onBot(u, add) {
    const room = this.requireHost(u);
    if (room.status !== 'waiting') fail('게임 중에는 할 수 없어요.');
    const meta = META[room.game];
    if (!meta.bots) fail('이 게임은 봇과 함께할 수 없어요.');
    if (add) {
      if (room.seats.length >= meta.max) fail('자리가 꽉 찼어요.');
      const used = new Set(Object.values(room.members).map((m) => m.name));
      const n = ++room.botSeq;
      const name = BOT_NAMES.find((x) => !used.has(x)) || `봇${n}`;
      const uid = `bot:${n}`;
      room.members[uid] = { uid, name, bot: true, online: true, offAt: 0, joined: Date.now() };
      room.seats.push(uid);
      this.sysChat(room, `🤖 ${name}이(가) 참가했어요.`);
    } else {
      const bot = room.seats.filter((id) => room.members[id]?.bot).pop();
      if (!bot) fail('봇이 없어요.');
      this.removeBot(room, bot);
    }
    this.touchRoom(room);
  }

  removeBot(room, uid) {
    const name = room.members[uid]?.name;
    delete room.members[uid];
    room.seats = room.seats.filter((x) => x !== uid);
    this.sysChat(room, `🤖 ${name}이(가) 나갔어요.`);
    this.fillSeats(room);
  }

  onKick(u, target) {
    const room = this.requireHost(u);
    if (target === u.uid) fail('자기 자신은 강퇴할 수 없어요.');
    const mem = room.members[target];
    if (!mem) fail('방에 없는 사람이에요.');
    if (mem.bot) {
      if (room.status !== 'waiting') fail('게임 중에는 봇을 뺄 수 없어요.');
      this.removeBot(room, target);
      this.touchRoom(room);
    } else this.leaveRoom(target, 'kick');
  }

  onOpts(u, opts) {
    const room = this.requireHost(u);
    if (room.status !== 'waiting') fail('게임 중에는 바꿀 수 없어요.');
    if (!opts || typeof opts !== 'object') return;
    for (const o of META[room.game].options || []) {
      if (!(o.key in opts)) continue;
      const v = opts[o.key];
      if (o.choices.some(([c]) => c === v)) room.opts[o.key] = v;
    }
    this.touchRoom(room);
  }

  // ─── 음성 채팅 (연결 신호만 전달, 소리는 참가자끼리 직접 주고받아요) ───
  onVoice(u, m) {
    const room = this.requireRoom(u);
    const mem = room.members[u.uid];
    if (!mem) return;
    if (m.on && !isMeteredGame(room.game)) fail('이 게임은 음성 채팅을 지원하지 않아요.');
    if (m.on) this.assertMediaOpen(room.game);
    const on = !!m.on;
    const mic = on && !!m.mic;
    if (mem.voice === on && !!mem.mic === mic) return;
    mem.voice = on;
    mem.mic = mic;
    this.touchRoom(room);
  }

  onRtc(u, m) {
    const room = this.roomOf(u.uid);
    const to = String(m.to ?? '');
    if (!room || !isMeteredGame(room.game) || !this.mediaAccess.open || !room.members[to]?.voice || !room.members[u.uid]?.voice || !room.members[to] || room.members[to].bot || to === u.uid) return;
    const d = m.d;
    if (!d || typeof d !== 'object' || JSON.stringify(d).length > 16000) return;
    this.sendUser(to, { t: 'rtc', from: u.uid, d });
  }

  onTitle(u, title) {
    const room = this.requireHost(u);
    const t = cleanText(title, 24);
    if (!t) fail('방 제목을 입력해 주세요.');
    room.title = t;
    this.touchRoom(room);
  }

  onStart(u) {
    const room = this.requireHost(u);
    if (room.status !== 'waiting') fail('이미 게임 중이에요.');
    const meta = META[room.game];
    const mod = MODULES[room.game];
    room.seats = room.seats.filter((id) => room.members[id]);
    if (room.seats.length < meta.min) fail(`${meta.min}명 이상 모여야 시작할 수 있어요. (지금 ${room.seats.length}명)`);
    const players = room.seats.map((id) => ({ id, name: room.members[id].name, bot: !!room.members[id].bot }));
    this.vols.set(room.id, {});
    room.chat = room.chat.filter((c) => !c.to);
    this.sysChat(room, `🎲 ${meta.name} 게임을 시작합니다!`, null, true);
    room.state = mod.setup(players, { ...room.opts }, this.gctx(room));
    room.status = 'playing';
    room.result = null;
    room.round = (room.round || 0) + 1;
    this.afterChange(room);
    this.lobbyDirty = true;
  }

  // ─── 채팅 ────────────────────────────────────────────────
  visibleChat(room, uid) {
    return room.chat.filter((c) => !c.to || c.to.includes(uid));
  }

  pushChat(room, msg) {
    room.chat.push(msg);
    if (room.chat.length > ROOM_CHAT_MAX) room.chat.splice(0, room.chat.length - ROOM_CHAT_MAX);
    const s = JSON.stringify({ t: 'chat', msg });
    for (const uid of Object.keys(room.members)) {
      if (msg.to && !msg.to.includes(uid)) continue;
      const u = this.users.get(uid);
      if (u) for (const ws of u.sockets) this.send(ws, s);
    }
    this.dirtyRooms.add(room.id);
    this.requestSave();
  }

  sysChat(room, text, to = null, big = false) {
    this.pushChat(room, { id: this.chatSeq++, sys: true, text, ts: Date.now(), to: to || undefined, big: big || undefined });
  }

  onChat(u, text) {
    const room = this.requireRoom(u);
    const x = cleanText(text, 200);
    if (!x) return;
    let route;
    if (room.status === 'playing' && room.state && MODULES[room.game].chat) {
      route = MODULES[room.game].chat(room.state, u.uid, x, this.gctx(room));
    }
    if (route?.consume) {
      if (route.changed) this.afterChange(room);
      return;
    }
    let to;
    if (route?.to) {
      const set = new Set(route.to);
      if (route.spect) {
        const players = new Set(room.state?.players?.map((p) => p.id) || []);
        for (const id of Object.keys(room.members)) if (!players.has(id)) set.add(id);
      }
      set.add(u.uid);
      to = [...set];
    }
    this.pushChat(room, { id: this.chatSeq++, uid: u.uid, name: u.name, text: x, ts: Date.now(), ch: route?.ch, to });
    if (route?.changed) this.afterChange(room);
  }

  // ─── 게임 진행 ───────────────────────────────────────────
  vol(room) {
    let v = this.vols.get(room.id);
    if (!v) {
      v = {};
      this.vols.set(room.id, v);
    }
    return v;
  }

  gctx(room) {
    return {
      now: Date.now(),
      rng: Math.random,
      sys: (text, to) => this.sysChat(room, text, to),
      vol: this.vol(room),
    };
  }

  applyGame(room, fn) {
    const backup = structuredClone(room.state);
    try {
      fn(this.gctx(room));
    } catch (e) {
      room.state = backup;
      throw e;
    }
    this.afterChange(room);
  }

  onAct(u, a) {
    const room = this.requireRoom(u);
    if (room.status !== 'playing' || !room.state) fail('게임 중이 아니에요.');
    if (!a || typeof a !== 'object' || typeof a.type !== 'string') fail('잘못된 요청이에요.');
    if (!room.state.players?.some((p) => p.id === u.uid)) fail('관전 중에는 할 수 없어요.');
    const mod = MODULES[room.game];
    this.applyGame(room, (ctx) => mod.action(room.state, u.uid, a, ctx));
  }

  onDraw(u, d) {
    const room = this.roomOf(u.uid);
    if (!room || room.status !== 'playing' || !room.state) return;
    const mod = MODULES[room.game];
    if (!mod.stream) return;
    const out = mod.stream(room.state, u.uid, d, this.gctx(room));
    if (!out) return;
    const s = JSON.stringify({ t: 'draw', d: out });
    for (const uid of Object.keys(room.members)) {
      if (uid === u.uid) continue;
      const usr = this.users.get(uid);
      if (usr) for (const ws of usr.sockets) this.send(ws, s);
    }
  }

  onFetch(u, key) {
    const room = this.requireRoom(u);
    const mod = MODULES[room.game];
    if (!room.state || !mod.fetch) return;
    const data = mod.fetch(room.state, u.uid, key, this.vol(room));
    this.sendUser(u.uid, { t: 'fetch', key, data });
  }

  isAuto(room, pid) {
    const m = room.members[pid];
    return !m || !!m.bot;
  }

  checkAbandon(room) {
    const st = room.state;
    if (!st?.players || st.over) return;
    const active = st.players.filter((p) => room.members[p.id]);
    const meta = META[room.game];
    const keep = MODULES[room.game].keepMin ?? 2;
    if (!active.length) {
      st.over = { winners: [], text: '모두 나가서 게임이 끝났어요.' };
      return;
    }
    if (st.players.length > 1 && active.length < Math.min(keep, st.players.length)) {
      if (meta.lastWins && active.length === 1) st.over = { winners: [active[0].id], text: `다른 참가자가 모두 나가서 ${active[0].name}님 승리!` };
      else st.over = { winners: [], text: '참가자가 부족해서 게임이 중단되었어요.' };
    }
  }

  afterChange(room) {
    room.ver = (room.ver || 0) + 1;
    if (room.status === 'playing') {
      this.checkAbandon(room);
      if (room.state?.over) this.endGame(room);
    }
    this.schedule(room);
    this.touchRoom(room);
  }

  endGame(room) {
    room.status = 'waiting';
    const over = room.state.over;
    room.result = { text: over.text || '게임이 끝났어요.', winners: over.winners || [] };
    this.sysChat(room, `🏁 ${room.result.text}`, null, true);
    room.seats = room.seats.filter((id) => room.members[id]);
    this.fillSeats(room);
    this.lobbyDirty = true;
  }

  schedule(room) {
    const old = this.timers.get(room.id);
    if (old) clearTimeout(old);
    this.timers.delete(room.id);
    const st = room.state;
    if (room.status !== 'playing' || !st || st.over) return;
    const mod = MODULES[room.game];
    const now = Date.now();
    let at = st.deadline || Infinity;
    if (room.botIdleVer !== room.ver) {
      const autos = (mod.actors?.(st) || []).filter((pid) => this.isAuto(room, pid));
      if (autos.length) at = Math.min(at, now + (mod.botDelay ? mod.botDelay(st, autos) : 1200));
    }
    if (at === Infinity) return;
    this.timers.set(room.id, setTimeout(() => this.onTimer(room.id), Math.max(0, at - now)));
  }

  onTimer(id) {
    this.timers.delete(id);
    const room = this.rooms.get(id);
    if (!room || room.status !== 'playing' || !room.state) return;
    const mod = MODULES[room.game];
    const st = room.state;
    try {
      if (st.deadline && Date.now() >= st.deadline - 30) {
        this.applyGame(room, (ctx) => mod.timeout(room.state, ctx));
      } else {
        const autos = (mod.actors?.(st) || []).filter((pid) => this.isAuto(room, pid));
        let done = false;
        for (const pid of autos) {
          const a = mod.auto?.(room.state, pid, this.gctx(room));
          if (!a) continue;
          try {
            this.applyGame(room, (ctx) => mod.action(room.state, pid, a, ctx));
            done = true;
            break;
          } catch (e) {
            console.error('bot action failed', room.game, a, e?.message);
          }
        }
        if (!done) {
          room.botIdleVer = room.ver;
          this.schedule(room);
        }
      }
    } catch (e) {
      console.error('timer error', room.game, e?.stack || e);
      if (room.state && !room.state.over) {
        room.state.over = { winners: [], text: '오류가 생겨 게임이 중단되었어요.' };
        this.afterChange(room);
      }
    }
    this.flush();
  }

  // ─── 방 상태 전송 ────────────────────────────────────────
  roomMeta(r) {
    return {
      id: r.id, no: r.no, game: r.game, title: r.title, private: r.private, host: r.host, status: r.status,
      opts: r.opts, seats: r.seats, result: r.result, round: r.round || 0,
      members: Object.values(r.members).map((m) => ({
        uid: m.uid, name: m.name, bot: m.bot || undefined, online: m.online, watch: m.watch || undefined,
        voice: m.voice || undefined, mic: m.voice ? !!m.mic : undefined,
      })),
    };
  }

  viewFor(room, uid) {
    if (!room.state) return null;
    const mod = MODULES[room.game];
    const isPlayer = room.state.players?.some((p) => p.id === uid);
    try {
      return mod.view(room.state, isPlayer ? uid : null);
    } catch (e) {
      console.error('view error', room.game, e);
      return null;
    }
  }

  broadcastRoom(room) {
    const meta = this.roomMeta(room);
    const now = Date.now();
    for (const uid of Object.keys(room.members)) {
      if (!this.users.has(uid)) continue;
      this.sendUser(uid, { t: 'room', room: meta, v: this.viewFor(room, uid), now });
    }
  }

  sendRoomFull(uid, room) {
    const mod = MODULES[room.game];
    const vol = room.status === 'playing' && mod.volView ? mod.volView(this.vol(room), uid) : undefined;
    this.sendUser(uid, {
      t: 'room', room: this.roomMeta(room), v: this.viewFor(room, uid), now: Date.now(),
      chat: this.visibleChat(room, uid), vol, full: true,
    });
  }

  // ─── 저장 ────────────────────────────────────────────────
  touchRoom(room) {
    this.pushRooms.add(room.id);
    this.dirtyRooms.add(room.id);
    this.lobbyDirty = true;
  }

  requestSave() {
    if (!this.saveTimer) this.saveTimer = setTimeout(() => this.save(), SAVE_DELAY);
  }

  flush() {
    for (const id of this.pushRooms) {
      const room = this.rooms.get(id);
      if (room) this.broadcastRoom(room);
    }
    this.pushRooms.clear();
    if (this.lobbyDirty && !this.lobbyTimer) {
      this.lobbyTimer = setTimeout(() => {
        this.lobbyTimer = null;
        this.lobbyDirty = false;
        this.broadcastLobby();
      }, 700);
    }
    if (this.dirtyRooms.size || this.lobbyChatDirty) this.requestSave();
  }

  async save() {
    this.saveTimer = null;
    const puts = {};
    const dels = [];
    for (const id of this.dirtyRooms) {
      const r = this.rooms.get(id);
      if (r) puts[`room:${id}`] = r;
      else dels.push(`room:${id}`);
    }
    this.dirtyRooms.clear();
    if (this.lobbyChatDirty) {
      puts.lobbyChat = this.lobbyChat;
      this.lobbyChatDirty = false;
    }
    puts.nextNo = this.nextNo;
    try {
      const keys = Object.keys(puts);
      for (let i = 0; i < keys.length; i += 100) {
        const chunk = {};
        for (const k of keys.slice(i, i + 100)) chunk[k] = puts[k];
        await this.ctx.storage.put(chunk);
      }
      for (let i = 0; i < dels.length; i += 100) await this.ctx.storage.delete(dels.slice(i, i + 100));
    } catch (e) {
      console.error('save failed', e);
    }
  }

  // ─── 연결이 끊긴 사람 정리 ───────────────────────────────
  offlineWait(room) {
    return room.status === 'playing' ? PLAY_KICK_MS : WAIT_KICK_MS;
  }

  scheduleKick() {
    if (this.kickTimer) clearTimeout(this.kickTimer);
    this.kickTimer = null;
    let next = Infinity;
    for (const r of this.rooms.values()) {
      for (const m of Object.values(r.members)) {
        if (!m.bot && !m.online && m.offAt) next = Math.min(next, m.offAt + this.offlineWait(r));
      }
    }
    if (next === Infinity) return;
    this.kickTimer = setTimeout(() => {
      this.kickTimer = null;
      this.sweepOffline();
      this.flush();
    }, Math.max(1000, next - Date.now()));
  }

  sweepOffline() {
    const t = Date.now();
    for (const r of [...this.rooms.values()]) {
      for (const m of Object.values(r.members)) {
        if (!m.bot && !m.online && m.offAt && t >= m.offAt + this.offlineWait(r) - 500) this.leaveRoom(m.uid, 'offline');
      }
    }
    this.scheduleKick();
  }
}
