import { fail, requirePlayer, shuffle, timer, tally, nameOf, pick } from './util.js';

const NIGHT_MS = 35000;
const VOTE_MS = 25000;
const DEFENSE_MS = 20000;
const CONFIRM_MS = 12000;
export const ROLE_NAMES = { mafia: '마피아', police: '경찰', doctor: '의사', citizen: '시민' };

const alivePlayers = (s) => s.players.filter((p) => s.alive[p.id]);
const aliveIds = (s) => alivePlayers(s).map((p) => p.id);
const mafiaAlive = (s) => alivePlayers(s).filter((p) => s.roles[p.id] === 'mafia').map((p) => p.id);

function setPhase(s, phase, ms, ctx) {
  s.phase = phase;
  s.deadline = ctx.now + ms;
  s.timer = timer(ms, ctx.now);
}

function checkWin(s) {
  const m = mafiaAlive(s).length;
  const others = alivePlayers(s).length - m;
  const mafiaIds = s.players.filter((p) => s.roles[p.id] === 'mafia').map((p) => p.id);
  if (m === 0) {
    s.over = { winners: s.players.filter((p) => s.roles[p.id] !== 'mafia').map((p) => p.id), text: '마피아를 모두 찾았어요! 시민 팀 승리!' };
    return true;
  }
  if (m >= others) {
    s.over = { winners: mafiaIds, text: `마피아 팀 승리! (마피아: ${mafiaIds.map((id) => nameOf(s, id)).join(', ')})` };
    return true;
  }
  return false;
}

function startNight(s, ctx) {
  s.night = { kills: {}, save: null, check: null };
  s.votes = {};
  s.confirm = {};
  s.accused = null;
  setPhase(s, 'night', NIGHT_MS, ctx);
  ctx.sys?.(`🌙 ${s.day}번째 밤이 되었어요. 마피아, 의사, 경찰은 능력을 사용하세요.`);
}

function nightActors(s) {
  const out = [];
  for (const p of alivePlayers(s)) {
    const r = s.roles[p.id];
    if (r === 'mafia' && s.night.kills[p.id] == null) out.push(p.id);
    if (r === 'doctor' && s.night.save == null) out.push(p.id);
    if (r === 'police' && s.night.check == null) out.push(p.id);
  }
  return out;
}

// 모두 행동하면 잠시 뒤 아침이 와요 (바로 끝나면 누가 살아 있는지 티가 나요)
function endNightSoon(s, ctx) {
  if (s.deadline - ctx.now > 4000) {
    s.deadline = ctx.now + 4000;
    s.timer = timer(4000, ctx.now);
  }
}

function resolveNight(s, ctx) {
  const t = tally(s.night.kills);
  const target = t.top.length ? pick(t.top, ctx.rng) : null;
  let killed = null, saved = false;
  if (target) {
    if (target === s.night.save) saved = true;
    else {
      s.alive[target] = false;
      killed = target;
    }
  }
  s.lastNight = { killed, saved, day: s.day };
  if (killed) ctx.sys?.(`☀️ 아침이 밝았어요. 지난밤 ${nameOf(s, killed)}님이 마피아에게 당했어요...`);
  else if (saved) ctx.sys?.('☀️ 아침이 밝았어요. 의사가 마피아의 공격으로부터 누군가를 살렸어요!');
  else ctx.sys?.('☀️ 아침이 밝았어요. 지난밤에는 아무 일도 없었어요.');
  if (checkWin(s)) return;
  s.skip = {};
  setPhase(s, 'day', s.discussMs, ctx);
}

function startVote(s, ctx) {
  s.votes = {};
  setPhase(s, 'vote', VOTE_MS, ctx);
  ctx.sys?.('🗳️ 투표 시간! 마피아로 의심되는 사람에게 투표하세요.');
}

function resolveVote(s, ctx) {
  const t = tally(s.votes);
  s.voteCount = t.count;
  if (t.top.length !== 1) {
    ctx.sys?.('표가 갈려서 아무도 지목되지 않았어요.');
    s.day++;
    startNight(s, ctx);
    return;
  }
  s.accused = t.top[0];
  s.confirm = {};
  ctx.sys?.(`⚖️ ${nameOf(s, s.accused)}님이 지목되었어요. 최후의 변론을 들어 보세요.`);
  setPhase(s, 'defense', DEFENSE_MS, ctx);
}

