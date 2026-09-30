import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

async function loadRoomClass() {
  const projectRoot = path.resolve(new URL('..', import.meta.url).pathname);
  const sourcePath = path.join(projectRoot, 'src', 'room.js');
  const gameCoreUrl = pathToFileURL(path.join(projectRoot, 'src', 'game-core.js')).href;
  const botAiUrl = pathToFileURL(path.join(projectRoot, 'src', 'bot-ai.js')).href;
  let src = await fs.readFile(sourcePath, 'utf8');
  src = src.replace("import { DurableObject } from 'cloudflare:workers';", "class DurableObject { constructor(ctx, env) { this.ctx = ctx; this.env = env; } }");
  src = src.replace("from './game-core.js';", `from '${gameCoreUrl}';`);
  src = src.replace("from './bot-ai.js';", `from '${botAiUrl}';`);
  const temp = path.join(os.tmpdir(), `avalon-room-${Date.now()}-${Math.random()}.mjs`);
  await fs.writeFile(temp, src);
  const mod = await import(pathToFileURL(temp).href);
  await fs.unlink(temp).catch(() => {});
  return mod.AvalonRoom;
}

class MockStorage {
  constructor() { this.values = new Map(); this.alarmAt = null; }
  async get(k) { return this.values.get(k); }
  async put(k, v) { this.values.set(k, structuredClone(v)); }
  async delete(k) { this.values.delete(k); }
  async setAlarm(ts) { this.alarmAt = ts; }
  async deleteAlarm() { this.alarmAt = null; }
}
class MockCtx {
  constructor() { this.storage = new MockStorage(); this.sockets = []; }
  acceptWebSocket(ws) { this.sockets.push(ws); }
  getWebSockets() { return this.sockets.filter(ws => !ws.closed); }
}
class FakeWS {
  constructor(socketId) { this.att = { socketId, clientId: null }; this.sent = []; this.closed = false; }
  serializeAttachment(v) { this.att = structuredClone(v); }
  deserializeAttachment() { return structuredClone(this.att); }
  send(v) { if (this.closed) throw new Error('closed'); this.sent.push(JSON.parse(v)); }
  close() { this.closed = true; }
}

function ackPayload(ws, requestId) {
  return ws.sent.findLast(x => x.type === 'ack' && x.requestId === requestId)?.payload;
}

async function setupGame(playerCount = 5, env = {}) {
  const AvalonRoom = await loadRoomClass();
  const ctx = new MockCtx();
  const roomObj = new AvalonRoom(ctx, env);
  const hostCreate = await roomObj.fetch(new Request('https://room/internal/create', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code: 'ABCDE', clientId: 'p1', name: 'P1' })
  }));
  assert.equal(hostCreate.status, 201);
  const created = await hostCreate.json();
  const sockets = new Map();
  for (let i = 1; i <= playerCount; i += 1) {
    const id = `p${i}`;
    const ws = new FakeWS(`s${i}`);
    ctx.sockets.push(ws);
    sockets.set(id, ws);
    const token = i === 1 ? created.resumeToken : '';
    await roomObj.handleEvent(ws, 'join-room', { code: 'ABCDE', clientId: id, name: `P${i}`, resumeToken: token }, `join-${i}`);
    assert.equal(ackPayload(ws, `join-${i}`)?.ok, true);
  }
  await roomObj.handleEvent(sockets.get('p1'), 'update-player-limit', { playerLimit: playerCount }, 'setup-limit');
  assert.equal(ackPayload(sockets.get('p1'), 'setup-limit')?.ok, true);
  for (let i = 2; i <= playerCount; i += 1) {
    await roomObj.handleEvent(sockets.get('p1'), 'set-participant', { clientId: `p${i}`, participant: true }, `setup-participant-${i}`);
    assert.equal(ackPayload(sockets.get('p1'), `setup-participant-${i}`)?.ok, true);
  }
  return { roomObj, ctx, sockets };
}

