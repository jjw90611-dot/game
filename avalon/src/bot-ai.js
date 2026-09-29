import { ROLE_META, roleSide } from './game-core.js';

export const BOT_PERSONAS = [
  { key: 'gawain', name: '가웨인', voiceProfile: 0, temperament: 'direct' },
  { key: 'tristan', name: '트리스탄', voiceProfile: 1, temperament: 'calm' },
  { key: 'kay', name: '케이', voiceProfile: 2, temperament: 'skeptical' },
  { key: 'bedivere', name: '베디비어', voiceProfile: 3, temperament: 'measured' },
  { key: 'bors', name: '보르스', voiceProfile: 4, temperament: 'bold' },
  { key: 'lionel', name: '라이오넬', voiceProfile: 5, temperament: 'quiet' },
  { key: 'ector', name: '엑터', voiceProfile: 6, temperament: 'veteran' },
  { key: 'lucan', name: '루칸', voiceProfile: 7, temperament: 'careful' },
  { key: 'agravain', name: '아그라베인', voiceProfile: 8, temperament: 'sharp' }
];

function hashText(text) {
  let h = 2166136261;
  for (const ch of String(text || '')) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function botRoll(room, bot, salt = '') {
  const seed = `${room.code}|${room.missionNo}|${room.history?.length || 0}|${room.rejectionCount || 0}|${bot?.clientId || ''}|${salt}`;
  return (hashText(seed) % 10000) / 10000;
}

export function nextBotPersona(players = []) {
  const used = new Set(players.filter(p => p.isBot).map(p => p.botPersonaKey));
  return BOT_PERSONAS.find(p => !used.has(p.key)) || BOT_PERSONAS[(players.filter(p => p.isBot).length) % BOT_PERSONAS.length];
}

export function knownEvilIds(room, bot) {
  const players = room.players.filter(p => p.isParticipant && p.role);
  const ids = new Set();
  if (!bot?.role) return ids;
  if (bot.role === 'merlin') {
    for (const p of players) if (ROLE_META[p.role]?.side === 'evil' && p.role !== 'mordred') ids.add(p.clientId);
    return ids;
  }
  if (ROLE_META[bot.role]?.side === 'evil') {
    ids.add(bot.clientId);
    if (bot.role === 'oberon' || bot.role === 'lancelot_evil') return ids;
    for (const p of players) {
      if (p.clientId !== bot.clientId && ROLE_META[p.role]?.side === 'evil' && p.role !== 'oberon') ids.add(p.clientId);
    }
  }
  return ids;
}

export function percivalCandidateIds(room, bot) {
  const ids = new Set();
  if (bot?.role !== 'percival') return ids;
  const hasMorgana = room.players.some(p => p.isParticipant && p.role === 'morgana');
  for (const p of room.players) {
    if (!p.isParticipant) continue;
    if (p.role === 'merlin' || (hasMorgana && p.role === 'morgana')) ids.add(p.clientId);
  }
  return ids;
}

export function suspicionScores(room, bot) {
  const players = room.players.filter(p => p.isParticipant);
  const scores = Object.fromEntries(players.map(p => [p.clientId, 0]));
  const knownEvil = knownEvilIds(room, bot);
  const percivalCandidates = percivalCandidateIds(room, bot);
  const currentSide = roleSide(bot);

  for (const p of players) {
    if (p.clientId === bot.clientId) scores[p.clientId] -= 1.5;
    if (currentSide === 'good' && knownEvil.has(p.clientId)) scores[p.clientId] += 100;
    if (currentSide === 'evil' && knownEvil.has(p.clientId)) scores[p.clientId] -= 40;
    if (bot.role === 'percival' && percivalCandidates.has(p.clientId)) scores[p.clientId] -= 3.5;
  }

  for (const h of room.history || []) {
    if (h.type === 'mission') {
      const team = Array.isArray(h.team) ? h.team : [];
      if (h.missionSucceeded && Number(h.fails || 0) === 0) {
        for (const id of team) if (id in scores) scores[id] -= 1.1;
      } else if (h.missionSucceeded && Number(h.fails || 0) > 0) {
        for (const id of team) if (id in scores) scores[id] += 1.8;
      } else {
        for (const id of team) if (id in scores) scores[id] += 3.3;
      }
    }
    if (h.type === 'teamVote') {
      const team = Array.isArray(h.team) ? h.team : [];
      const failedLater = false;
      if (h.leaderClientId && h.leaderClientId in scores && team.length) scores[h.leaderClientId] += failedLater ? 0.5 : 0;
    }
  }

  return scores;
}

function byScoreThenId(scores, a, b) {
  const diff = (scores[a.clientId] || 0) - (scores[b.clientId] || 0);
  return diff || String(a.clientId).localeCompare(String(b.clientId));
}

export function chooseBotTeam(room, bot, teamSize) {
  const players = room.players.filter(p => p.isParticipant);
  const scores = suspicionScores(room, bot);
  const side = roleSide(bot);
  if (side === 'good') {
    return players.slice().sort((a, b) => byScoreThenId(scores, a, b)).slice(0, teamSize).map(p => p.clientId);
  }

  const knownEvil = knownEvilIds(room, bot);
  const chosen = [];
  if (players.some(p => p.clientId === bot.clientId)) chosen.push(bot.clientId);

  const needsTwo = players.length >= 7 && room.missionNo === 4;
  if (needsTwo) {
    const ally = players.find(p => p.clientId !== bot.clientId && knownEvil.has(p.clientId));
    if (ally && chosen.length < teamSize) chosen.push(ally.clientId);
  }

  const cover = players
    .filter(p => !chosen.includes(p.clientId) && !knownEvil.has(p.clientId))
    .sort((a, b) => byScoreThenId(scores, a, b));
  for (const p of cover) if (chosen.length < teamSize) chosen.push(p.clientId);

  const rest = players
    .filter(p => !chosen.includes(p.clientId))
    .sort((a, b) => byScoreThenId(scores, a, b));
  for (const p of rest) if (chosen.length < teamSize) chosen.push(p.clientId);
  return chosen.slice(0, teamSize);
}

export function decideBotTeamVote(room, bot) {
  const players = room.players.filter(p => p.isParticipant);
  if (room.rejectionCount >= 4) return roleSide(bot) === 'good';
  const scores = suspicionScores(room, bot);
  const team = room.currentTeam || [];
  if (roleSide(bot) === 'good') {
    if (bot.role === 'merlin' && team.some(id => knownEvilIds(room, bot).has(id))) return false;
    const avg = team.reduce((s, id) => s + (scores[id] || 0), 0) / Math.max(1, team.length);
    return avg < 3.2;
  }
  const knownEvil = knownEvilIds(room, bot);
  const hasUs = team.some(id => knownEvil.has(id));
  if (hasUs) return true;
  return botRoll(room, bot, 'team-vote') > 0.72;
}

export function decideBotMissionVote(room, bot) {
  if (roleSide(bot) === 'good') return true;
  const teamBots = room.players
    .filter(p => p.isParticipant && p.isBot && room.currentTeam.includes(p.clientId) && roleSide(p) === 'evil')
    .sort((a, b) => String(a.clientId).localeCompare(String(b.clientId)));
  const mustStopGood = room.missionScores.good >= 2;
  const canWinNow = room.missionScores.evil >= 2;
  const needsTwo = room.players.filter(p => p.isParticipant).length >= 7 && room.missionNo === 4;
  const rank = teamBots.findIndex(p => p.clientId === bot.clientId);
  const requiredBotFails = needsTwo ? Math.min(2, teamBots.length) : Math.min(1, teamBots.length);
  if (rank >= 0 && rank < requiredBotFails) {
    if (!mustStopGood && !canWinNow && room.missionNo === 1 && teamBots.length === 1 && botRoll(room, bot, 'hide-first') < 0.22) return true;
    return false;
  }
  return true;
}

export function chooseBotAssassinationTarget(room, assassin) {
  const players = room.players.filter(p => p.isParticipant && p.clientId !== assassin.clientId);
  const knownEvil = knownEvilIds(room, assassin);
  const candidates = players.filter(p => !knownEvil.has(p.clientId));
  const score = Object.fromEntries(candidates.map(p => [p.clientId, 0]));

  for (const h of room.history || []) {
    if (h.type !== 'teamVote') continue;
    const team = Array.isArray(h.team) ? h.team : [];
    const containsKnownEvil = team.some(id => knownEvil.has(id));
    if (h.leaderClientId && h.leaderClientId in score) score[h.leaderClientId] += containsKnownEvil ? -0.8 : 2.5;
    for (const vote of h.votes || []) {
      if (!(vote.clientId in score)) continue;
      if (containsKnownEvil && vote.approve === false) score[vote.clientId] += 1.3;
      if (!containsKnownEvil && vote.approve === true) score[vote.clientId] += 0.7;
    }
  }

  for (const h of room.history || []) {
    if (h.type !== 'mission' || !h.missionSucceeded) continue;
    for (const id of h.team || []) if (id in score) score[id] += 0.35;
  }

  return candidates.sort((a, b) => (score[b.clientId] || 0) - (score[a.clientId] || 0) || String(a.clientId).localeCompare(String(b.clientId)))[0] || players[0] || null;
}

export function chooseBotLadyTarget(room, bot) {
  const scores = suspicionScores(room, bot);
  const eligible = room.players.filter(p => p.isParticipant && !room.lady.holders.includes(p.clientId));
  return eligible.sort((a, b) => (scores[b.clientId] || 0) - (scores[a.clientId] || 0) || String(a.clientId).localeCompare(String(b.clientId)))[0] || null;
}

export function chooseBotExcaliburRecipient(room, bot) {
  const scores = suspicionScores(room, bot);
  const candidates = room.players.filter(p => p.isParticipant && room.currentTeam.includes(p.clientId) && p.clientId !== bot.clientId);
  return candidates.sort((a, b) => byScoreThenId(scores, a, b))[0] || null;
}

export function chooseBotExcaliburTarget(room, bot) {
  const scores = suspicionScores(room, bot);
  const candidates = room.players.filter(p => p.isParticipant && room.currentTeam.includes(p.clientId) && p.clientId !== bot.clientId);
  if (!candidates.length) return null;
  if (roleSide(bot) === 'good') {
    const suspicious = candidates.sort((a, b) => (scores[b.clientId] || 0) - (scores[a.clientId] || 0))[0];
    return (scores[suspicious.clientId] || 0) >= 2.2 ? suspicious : null;
  }
  const cover = candidates.filter(p => !knownEvilIds(room, bot).has(p.clientId));
  return cover[0] || candidates[0];
}

function names(room, ids) {
  return ids.map(id => room.players.find(p => p.clientId === id)?.name).filter(Boolean).join(', ');
}

export function proposalSpeech(room, bot, team) {
  const scores = suspicionScores(room, bot);
  const high = room.players.filter(p => p.isParticipant && !team.includes(p.clientId)).sort((a, b) => (scores[b.clientId] || 0) - (scores[a.clientId] || 0))[0];
  const roster = names(room, team);
  const lines = roleSide(bot) === 'evil'
    ? [
        `이번 원정은 ${roster} 조합으로 가겠습니다. 제 선택은 충분히 설명 가능한 구성입니다.`,
        `${roster}로 제안합니다. 지금 단계에서는 근거 없는 의심보다 실제 결과를 한 번 더 보는 게 낫습니다.`,
        `저는 ${roster} 조합이 가장 안정적이라고 봅니다. 저를 악으로 단정할 근거는 아직 없습니다.`
      ]
    : [
        `이번에는 ${roster}로 가보겠습니다.${high ? ` ${high.name}님은 일단 한 번 빼고 보죠.` : ''}`,
        `${roster} 조합을 제안합니다. 지금까지 나온 원정 결과를 기준으로 위험한 조합을 줄였습니다.`,
        `제 판단은 ${roster}입니다. 성공했던 흐름은 살리고 실패했던 조합은 피하겠습니다.`
      ];
  return lines[Math.floor(botRoll(room, bot, 'proposal-speech') * lines.length) % lines.length];
}

export function voteSpeech(room, bot, approve) {
  const scores = suspicionScores(room, bot);
  const suspect = room.players.filter(p => p.isParticipant && room.currentTeam.includes(p.clientId) && p.clientId !== bot.clientId).sort((a, b) => (scores[b.clientId] || 0) - (scores[a.clientId] || 0))[0];
  if (approve) return suspect && (scores[suspect.clientId] || 0) > 2.5
    ? `찬성은 했지만 ${suspect.name}님은 계속 지켜보겠습니다. 이번 결과가 중요합니다.`
    : '저는 이 원정대에 찬성했습니다. 결과를 보고 다음 판단을 이어가죠.';
  return suspect ? `저는 반대했습니다. 특히 ${suspect.name}님이 포함된 구성이 아직 불안합니다.` : '저는 이 구성에는 반대입니다. 한 번 더 조합을 바꿔보는 게 좋겠습니다.';
}

export function missionReactionSpeech(room, bot) {
  const result = room.lastMissionResult;
  if (!result || !result.team.includes(bot.clientId)) return null;
  const scores = suspicionScores(room, bot);
  const others = room.players.filter(p => p.isParticipant && result.team.includes(p.clientId) && p.clientId !== bot.clientId);
  const frame = others.sort((a, b) => (scores[b.clientId] || 0) - (scores[a.clientId] || 0))[0];
  if (!result.missionSucceeded) {
    if (roleSide(bot) === 'evil') return `저는 성공을 냈습니다. ${frame ? `${frame.name}님 쪽도 다시 확인해야 합니다.` : '이 원정대 안의 다른 사람을 다시 봐야 합니다.'}`;
    return `저는 성공 카드였습니다. ${frame ? `${frame.name}님을 포함한 이번 조합은 다시 검증해야 합니다.` : '이번 원정대 안에 악이 섞여 있습니다.'}`;
  }
  if (roleSide(bot) === 'evil') return '이번 원정은 성공했지만, 성공 한 번으로 누구도 선이라고 확정할 수는 없습니다. 다음 조합도 봐야 합니다.';
  return '이번 원정은 깔끔하게 성공했습니다. 이 조합은 다음 추리에서 참고할 가치가 있습니다.';
}

export function assassinationSpeech(room, assassin, target) {
  const lines = [
    `제 최종 추리는 ${target.name}님입니다. 선의 선택을 너무 정확하게 피한 흐름이 멀린처럼 보였습니다.`,
    `${target.name}님을 멀린으로 지목하겠습니다. 투표와 원정대 선택에서 정보가 있는 사람처럼 움직였습니다.`,
    `마지막 선택은 ${target.name}님입니다. 지금까지의 원정 흐름에서 가장 멀린다운 판단을 보여줬습니다.`
  ];
  return lines[Math.floor(botRoll(room, assassin, 'assassin-speech') * lines.length) % lines.length];
}