function resolveConfirm(s, ctx) {
  const yes = Object.values(s.confirm).filter((v) => v === true).length;
  const no = Object.values(s.confirm).filter((v) => v === false).length;
  s.confirmResult = { yes, no };
  if (yes > no) {
    s.alive[s.accused] = false;
    s.executed = s.accused;
    ctx.sys?.(`🔨 찬성 ${yes} : 반대 ${no} — ${nameOf(s, s.accused)}님이 처형되었어요.`);
    if (checkWin(s)) return;
  } else ctx.sys?.(`🕊️ 찬성 ${yes} : 반대 ${no} — ${nameOf(s, s.accused)}님이 살아남았어요.`);
  s.day++;
  startNight(s, ctx);
}

function action(s, pid, a, ctx) {
  requirePlayer(s, pid);
  if (s.over) fail('게임이 끝났어요.');
  if (!s.alive[pid]) fail('죽은 사람은 행동할 수 없어요.');
  const role = s.roles[pid];
  const target = a.target;
  const validTarget = () => {
    if (!s.players.some((p) => p.id === target) || !s.alive[target]) fail('살아 있는 사람을 골라 주세요.');
  };
  if (a.type === 'night') {
    if (s.phase !== 'night') fail('밤에만 할 수 있어요.');
    validTarget();
    if (role === 'mafia') {
      if (s.roles[target] === 'mafia') fail('같은 마피아는 고를 수 없어요.');
      s.night.kills[pid] = target;
    } else if (role === 'doctor') {
      if (s.night.save != null) fail('이미 살릴 사람을 정했어요.');
      s.night.save = target;
    } else if (role === 'police') {
      if (s.night.check != null) fail('오늘 밤은 이미 조사했어요.');
      if (target === pid) fail('자기 자신은 조사할 수 없어요.');
      s.night.check = target;
      s.policeLog.push({ target, mafia: s.roles[target] === 'mafia', day: s.day });
    } else fail('시민은 밤에 할 일이 없어요. 푹 주무세요!');
    if (!nightActors(s).length) endNightSoon(s, ctx);
  } else if (a.type === 'skip') {
    if (s.phase !== 'day') fail('지금은 할 수 없어요.');
    s.skip[pid] = true;
    if (Object.keys(s.skip).filter((id) => s.alive[id]).length > alivePlayers(s).length / 2) startVote(s, ctx);
  } else if (a.type === 'vote') {
    if (s.phase !== 'vote') fail('투표 시간이 아니에요.');
    if (target === null || target === 'none') s.votes[pid] = '';
    else {
      validTarget();
      if (target === pid) fail('자기 자신에게는 투표할 수 없어요.');
      s.votes[pid] = target;
    }
    if (aliveIds(s).every((id) => s.votes[id] != null)) resolveVote(s, ctx);
  } else if (a.type === 'confirm') {
    if (s.phase !== 'confirm') fail('찬반 투표 시간이 아니에요.');
    if (pid === s.accused) fail('지목된 사람은 투표할 수 없어요.');
    s.confirm[pid] = !!a.yes;
    if (aliveIds(s).filter((id) => id !== s.accused).every((id) => s.confirm[id] != null)) resolveConfirm(s, ctx);
  } else fail('알 수 없는 동작이에요.');
}