async function setupSpectatorRoom(gameCount = 5, spectatorCount = 2) {
  const base = await setupGame(gameCount);
  const { roomObj, ctx, sockets } = base;
  for (let i = 1; i <= spectatorCount; i += 1) {
    const idx = gameCount + i;
    const id = `p${idx}`;
    const ws = new FakeWS(`s${idx}`);
    ctx.sockets.push(ws);
    sockets.set(id, ws);
    await roomObj.handleEvent(ws, 'join-room', { code: 'ABCDE', clientId: id, name: `P${idx}`, resumeToken: '' }, `spectator-join-${idx}`);
    assert.equal(ackPayload(ws, `spectator-join-${idx}`)?.ok, true);
  }
  return base;
}

async function readyAll(roomObj, sockets) {
  for (const [id, ws] of sockets) await roomObj.handleEvent(ws, 'role-ready', {}, `ready-${id}`);
}

async function approveCurrentTeam(roomObj, sockets) {
  for (const [id, ws] of sockets) await roomObj.handleEvent(ws, 'team-vote', { approve: true }, `vote-${id}-${Date.now()}`);
  assert.equal(roomObj.room.phase, 'team_vote_result');
  await roomObj.alarm();
  assert.equal(roomObj.room.phase, 'mission_vote');
}

async function proposeTeamWithEvil(roomObj, sockets) {
  const room = roomObj.room;
  const leader = room.players[room.leaderIndex];
  const evil = room.players.find(p => p.role && ['assassin','morgana','mordred','oberon','minion','lancelot_evil'].includes(p.role));
  const size = roomObj.teamSize(room);
  const team = [evil.clientId];
  for (const p of room.players) if (!team.includes(p.clientId) && team.length < size) team.push(p.clientId);
  await roomObj.handleEvent(sockets.get(leader.clientId), 'propose-team', { team }, `propose-${room.missionNo}`);
  assert.equal(roomObj.room.phase, 'team_vote');
  return { team, evil };
}


test('Durable Object runtime: media lock blocks WebRTC but not Avalon gameplay', async () => {
  const gate = {
    idFromName: name => name,
    get: () => ({ fetch: async () => Response.json({ locked: true, mediaLocked: true }) })
  };
  const { roomObj, sockets } = await setupGame(5, { GATE: gate });
  await roomObj.handleEvent(sockets.get('p1'), 'start-game', {}, 'locked-start');
  assert.equal(ackPayload(sockets.get('p1'), 'locked-start')?.ok, true);
  assert.equal(roomObj.room.phase, 'role_reveal');

  await roomObj.handleEvent(sockets.get('p1'), 'webrtc-ready', {}, 'locked-webrtc');
  const rtcAck = ackPayload(sockets.get('p1'), 'locked-webrtc');
  assert.equal(rtcAck?.ok, false);
  assert.match(rtcAck?.error || '', /음성·화상/);

  await readyAll(roomObj, sockets);
  assert.equal(roomObj.room.phase, 'team_building');
});

test('Durable Object runtime: 5 players can play through three failed missions', async () => {
  const { roomObj, sockets } = await setupGame(5);
  await roomObj.handleEvent(sockets.get('p1'), 'start-game', {}, 'start');
  assert.equal(ackPayload(sockets.get('p1'), 'start')?.ok, true);
  assert.equal(roomObj.room.phase, 'role_reveal');
  assert.equal(roomObj.room.players.filter(p => ['merlin','percival','servant'].includes(p.role)).length, 3);
  const publicBefore = roomObj.publicState(roomObj.room);
  assert.ok(publicBefore.players.every(p => p.role === null));
  assert.equal(Object.hasOwn(publicBefore, 'assassinClientId'), false);

  await readyAll(roomObj, sockets);
  assert.equal(roomObj.room.phase, 'team_building');

  for (let mission = 1; mission <= 3; mission += 1) {
    const { team, evil } = await proposeTeamWithEvil(roomObj, sockets);
    await approveCurrentTeam(roomObj, sockets);
    for (const id of team) {
      await roomObj.handleEvent(sockets.get(id), 'mission-vote', { success: id !== evil.clientId }, `mission-${mission}-${id}`);
    }
    assert.equal(roomObj.room.phase, 'mission_result');
    assert.equal(roomObj.room.lastMissionResult.fails, 1);
    await roomObj.alarm();
  }
  assert.equal(roomObj.room.phase, 'game_over');
  assert.equal(roomObj.room.winner, 'evil');
  assert.match(roomObj.room.winnerReason, /3회/);
  assert.ok(roomObj.publicState(roomObj.room).players.every(p => p.role?.name));
});

