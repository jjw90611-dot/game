import { fail, requirePlayer, shuffle, timer, nameOf, pick } from './util.js';

// 인원별 원정대 크기와 악의 수
export const SIZES = { 5: [2, 3, 2, 3, 3], 6: [2, 3, 4, 3, 4], 7: [2, 3, 3, 4, 4], 8: [3, 4, 4, 5, 5], 9: [3, 4, 4, 5, 5], 10: [3, 4, 4, 5, 5] };
const EVIL_N = { 5: 2, 6: 2, 7: 3, 8: 3, 9: 3, 10: 4 };
export const ROLE_INFO = {
  merlin: { name: '멀린', side: 'good' },
  percival: { name: '퍼시벌', side: 'good' },
  servant: { name: '원탁의 기사', side: 'good' },
  assassin: { name: '암살자', side: 'evil' },
  morgana: { name: '모르가나', side: 'evil' },
  minion: { name: '모드레드의 부하', side: 'evil' },
};
const TEAM_MS = 90000, VOTE_MS = 30000, QUEST_MS = 30000, ASSASSIN_MS = 90000;

const side = (s, pid) => ROLE_INFO[s.roles[pid]].side;
const size = (s) => SIZES[s.players.length][s.quest];
const need2 = (s) => s.players.length >= 7 && s.quest === 3;

function setPhase(s, phase, ms, ctx) {
  s.phase = phase;
  s.deadline = ctx.now + ms;
  s.timer = timer(ms, ctx.now);
}

function evilWins(s, why) {
  s.over = { winners: s.players.filter((p) => side(s, p.id) === 'evil').map((p) => p.id), text: `${why} 악의 편 승리!` };
}

function goodWins(s, why) {
  s.over = { winners: s.players.filter((p) => side(s, p.id) === 'good').map((p) => p.id), text: `${why} 선의 편 승리!` };
}

function newTeamPhase(s, ctx) {
  s.team = [];
  s.picking = [];
  s.votes = {};
  s.qvotes = {};
  setPhase(s, 'team', TEAM_MS, ctx);
}

function nextLeader(s) {
  s.leader = (s.leader + 1) % s.players.length;
}

function resolveVote(s, ctx) {
  const n = s.players.length;
  const yes = Object.values(s.votes).filter(Boolean).length;
  const approved = yes > n / 2;
  s.history.push({ quest: s.quest, leader: s.players[s.leader].id, team: s.team.slice(), votes: { ...s.votes }, approved, fails: null });
  if (approved) {
    ctx.sys?.(`✅ 찬성 ${yes} : 반대 ${n - yes} — 원정대가 출발해요!`);
    s.rejects = 0;
    s.qvotes = {};
    setPhase(s, 'quest', QUEST_MS, ctx);
  } else {
    s.rejects++;
    ctx.sys?.(`❌ 찬성 ${yes} : 반대 ${n - yes} — 부결되었어요. (연속 부결 ${s.rejects}/5)`);
    if (s.rejects >= 5) {
      evilWins(s, '원정대 구성이 5번 연속 부결되었어요.');
      return;
    }
    nextLeader(s);
    newTeamPhase(s, ctx);
  }
}

function resolveQuest(s, ctx) {
  const fails = s.team.filter((id) => s.qvotes[id] === false).length;
  const failed = fails >= (need2(s) ? 2 : 1);
  s.results.push(!failed);
  s.history[s.history.length - 1].fails = fails;
  ctx.sys?.(failed ? `💥 ${s.quest + 1}번째 원정 실패! (실패 카드 ${fails}장)` : `🏆 ${s.quest + 1}번째 원정 성공! (실패 카드 ${fails}장)`);
  const ok = s.results.filter(Boolean).length;
  const bad = s.results.length - ok;
  if (bad >= 3) {
    evilWins(s, '원정이 3번 실패했어요.');
    return;
  }
  if (ok >= 3) {
    ctx.sys?.('🗡️ 원정 3번 성공! 암살자가 멀린을 찾아 암살할 수 있어요.');
    setPhase(s, 'assassin', ASSASSIN_MS, ctx);
    return;
  }
  s.quest++;
  nextLeader(s);
  newTeamPhase(s, ctx);
}

