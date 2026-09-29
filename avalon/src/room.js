import { DurableObject } from 'cloudflare:workers';
import {
  PLAYER_RULES, ROLE_META, shuffle, validateRoleOptions, buildRoleList,
  privateRolePayload, missionSucceeded, cleanName, makeResumeToken, createRoomState, roleSide
} from './game-core.js';
import {
  nextBotPersona, chooseBotTeam, decideBotTeamVote, decideBotMissionVote, chooseBotAssassinationTarget,
  chooseBotLadyTarget, chooseBotExcaliburRecipient, chooseBotExcaliburTarget, proposalSpeech, voteSpeech,
  missionReactionSpeech, assassinationSpeech
} from './bot-ai.js';

const RESULT_DELAY_MS = 2200;
const MISSION_RESULT_DELAY_MS = 2800;
const MODULE_DELAY_MS = 2600;
const BLOCK_AFTER_KICK_MS = 5 * 60 * 1000;
const MAX_ROOM_MEMBERS = 20;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });
}

export class AvalonRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.ctx = ctx;
    this.env = env;
    this.room = undefined;
    this.queue = Promise.resolve();
    this.gateCache = { locked: false, expiresAt: 0 };
  }

  enqueue(fn) {
    const next = this.queue.then(fn, fn);
    this.queue = next.catch(() => {});
    return next;
  }

  async loadRoom() {
    if (this.room !== undefined) return this.room;
    this.room = (await this.ctx.storage.get('room')) || null;
    if (this.room) {
      if (!Number.isInteger(this.room.playerLimit) || this.room.playerLimit < 5 || this.room.playerLimit > 10) {
        this.room.playerLimit = Math.min(10, Math.max(5, this.room.players?.length || 5));
      }
      for (const p of this.room.players || []) {
        if (typeof p.isParticipant !== 'boolean') p.isParticipant = true;
        if (typeof p.isBot !== 'boolean') p.isBot = false;
        if (p.isBot) { p.connected = true; p.socketId = null; p.everConnected = true; }
      }
    }
    return this.room;
  }

  async saveRoom(room) {
    room.updatedAt = Date.now();
    this.room = room;
    await this.ctx.storage.put('room', room);
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/internal/create' && request.method === 'POST') {
      return this.enqueue(async () => {
        if (await this.loadRoom()) return json({ ok: false, error: 'room-exists' }, 409);
        const body = await request.json().catch(() => ({}));
        const clientId = String(body.clientId || '').slice(0, 80);
        const name = cleanName(body.name);
        const code = String(body.code || '').toUpperCase();
        if (!clientId || !name || !/^[A-Z2-9]{5}$/.test(code)) return json({ ok: false, error: 'invalid-room-data' }, 400);
        const room = createRoomState({ code, clientId, name });
        await this.saveRoom(room);
        return json({ ok: true, code, resumeToken: room.players[0].resumeToken }, 201);
      });
    }

    if (url.pathname === '/internal/exists') return json({ exists: !!(await this.loadRoom()) });

    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return new Response('Expected WebSocket upgrade', { status: 426 });
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    const socketId = crypto.randomUUID();
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ socketId, clientId: null });
    server.send(JSON.stringify({ type: 'welcome', socketId }));
    return new Response(null, { status: 101, webSocket: client });
  }

  webSocketMessage(ws, raw) {
    return this.enqueue(async () => {
      let message;
      try { message = JSON.parse(typeof raw === 'string' ? raw : new TextDecoder().decode(raw)); }
      catch { return this.sendAck(ws, null, { ok: false, error: '\uc798\ubabb\ub41c \uba54\uc2dc\uc9c0 \ud615\uc2dd\uc785\ub2c8\ub2e4.' }); }
      if (message?.type !== 'event' || typeof message.event !== 'string') return;
      try {
        await this.handleEvent(ws, message.event, message.payload ?? {}, message.requestId || null);
      } catch (err) {
        console.error('room event error', message.event, err);
        this.sendAck(ws, message.requestId, { ok: false, error: '\uc11c\ubc84 \ucc98\ub9ac \uc911 \uc624\ub958\uac00 \ubc1c\uc0dd\ud588\uc2b5\ub2c8\ub2e4.' });
      }
    });
  }

  webSocketClose(ws) { return this.enqueue(() => this.markDisconnected(ws)); }
  webSocketError(ws) { return this.enqueue(() => this.markDisconnected(ws)); }

  async alarm() {
    return this.enqueue(async () => {
      const room = await this.loadRoom();
      if (!room?.pendingTransition) return;
      const transition = room.pendingTransition;
      room.pendingTransition = null;

      if (transition.type === 'finish-rejections') {
        return this.finishGame(room, 'evil', '\uc6d0\uc815\ub300 \uc81c\uc548\uc774 5\ud68c \uc5f0\uc18d \ubd80\uacb0\ub418\uc5c8\uc2b5\ub2c8\ub2e4.');
      }
      if (transition.type === 'after-team-vote') {
        if (transition.approved) {
          if (room.roleOptions.excalibur) return this.beginExcaliburAssign(room);
          return this.beginMissionVote(room);
        }
        const gamePlayers = this.gamePlayers(room);
        room.leaderIndex = (room.leaderIndex + 1) % gamePlayers.length;
        room.currentTeam = [];
        room.teamVotes = {};
        return this.enterTeamBuilding(room, `다음 대표자는 ${gamePlayers[room.leaderIndex].name}님입니다. ${this.teamSize(room)}명을 선택해주세요.`);
      }
      if (transition.type === 'after-mission' || transition.type === 'after-lancelot' || transition.type === 'after-lady') {
        return this.continueAfterMission(room);
      }
    });
  }

  attachment(ws) {
    try { return ws.deserializeAttachment() || {}; } catch { return {}; }
  }

  sendRaw(ws, value) {
    try { ws.send(JSON.stringify(value)); return true; } catch { return false; }
  }

  sendEvent(ws, event, payload) { return this.sendRaw(ws, { type: 'event', event, payload }); }
  sendAck(ws, requestId, payload) { if (requestId) this.sendRaw(ws, { type: 'ack', requestId, payload }); }
  allSockets() { return this.ctx.getWebSockets(); }
  socketById(socketId) { return this.allSockets().find(ws => this.attachment(ws).socketId === socketId) || null; }

  broadcast(event, payload, exceptSocketId = null) {
    for (const ws of this.allSockets()) {
      const a = this.attachment(ws);
      if (!a.clientId || (exceptSocketId && a.socketId === exceptSocketId)) continue;
      this.sendEvent(ws, event, payload);
    }
  }

  getPlayer(room, clientId) { return room.players.find(p => p.clientId === clientId) || null; }
  gamePlayers(room) { return room.players.filter(p => p.isParticipant); }
  botPlayers(room) { return this.gamePlayers(room).filter(p => p.isBot); }
  humanPlayers(room) { return this.gamePlayers(room).filter(p => !p.isBot); }
  getGamePlayer(room, clientId) { return this.gamePlayers(room).find(p => p.clientId === clientId) || null; }
  leader(room) { return this.gamePlayers(room)[room.leaderIndex] || null; }

  botSpeak(room, bot, text, tone = 'neutral') {
    if (!bot?.isBot || !text) return;
    room.botSpeechSeq = (room.botSpeechSeq || 0) + 1;
    this.broadcast('bot-speech', {
      id: `${room.code}-bot-${room.botSpeechSeq}`,
      clientId: bot.clientId,
      name: bot.name,
      text,
      tone,
      voiceProfile: Number(bot.botVoiceProfile || 0)
    });
  }

  async enterTeamBuilding(room, narration = '') {
    room.phase = 'team_building';
    await this.emitState(room);
    if (narration) this.narrate(room, narration, 'command');
    await this.maybeBotLead(room);
  }

  async maybeBotLead(room) {
    if (room.phase !== 'team_building') return;
    const leader = this.leader(room);
    if (!leader?.isBot) return;
    const team = chooseBotTeam(room, leader, this.teamSize(room));
    room.currentTeam = team;
    room.teamVotes = {};
    room.lastTeamVote = null;
    room.phase = 'team_vote';
    await this.emitState(room);
    this.botSpeak(room, leader, proposalSpeech(room, leader, team), 'proposal');
    this.narrate(room, `${leader.name} 기사가 원정대를 제안했습니다. 명단을 확인한 뒤 찬성 또는 반대를 선택해 주세요.`, 'command');
    await this.processBotTeamVotes(room);
  }

  async processBotTeamVotes(room) {
    if (room.phase !== 'team_vote') return;
    let changed = false;
    for (const bot of this.botPlayers(room)) {
      if (Object.hasOwn(room.teamVotes, bot.clientId)) continue;
      room.teamVotes[bot.clientId] = decideBotTeamVote(room, bot);
      changed = true;
    }
    if (changed) await this.emitState(room);
    await this.resolveTeamVoteIfComplete(room);
  }

  async resolveTeamVoteIfComplete(room) {
    const gamePlayers = this.gamePlayers(room);
    if (room.phase !== 'team_vote' || Object.keys(room.teamVotes).length !== gamePlayers.length) return false;
    const approvals = Object.values(room.teamVotes).filter(Boolean).length;
    const rejections = gamePlayers.length - approvals;
    const approved = approvals > rejections;
    room.lastTeamVote = {
      approved, approvals, rejections,
      votes: gamePlayers.map(p => ({ clientId: p.clientId, name: p.name, approve: !!room.teamVotes[p.clientId] }))
    };
    room.history.push({
      type: 'teamVote', missionNo: room.missionNo, leader: this.leader(room).name, leaderClientId: this.leader(room).clientId,
      team: [...room.currentTeam], approved, approvals, rejections,
      votes: room.lastTeamVote.votes.map(v => ({ ...v }))
    });
    room.phase = 'team_vote_result';
    room.rejectionCount = approved ? 0 : room.rejectionCount + 1;
    await this.emitState(room);
    this.narrate(room, approved
      ? `찬성 ${approvals}표, 반대 ${rejections}표. 과반수 찬성으로 원정대가 승인되었습니다.`
      : `찬성 ${approvals}표, 반대 ${rejections}표. 찬성이 과반수가 아니므로 원정대가 부결되었습니다.`, approved ? 'good' : 'warning');
    const speakingBot = this.botPlayers(room).find(b => !!room.teamVotes[b.clientId] === approved) || this.botPlayers(room)[0];
    if (speakingBot) this.botSpeak(room, speakingBot, voteSpeech(room, speakingBot, !!room.teamVotes[speakingBot.clientId]), approved ? 'calm' : 'skeptical');
    if (!approved && room.rejectionCount >= 5) await this.schedule(room, RESULT_DELAY_MS, { type: 'finish-rejections' });
    else await this.schedule(room, RESULT_DELAY_MS, { type: 'after-team-vote', approved });
    return true;
  }

  async processBotMissionVotes(room) {
    if (room.phase !== 'mission_vote') return;
    let changed = false;
    for (const bot of this.botPlayers(room)) {
      if (!room.currentTeam.includes(bot.clientId) || Object.hasOwn(room.missionVotes, bot.clientId)) continue;
      room.missionVotes[bot.clientId] = decideBotMissionVote(room, bot);
      changed = true;
    }
    if (changed) await this.emitState(room);
    if (Object.keys(room.missionVotes).length === room.currentTeam.length) {
      if (room.roleOptions.excalibur && room.excaliburHolderClientId) {
        room.phase = 'excalibur_action';
        await this.emitState(room);
        const holder = this.getPlayer(room, room.excaliburHolderClientId);
        this.narrate(room, `엑스칼리버 사용 단계입니다. ${holder?.name || ''}님은 다른 원정대원 1명의 카드를 반대 카드로 바꾸거나, 사용하지 않을 수 있습니다.`, 'secret');
        if (holder?.isBot) await this.processBotExcaliburAction(room, holder);
      } else {
        await this.resolveMission(room);
      }
    }
  }

  async processBotExcaliburAssign(room, leader) {
    if (room.phase !== 'excalibur_assign' || !leader?.isBot) return;
    const target = chooseBotExcaliburRecipient(room, leader);
    if (!target) return this.beginMissionVote(room);
    room.excaliburHolderClientId = target.clientId;
    await this.saveRoom(room);
    this.botSpeak(room, leader, `${target.name} 기사에게 엑스칼리버를 맡기겠습니다. 이번 원정의 변수를 책임져 주세요.`, 'proposal');
    this.narrate(room, `${target.name}님이 엑스칼리버를 받았습니다.`, 'command');
    return this.beginMissionVote(room);
  }

  async processBotExcaliburAction(room, holder) {
    if (room.phase !== 'excalibur_action' || !holder?.isBot) return;
    const target = chooseBotExcaliburTarget(room, holder);
    if (target && Object.hasOwn(room.missionVotes, target.clientId)) {
      const original = !!room.missionVotes[target.clientId];
      room.missionVotes[target.clientId] = !original;
      room.lastExcalibur = { used: true, holderClientId: holder.clientId, targetClientId: target.clientId, targetName: target.name };
      room.history.push({ type: 'excalibur', missionNo: room.missionNo, used: true, targetName: target.name });
      this.botSpeak(room, holder, `${target.name}님의 임무 카드를 엑스칼리버로 뒤집겠습니다.`, 'sharp');
    } else {
      room.lastExcalibur = { used: false, holderClientId: holder.clientId, targetClientId: null, targetName: null };
      room.history.push({ type: 'excalibur', missionNo: room.missionNo, used: false });
      this.botSpeak(room, holder, '이번에는 엑스칼리버를 사용하지 않겠습니다.', 'calm');
    }
    await this.saveRoom(room);
    return this.resolveMission(room);
  }

  async processBotLady(room, holder) {
    if (room.phase !== 'lady_of_lake' || !holder?.isBot) return;
    const target = chooseBotLadyTarget(room, holder);
    if (!target) {
      room.postMission.ladyDone = true;
      return this.continueAfterMission(room);
    }
    const side = roleSide(target);
    room.lady.lastInspection = { missionNo: room.missionNo, holderClientId: holder.clientId, holderName: holder.name, targetClientId: target.clientId, targetName: target.name };
    room.lady.holderClientId = target.clientId;
    room.lady.holders.push(target.clientId);
    room.lady.uses += 1;
    room.postMission.ladyDone = true;
    room.history.push({ type: 'lady', missionNo: room.missionNo, holderName: holder.name, targetName: target.name });
    await this.emitState(room);
    this.botSpeak(room, holder, `${target.name}님의 진영을 확인했습니다. 결과는 제 판단에 반영하겠습니다.`, 'quiet');
    this.narrate(room, `호수의 여인 확인이 완료되었습니다. 토큰은 ${target.name}님에게 넘어갑니다.`, 'neutral');
    await this.schedule(room, MODULE_DELAY_MS, { type: 'after-lady' });
  }

  async processBotAssassination(room) {
    if (room.phase !== 'assassination') return;
    const assassin = this.getPlayer(room, room.assassinClientId);
    if (!assassin?.isBot) return;
    const target = chooseBotAssassinationTarget(room, assassin);
    if (!target) return this.finishGame(room, 'good', '암살자가 멀린 후보를 찾지 못했습니다.');
    this.botSpeak(room, assassin, assassinationSpeech(room, assassin, target), 'danger');
    if (target.role === 'merlin') return this.finishGame(room, 'evil', `${target.name}님이 멀린이었습니다. 컴퓨터 암살자가 멀린을 찾아냈습니다.`);
    return this.finishGame(room, 'good', `${target.name}님은 멀린이 아니었습니다. 컴퓨터 암살자의 지목이 빗나갔습니다.`);
  }

  async siteLocked() {
    if (!this.env.GATE) return false;
    if (this.gateCache.expiresAt > Date.now()) return this.gateCache.locked;
    try {
      const stub = this.env.GATE.get(this.env.GATE.idFromName('AVALON_GLOBAL_GATE'));
      const res = await stub.fetch('https://gate/internal/status');
      const data = await res.json();
      this.gateCache = { locked: !!data.locked, expiresAt: Date.now() + 5000 };
      return this.gateCache.locked;
    } catch (_) {
      this.gateCache = { locked: true, expiresAt: Date.now() + 3000 };
      return true;
    }
  }

  authenticated(room, ws) {
    const a = this.attachment(ws);
    if (!a.clientId) return null;
    const p = this.getPlayer(room, a.clientId);
    return p && p.socketId === a.socketId ? p : null;
  }

  connectedPlayers(room) { return this.gamePlayers(room).filter(p => !p.isBot && p.connected); }
  isSecretPhase(phase) { return ['role_reveal', 'mission_vote', 'excalibur_action', 'lady_of_lake'].includes(phase); }
  teamSize(room) { return PLAYER_RULES[this.gamePlayers(room).length]?.teams[room.missionNo - 1] || 0; }

  publicState(room) {
    const gamePlayers = this.gamePlayers(room);
    const rules = PLAYER_RULES[gamePlayers.length] || null;
    const leaderId = gamePlayers[room.leaderIndex]?.clientId || null;
    const ladyEligible = room.roleOptions.ladyOfLake && room.phase === 'lady_of_lake'
      ? gamePlayers.filter(p => !room.lady.holders.includes(p.clientId)).map(p => p.clientId)
      : [];
    return {
      code: room.code,
      phase: room.phase,
      hostClientId: room.hostClientId,
      players: room.players.map((p, idx) => ({
        clientId: p.clientId,
        name: p.name,
        connected: !!p.connected,
        ready: !!p.ready,
        isHost: p.clientId === room.hostClientId,
        isParticipant: !!p.isParticipant,
        isBot: !!p.isBot,
        botVoiceProfile: p.isBot ? Number(p.botVoiceProfile || 0) : null,
        isLeader: p.clientId === leaderId,
        role: room.phase === 'game_over' && p.role ? {
          key: p.role,
          name: ROLE_META[p.role].name,
          initialSide: ROLE_META[p.role].side,
          currentSide: roleSide(p),
          icon: ROLE_META[p.role].icon
        } : null
      })),
      playerLimit: room.playerLimit || 5,
      playerCount: gamePlayers.length,
      spectatorCount: room.players.length - gamePlayers.length,
      missionNo: room.missionNo,
      missionScores: { ...room.missionScores },
      teamSize: rules ? this.teamSize(room) : 0,
      currentTeam: [...room.currentTeam],
      teamVotesCast: Object.keys(room.teamVotes || {}).length,
      teamVotesNeeded: room.phase === 'team_vote' ? gamePlayers.length : 0,
      lastTeamVote: room.lastTeamVote,
      missionVotesCast: Object.keys(room.missionVotes || {}).length,
      missionVotesNeeded: ['mission_vote', 'excalibur_action'].includes(room.phase) ? room.currentTeam.length : 0,
      lastMissionResult: room.lastMissionResult,
      rejectionCount: room.rejectionCount,
      history: room.history.slice(-16),
      winner: room.winner,
      winnerReason: room.winnerReason,
      coverFaces: this.isSecretPhase(room.phase),
      autoSilence: this.isSecretPhase(room.phase),
      roleOptions: { ...room.roleOptions },
      rules: rules ? { good: rules.good, evil: rules.evil } : null,
      lady: {
        enabled: !!room.roleOptions.ladyOfLake,
        holderClientId: room.lady.holderClientId,
        uses: room.lady.uses,
        eligibleClientIds: ladyEligible,
        lastInspection: room.lady.lastInspection ? { ...room.lady.lastInspection } : null
      },
      lancelot: {
        enabled: !!room.roleOptions.lancelot,
        drawCount: room.lancelotDrawIndex,
        lastCard: room.lastLancelotCard ? { ...room.lastLancelotCard } : null
      },
      excalibur: {
        enabled: !!room.roleOptions.excalibur,
        holderClientId: room.excaliburHolderClientId,
        lastAction: room.lastExcalibur ? { ...room.lastExcalibur } : null
      },
      updatedAt: room.updatedAt
    };
  }

  async emitState(room) {
    await this.saveRoom(room);
    this.broadcast('room-state', this.publicState(room));
  }

  narrate(room, text, tone = 'neutral', extra = {}) {
    room.narrationSeq = (room.narrationSeq || 0) + 1;
    this.broadcast('narrator', { id: `${room.code}-${room.narrationSeq}`, text, tone, ...extra });
  }

  sendPrivateEvent(room, clientId, event, payload) {
    const player = this.getPlayer(room, clientId);
    if (!player?.socketId) return;
    const ws = this.socketById(player.socketId);
    if (ws) this.sendEvent(ws, event, payload);
  }

  emitPrivateRole(room, player) {
    if (!player?.socketId) return;
    const ws = this.socketById(player.socketId);
    if (ws) this.sendEvent(ws, 'private-role', privateRolePayload(this.gamePlayers(room), player, room.roleOptions));
  }

  clearRoundData(room) {
    room.currentTeam = [];
    room.teamVotes = {};
    room.missionVotes = {};
    room.lastTeamVote = null;
    room.lastMissionResult = null;
    room.excaliburHolderClientId = null;
    room.lastExcalibur = null;
  }

  async schedule(room, delay, transition) {
    room.pendingTransition = transition;
    await this.saveRoom(room);
    await this.ctx.storage.setAlarm(Date.now() + delay);
  }

  async finishGame(room, winner, reason) {
    room.phase = 'game_over';
    room.winner = winner;
    room.winnerReason = reason;
    room.pendingTransition = null;
    await this.ctx.storage.deleteAlarm().catch(() => {});
    await this.emitState(room);
    this.narrate(room, winner === 'good' ? `\uc120\uc758 \uc138\ub825\uc774 \uc2b9\ub9ac\ud588\uc2b5\ub2c8\ub2e4. ${reason}` : `\uc545\uc758 \uc138\ub825\uc774 \uc2b9\ub9ac\ud588\uc2b5\ub2c8\ub2e4. ${reason}`, winner === 'good' ? 'good' : 'evil');
  }

  assignRoles(room) {
    const gamePlayers = this.gamePlayers(room);
    const roles = shuffle(buildRoleList(gamePlayers.length, room.roleOptions));
    room.players.forEach(p => { p.role = null; p.currentSide = null; p.ready = false; });
    gamePlayers.forEach((p, i) => {
      p.role = roles[i];
      p.currentSide = ROLE_META[p.role].side;
    });
    room.assassinClientId = gamePlayers.find(p => p.role === 'assassin')?.clientId || null;
    room.lancelotDeck = room.roleOptions.lancelot ? shuffle([false, false, false, true, true]) : [];
    room.lancelotDrawIndex = 0;
    room.lastLancelotCard = null;
    room.lady = { holderClientId: null, holders: [], uses: 0, lastInspection: null };
    if (room.roleOptions.ladyOfLake) {
      const rightIndex = (room.leaderIndex - 1 + gamePlayers.length) % gamePlayers.length;
      room.lady.holderClientId = gamePlayers[rightIndex].clientId;
      room.lady.holders = [room.lady.holderClientId];
    }
  }

  async advanceRoleRevealIfReady(room) {
    if (room.phase !== 'role_reveal' || !this.gamePlayers(room).every(p => p.ready)) return false;
    const gamePlayers = this.gamePlayers(room);
    gamePlayers.forEach(p => { p.ready = false; });
    const leader = this.leader(room);
    const ladyText = room.roleOptions.ladyOfLake ? ` 호수의 여인 토큰은 ${this.getPlayer(room, room.lady.holderClientId)?.name || ''}님이 가집니다.` : '';
    await this.enterTeamBuilding(room, `좋습니다. 이제 얼굴을 공개하겠습니다. 첫 번째 원정을 시작합니다. 대표자 ${leader.name}님, 이번 원정에 함께할 ${this.teamSize(room)}명을 선택해 주세요.${ladyText}`);
    return true;
  }

  async resetToLobby(room, narration = '\uc0c8 \uac8c\uc784\uc744 \uc900\ube44\ud569\ub2c8\ub2e4. \ud55c\uad6d\uc5b4\ud310 \uc5ed\ud560\uacfc \ud655\uc7a5 \uc635\uc158\uc744 \ud655\uc778\ud55c \ub4a4 \uac8c\uc784 \uc2dc\uc791\uc744 \ub20c\ub7ec\uc8fc\uc138\uc694.') {
    room.phase = 'lobby';
    room.missionNo = 1;
    room.leaderIndex = 0;
    room.missionScores = { good: 0, evil: 0 };
    room.rejectionCount = 0;
    room.currentTeam = [];
    room.teamVotes = {};
    room.missionVotes = {};
    room.lastTeamVote = null;
    room.lastMissionResult = null;
    room.history = [];
    room.winner = null;
    room.winnerReason = null;
    room.assassinClientId = null;
    room.lady = { holderClientId: null, holders: [], uses: 0, lastInspection: null };
    room.lancelotDeck = [];
    room.lancelotDrawIndex = 0;
    room.lastLancelotCard = null;
    room.excaliburHolderClientId = null;
    room.lastExcalibur = null;
    room.postMission = null;
    room.pendingTransition = null;
    room.players.forEach(p => { p.role = null; p.currentSide = null; p.ready = false; });
    await this.ctx.storage.deleteAlarm().catch(() => {});
    await this.emitState(room);
    for (const p of room.players) {
      const ws = p.socketId ? this.socketById(p.socketId) : null;
      if (ws) this.sendEvent(ws, 'private-role', null);
    }
    if (narration) this.narrate(room, narration);
  }

  async beginMissionVote(room) {
    room.phase = 'mission_vote';
    room.missionVotes = {};
    await this.emitState(room);
    this.narrate(room, '원정대원만 화면을 확인해 주세요. 지금부터 비밀 임무 카드를 제출합니다. 선의 세력은 성공만, 악의 세력은 성공 또는 실패를 선택할 수 있습니다.', 'secret');
    await this.processBotMissionVotes(room);
  }

  async beginExcaliburAssign(room) {
    room.phase = 'excalibur_assign';
    room.excaliburHolderClientId = null;
    room.lastExcalibur = null;
    await this.emitState(room);
    const leader = this.leader(room);
    this.narrate(room, `\uc5d1\uc2a4\uce7c\ub9ac\ubc84 \uaddc\uce59\uc785\ub2c8\ub2e4. \ub300\ud45c\uc790 ${leader.name}\ub2d8\uc740 \uc790\uc2e0\uc744 \uc81c\uc678\ud55c \uc6d0\uc815\ub300\uc6d0 1\uba85\uc5d0\uac8c \uc5d1\uc2a4\uce7c\ub9ac\ubc84\ub97c \uc8fc\uc138\uc694.`, 'command');
    if (leader?.isBot) await this.processBotExcaliburAssign(room, leader);
  }

  async resolveMission(room) {
    const fails = Object.values(room.missionVotes).filter(v => !v).length;
    const outcome = missionSucceeded({ playerCount: this.gamePlayers(room).length, missionNo: room.missionNo, failCount: fails });
    if (outcome.success) room.missionScores.good += 1;
    else room.missionScores.evil += 1;
    room.lastMissionResult = {
      missionNo: room.missionNo,
      missionSucceeded: outcome.success,
      fails,
      needsTwoFails: outcome.needsTwoFails,
      team: [...room.currentTeam]
    };
    room.history.push({ type: 'mission', missionNo: room.missionNo, missionSucceeded: outcome.success, fails, needsTwoFails: outcome.needsTwoFails, team: [...room.currentTeam] });
    room.phase = 'mission_result';
    room.postMission = { missionNo: room.missionNo, lancelotDone: false, ladyDone: false };
    await this.emitState(room);
    this.narrate(room, outcome.success
      ? `${room.missionNo}\ubc88\uc9f8 \uc6d0\uc815\uc774 \uc131\uacf5\ud588\uc2b5\ub2c8\ub2e4. \uc2e4\ud328 \uce74\ub4dc ${fails}\uc7a5\uc785\ub2c8\ub2e4.`
      : `${room.missionNo}\ubc88\uc9f8 \uc6d0\uc815\uc774 \uc2e4\ud328\ud588\uc2b5\ub2c8\ub2e4. \uc2e4\ud328 \uce74\ub4dc ${fails}\uc7a5\uc785\ub2c8\ub2e4.`, outcome.success ? 'good' : 'evil');
    const reactingBot = this.botPlayers(room).find(b => room.currentTeam.includes(b.clientId));
    if (reactingBot) {
      const line = missionReactionSpeech(room, reactingBot);
      if (line) this.botSpeak(room, reactingBot, line, outcome.success ? 'calm' : 'skeptical');
    }
    await this.schedule(room, MISSION_RESULT_DELAY_MS, { type: 'after-mission' });
  }

  async revealLancelotCard(room) {
    const changed = !!room.lancelotDeck[room.lancelotDrawIndex];
    room.lancelotDrawIndex += 1;
    if (changed) {
      for (const p of this.gamePlayers(room)) {
        if (p.role === 'lancelot_good' || p.role === 'lancelot_evil') p.currentSide = roleSide(p) === 'good' ? 'evil' : 'good';
      }
    }
    room.lastLancelotCard = { missionNo: room.missionNo, changed, drawNo: room.lancelotDrawIndex };
    room.history.push({ type: 'lancelot', missionNo: room.missionNo, changed });
    room.postMission.lancelotDone = true;
    room.phase = 'lancelot_reveal';
    await this.emitState(room);
    this.gamePlayers(room).filter(p => p.role === 'lancelot_good' || p.role === 'lancelot_evil').forEach(p => this.emitPrivateRole(room, p));
    this.narrate(room, changed
      ? '\ub780\uc2ac\ub86f \uc9c4\uc601 \ubcc0\uacbd \uce74\ub4dc\uac00 \ub098\uc654\uc2b5\ub2c8\ub2e4. \uc120\uacfc \uc545\uc758 \ub780\uc2ac\ub86f\uc740 \uac01\uc790 \ud604\uc7ac \uc9c4\uc601\uc744 \ubc18\ub300\ub85c \ubc14\uafd4\uc8fc\uc138\uc694.'
      : '\ub780\uc2ac\ub86f \ube48 \uce74\ub4dc\uac00 \ub098\uc654\uc2b5\ub2c8\ub2e4. \ub780\uc2ac\ub86f\uc758 \uc9c4\uc601\uc740 \ubc14\ub00c\uc9c0 \uc54a\uc2b5\ub2c8\ub2e4.', changed ? 'warning' : 'neutral');
    await this.schedule(room, MODULE_DELAY_MS, { type: 'after-lancelot' });
  }

  async beginLadyOfLake(room) {
    room.postMission.ladyDone = false;
    room.phase = 'lady_of_lake';
    await this.emitState(room);
    const holder = this.getPlayer(room, room.lady.holderClientId);
    this.narrate(room, `\ud638\uc218\uc758 \uc5ec\uc778 \uc0ac\uc6a9 \uc2dc\uac04\uc785\ub2c8\ub2e4. ${holder?.name || ''}\ub2d8\uc740 \uc544\uc9c1 \ud638\uc218\uc758 \uc5ec\uc778 \ud1a0\ud070\uc744 \uac00\uc838\ubcf8 \uc801 \uc5c6\ub294 \ud50c\ub808\uc774\uc5b4 1\uba85\uc744 \uc120\ud0dd\ud574 \uc9c4\uc601\uc744 \ud655\uc778\ud558\uc138\uc694.`, 'secret');
    if (holder?.isBot) await this.processBotLady(room, holder);
  }

  async continueAfterMission(room) {
    const post = room.postMission || { missionNo: room.missionNo, lancelotDone: false, ladyDone: false };
    room.postMission = post;

    if (room.roleOptions.lancelot && [2, 3, 4].includes(room.missionNo) && !post.lancelotDone) {
      return this.revealLancelotCard(room);
    }
    post.lancelotDone = true;

    if (room.roleOptions.ladyOfLake && [2, 3, 4].includes(room.missionNo) && !post.ladyDone && room.lady.uses < 3) {
      return this.beginLadyOfLake(room);
    }
    post.ladyDone = true;

    if (room.missionScores.evil >= 3) return this.finishGame(room, 'evil', '\uc545\uc758 \uc138\ub825\uc774 \uc6d0\uc815 3\ud68c\ub97c \uc2e4\ud328\uc2dc\ucf30\uc2b5\ub2c8\ub2e4.');
    if (room.missionScores.good >= 3) {
      room.phase = 'assassination';
      room.postMission = null;
      await this.emitState(room);
      const assassin = this.getPlayer(room, room.assassinClientId);
      this.narrate(room, `선의 세력이 세 번의 원정을 성공했습니다. 하지만 아직 끝나지 않았습니다. 암살자 ${assassin?.name || ''}님, 마지막 기회입니다. 멀린이라고 생각하는 한 사람을 지목해 주세요.`, 'danger');
      if (assassin?.isBot) return this.processBotAssassination(room);
      return;
    }

    room.missionNo += 1;
    const gamePlayers = this.gamePlayers(room);
    room.leaderIndex = (room.leaderIndex + 1) % gamePlayers.length;
    room.currentTeam = [];
    room.teamVotes = {};
    room.missionVotes = {};
    room.lastTeamVote = null;
    room.excaliburHolderClientId = null;
    room.lastExcalibur = null;
    room.postMission = null;
    return this.enterTeamBuilding(room, `${room.missionNo}번째 원정을 시작하겠습니다. 대표자 ${gamePlayers[room.leaderIndex].name}님, 원정대원 ${this.teamSize(room)}명을 선택해 주세요.`);
  }

  async handleEvent(ws, event, payload, requestId) {
    const room = await this.loadRoom();
    if (!room) return this.sendAck(ws, requestId, { ok: false, error: '\ubc29\uc744 \ucc3e\uc744 \uc218 \uc5c6\uc2b5\ub2c8\ub2e4.' });
    const a = this.attachment(ws);

    if (event !== 'leave-room' && await this.siteLocked()) {
      return this.sendAck(ws, requestId, { ok: false, error: '관리자가 현재 사이트를 잠가 두었습니다.' });
    }

    if (event === 'join-room') {
      const code = String(payload.code || '').trim().toUpperCase();
      const clientId = String(payload.clientId || '').slice(0, 80);
      const name = cleanName(payload.name);
      if (code !== room.code) return this.sendAck(ws, requestId, { ok: false, error: '\ubc29 \ucf54\ub4dc\uac00 \uc77c\uce58\ud558\uc9c0 \uc54a\uc2b5\ub2c8\ub2e4.' });
      if (!clientId || !name) return this.sendAck(ws, requestId, { ok: false, error: '\uc774\ub984\uc774 \ud544\uc694\ud569\ub2c8\ub2e4.' });
      const blockedUntil = Number(room.blockedClientIds?.[clientId] || 0);
      if (blockedUntil > Date.now()) return this.sendAck(ws, requestId, { ok: false, error: '\ubc29\uc7a5\uc774 \ub0b4\ubcf4\ub0b8 \ud50c\ub808\uc774\uc5b4\uc785\ub2c8\ub2e4. \uc7a0\uc2dc \ud6c4 \ub2e4\uc2dc \uc2dc\ub3c4\ud574\uc8fc\uc138\uc694.' });
      if (blockedUntil) delete room.blockedClientIds[clientId];

      let player = this.getPlayer(room, clientId);
      const wasNew = !player;
      if (!player) {
        if (room.phase !== 'lobby') return this.sendAck(ws, requestId, { ok: false, error: '\uc774\ubbf8 \uac8c\uc784\uc774 \uc2dc\uc791\ub41c \ubc29\uc785\ub2c8\ub2e4.' });
        if (room.players.length >= MAX_ROOM_MEMBERS) return this.sendAck(ws, requestId, { ok: false, error: `한 방에는 게임 참가자와 관전자를 합쳐 최대 ${MAX_ROOM_MEMBERS}명까지 입장할 수 있습니다.` });
        if (room.players.some(p => p.name.toLowerCase() === name.toLowerCase())) return this.sendAck(ws, requestId, { ok: false, error: '\uac19\uc740 \uc774\ub984\uc758 \ud50c\ub808\uc774\uc5b4\uac00 \uc774\ubbf8 \uc788\uc2b5\ub2c8\ub2e4.' });
        player = { clientId, name, socketId: null, connected: false, ready: false, role: null, currentSide: null, isParticipant: false, resumeToken: makeResumeToken(), everConnected: false, joinedAt: Date.now() };
        room.players.push(player);
      } else if (!payload.resumeToken || payload.resumeToken !== player.resumeToken) {
        return this.sendAck(ws, requestId, { ok: false, error: '\uc774 \ud50c\ub808\uc774\uc5b4\uc758 \uc7ac\uc811\uc18d \uc778\uc99d \uc815\ubcf4\uac00 \uc77c\uce58\ud558\uc9c0 \uc54a\uc2b5\ub2c8\ub2e4.' });
      }

      const oldSocketId = player.socketId;
      if (oldSocketId && oldSocketId !== a.socketId) {
        const old = this.socketById(oldSocketId);
        if (old) { this.sendEvent(old, 'replaced', {}); try { old.close(4001, 'replaced'); } catch {} }
      }
      const firstConnection = !player.everConnected;
      player.name = name;
      player.socketId = a.socketId;
      player.connected = true;
      player.everConnected = true;
      ws.serializeAttachment({ socketId: a.socketId, clientId });
      await this.saveRoom(room);
      this.sendAck(ws, requestId, { ok: true, code: room.code, rejoined: !!player.role, resumeToken: player.resumeToken });
      this.broadcast('room-state', this.publicState(room));
      if (player.role) this.emitPrivateRole(room, player);
      if (player.isParticipant) this.broadcast('peer-joined', { socketId: a.socketId, clientId, name }, a.socketId);
      if (firstConnection) this.narrate(room, wasNew ? `${name}\ub2d8\uc774 \uc811\uc18d\ud588\uc2b5\ub2c8\ub2e4.` : `${name}\ub2d8\uc774 \ubc29\uc744 \ub9cc\ub4e4\uc5c8\uc2b5\ub2c8\ub2e4. \ubc29 \ucf54\ub4dc ${room.code}\ub97c \uc54c\ub824\uc8fc\uc138\uc694.`);
      return;
    }

    const player = this.authenticated(room, ws);
    if (!player) return this.sendAck(ws, requestId, { ok: false, error: '\uba3c\uc800 \ubc29\uc5d0 \uc785\uc7a5\ud574\uc8fc\uc138\uc694.' });
    const clientId = player.clientId;

    if (event === 'get-room') {
      if (player.role) this.emitPrivateRole(room, player);
      return this.sendAck(ws, requestId, { ok: true, state: this.publicState(room) });
    }

    if (event === 'abort-game') {
      if (clientId !== room.hostClientId) return this.sendAck(ws, requestId, { ok: false, error: '방장만 진행 중인 게임을 중단할 수 있습니다.' });
      if (['lobby', 'game_over'].includes(room.phase)) return this.sendAck(ws, requestId, { ok: false, error: '현재 중단할 진행 중 게임이 없습니다.' });
      this.sendAck(ws, requestId, { ok: true });
      return this.resetToLobby(room, '방장이 현재 판을 중단했습니다. 모든 플레이어는 대기실로 돌아갑니다. 인원과 역할을 확인한 뒤 다시 시작해 주세요.');
    }

    if (event === 'leave-room') {
      const leavingName = player.name;
      const leavingSocketId = a.socketId;
      const wasActiveParticipant = player.isParticipant && !['lobby', 'game_over'].includes(room.phase);
      this.broadcast('peer-left', { socketId: leavingSocketId, clientId }, leavingSocketId);
      room.players = room.players.filter(p => p.clientId !== clientId);
      this.sendAck(ws, requestId, { ok: true });
      try { ws.close(1000, 'left-room'); } catch {}

      if (!room.players.some(p => !p.isBot)) {
        await this.ctx.storage.deleteAlarm().catch(() => {});
        await this.ctx.storage.delete('room');
        this.room = null;
        return;
      }

      if (room.hostClientId === clientId) {
        const nextHost = room.players.find(p => !p.isBot && p.connected) || room.players.find(p => !p.isBot);
        if (nextHost) room.hostClientId = nextHost.clientId;
      }
      room.leaderIndex = Math.min(room.leaderIndex, Math.max(0, this.gamePlayers(room).length - 1));
      if (wasActiveParticipant) {
        return this.resetToLobby(room, `${leavingName}\ub2d8\uc774 \ubc29\uc744 \ub098\uac00 \uc9c4\ud589 \uc911\uc774\ub358 \ud310\uc744 \uc911\ub2e8\ud588\uc2b5\ub2c8\ub2e4. \ub0a8\uc740 \ud50c\ub808\uc774\uc5b4\ub4e4\uc740 \ub300\uae30\uc2e4\ub85c \ub3cc\uc544\uac11\ub2c8\ub2e4.`);
      }
      await this.emitState(room);
      this.narrate(room, `${leavingName}\ub2d8\uc774 \ubc29\uc5d0\uc11c \ub098\uac14\uc2b5\ub2c8\ub2e4.`);
      return;
    }

    if (event === 'add-bot') {
      if (room.phase !== 'lobby') return this.sendAck(ws, requestId, { ok: false, error: '대기실에서만 컴퓨터 플레이어를 추가할 수 있습니다.' });
      if (clientId !== room.hostClientId) return this.sendAck(ws, requestId, { ok: false, error: '방장만 컴퓨터 플레이어를 추가할 수 있습니다.' });
      if (this.gamePlayers(room).length >= (room.playerLimit || 5)) return this.sendAck(ws, requestId, { ok: false, error: `게임 참가 인원 ${room.playerLimit || 5}명이 이미 모두 채워졌습니다.` });
      if (room.players.length >= MAX_ROOM_MEMBERS) return this.sendAck(ws, requestId, { ok: false, error: `한 방에는 최대 ${MAX_ROOM_MEMBERS}명까지 등록할 수 있습니다.` });
      const persona = nextBotPersona(room.players);
      let name = `${persona.name} · CPU`;
      let suffix = 2;
      while (room.players.some(p => p.name === name)) name = `${persona.name} ${suffix++} · CPU`;
      room.players.push({
        clientId: `bot-${crypto.randomUUID()}`, name, socketId: null, connected: true, ready: false, role: null, currentSide: null,
        isParticipant: true, isBot: true, botPersonaKey: persona.key, botVoiceProfile: persona.voiceProfile,
        resumeToken: null, everConnected: true, joinedAt: Date.now()
      });
      room.leaderIndex = 0;
      await this.emitState(room);
      this.narrate(room, `${name} 기사가 컴퓨터 플레이어로 원탁에 합류했습니다.`);
      return this.sendAck(ws, requestId, { ok: true });
    }

    if (event === 'remove-bot') {
      if (room.phase !== 'lobby') return this.sendAck(ws, requestId, { ok: false, error: '대기실에서만 컴퓨터 플레이어를 제거할 수 있습니다.' });
      if (clientId !== room.hostClientId) return this.sendAck(ws, requestId, { ok: false, error: '방장만 컴퓨터 플레이어를 제거할 수 있습니다.' });
      const targetId = String(payload.clientId || '');
      const target = this.getPlayer(room, targetId);
      if (!target?.isBot) return this.sendAck(ws, requestId, { ok: false, error: '컴퓨터 플레이어를 찾을 수 없습니다.' });
      room.players = room.players.filter(p => p.clientId !== targetId);
      room.leaderIndex = 0;
      await this.emitState(room);
      return this.sendAck(ws, requestId, { ok: true });
    }

    if (event === 'update-player-limit') {
      if (room.phase !== 'lobby') return this.sendAck(ws, requestId, { ok: false, error: '대기실에서만 게임 인원을 바꿀 수 있습니다.' });
      if (clientId !== room.hostClientId) return this.sendAck(ws, requestId, { ok: false, error: '방장만 게임 인원을 정할 수 있습니다.' });
      const limit = Math.trunc(Number(payload.playerLimit));
      if (limit < 5 || limit > 10) return this.sendAck(ws, requestId, { ok: false, error: '게임 인원은 5명부터 10명까지 선택할 수 있습니다.' });
      if (this.gamePlayers(room).length > limit) return this.sendAck(ws, requestId, { ok: false, error: `현재 게임 참가자가 ${this.gamePlayers(room).length}명입니다. 먼저 참가 체크를 해제한 뒤 ${limit}명으로 줄여주세요.` });
      room.playerLimit = limit;
      room.leaderIndex = 0;
      await this.emitState(room);
      return this.sendAck(ws, requestId, { ok: true });
    }

    if (event === 'set-participant') {
      if (room.phase !== 'lobby') return this.sendAck(ws, requestId, { ok: false, error: '대기실에서만 참가자/관전자를 바꿀 수 있습니다.' });
      if (clientId !== room.hostClientId) return this.sendAck(ws, requestId, { ok: false, error: '방장만 참가자를 선택할 수 있습니다.' });
      const targetId = String(payload.clientId || '');
      const target = this.getPlayer(room, targetId);
      if (!target) return this.sendAck(ws, requestId, { ok: false, error: '대상을 찾을 수 없습니다.' });
      const participant = !!payload.participant;
      if (participant && !target.isParticipant && this.gamePlayers(room).length >= (room.playerLimit || 5)) {
        return this.sendAck(ws, requestId, { ok: false, error: `게임 참가자는 ${room.playerLimit || 5}명까지만 선택할 수 있습니다.` });
      }
      target.isParticipant = participant;
      target.role = null; target.currentSide = null; target.ready = false;
      room.leaderIndex = 0;
      await this.emitState(room);
      this.broadcast(participant ? 'participant-enabled' : 'participant-disabled', { clientId: targetId });
      return this.sendAck(ws, requestId, { ok: true });
    }

    if (event === 'update-role-options') {
      if (room.phase !== 'lobby') return this.sendAck(ws, requestId, { ok: false, error: '\ub300\uae30\uc2e4\uc5d0\uc11c\ub9cc \ubcc0\uacbd\ud560 \uc218 \uc788\uc2b5\ub2c8\ub2e4.' });
      if (clientId !== room.hostClientId) return this.sendAck(ws, requestId, { ok: false, error: '\ubc29\uc7a5\ub9cc \uc5ed\ud560 \uad6c\uc131\uc744 \ubcc0\uacbd\ud560 \uc218 \uc788\uc2b5\ub2c8\ub2e4.' });
      for (const key of ['percival', 'morgana', 'mordred', 'oberon', 'ladyOfLake', 'lancelot', 'lancelotKnowEachOther', 'excalibur']) room.roleOptions[key] = !!payload[key];
      if (!room.roleOptions.lancelot) room.roleOptions.lancelotKnowEachOther = false;
      await this.emitState(room);
      return this.sendAck(ws, requestId, { ok: true });
    }

    if (event === 'start-game') {
      if (clientId !== room.hostClientId) return this.sendAck(ws, requestId, { ok: false, error: '\ubc29\uc7a5\ub9cc \uac8c\uc784\uc744 \uc2dc\uc791\ud560 \uc218 \uc788\uc2b5\ub2c8\ub2e4.' });
      if (room.phase !== 'lobby') return this.sendAck(ws, requestId, { ok: false, error: '\uc774\ubbf8 \uac8c\uc784\uc774 \uc9c4\ud589 \uc911\uc785\ub2c8\ub2e4.' });
      const gamePlayers = this.gamePlayers(room);
      const limit = room.playerLimit || 5;
      if (gamePlayers.length !== limit) return this.sendAck(ws, requestId, { ok: false, error: `방장이 정한 게임 인원 ${limit}명 중 현재 ${gamePlayers.length}명만 참가자로 선택되어 있습니다.` });
      if (gamePlayers.some(p => !p.isBot && !p.connected)) return this.sendAck(ws, requestId, { ok: false, error: '게임 참가자로 선택된 모든 사람이 접속한 상태여야 합니다.' });
      const err = validateRoleOptions(gamePlayers.length, room.roleOptions);
      if (err) return this.sendAck(ws, requestId, { ok: false, error: err });
      room.leaderIndex = Math.floor(Math.random() * gamePlayers.length);
      this.assignRoles(room);
      this.botPlayers(room).forEach(p => { p.ready = true; });
      room.phase = 'role_reveal';
      room.missionNo = 1;
      room.missionScores = { good: 0, evil: 0 };
      room.rejectionCount = 0;
      room.history = [];
      room.winner = null;
      room.winnerReason = null;
      room.postMission = null;
      this.clearRoundData(room);
      await this.emitState(room);
      gamePlayers.forEach(p => this.emitPrivateRole(room, p));
      this.narrate(room, '기사 여러분, 지금부터 비밀 역할을 확인하겠습니다. 잠시 서로의 얼굴과 마이크를 가립니다. 자신의 카드와 화면에 표시된 정보만 조용히 확인한 뒤, 역할 확인 완료를 눌러 주세요.', 'secret');
      this.sendAck(ws, requestId, { ok: true });
      await this.advanceRoleRevealIfReady(room);
      return;
    }

    if (event === 'role-ready') {
      if (!player.isParticipant) return this.sendAck(ws, requestId, { ok: false, error: '관전자는 역할 확인에 참여하지 않습니다.' });
      if (room.phase !== 'role_reveal') return this.sendAck(ws, requestId, { ok: false, error: '\ud604\uc7ac \uc5ed\ud560 \ud655\uc778 \ub2e8\uacc4\uac00 \uc544\ub2d9\ub2c8\ub2e4.' });
      player.ready = true;
      await this.emitState(room);
      this.sendAck(ws, requestId, { ok: true });
      await this.advanceRoleRevealIfReady(room);
      return;
    }

    if (event === 'propose-team') {
      if (room.phase !== 'team_building') return this.sendAck(ws, requestId, { ok: false, error: '\ud604\uc7ac \uc6d0\uc815\ub300 \uad6c\uc131 \ub2e8\uacc4\uac00 \uc544\ub2d9\ub2c8\ub2e4.' });
      const leader = this.leader(room);
      if (leader?.clientId !== clientId) return this.sendAck(ws, requestId, { ok: false, error: '\ud604\uc7ac \ub300\ud45c\uc790\ub9cc \uc6d0\uc815\ub300\ub97c \uc120\ud0dd\ud560 \uc218 \uc788\uc2b5\ub2c8\ub2e4.' });
      const ids = Array.isArray(payload.team) ? [...new Set(payload.team.map(String))] : [];
      if (ids.length !== this.teamSize(room)) return this.sendAck(ws, requestId, { ok: false, error: `\uc815\ud655\ud788 ${this.teamSize(room)}\uba85\uc744 \uc120\ud0dd\ud574\uc8fc\uc138\uc694.` });
      if (ids.some(id => !this.getGamePlayer(room, id))) return this.sendAck(ws, requestId, { ok: false, error: '\uc798\ubabb\ub41c \ud50c\ub808\uc774\uc5b4\uac00 \ud3ec\ud568\ub418\uc5b4 \uc788\uc2b5\ub2c8\ub2e4.' });
      room.currentTeam = ids;
      room.teamVotes = {};
      room.lastTeamVote = null;
      room.phase = 'team_vote';
      await this.emitState(room);
      this.narrate(room, '원정대가 제안되었습니다. 명단을 확인해 주세요. 이제 모두 찬성 또는 반대를 선택합니다. 전원이 투표하면 결과를 한꺼번에 공개하겠습니다.', 'command');
      this.sendAck(ws, requestId, { ok: true });
      await this.processBotTeamVotes(room);
      return;
    }

    if (event === 'team-vote') {
      if (!player.isParticipant) return this.sendAck(ws, requestId, { ok: false, error: '관전자는 찬반 투표에 참여하지 않습니다.' });
      if (room.phase !== 'team_vote') return this.sendAck(ws, requestId, { ok: false, error: '\ud604\uc7ac \ucc2c\ubc18 \ud22c\ud45c \ub2e8\uacc4\uac00 \uc544\ub2d9\ub2c8\ub2e4.' });
      if (Object.hasOwn(room.teamVotes, clientId)) return this.sendAck(ws, requestId, { ok: false, error: '\uc774\ubbf8 \ud22c\ud45c\ud588\uc2b5\ub2c8\ub2e4.' });
      room.teamVotes[clientId] = !!payload.approve;
      await this.emitState(room);
      this.sendAck(ws, requestId, { ok: true });
      await this.resolveTeamVoteIfComplete(room);
      return;
    }

    if (event === 'assign-excalibur') {
      if (room.phase !== 'excalibur_assign') return this.sendAck(ws, requestId, { ok: false, error: '\ud604\uc7ac \uc5d1\uc2a4\uce7c\ub9ac\ubc84 \ubc30\uc815 \ub2e8\uacc4\uac00 \uc544\ub2d9\ub2c8\ub2e4.' });
      const leader = this.leader(room);
      if (leader?.clientId !== clientId) return this.sendAck(ws, requestId, { ok: false, error: '\ub300\ud45c\uc790\ub9cc \uc5d1\uc2a4\uce7c\ub9ac\ubc84\ub97c \uc904 \uc218 \uc788\uc2b5\ub2c8\ub2e4.' });
      const targetId = String(payload.targetClientId || '');
      if (!room.currentTeam.includes(targetId)) return this.sendAck(ws, requestId, { ok: false, error: '\uc6d0\uc815\ub300\uc6d0\uc5d0\uac8c\ub9cc \uc5d1\uc2a4\uce7c\ub9ac\ubc84\ub97c \uc904 \uc218 \uc788\uc2b5\ub2c8\ub2e4.' });
      if (targetId === leader.clientId) return this.sendAck(ws, requestId, { ok: false, error: '\ub300\ud45c\uc790\ub294 \uc790\uc2e0\uc5d0\uac8c \uc5d1\uc2a4\uce7c\ub9ac\ubc84\ub97c \uc904 \uc218 \uc5c6\uc2b5\ub2c8\ub2e4.' });
      room.excaliburHolderClientId = targetId;
      await this.saveRoom(room);
      this.sendAck(ws, requestId, { ok: true });
      this.narrate(room, `${this.getPlayer(room, targetId)?.name || ''}\ub2d8\uc774 \uc5d1\uc2a4\uce7c\ub9ac\ubc84\ub97c \ubc1b\uc558\uc2b5\ub2c8\ub2e4.`, 'command');
      return this.beginMissionVote(room);
    }

    if (event === 'mission-vote') {
      if (!player.isParticipant) return this.sendAck(ws, requestId, { ok: false, error: '관전자는 원정 카드를 제출하지 않습니다.' });
      if (room.phase !== 'mission_vote') return this.sendAck(ws, requestId, { ok: false, error: '\ud604\uc7ac \uc6d0\uc815 \uce74\ub4dc \uc120\ud0dd \ub2e8\uacc4\uac00 \uc544\ub2d9\ub2c8\ub2e4.' });
      if (!room.currentTeam.includes(clientId)) return this.sendAck(ws, requestId, { ok: false, error: '\uc6d0\uc815\ub300\uc6d0\ub9cc \uce74\ub4dc\ub97c \uc81c\ucd9c\ud560 \uc218 \uc788\uc2b5\ub2c8\ub2e4.' });
      if (Object.hasOwn(room.missionVotes, clientId)) return this.sendAck(ws, requestId, { ok: false, error: '\uc774\ubbf8 \uc6d0\uc815 \uce74\ub4dc\ub97c \uc81c\ucd9c\ud588\uc2b5\ub2c8\ub2e4.' });
      let success = payload.success !== false;
      if (roleSide(player) === 'good') success = true;
      room.missionVotes[clientId] = success;
      await this.emitState(room);
      this.sendAck(ws, requestId, { ok: true });
      await this.processBotMissionVotes(room);
      return;
    }

    if (event === 'use-excalibur') {
      if (room.phase !== 'excalibur_action') return this.sendAck(ws, requestId, { ok: false, error: '\ud604\uc7ac \uc5d1\uc2a4\uce7c\ub9ac\ubc84 \uc0ac\uc6a9 \ub2e8\uacc4\uac00 \uc544\ub2d9\ub2c8\ub2e4.' });
      if (clientId !== room.excaliburHolderClientId) return this.sendAck(ws, requestId, { ok: false, error: '\uc5d1\uc2a4\uce7c\ub9ac\ubc84 \ubcf4\uc720\uc790\ub9cc \uc0ac\uc6a9\ud560 \uc218 \uc788\uc2b5\ub2c8\ub2e4.' });
      const targetId = payload.targetClientId ? String(payload.targetClientId) : '';
      if (targetId) {
        if (!room.currentTeam.includes(targetId) || targetId === clientId) return this.sendAck(ws, requestId, { ok: false, error: '\uc790\uc2e0\uc744 \uc81c\uc678\ud55c \ub2e4\ub978 \uc6d0\uc815\ub300\uc6d0\uc744 \uc120\ud0dd\ud574\uc8fc\uc138\uc694.' });
        if (!Object.hasOwn(room.missionVotes, targetId)) return this.sendAck(ws, requestId, { ok: false, error: '\ub300\uc0c1\uc758 \uc6d0\uc815 \uce74\ub4dc\ub97c \ucc3e\uc744 \uc218 \uc5c6\uc2b5\ub2c8\ub2e4.' });
        const original = !!room.missionVotes[targetId];
        room.missionVotes[targetId] = !original;
        const target = this.getPlayer(room, targetId);
        room.lastExcalibur = { used: true, holderClientId: clientId, targetClientId: targetId, targetName: target?.name || '' };
        room.history.push({ type: 'excalibur', missionNo: room.missionNo, used: true, targetName: target?.name || '' });
        this.sendPrivateEvent(room, clientId, 'excalibur-result', { targetName: target?.name || '', originalSuccess: original, changedSuccess: !original });
      } else {
        room.lastExcalibur = { used: false, holderClientId: clientId, targetClientId: null, targetName: null };
        room.history.push({ type: 'excalibur', missionNo: room.missionNo, used: false });
      }
      await this.saveRoom(room);
      this.sendAck(ws, requestId, { ok: true });
      return this.resolveMission(room);
    }

    if (event === 'lady-inspect') {
      if (room.phase !== 'lady_of_lake') return this.sendAck(ws, requestId, { ok: false, error: '\ud604\uc7ac \ud638\uc218\uc758 \uc5ec\uc778 \ub2e8\uacc4\uac00 \uc544\ub2d9\ub2c8\ub2e4.' });
      if (clientId !== room.lady.holderClientId) return this.sendAck(ws, requestId, { ok: false, error: '\ud638\uc218\uc758 \uc5ec\uc778 \ud1a0\ud070 \ubcf4\uc720\uc790\ub9cc \ud655\uc778\ud560 \uc218 \uc788\uc2b5\ub2c8\ub2e4.' });
      const targetId = String(payload.targetClientId || '');
      const target = this.getGamePlayer(room, targetId);
      if (!target || room.lady.holders.includes(targetId)) return this.sendAck(ws, requestId, { ok: false, error: '\uc544\uc9c1 \ud638\uc218\uc758 \uc5ec\uc778 \ud1a0\ud070\uc744 \uac00\uc838\ubcf8 \uc801 \uc5c6\ub294 \ud50c\ub808\uc774\uc5b4\ub97c \uc120\ud0dd\ud574\uc8fc\uc138\uc694.' });
      const side = roleSide(target);
      const holderName = player.name;
      room.lady.lastInspection = { missionNo: room.missionNo, holderClientId: clientId, holderName, targetClientId: targetId, targetName: target.name };
      room.lady.holderClientId = targetId;
      room.lady.holders.push(targetId);
      room.lady.uses += 1;
      room.postMission.ladyDone = true;
      room.history.push({ type: 'lady', missionNo: room.missionNo, holderName, targetName: target.name });
      this.sendPrivateEvent(room, clientId, 'lady-result', { targetName: target.name, side });
      await this.emitState(room);
      this.sendAck(ws, requestId, { ok: true });
      this.narrate(room, `\ud638\uc218\uc758 \uc5ec\uc778 \ud655\uc778\uc774 \uc644\ub8cc\ub418\uc5c8\uc2b5\ub2c8\ub2e4. \ud1a0\ud070\uc740 ${target.name}\ub2d8\uc5d0\uac8c \ub118\uc5b4\uac11\ub2c8\ub2e4.`, 'neutral');
      await this.schedule(room, MODULE_DELAY_MS, { type: 'after-lady' });
      return;
    }

    if (event === 'assassinate') {
      if (room.phase !== 'assassination') return this.sendAck(ws, requestId, { ok: false, error: '\ud604\uc7ac \uc554\uc0b4 \ub2e8\uacc4\uac00 \uc544\ub2d9\ub2c8\ub2e4.' });
      if (clientId !== room.assassinClientId) return this.sendAck(ws, requestId, { ok: false, error: '\uc554\uc0b4\uc790\ub9cc \uc120\ud0dd\ud560 \uc218 \uc788\uc2b5\ub2c8\ub2e4.' });
      const target = this.getGamePlayer(room, String(payload.targetClientId || ''));
      if (!target) return this.sendAck(ws, requestId, { ok: false, error: '\ub300\uc0c1\uc744 \ucc3e\uc744 \uc218 \uc5c6\uc2b5\ub2c8\ub2e4.' });
      if (target.clientId === room.assassinClientId) return this.sendAck(ws, requestId, { ok: false, error: '\uc790\uae30 \uc790\uc2e0\uc740 \uc120\ud0dd\ud560 \uc218 \uc5c6\uc2b5\ub2c8\ub2e4.' });
      this.sendAck(ws, requestId, { ok: true });
      if (target.role === 'merlin') await this.finishGame(room, 'evil', `${target.name}\ub2d8\uc774 \uba40\ub9b0\uc774\uc5c8\uc2b5\ub2c8\ub2e4. \uc554\uc0b4\uc790\uac00 \uba40\ub9b0\uc744 \ucc3e\uc544\ub0c8\uc2b5\ub2c8\ub2e4.`);
      else await this.finishGame(room, 'good', `${target.name}\ub2d8\uc740 \uba40\ub9b0\uc774 \uc544\ub2c8\uc5c8\uc2b5\ub2c8\ub2e4. \uc554\uc0b4\uc774 \ube57\ub098\uac14\uc2b5\ub2c8\ub2e4.`);
      return;
    }

    if (event === 'restart-game') {
      if (clientId !== room.hostClientId) return this.sendAck(ws, requestId, { ok: false, error: '\ubc29\uc7a5\ub9cc \uc0c8 \uac8c\uc784\uc744 \uc2dc\uc791\ud560 \uc218 \uc788\uc2b5\ub2c8\ub2e4.' });
      await this.resetToLobby(room);
      return this.sendAck(ws, requestId, { ok: true });
    }

    if (event === 'kick-player') {
      if (room.phase !== 'lobby') return this.sendAck(ws, requestId, { ok: false, error: '\ub300\uae30\uc2e4\uc5d0\uc11c\ub9cc \ub0b4\ubcf4\ub0bc \uc218 \uc788\uc2b5\ub2c8\ub2e4.' });
      if (clientId !== room.hostClientId) return this.sendAck(ws, requestId, { ok: false, error: '\ubc29\uc7a5\ub9cc \ub0b4\ubcf4\ub0bc \uc218 \uc788\uc2b5\ub2c8\ub2e4.' });
      const targetId = String(payload.clientId || '');
      if (targetId === room.hostClientId) return this.sendAck(ws, requestId, { ok: false, error: '\ubc29\uc7a5\uc740 \uc790\uc2e0\uc744 \ub0b4\ubcf4\ub0bc \uc218 \uc5c6\uc2b5\ub2c8\ub2e4.' });
      const target = this.getPlayer(room, targetId);
      if (!target) return this.sendAck(ws, requestId, { ok: false, error: '\ud50c\ub808\uc774\uc5b4\ub97c \ucc3e\uc744 \uc218 \uc5c6\uc2b5\ub2c8\ub2e4.' });
      const targetWs = target.socketId ? this.socketById(target.socketId) : null;
      room.players = room.players.filter(p => p.clientId !== targetId);
      room.blockedClientIds[targetId] = Date.now() + BLOCK_AFTER_KICK_MS;
      await this.emitState(room);
      this.sendAck(ws, requestId, { ok: true });
      if (targetWs) {
        this.sendEvent(targetWs, 'kicked', {});
        try { targetWs.close(4000, 'kicked'); } catch {}
      }
      return;
    }

    if (event === 'webrtc-ready') {
      if (!player.isParticipant) return this.sendAck(ws, requestId, { ok: true, peers: [] });
      const peers = this.connectedPlayers(room)
        .filter(p => p.socketId !== a.socketId)
        .map(p => ({ socketId: p.socketId, clientId: p.clientId, name: p.name }));
      return this.sendAck(ws, requestId, { ok: true, peers });
    }

    if (['rtc-offer', 'rtc-answer', 'rtc-ice'].includes(event)) {
      if (!player.isParticipant) return;
      const targetSocketId = String(payload.targetSocketId || '');
      if (!targetSocketId) return;
      const target = this.gamePlayers(room).find(p => p.connected && p.socketId === targetSocketId);
      if (!target) return;
      if (event === 'rtc-ice' && !payload.candidate) return;
      const targetWs = this.socketById(targetSocketId);
      if (!targetWs) return;
      const out = { sourceSocketId: a.socketId, sourceClientId: clientId };
      if (event === 'rtc-ice') out.candidate = payload.candidate;
      else out.sdp = payload.sdp;
      this.sendEvent(targetWs, event, out);
      return;
    }

    this.sendAck(ws, requestId, { ok: false, error: '\uc9c0\uc6d0\ud558\uc9c0 \uc54a\ub294 \uc694\uccad\uc785\ub2c8\ub2e4.' });
  }

  async markDisconnected(ws) {
    const room = await this.loadRoom();
    if (!room) return;
    const a = this.attachment(ws);
    if (!a.clientId) return;
    const player = this.getPlayer(room, a.clientId);
    if (!player || player.socketId !== a.socketId) return;
    player.connected = false;
    player.socketId = null;
    if (room.phase === 'lobby' && room.hostClientId === player.clientId) {
      const replacement = room.players.find(p => !p.isBot && p.connected && p.clientId !== player.clientId);
      if (replacement) room.hostClientId = replacement.clientId;
    }
    await this.emitState(room);
    this.broadcast('peer-left', { socketId: a.socketId, clientId: a.clientId }, a.socketId);
  }
}