test('Durable Object runtime: three successful missions enter assassination and Merlin hit ends game', async () => {
  const { roomObj, sockets } = await setupGame(5);
  await roomObj.handleEvent(sockets.get('p1'), 'start-game', {}, 'start2');
  await readyAll(roomObj, sockets);

  for (let mission = 1; mission <= 3; mission += 1) {
    const room = roomObj.room;
    const leader = room.players[room.leaderIndex];
    const size = roomObj.teamSize(room);
    const team = room.players.slice(0, size).map(p => p.clientId);
    await roomObj.handleEvent(sockets.get(leader.clientId), 'propose-team', { team }, `success-propose-${mission}`);
    await approveCurrentTeam(roomObj, sockets);
    for (const id of team) await roomObj.handleEvent(sockets.get(id), 'mission-vote', { success: true }, `success-mission-${mission}-${id}`);
    await roomObj.alarm();
  }
  assert.equal(roomObj.room.phase, 'assassination');
  assert.equal(Object.hasOwn(roomObj.publicState(roomObj.room), 'assassinClientId'), false);
  const assassin = roomObj.room.players.find(p => p.role === 'assassin');
  const merlin = roomObj.room.players.find(p => p.role === 'merlin');
  await roomObj.handleEvent(sockets.get(assassin.clientId), 'assassinate', { targetClientId: merlin.clientId }, 'kill-merlin');
  assert.equal(roomObj.room.phase, 'game_over');
  assert.equal(roomObj.room.winner, 'evil');
});

test('Durable Object runtime: five consecutive rejected teams give evil the win', async () => {
  const { roomObj, sockets } = await setupGame(5);
  await roomObj.handleEvent(sockets.get('p1'), 'start-game', {}, 'reject-start');
  await readyAll(roomObj, sockets);
  for (let round = 1; round <= 5; round += 1) {
    const room = roomObj.room;
    const leader = room.players[room.leaderIndex];
    const size = roomObj.teamSize(room);
    const team = room.players.slice(0, size).map(p => p.clientId);
    await roomObj.handleEvent(sockets.get(leader.clientId), 'propose-team', { team }, `reject-propose-${round}`);
    for (const [id, ws] of sockets) await roomObj.handleEvent(ws, 'team-vote', { approve: false }, `reject-vote-${round}-${id}`);
    assert.equal(roomObj.room.phase, 'team_vote_result');
    await roomObj.alarm();
    if (round < 5) assert.equal(roomObj.room.phase, 'team_building');
  }
  assert.equal(roomObj.room.phase, 'game_over');
  assert.equal(roomObj.room.winner, 'evil');
  assert.match(roomObj.room.winnerReason, /5회 연속 부결/);
});