function action(s, pid, a, ctx) {
  requirePlayer(s, pid);
  if (s.over) fail('게임이 끝났어요.');
  const isLeader = s.players[s.leader].id === pid;
  if (a.type === 'pick') {
    if (s.phase !== 'team' || !isLeader) fail('대표만 고를 수 있어요.');
    const ids = Array.isArray(a.pids) ? [...new Set(a.pids)].filter((id) => s.players.some((p) => p.id === id)) : [];
    s.picking = ids.slice(0, size(s));
  } else if (a.type === 'team') {
    if (s.phase !== 'team' || !isLeader) fail('대표만 원정대를 정할 수 있어요.');
    const ids = Array.isArray(a.pids) ? [...new Set(a.pids)] : [];
    if (ids.length !== size(s)) fail(`원정대는 ${size(s)}명이어야 해요.`);
    if (ids.some((id) => !s.players.some((p) => p.id === id))) fail('잘못된 참가자예요.');
    s.team = ids;
    s.picking = ids.slice();
    s.votes = {};
    ctx.sys?.(`🛡️ ${nameOf(s, pid)}님이 원정대를 골랐어요: ${ids.map((id) => nameOf(s, id)).join(', ')}`);
    setPhase(s, 'vote', VOTE_MS, ctx);
  } else if (a.type === 'vote') {
    if (s.phase !== 'vote') fail('투표 시간이 아니에요.');
    if (s.votes[pid] != null) fail('이미 투표했어요.');
    s.votes[pid] = !!a.approve;
    if (s.players.every((p) => s.votes[p.id] != null)) resolveVote(s, ctx);
  } else if (a.type === 'quest') {
    if (s.phase !== 'quest' || !s.team.includes(pid)) fail('원정대원만 낼 수 있어요.');
    if (s.qvotes[pid] != null) fail('이미 카드를 냈어요.');
    if (!a.success && side(s, pid) === 'good') fail('선의 편은 성공 카드만 낼 수 있어요.');
    s.qvotes[pid] = !!a.success;
    if (s.team.every((id) => s.qvotes[id] != null)) resolveQuest(s, ctx);
  } else if (a.type === 'assassinate') {
    if (s.phase !== 'assassin' || s.roles[pid] !== 'assassin') fail('암살자만 할 수 있어요.');
    const t = s.players.find((p) => p.id === a.target);
    if (!t) fail('대상을 골라 주세요.');
    if (side(s, t.id) === 'evil') fail('선의 편 중에서 골라 주세요.');
    s.assassinated = t.id;
    if (s.roles[t.id] === 'merlin') evilWins(s, `암살자가 멀린(${t.name})을 찾아냈어요!`);
    else goodWins(s, `암살자가 고른 ${t.name}님은 멀린이 아니었어요!`);
  } else fail('알 수 없는 동작이에요.');
}

function randomTeam(s, rng) {
  const leader = s.players[s.leader].id;
  const others = shuffle(s.players.map((p) => p.id).filter((id) => id !== leader), rng);
  return [leader, ...others].slice(0, size(s));
}

