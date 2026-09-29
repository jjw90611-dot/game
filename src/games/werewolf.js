import { fail, requirePlayer, shuffle, timer, nameOf, pick } from './util.js';

export const ROLES = {
  werewolf: { name: '늑대인간', team: 'wolf' },
  seer: { name: '예언자', team: 'village' },
  robber: { name: '강도', team: 'village' },
  troublemaker: { name: '말썽쟁이', team: 'village' },
  drunk: { name: '주정뱅이', team: 'village' },
  insomniac: { name: '불면증 환자', team: 'village' },
  villager: { name: '마을 주민', team: 'village' },
  hunter: { name: '사냥꾼', team: 'village' },
  tanner: { name: '무두장이', team: 'tanner' },
};
const BASE = ['werewolf', 'werewolf', 'seer', 'robber', 'troublemaker', 'villager'];
const EXTRA = ['insomniac', 'drunk', 'villager', 'tanner', 'hunter', 'villager', 'villager'];
const NIGHT_MS = 30000;
const VOTE_MS = 30000;
const R = (r) => ROLES[r].name;

function setPhase(s, phase, ms, ctx) {
  s.phase = phase;
  s.deadline = ctx.now + ms;
  s.timer = timer(ms, ctx.now);
}

const wolvesInit = (s) => s.players.filter((p) => s.initial[p.id] === 'werewolf').map((p) => p.id);

function validPlayer(s, id, not) {
  return s.players.some((p) => p.id === id) && !not.includes(id);
}

// 역할별 밤 행동 검증 (행동은 모았다가 밤이 끝나면 정해진 순서대로 처리)
function checkNight(s, pid, a) {
  const role = s.initial[pid];
  const center = (k) => Number.isInteger(k) && k >= 0 && k < 3;
  if (role === 'werewolf') {
    if (wolvesInit(s).length === 1 && a.center != null && !center(Number(a.center))) fail('가운데 카드를 골라 주세요.');
    return { center: wolvesInit(s).length === 1 && a.center != null ? Number(a.center) : null };
  }
  if (role === 'seer') {
    if (a.target != null) {
      if (!validPlayer(s, a.target, [pid])) fail('다른 사람을 골라 주세요.');
      return { target: a.target };
    }
    if (Array.isArray(a.centers)) {
      const cs = [...new Set(a.centers.map(Number))];
      if (cs.length !== 2 || !cs.every(center)) fail('가운데 카드 2장을 골라 주세요.');
      return { centers: cs };
    }
    return {};
  }
  if (role === 'robber') {
    if (a.target == null) return {};
    if (!validPlayer(s, a.target, [pid])) fail('다른 사람을 골라 주세요.');
    return { target: a.target };
  }
  if (role === 'troublemaker') {
    if (!Array.isArray(a.targets)) return {};
    const ts = [...new Set(a.targets)];
    if (ts.length !== 2 || !ts.every((t) => validPlayer(s, t, [pid]))) fail('나를 뺀 두 사람을 골라 주세요.');
    return { targets: ts };
  }
  if (role === 'drunk') {
    if (!center(Number(a.center))) fail('가운데 카드 한 장을 골라 주세요.');
    return { center: Number(a.center) };
  }
  return {};
}