test('Durable Object runtime: fourth mission with 7 players survives one fail', async () => {
  const { roomObj, sockets } = await setupGame(7);
  await roomObj.handleEvent(sockets.get('p1'), 'start-game', {}, 'seven-start');
  const room = roomObj.room;
  room.phase = 'mission_vote';
  room.missionNo = 4;
  room.currentTeam = [];
  const evil = room.players.find(p => ['assassin','morgana','mordred','oberon','minion','lancelot_evil'].includes(p.role));
  room.currentTeam.push(evil.clientId);
  for (const p of room.players) if (!room.currentTeam.includes(p.clientId) && room.currentTeam.length < 4) room.currentTeam.push(p.clientId);
  room.missionVotes = {};
  for (const id of room.currentTeam) {
    await roomObj.handleEvent(sockets.get(id), 'mission-vote', { success: id !== evil.clientId }, `seven-mission-${id}`);
  }
  assert.equal(roomObj.room.phase, 'mission_result');
  assert.equal(roomObj.room.lastMissionResult.fails, 1);
  assert.equal(roomObj.room.lastMissionResult.needsTwoFails, true);
  assert.equal(roomObj.room.lastMissionResult.missionSucceeded, true);
});

test('Durable Object runtime: good player cannot submit a Fail card', async () => {
  const { roomObj, sockets } = await setupGame(5);
  await roomObj.handleEvent(sockets.get('p1'), 'start-game', {}, 'force-good-start');
  const room = roomObj.room;
  const good = room.players.find(p => ['merlin','percival','servant'].includes(p.role));
  const evil = room.players.find(p => ['assassin','morgana','mordred','oberon','minion','lancelot_evil'].includes(p.role));
  room.phase = 'mission_vote';
  room.missionNo = 1;
  room.currentTeam = [good.clientId, evil.clientId];
  room.missionVotes = {};
  await roomObj.handleEvent(sockets.get(good.clientId), 'mission-vote', { success: false }, 'good-tries-fail');
  assert.equal(roomObj.room.missionVotes[good.clientId], true);
  await roomObj.handleEvent(sockets.get(evil.clientId), 'mission-vote', { success: false }, 'evil-fails');
  assert.equal(roomObj.room.lastMissionResult.fails, 1);
  assert.equal(roomObj.room.lastMissionResult.missionSucceeded, false);
});


test('Durable Object runtime: Lancelot switch card flips both Lancelots current allegiance after mission 2', async () => {
  const { roomObj, sockets } = await setupGame(7);
  roomObj.room.roleOptions = {
    ...roomObj.room.roleOptions,
    percival: true,
    mordred: true,
    morgana: false,
    oberon: false,
    lancelot: true,
    lancelotKnowEachOther: false,
    ladyOfLake: false,
    excalibur: false
  };
  await roomObj.handleEvent(sockets.get('p1'), 'start-game', {}, 'lancelot-start');
  const lancelots = roomObj.room.players.filter(p => p.role === 'lancelot_good' || p.role === 'lancelot_evil');
  assert.equal(lancelots.length, 2);
  const before = Object.fromEntries(lancelots.map(p => [p.clientId, p.currentSide]));
  roomObj.room.missionNo = 2;
  roomObj.room.postMission = { missionNo: 2, lancelotDone: false, ladyDone: false };
  roomObj.room.lancelotDeck = [true, false, false, false, true];
  roomObj.room.lancelotDrawIndex = 0;
  await roomObj.continueAfterMission(roomObj.room);
  assert.equal(roomObj.room.phase, 'lancelot_reveal');
  assert.equal(roomObj.room.lastLancelotCard.changed, true);
  for (const p of lancelots) assert.notEqual(p.currentSide, before[p.clientId]);
  const publicState = roomObj.publicState(roomObj.room);
  assert.equal(publicState.lancelot.lastCard.changed, true);
  assert.ok(publicState.players.every(p => p.role === null));
});

