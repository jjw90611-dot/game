export const PLAYER_RULES = {
  5: { good: 3, evil: 2, teams: [2, 3, 2, 3, 3] },
  6: { good: 4, evil: 2, teams: [2, 3, 4, 3, 4] },
  7: { good: 4, evil: 3, teams: [2, 3, 3, 4, 4] },
  8: { good: 5, evil: 3, teams: [3, 4, 4, 5, 5] },
  9: { good: 6, evil: 3, teams: [3, 4, 4, 5, 5] },
  10: { good: 6, evil: 4, teams: [3, 4, 4, 5, 5] }
};

export const ROLE_META = {
  merlin: { name: '\uba40\ub9b0', side: 'good', icon: '\ud83e\uddd9', desc: '\ubaa8\ub4dc\ub808\ub4dc\ub97c \uc81c\uc678\ud55c \uc545\uc758 \uc138\ub825\uc744 \uc54c\uace0 \uc2dc\uc791\ud569\ub2c8\ub2e4. \uc815\uccb4\ub97c \ub4e4\ud0a4\uc9c0 \ub9c8\uc138\uc694.' },
  percival: { name: '\ud37c\uc2dc\ubc8c', side: 'good', icon: '\ud83d\udee1\ufe0f', desc: '\uba40\ub9b0\uacfc \ubaa8\ub974\uac00\ub098\ub97c \uba40\ub9b0 \ud6c4\ubcf4\ub85c \ud655\uc778\ud569\ub2c8\ub2e4. \ubaa8\ub974\uac00\ub098\uac00 \uc5c6\uc73c\uba74 \uba40\ub9b0\ub9cc \ubcf4\uc785\ub2c8\ub2e4.' },
  servant: { name: '\ucda9\uc2e0', side: 'good', icon: '\u2694\ufe0f', desc: '\ud2b9\ubcc4\ud55c \uc2dc\uc791 \uc815\ubcf4\ub294 \uc5c6\uc2b5\ub2c8\ub2e4. \ub300\ud654, \ud22c\ud45c, \uc6d0\uc815 \uacb0\uacfc\ub97c \ubc14\ud0d5\uc73c\ub85c \uc545\uc758 \uc138\ub825\uc744 \ucd94\ub9ac\ud558\uc138\uc694.' },
  assassin: { name: '\uc554\uc0b4\uc790', side: 'evil', icon: '\ud83d\udde1\ufe0f', desc: '\uc120\uc758 \uc138\ub825\uc774 \uc6d0\uc815 3\ud68c\ub97c \uc131\uacf5\ud558\uba74 \ub9c8\uc9c0\ub9c9\uc5d0 \uba40\ub9b0\uc744 \uc9c0\ubaa9\ud560 \uc218 \uc788\uc2b5\ub2c8\ub2e4.' },
  morgana: { name: '\ubaa8\ub974\uac00\ub098', side: 'evil', icon: '\ud83d\udd6f\ufe0f', desc: '\ud37c\uc2dc\ubc8c\uc5d0\uac8c \uba40\ub9b0 \ud6c4\ubcf4\ub85c \ubcf4\uc785\ub2c8\ub2e4.' },
  mordred: { name: '\ubaa8\ub4dc\ub808\ub4dc', side: 'evil', icon: '\ud83d\udc09', desc: '\uc545\uc758 \uc138\ub825\uc774\uc9c0\ub9cc \uba40\ub9b0\uc758 \uc2dc\uc57c\uc5d0 \ubcf4\uc774\uc9c0 \uc54a\uc2b5\ub2c8\ub2e4.' },
  oberon: { name: '\uc624\ubca0\ub860', side: 'evil', icon: '\ud83c\udf11', desc: '\ub2e4\ub978 \uc545\uc758 \uc138\ub825\uc744 \ubaa8\ub974\uba70, \ub2e4\ub978 \uc545\uc758 \uc138\ub825\ub3c4 \uc624\ubca0\ub860\uc744 \ubaa8\ub985\ub2c8\ub2e4.' },
  minion: { name: '\ubaa8\ub4dc\ub808\ub4dc\uc758 \ud558\uc218\uc778', side: 'evil', icon: '\ud83e\udd82', desc: '\ub2e4\ub978 \uc545\uc758 \uc138\ub825\uacfc \ud611\ub825\ud574 \uc6d0\uc815\uc744 \uc2e4\ud328\uc2dc\ud0a4\uc138\uc694.' },
  lancelot_good: { name: '\uc120\uc758 \ub780\uc2ac\ub86f', side: 'good', icon: '\ud83d\udc0e', desc: '\uc120\uc758 \uc138\ub825\uc73c\ub85c \uc2dc\uc791\ud558\uba70, \ub780\uc2ac\ub86f \uc9c4\uc601 \ubcc0\uacbd \uce74\ub4dc\uc5d0 \ub530\ub77c \uc9c4\uc601\uc774 \ubc14\ub010 \uc218 \uc788\uc2b5\ub2c8\ub2e4.' },
  lancelot_evil: { name: '\uc545\uc758 \ub780\uc2ac\ub86f', side: 'evil', icon: '\ud83d\udc0e', desc: '\uc545\uc758 \uc138\ub825\uc73c\ub85c \uc2dc\uc791\ud558\uba70, \ub2e4\ub978 \uc545\uc758 \uc138\ub825\uc5d0\uac8c\ub294 \ubcf4\uc774\uc9c0\ub9cc \ubcf8\uc778\uc740 \ub2e4\ub978 \uc545\uc744 \ubcf4\uc9c0 \ubabb\ud569\ub2c8\ub2e4. \uc9c4\uc601 \ubcc0\uacbd \uce74\ub4dc\uc5d0 \ub530\ub77c \uc9c4\uc601\uc774 \ubc14\ub010 \uc218 \uc788\uc2b5\ub2c8\ub2e4.' }
};