function resolveNight(s, ctx) {
  const info = {};
  const add = (pid, text) => (info[pid] ||= []).push(text);
  const by = (role) => s.players.filter((p) => s.initial[p.id] === role).map((p) => p.id);
  const act = (pid) => s.acts[pid] || {};
  // 1. 늑대인간
  const wolves = wolvesInit(s);
  for (const w of wolves) {
    if (wolves.length === 1) {
      add(w, '혼자인 늑대인간이에요.');
      const k = act(w).center;
      if (k != null) add(w, `가운데 ${k + 1}번 카드는 [${R(s.center[k])}]였어요.`);
    } else add(w, `동료 늑대인간: ${wolves.filter((x) => x !== w).map((x) => nameOf(s, x)).join(', ')}`);
  }
  // 2. 예언자
  for (const p of by('seer')) {
    const a = act(p);
    if (a.target) add(p, `${nameOf(s, a.target)}님의 카드는 [${R(s.cards[a.target])}]였어요.`);
    else if (a.centers) add(p, `가운데 카드: ${a.centers.map((k) => `${k + 1}번 [${R(s.center[k])}]`).join(', ')}`);
    else add(p, '아무것도 보지 않았어요.');
  }
  // 3. 강도
  for (const p of by('robber')) {
    const t = act(p).target;
    if (t) {
      [s.cards[p], s.cards[t]] = [s.cards[t], s.cards[p]];
      add(p, `${nameOf(s, t)}님의 카드를 훔쳤어요. 이제 나는 [${R(s.cards[p])}]예요.`);
    } else add(p, '아무것도 훔치지 않았어요.');
  }
  // 4. 말썽쟁이
  for (const p of by('troublemaker')) {
    const ts = act(p).targets;
    if (ts) {
      [s.cards[ts[0]], s.cards[ts[1]]] = [s.cards[ts[1]], s.cards[ts[0]]];
      add(p, `${nameOf(s, ts[0])}님과 ${nameOf(s, ts[1])}님의 카드를 바꿨어요.`);
    } else add(p, '아무 카드도 바꾸지 않았어요.');
  }
  // 5. 주정뱅이
  for (const p of by('drunk')) {
    let k = act(p).center;
    if (k == null) k = Math.floor(ctx.rng() * 3);
    [s.cards[p], s.center[k]] = [s.center[k], s.cards[p]];
    add(p, `가운데 ${k + 1}번 카드와 바꿨어요. (무엇인지는 몰라요)`);
  }
  // 6. 불면증 환자
  for (const p of by('insomniac')) add(p, `잠에서 깨어 보니 내 카드는 [${R(s.cards[p])}]예요.`);
  s.info = info;
  s.skip = {};
  ctx.sys?.('☀️ 아침이 밝았어요! 밤에 알게 된 정보로 토론하고 늑대인간을 찾아보세요.');
  setPhase(s, 'day', s.discussMs, ctx);
}

function startVote(s, ctx) {
  s.votes = {};
  ctx.sys?.('🗳️ 투표 시간! 늑대인간이라고 생각하는 사람을 골라 주세요.');
  setPhase(s, 'vote', VOTE_MS, ctx);
}

function resolveVote(s, ctx) {
  const count = {};
  for (const t of Object.values(s.votes)) if (t) count[t] = (count[t] || 0) + 1;
  let max = 0;
  for (const c of Object.values(count)) max = Math.max(max, c);
  const dead = max >= 2 ? Object.keys(count).filter((id) => count[id] === max) : [];
  // 사냥꾼
  for (const d of [...dead]) {
    if (s.cards[d] === 'hunter' && s.votes[d] && !dead.includes(s.votes[d])) dead.push(s.votes[d]);
  }
  s.dead = dead;
  s.voteCount = count;
  const finalWolves = s.players.filter((p) => s.cards[p.id] === 'werewolf').map((p) => p.id);
  const deadWolf = dead.some((d) => s.cards[d] === 'werewolf');
  const deadTanner = dead.filter((d) => s.cards[d] === 'tanner');
  const villagers = s.players.filter((p) => ROLES[s.cards[p.id]].team === 'village').map((p) => p.id);
  const deadText = dead.length ? `처형: ${dead.map((d) => `${nameOf(s, d)}(${R(s.cards[d])})`).join(', ')}.` : '아무도 처형되지 않았어요.';
  let winners = [];
  let text;
  if (deadTanner.length) {
    winners = [...deadTanner, ...(deadWolf ? villagers : [])];
    text = `${deadText} 무두장이의 소원대로 무두장이 승리!${deadWolf ? ' (마을도 승리)' : ''}`;
  } else if (deadWolf) {
    winners = villagers;
    text = `${deadText} 늑대인간을 찾아냈어요! 마을 승리!`;
  } else if (!finalWolves.length) {
    if (!dead.length) {
      winners = villagers;
      text = '늑대인간이 모두 가운데 있었어요. 아무도 죽지 않아 마을 승리!';
    } else text = `${deadText} 늑대인간은 없었는데… 무고한 사람이 희생되어 모두 패배!`;
  } else {
    winners = finalWolves;
    text = `${deadText} 늑대인간 승리! (늑대인간: ${finalWolves.map((w) => nameOf(s, w)).join(', ')})`;
  }
  s.over = { winners, text };
}