test('Durable Object runtime: Lady of the Lake privately reveals current side and token cannot return to a previous holder', async () => {
  const { roomObj, sockets } = await setupGame(5);
  roomObj.room.roleOptions.ladyOfLake = true;
  await roomObj.handleEvent(sockets.get('p1'), 'start-game', {}, 'lady-start');
  const room = roomObj.room;
  room.phase = 'lady_of_lake';
  room.missionNo = 2;
  room.postMission = { missionNo: 2, lancelotDone: true, ladyDone: false };
  const initialHolderId = room.lady.holderClientId;
  const initialHolder = room.players.find(p => p.clientId === initialHolderId);
  const target = room.players.find(p => p.clientId !== initialHolderId);
  await roomObj.handleEvent(sockets.get(initialHolderId), 'lady-inspect', { targetClientId: target.clientId }, 'lady-inspect-1');
  assert.equal(ackPayload(sockets.get(initialHolderId), 'lady-inspect-1')?.ok, true);
  const privateResult = sockets.get(initialHolderId).sent.findLast(x => x.type === 'event' && x.event === 'lady-result')?.payload;
  assert.equal(privateResult.targetName, target.name);
  assert.equal(privateResult.side, target.currentSide);
  assert.equal(room.lady.holderClientId, target.clientId);
  assert.ok(room.lady.holders.includes(initialHolder.clientId));
  assert.ok(room.lady.holders.includes(target.clientId));
  const publicState = roomObj.publicState(room);
  assert.equal(Object.hasOwn(publicState.lady.lastInspection || {}, 'side'), false);

  room.phase = 'lady_of_lake';
  room.postMission.ladyDone = false;
  await roomObj.handleEvent(sockets.get(target.clientId), 'lady-inspect', { targetClientId: initialHolder.clientId }, 'lady-return');
  assert.equal(ackPayload(sockets.get(target.clientId), 'lady-return')?.ok, false);
});

test('Durable Object runtime: Excalibur can flip another quest member Success into Fail before reveal', async () => {
  const { roomObj, sockets } = await setupGame(5);
  roomObj.room.roleOptions.excalibur = true;
  await roomObj.handleEvent(sockets.get('p1'), 'start-game', {}, 'excalibur-start');
  await readyAll(roomObj, sockets);
  const room = roomObj.room;
  const leader = room.players[room.leaderIndex];
  const other = room.players.find(p => p.clientId !== leader.clientId);
  const team = [leader.clientId, other.clientId];
  await roomObj.handleEvent(sockets.get(leader.clientId), 'propose-team', { team }, 'excalibur-propose');
  for (const [id, ws] of sockets) await roomObj.handleEvent(ws, 'team-vote', { approve: true }, `excalibur-vote-${id}`);
  assert.equal(roomObj.room.phase, 'team_vote_result');
  await roomObj.alarm();
  assert.equal(roomObj.room.phase, 'excalibur_assign');
  await roomObj.handleEvent(sockets.get(leader.clientId), 'assign-excalibur', { targetClientId: other.clientId }, 'excalibur-assign');
  assert.equal(ackPayload(sockets.get(leader.clientId), 'excalibur-assign')?.ok, true);
  assert.equal(roomObj.room.phase, 'mission_vote');
  for (const id of team) await roomObj.handleEvent(sockets.get(id), 'mission-vote', { success: true }, `excalibur-mission-${id}`);
  assert.equal(roomObj.room.phase, 'excalibur_action');
  await roomObj.handleEvent(sockets.get(other.clientId), 'use-excalibur', { targetClientId: leader.clientId }, 'excalibur-use');
  assert.equal(ackPayload(sockets.get(other.clientId), 'excalibur-use')?.ok, true);
  assert.equal(roomObj.room.phase, 'mission_result');
  assert.equal(roomObj.room.lastMissionResult.fails, 1);
  assert.equal(roomObj.room.lastMissionResult.missionSucceeded, false);
  const privateResult = sockets.get(other.clientId).sent.findLast(x => x.type === 'event' && x.event === 'excalibur-result')?.payload;
  assert.equal(privateResult.originalSuccess, true);
  assert.equal(privateResult.changedSuccess, false);
});