export default {
  setup(players, opts, ctx) {
    const ps = players.map((p) => ({ id: p.id, name: p.name }));
    const n = ps.length;
    const mafiaN = n <= 5 ? 1 : n <= 8 ? 2 : 3;
    const deck = [];
    for (let i = 0; i < mafiaN; i++) deck.push('mafia');
    deck.push('police');
    if (n >= 5) deck.push('doctor');
    while (deck.length < n) deck.push('citizen');
    shuffle(deck, ctx.rng);
    const roles = {}, alive = {};
    ps.forEach((p, i) => { roles[p.id] = deck[i]; alive[p.id] = true; });
    const s = {
      players: ps, roles, alive, day: 1, phase: 'night', night: null, policeLog: [], votes: {}, confirm: {},
      voteCount: null, confirmResult: null, accused: null, executed: null, lastNight: null, skip: {},
      discussMs: (Number(opts.discuss) || 90) * 1000, over: null,
    };
    ctx.sys?.(`🕵️ 역할이 정해졌어요! 마피아 ${mafiaN}명, 경찰 1명${n >= 5 ? ', 의사 1명' : ''}이 숨어 있어요.`);
    startNight(s, ctx);
    return s;
  },
  actors(s) {
    if (s.over) return [];
    if (s.phase === 'night') return nightActors(s);
    if (s.phase === 'vote') return aliveIds(s).filter((id) => s.votes[id] == null);
    if (s.phase === 'confirm') return aliveIds(s).filter((id) => id !== s.accused && s.confirm[id] == null);
    return [];
  },
  action,
  auto: () => null,
  timeout(s, ctx) {
    if (s.phase === 'night') resolveNight(s, ctx);
    else if (s.phase === 'day') startVote(s, ctx);
    else if (s.phase === 'vote') resolveVote(s, ctx);
    else if (s.phase === 'defense') {
      setPhase(s, 'confirm', CONFIRM_MS, ctx);
      ctx.sys?.(`${nameOf(s, s.accused)}님을 처형할까요? 찬반 투표를 해 주세요.`);
    } else if (s.phase === 'confirm') resolveConfirm(s, ctx);
  },
  leave(s, pid, ctx) {
    if (!s.alive[pid]) return;
    s.alive[pid] = false;
    ctx.sys?.(`${nameOf(s, pid)}님이 게임을 떠났어요.`);
    if (checkWin(s)) return;
    if (s.phase === 'night' && !nightActors(s).length) endNightSoon(s, ctx);
    else if (s.phase === 'vote' && aliveIds(s).every((id) => s.votes[id] != null)) resolveVote(s, ctx);
    else if ((s.phase === 'defense' || s.phase === 'confirm') && s.accused === pid) {
      s.day++;
      startNight(s, ctx);
    }
  },
  chat(s, pid) {
    if (s.over) return;
    const isPlayer = s.players.some((p) => p.id === pid);
    const deadAndWatchers = { ch: 'dead', to: s.players.filter((p) => !s.alive[p.id]).map((p) => p.id), spect: true };
    if (!isPlayer || !s.alive[pid]) return deadAndWatchers;
    if (s.phase === 'night') {
      if (s.roles[pid] === 'mafia') return { ch: 'mafia', to: mafiaAlive(s) };
      fail('밤에는 마피아만 대화할 수 있어요. 🌙');
    }
    if (s.phase === 'defense' && pid !== s.accused) fail('최후의 변론 중에는 지목된 사람만 말할 수 있어요.');
    return undefined;
  },
  view(s, pid) {
    const isPlayer = s.players.some((p) => p.id === pid);
    const role = isPlayer ? s.roles[pid] : null;
    const seeAll = !!s.over || (isPlayer && !s.alive[pid]);
    const roles = {};
    for (const p of s.players) {
      if (seeAll || p.id === pid || (role === 'mafia' && s.roles[p.id] === 'mafia')) roles[p.id] = s.roles[p.id];
    }
    let myNight = null;
    if (s.phase === 'night' && isPlayer && s.alive[pid]) {
      if (role === 'mafia') myNight = s.night.kills[pid] ?? null;
      if (role === 'doctor') myNight = s.night.save;
      if (role === 'police') myNight = s.night.check;
    }
    const voteCounts = {};
    for (const t of Object.values(s.votes || {})) if (t) voteCounts[t] = (voteCounts[t] || 0) + 1;
    return {
      players: s.players, alive: s.alive, phase: s.phase, day: s.day, role, roles, isPlayer,
      mafiaPicks: role === 'mafia' && s.phase === 'night' ? s.night.kills : null,
      myNight, policeLog: role === 'police' || seeAll ? s.policeLog : null,
      voteCounts: s.phase === 'vote' ? voteCounts : null, voted: Object.keys(s.votes || {}), myVote: s.votes?.[pid] ?? null,
      accused: s.accused, confirmed: Object.keys(s.confirm || {}), myConfirm: s.confirm?.[pid] ?? null,
      confirmResult: s.confirmResult, lastNight: s.lastNight, skip: Object.keys(s.skip || {}), timer: s.timer, over: s.over,
    };
  },
};