function action(s, pid, a, ctx) {
  requirePlayer(s, pid);
  if (s.over) fail('게임이 끝났어요.');
  if (a.type === 'night') {
    if (s.phase !== 'night') fail('밤에만 할 수 있어요.');
    if (s.acts[pid]) fail('이미 행동을 마쳤어요.');
    s.acts[pid] = checkNight(s, pid, a);
    if (s.players.every((p) => s.acts[p.id])) {
      s.deadline = Math.min(s.deadline, ctx.now + 2000);
      s.timer = timer(Math.max(0, s.deadline - ctx.now), ctx.now);
    }
  } else if (a.type === 'skip') {
    if (s.phase !== 'day') fail('지금은 할 수 없어요.');
    s.skip[pid] = true;
    if (Object.keys(s.skip).length > s.players.length / 2) startVote(s, ctx);
  } else if (a.type === 'vote') {
    if (s.phase !== 'vote') fail('투표 시간이 아니에요.');
    if (!validPlayer(s, a.target, [pid])) fail('다른 사람을 골라 주세요.');
    s.votes[pid] = a.target;
    if (s.players.every((p) => s.votes[p.id])) resolveVote(s, ctx);
  } else fail('알 수 없는 동작이에요.');
}

function autoNight(s, pid, rng) {
  const role = s.initial[pid];
  const others = s.players.filter((p) => p.id !== pid).map((p) => p.id);
  if (role === 'drunk') return { type: 'night', center: Math.floor(rng() * 3) };
  if (role === 'werewolf' && wolvesInit(s).length === 1) return { type: 'night', center: Math.floor(rng() * 3) };
  if (role === 'seer') return { type: 'night', target: pick(others, rng) };
  return { type: 'night' };
}

export default {
  setup(players, opts, ctx) {
    const ps = shuffle(players.map((p) => ({ id: p.id, name: p.name })), ctx.rng);
    const deck = shuffle([...BASE, ...EXTRA.slice(0, ps.length - 3)], ctx.rng);
    const initial = {}, cards = {};
    ps.forEach((p, i) => { initial[p.id] = deck[i]; cards[p.id] = deck[i]; });
    const s = {
      players: ps, initial, cards, center: deck.slice(ps.length), deckRoles: [...BASE, ...EXTRA.slice(0, ps.length - 3)],
      phase: 'night', acts: {}, info: {}, skip: {}, votes: {}, dead: null, voteCount: null,
      discussMs: (Number(opts.discuss) || 180) * 1000, over: null,
    };
    ctx.sys?.('🌙 밤이 되었어요. 자기 역할을 확인하고 능력을 사용하세요! (밤에는 채팅할 수 없어요)');
    setPhase(s, 'night', NIGHT_MS, ctx);
    return s;
  },
  keepMin: 3,
  actors(s) {
    if (s.over) return [];
    if (s.phase === 'night') return s.players.filter((p) => !s.acts[p.id]).map((p) => p.id);
    if (s.phase === 'vote') return s.players.filter((p) => !s.votes[p.id]).map((p) => p.id);
    return [];
  },
  action,
  auto(s, pid, ctx) {
    if (s.phase === 'night' && !s.acts[pid]) return autoNight(s, pid, ctx.rng);
    if (s.phase === 'vote' && !s.votes[pid]) return { type: 'vote', target: pick(s.players.filter((p) => p.id !== pid), ctx.rng).id };
    return null;
  },
  timeout(s, ctx) {
    if (s.phase === 'night') {
      for (const p of s.players) if (!s.acts[p.id]) s.acts[p.id] = checkNight(s, p.id, autoNight(s, p.id, ctx.rng));
      resolveNight(s, ctx);
    } else if (s.phase === 'day') startVote(s, ctx);
    else if (s.phase === 'vote') resolveVote(s, ctx);
  },
  chat(s, pid) {
    if (!s.over && s.phase === 'night' && s.players.some((p) => p.id === pid)) fail('밤에는 조용히! 아침에 이야기해요 🌙');
  },
  view(s, pid) {
    const isPlayer = s.players.some((p) => p.id === pid);
    const over = !!s.over;
    return {
      players: s.players, isPlayer, phase: s.phase, deckRoles: s.deckRoles,
      myRole: isPlayer ? s.initial[pid] : null, lone: wolvesInit(s).length === 1,
      acted: s.phase === 'night' ? Object.keys(s.acts) : null, myAct: s.acts[pid] || null,
      info: isPlayer && s.phase !== 'night' ? s.info[pid] || [] : [],
      skip: Object.keys(s.skip), voted: Object.keys(s.votes), myVote: s.votes[pid] || null,
      timer: s.timer, over: s.over,
      reveal: over ? { initial: s.initial, cards: s.cards, center: s.center, votes: s.votes, dead: s.dead, count: s.voteCount } : null,
    };
  },
};