test('Durable Object runtime: leaving lobby removes player and transfers host safely', async () => {
  const { roomObj, sockets } = await setupGame(5);
  await roomObj.handleEvent(sockets.get('p1'), 'leave-room', {}, 'leave-host-lobby');
  assert.equal(ackPayload(sockets.get('p1'), 'leave-host-lobby')?.ok, true);
  assert.equal(roomObj.room.players.length, 4);
  assert.equal(roomObj.room.hostClientId, 'p2');
  assert.equal(roomObj.room.phase, 'lobby');
});

test('Durable Object runtime: intentional leave during active game aborts round and returns remaining players to lobby', async () => {
  const { roomObj, sockets } = await setupGame(5);
  await roomObj.handleEvent(sockets.get('p1'), 'start-game', {}, 'leave-active-start');
  assert.equal(roomObj.room.phase, 'role_reveal');
  await roomObj.handleEvent(sockets.get('p5'), 'leave-room', {}, 'leave-active');
  assert.equal(ackPayload(sockets.get('p5'), 'leave-active')?.ok, true);
  assert.equal(roomObj.room.players.length, 4);
  assert.equal(roomObj.room.phase, 'lobby');
  assert.ok(roomObj.room.players.every(p => p.role === null && p.currentSide === null));
  assert.deepEqual(roomObj.room.missionScores, { good: 0, evil: 0 });
});


test('Durable Object runtime: host can abort an active game back to lobby', async () => {
  const { roomObj, sockets } = await setupGame(5);
  await roomObj.handleEvent(sockets.get('p1'), 'start-game', {}, 'abort-start');
  assert.equal(roomObj.room.phase, 'role_reveal');
  await roomObj.handleEvent(sockets.get('p1'), 'abort-game', {}, 'abort-now');
  assert.equal(ackPayload(sockets.get('p1'), 'abort-now')?.ok, true);
  assert.equal(roomObj.room.phase, 'lobby');
  assert.ok(roomObj.room.players.every(p => p.role === null));
});

test('Durable Object runtime: spectators stay role-free and receive no WebRTC peers', async () => {
  const { roomObj, sockets } = await setupSpectatorRoom(5, 2);
  assert.equal(roomObj.room.players.filter(p => p.isParticipant).length, 5);
  assert.equal(roomObj.room.players.filter(p => !p.isParticipant).length, 2);
  await roomObj.handleEvent(sockets.get('p1'), 'start-game', {}, 'spectator-start');
  assert.equal(ackPayload(sockets.get('p1'), 'spectator-start')?.ok, true);
  for (const id of ['p6', 'p7']) {
    const p = roomObj.room.players.find(x => x.clientId === id);
    assert.equal(p.role, null);
    await roomObj.handleEvent(sockets.get(id), 'webrtc-ready', {}, `rtc-${id}`);
    assert.deepEqual(ackPayload(sockets.get(id), `rtc-${id}`)?.peers, []);
  }
});

test('Durable Object runtime: host can swap a player with a spectator before the game', async () => {
  const { roomObj, sockets } = await setupSpectatorRoom(5, 1);
  await roomObj.handleEvent(sockets.get('p1'), 'set-participant', { clientId: 'p5', participant: false }, 'bench-p5');
  assert.equal(ackPayload(sockets.get('p1'), 'bench-p5')?.ok, true);
  await roomObj.handleEvent(sockets.get('p1'), 'set-participant', { clientId: 'p6', participant: true }, 'promote-p6');
  assert.equal(ackPayload(sockets.get('p1'), 'promote-p6')?.ok, true);
  assert.equal(roomObj.room.players.find(p => p.clientId === 'p5').isParticipant, false);
  assert.equal(roomObj.room.players.find(p => p.clientId === 'p6').isParticipant, true);
  await roomObj.handleEvent(sockets.get('p1'), 'start-game', {}, 'swap-start');
  assert.equal(ackPayload(sockets.get('p1'), 'swap-start')?.ok, true);
  assert.equal(roomObj.room.players.find(p => p.clientId === 'p5').role, null);
  assert.ok(roomObj.room.players.find(p => p.clientId === 'p6').role);
});