export function shuffle(items, random = Math.random) {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function roleSide(player) {
  if (!player) return null;
  return player.currentSide || ROLE_META[player.role]?.side || null;
}

export function validateRoleOptions(playerCount, roleOptions = {}) {
  const rules = PLAYER_RULES[playerCount];
  if (!rules) return '\uac8c\uc784\uc740 5\uba85\ubd80\ud130 10\uba85\uae4c\uc9c0 \uac00\ub2a5\ud569\ub2c8\ub2e4.';
  const goodNeeded = 1 + (roleOptions.percival ? 1 : 0) + (roleOptions.lancelot ? 1 : 0);
  const evilNeeded = 1 + ['morgana', 'mordred', 'oberon'].filter(k => roleOptions[k]).length + (roleOptions.lancelot ? 1 : 0);
  if (goodNeeded > rules.good) return `\ud604\uc7ac ${playerCount}\uc778 \uad6c\uc131\uc5d0\uc11c \uc120 \ud2b9\uc218 \uc5ed\ud560\uc774 \ub108\ubb34 \ub9ce\uc2b5\ub2c8\ub2e4. \ud37c\uc2dc\ubc8c/\ub780\uc2ac\ub86f \uc635\uc158\uc744 \uc904\uc5ec\uc8fc\uc138\uc694.`;
  if (evilNeeded > rules.evil) return `\ud604\uc7ac ${playerCount}\uc778 \uad6c\uc131\uc5d0\uc11c \uc545 \ud2b9\uc218 \uc5ed\ud560\uc774 \ub108\ubb34 \ub9ce\uc2b5\ub2c8\ub2e4. \ubaa8\ub974\uac00\ub098/\ubaa8\ub4dc\ub808\ub4dc/\uc624\ubca0\ub860/\ub780\uc2ac\ub86f \uc635\uc158\uc744 \uc904\uc5ec\uc8fc\uc138\uc694.`;
  if (roleOptions.lancelotKnowEachOther && !roleOptions.lancelot) return '\ub780\uc2ac\ub86f \uc11c\ub85c \ud655\uc778 \uc635\uc158\uc740 \ub780\uc2ac\ub86f \ud655\uc7a5\uc744 \ucf1c\uc57c \uc0ac\uc6a9\ud560 \uc218 \uc788\uc2b5\ub2c8\ub2e4.';
  return null;
}

export function buildRoleList(playerCount, roleOptions = {}) {
  const error = validateRoleOptions(playerCount, roleOptions);
  if (error) throw new Error(error);
  const rules = PLAYER_RULES[playerCount];
  const goodRoles = ['merlin'];
  if (roleOptions.percival) goodRoles.push('percival');
  if (roleOptions.lancelot) goodRoles.push('lancelot_good');
  while (goodRoles.length < rules.good) goodRoles.push('servant');

  const evilRoles = ['assassin'];
  for (const key of ['morgana', 'mordred', 'oberon']) if (roleOptions[key]) evilRoles.push(key);
  if (roleOptions.lancelot) evilRoles.push('lancelot_evil');
  while (evilRoles.length < rules.evil) evilRoles.push('minion');
  return [...goodRoles, ...evilRoles];
}

export function privateRolePayload(players, player, roleOptions = {}) {
  if (!player?.role) return null;
  const meta = ROLE_META[player.role];
  if (!meta) throw new Error(`Unknown role: ${player.role}`);
  const current = roleSide(player);
  const payload = {
    role: player.role,
    name: meta.name,
    icon: meta.icon,
    side: current,
    initialSide: meta.side,
    isLancelot: player.role === 'lancelot_good' || player.role === 'lancelot_evil',
    description: meta.desc,
    knownPlayers: []
  };
  if (payload.isLancelot) payload.description += ` \ud604\uc7ac \uc9c4\uc601: ${current === 'good' ? '\uc120' : '\uc545'}.`;

  if (player.role === 'merlin') {
    payload.knownPlayers = players
      .filter(p => ROLE_META[p.role]?.side === 'evil' && p.role !== 'mordred')
      .map(p => ({ clientId: p.clientId, name: p.name, hint: '\uc545\uc758 \uc138\ub825' }));
  } else if (player.role === 'percival') {
    const hasMorgana = players.some(p => p.role === 'morgana');
    payload.knownPlayers = players
      .filter(p => p.role === 'merlin' || (hasMorgana && p.role === 'morgana'))
      .map(p => ({ clientId: p.clientId, name: p.name, hint: hasMorgana ? '\uba40\ub9b0 \ub610\ub294 \ubaa8\ub974\uac00\ub098' : '\uba40\ub9b0' }));
  } else if (meta.side === 'evil' && player.role !== 'oberon' && player.role !== 'lancelot_evil') {
    payload.knownPlayers = players
      .filter(p => p.clientId !== player.clientId && ROLE_META[p.role]?.side === 'evil' && p.role !== 'oberon')
      .map(p => ({ clientId: p.clientId, name: p.name, hint: '\uac19\uc740 \uc545\uc758 \uc138\ub825' }));
  }

  if (roleOptions.lancelotKnowEachOther && payload.isLancelot) {
    const other = players.find(p => p.clientId !== player.clientId && (p.role === 'lancelot_good' || p.role === 'lancelot_evil'));
    if (other && !payload.knownPlayers.some(p => p.clientId === other.clientId)) {
      payload.knownPlayers.push({ clientId: other.clientId, name: other.name, hint: '\ub2e4\ub978 \ub780\uc2ac\ub86f' });
    }
  }
  return payload;
}

export function missionSucceeded({ playerCount, missionNo, failCount }) {
  const needsTwoFails = playerCount >= 7 && missionNo === 4;
  return { needsTwoFails, success: needsTwoFails ? failCount < 2 : failCount === 0 };
}

export function cleanName(name) {
  return String(name || '').replace(/\s+/g, ' ').trim().slice(0, 18);
}

export function makeResumeToken() {
  return `${crypto.randomUUID().replaceAll('-', '')}${crypto.randomUUID().replaceAll('-', '')}`;
}

export function createRoomState({ code, clientId, name, resumeToken = makeResumeToken(), now = Date.now() }) {
  return {
    code,
    createdAt: now,
    updatedAt: now,
    hostClientId: clientId,
    players: [{
      clientId, name, socketId: null, connected: false, ready: false, role: null, currentSide: null, isParticipant: true, isBot: false,
      resumeToken, everConnected: false, joinedAt: now
    }],
    phase: 'lobby',
    playerLimit: 5,
    missionNo: 1,
    leaderIndex: 0,
    missionScores: { good: 0, evil: 0 },
    rejectionCount: 0,
    currentTeam: [],
    teamVotes: {},
    missionVotes: {},
    lastTeamVote: null,
    lastMissionResult: null,
    history: [],
    winner: null,
    winnerReason: null,
    assassinClientId: null,
    roleOptions: {
      percival: true,
      morgana: false,
      mordred: true,
      oberon: false,
      ladyOfLake: false,
      lancelot: false,
      lancelotKnowEachOther: false,
      excalibur: false
    },
    lady: { holderClientId: null, holders: [], uses: 0, lastInspection: null },
    lancelotDeck: [],
    lancelotDrawIndex: 0,
    lastLancelotCard: null,
    excaliburHolderClientId: null,
    lastExcalibur: null,
    postMission: null,
    narrationSeq: 0,
    botSpeechSeq: 0,
    pendingTransition: null,
    blockedClientIds: {}
  };
}