export default {
  setup(players, opts, ctx) {
    const ps = shuffle(players.map((p) => ({ id: p.id, name: p.name })), ctx.rng);
    const n = ps.length;
    const evil = EVIL_N[n];
    const deck = ['merlin', 'assassin'];
    if (n >= 7) deck.push('percival', 'morgana');
    const evilCount = deck.filter((r) => ROLE_INFO[r].side === 'evil').length;
    for (let i = evilCount; i < evil; i++) deck.push('minion');
    while (deck.length < n) deck.push('servant');
    shuffle(deck, ctx.rng);
    const roles = {};
    ps.forEach((p, i) => { roles[p.id] = deck[i]; });
    const s = {
      players: ps, roles, leader: Math.floor(ctx.rng() * n), quest: 0, results: [], phase: 'team', team: [], picking: [],
      votes: {}, qvotes: {}, rejects: 0, history: [], assassinated: null, over: null,
    };
    ctx.sys?.(`⚔️ 선의 편 ${n - evil}명, 악의 편 ${evil}명! 역할 카드를 확인하세요.`);
    newTeamPhase(s, ctx);
    return s;
  },
  keepMin: 3,
  actors(s) {
    if (s.over) return [];
    if (s.phase === 'team') return [s.players[s.leader].id];
    if (s.phase === 'vote') return s.players.filter((p) => s.votes[p.id] == null).map((p) => p.id);
    if (s.phase === 'quest') return s.team.filter((id) => s.qvotes[id] == null);
    if (s.phase === 'assassin') return s.players.filter((p) => s.roles[p.id] === 'assassin').map((p) => p.id);
    return [];
  },
  action,
  auto(s, pid, ctx) {
    if (s.phase === 'team' && s.players[s.leader].id === pid) return { type: 'team', pids: randomTeam(s, ctx.rng) };
    if (s.phase === 'vote' && s.votes[pid] == null) return { type: 'vote', approve: true };
    if (s.phase === 'quest' && s.team.includes(pid) && s.qvotes[pid] == null) return { type: 'quest', success: true };
    if (s.phase === 'assassin' && s.roles[pid] === 'assassin') {
      return { type: 'assassinate', target: pick(s.players.filter((p) => side(s, p.id) === 'good'), ctx.rng).id };
    }
    return null;
  },
  timeout(s, ctx) {
    if (s.phase === 'team') {
      const team = s.picking.length === size(s) ? s.picking : randomTeam(s, ctx.rng);
      ctx.sys?.('⏰ 시간 초과! 원정대가 자동으로 정해졌어요.');
      action(s, s.players[s.leader].id, { type: 'team', pids: team }, ctx);
    } else if (s.phase === 'vote') {
      for (const p of s.players) if (s.votes[p.id] == null) s.votes[p.id] = true;
      resolveVote(s, ctx);
    } else if (s.phase === 'quest') {
      for (const id of s.team) if (s.qvotes[id] == null) s.qvotes[id] = true;
      resolveQuest(s, ctx);
    } else if (s.phase === 'assassin') {
      const target = pick(s.players.filter((p) => side(s, p.id) === 'good'), ctx.rng);
      ctx.sys?.('⏰ 시간 초과! 암살 대상이 무작위로 정해졌어요.');
      const assassin = s.players.find((p) => s.roles[p.id] === 'assassin');
      action(s, assassin.id, { type: 'assassinate', target: target.id }, ctx);
    }
  },
  view(s, pid) {
    const isPlayer = s.players.some((p) => p.id === pid);
    const myRole = isPlayer ? s.roles[pid] : null;
    const known = {};
    if (myRole) {
      for (const p of s.players) {
        if (p.id === pid) continue;
        const r = s.roles[p.id];
        if (myRole === 'merlin' && ROLE_INFO[r].side === 'evil') known[p.id] = '악';
        if (myRole === 'percival' && (r === 'merlin' || r === 'morgana')) known[p.id] = '멀린 후보';
        if (ROLE_INFO[myRole].side === 'evil' && ROLE_INFO[r].side === 'evil') known[p.id] = '악';
      }
    }
    const inVote = s.phase === 'vote';
    return {
      players: s.players, isPlayer, myRole, mySide: myRole ? ROLE_INFO[myRole].side : null, known,
      leader: s.leader, quest: s.quest, results: s.results, sizes: SIZES[s.players.length], need2: s.players.length >= 7,
      phase: s.phase, team: s.team, picking: s.picking, rejects: s.rejects,
      voted: Object.keys(s.votes), myVote: inVote ? s.votes[pid] ?? null : null,
      qvoted: Object.keys(s.qvotes), myQuest: s.qvotes[pid] ?? null,
      history: s.history, assassinated: s.assassinated, timer: s.timer, over: s.over,
      roles: s.over ? s.roles : null,
    };
  },
};