test('Durable Object runtime: spectator leaving during an active game does not abort it', async () => {
  const { roomObj, sockets } = await setupSpectatorRoom(5, 1);
  await roomObj.handleEvent(sockets.get('p1'), 'start-game', {}, 'spectator-leave-start');
  assert.equal(roomObj.room.phase, 'role_reveal');
  await roomObj.handleEvent(sockets.get('p6'), 'leave-room', {}, 'spectator-leave');
  assert.equal(ackPayload(sockets.get('p6'), 'spectator-leave')?.ok, true);
  assert.equal(roomObj.room.phase, 'role_reveal');
  assert.equal(roomObj.room.players.length, 5);
});

test('Durable Object runtime: spectators cannot cast team or mission votes', async () => {
  const { roomObj, sockets } = await setupSpectatorRoom(5, 1);
  await roomObj.handleEvent(sockets.get('p1'), 'start-game', {}, 'spectator-vote-start');
  await roomObj.handleEvent(sockets.get('p6'), 'role-ready', {}, 'spectator-ready');
  assert.equal(ackPayload(sockets.get('p6'), 'spectator-ready')?.ok, false);

  const activeSockets = new Map([...sockets].filter(([id]) => id !== 'p6'));
  await readyAll(roomObj, activeSockets);
  const room = roomObj.room;
  const leader = roomObj.leader(room);
  const team = roomObj.gamePlayers(room).slice(0, roomObj.teamSize(room)).map(p => p.clientId);
  await roomObj.handleEvent(sockets.get(leader.clientId), 'propose-team', { team }, 'spectator-propose');
  await roomObj.handleEvent(sockets.get('p6'), 'team-vote', { approve: true }, 'spectator-team-vote');
  assert.equal(ackPayload(sockets.get('p6'), 'spectator-team-vote')?.ok, false);
});


test('Durable Object runtime: one human can fill a 5-player table with four computer knights', async () => {
  const AvalonRoom = await loadRoomClass();
  const ctx = new MockCtx();
  const roomObj = new AvalonRoom(ctx, {});
  const create = await roomObj.fetch(new Request('https://room/internal/create', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code: 'ABCDE', clientId: 'p1', name: 'Human' })
  }));
  const created = await create.json();
  const ws = new FakeWS('s1');
  ctx.sockets.push(ws);
  await roomObj.handleEvent(ws, 'join-room', { code: 'ABCDE', clientId: 'p1', name: 'Human', resumeToken: created.resumeToken }, 'bot-join');
  for (let i = 0; i < 4; i += 1) {
    await roomObj.handleEvent(ws, 'add-bot', {}, `add-bot-${i}`);
    assert.equal(ackPayload(ws, `add-bot-${i}`)?.ok, true);
  }
  assert.equal(roomObj.gamePlayers(roomObj.room).length, 5);
  assert.equal(roomObj.botPlayers(roomObj.room).length, 4);
  assert.ok(roomObj.botPlayers(roomObj.room).every(p => p.connected && p.isBot));

  await roomObj.handleEvent(ws, 'start-game', {}, 'bot-start');
  assert.equal(ackPayload(ws, 'bot-start')?.ok, true);
  assert.equal(roomObj.room.phase, 'role_reveal');
  assert.ok(roomObj.botPlayers(roomObj.room).every(p => p.ready));
  assert.ok(roomObj.publicState(roomObj.room).players.every(p => p.role === null));

  const botIndex = roomObj.gamePlayers(roomObj.room).findIndex(p => p.isBot);
  roomObj.room.leaderIndex = botIndex;
  await roomObj.handleEvent(ws, 'role-ready', {}, 'human-ready-with-bots');
  assert.equal(ackPayload(ws, 'human-ready-with-bots')?.ok, true);
  assert.equal(roomObj.room.phase, 'team_vote');
  assert.equal(Object.keys(roomObj.room.teamVotes).length, 4, 'all four bots should vote automatically');
  assert.ok(roomObj.room.currentTeam.length > 0);
});

test('Durable Object runtime: computer quest members submit mission cards automatically', async () => {
  const AvalonRoom = await loadRoomClass();
  const ctx = new MockCtx();
  const roomObj = new AvalonRoom(ctx, {});
  const create = await roomObj.fetch(new Request('https://room/internal/create', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code: 'ABCDE', clientId: 'p1', name: 'Human' })
  }));
  const created = await create.json();
  const ws = new FakeWS('s1');
  ctx.sockets.push(ws);
  await roomObj.handleEvent(ws, 'join-room', { code: 'ABCDE', clientId: 'p1', name: 'Human', resumeToken: created.resumeToken }, 'auto-join');
  for (let i = 0; i < 4; i += 1) await roomObj.handleEvent(ws, 'add-bot', {}, `auto-add-${i}`);
  await roomObj.handleEvent(ws, 'start-game', {}, 'auto-start');
  const bots = roomObj.botPlayers(roomObj.room);
  roomObj.room.phase = 'mission_vote';
  roomObj.room.missionNo = 1;
  roomObj.room.currentTeam = bots.slice(0, 2).map(p => p.clientId);
  roomObj.room.missionVotes = {};
  await roomObj.processBotMissionVotes(roomObj.room);
  assert.equal(Object.keys(roomObj.room.missionVotes).length, 2);
  assert.equal(roomObj.room.phase, 'mission_result');
});

test('Durable Object runtime: a computer assassin performs the final Merlin guess automatically', async () => {
  const AvalonRoom = await loadRoomClass();
  const ctx = new MockCtx();
  const roomObj = new AvalonRoom(ctx, {});
  roomObj.room = {
    code: 'ABCDE', phase: 'assassination', playerLimit: 5, missionNo: 3, leaderIndex: 0,
    missionScores: { good: 3, evil: 0 }, rejectionCount: 0, currentTeam: [], teamVotes: {}, missionVotes: {},
    lastTeamVote: null, lastMissionResult: null, history: [], winner: null, winnerReason: null,
    hostClientId: 'p1', assassinClientId: 'b1', pendingTransition: null, narrationSeq: 0, botSpeechSeq: 0,
    roleOptions: { percival: true, morgana: false, mordred: true, oberon: false, ladyOfLake: false, lancelot: false, lancelotKnowEachOther: false, excalibur: false },
    lady: { holderClientId: null, holders: [], uses: 0, lastInspection: null }, lancelotDeck: [], lancelotDrawIndex: 0,
    lastLancelotCard: null, excaliburHolderClientId: null, lastExcalibur: null, postMission: null, blockedClientIds: {},
    players: [
      { clientId: 'p1', name: 'Human', isParticipant: true, isBot: false, connected: true, role: 'merlin', currentSide: 'good' },
      { clientId: 'b1', name: '가웨인 · CPU', isParticipant: true, isBot: true, connected: true, role: 'assassin', currentSide: 'evil', botVoiceProfile: 0 },
      { clientId: 'p3', name: 'P3', isParticipant: true, isBot: false, connected: true, role: 'percival', currentSide: 'good' },
      { clientId: 'p4', name: 'P4', isParticipant: true, isBot: false, connected: true, role: 'servant', currentSide: 'good' },
      { clientId: 'p5', name: 'P5', isParticipant: true, isBot: false, connected: true, role: 'mordred', currentSide: 'evil' }
    ]
  };
  await roomObj.processBotAssassination(roomObj.room);
  assert.equal(roomObj.room.phase, 'game_over');
  assert.ok(['good','evil'].includes(roomObj.room.winner));
});
