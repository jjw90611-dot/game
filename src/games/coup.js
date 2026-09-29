import { fail, requirePlayer, shuffle, timer, nameOf, pick } from './util.js';

export const ROLE_NAMES = { duke: '공작', assassin: '암살자', captain: '사령관', ambassador: '대사', contessa: '백작부인' };
const ROLES = Object.keys(ROLE_NAMES);
export const ACTIONS = {
  income: { name: '소득', claim: null, cost: 0, target: false, blockers: [] },
  foreign: { name: '해외 원조', claim: null, cost: 0, target: false, blockers: ['duke'], anyBlock: true },
  coup: { name: '쿠데타', claim: null, cost: 7, target: true, blockers: [] },
  tax: { name: '세금', claim: 'duke', cost: 0, target: false, blockers: [] },
  assassinate: { name: '암살', claim: 'assassin', cost: 3, target: true, blockers: ['contessa'] },
  steal: { name: '갈취', claim: 'captain', cost: 0, target: true, blockers: ['captain', 'ambassador'] },
  exchange: { name: '교환', claim: 'ambassador', cost: 0, target: false, blockers: [] },
};
const ACTION_MS = 30000, RESPOND_MS = 12000, LOSE_MS = 20000, EXCHANGE_MS = 25000;
const VALUE = { contessa: 1, ambassador: 2, captain: 3, assassin: 4, duke: 5 };

const aliveCards = (s, pid) => s.hands[pid].filter((c) => !c.dead);
const isAlive = (s, pid) => aliveCards(s, pid).length > 0;
const alivePlayers = (s) => s.players.filter((p) => isAlive(s, p.id)).map((p) => p.id);

function setPhase(s, phase, ms, ctx) {
  s.phase = phase;
  s.deadline = ctx.now + ms;
  s.timer = timer(ms, ctx.now);
}

function log(s, text, ctx) {
  s.log.push(text);
  if (s.log.length > 40) s.log.shift();
  ctx.sys?.(text);
}

function startTurn(s, ctx) {
  s.pending = null;
  setPhase(s, 'action', ACTION_MS, ctx);
}

function nextTurn(s, ctx) {
  const alive = alivePlayers(s);
  if (alive.length <= 1) {
    s.over = { winners: alive, text: alive.length ? `${nameOf(s, alive[0])}님이 마지막까지 살아남아 권력을 차지했어요!` : '무승부' };
    return;
  }
  const n = s.players.length;
  for (let k = 1; k <= n; k++) {
    const i = (s.turn + k) % n;
    if (isAlive(s, s.players[i].id)) {
      s.turn = i;
      break;
    }
  }
  startTurn(s, ctx);
}

// 응답할 수 있는 사람들
function responders(s) {
  const p = s.pending;
  if (!p) return [];
  if (s.phase === 'respond') return alivePlayers(s).filter((id) => id !== p.actor);
  if (s.phase === 'block') return p.target && isAlive(s, p.target) ? [p.target] : [];
  if (s.phase === 'blockrespond') return alivePlayers(s).filter((id) => id !== p.blocker);
  return [];
}

function canBlock(s, pid) {
  const p = s.pending;
  const A = ACTIONS[p.type];
  if (!A.blockers.length || p.blocker) return false;
  if (A.anyBlock) return pid !== p.actor;
  return pid === p.target;
}

function openRespond(s, ctx) {
  s.pending.passed = [];
  setPhase(s, 'respond', RESPOND_MS, ctx);
}

function loseCard(s, pid, then, ctx) {
  const alive = aliveCards(s, pid);
  if (!alive.length) return cont(s, then, ctx);
  if (alive.length === 1) {
    alive[0].dead = true;
    log(s, `💀 ${nameOf(s, pid)}님이 [${ROLE_NAMES[alive[0].role]}] 카드를 잃었어요.`, ctx);
    if (!isAlive(s, pid)) log(s, `☠️ ${nameOf(s, pid)}님이 탈락했어요.`, ctx);
    return cont(s, then, ctx);
  }
  s.pending = { ...(s.pending || {}), loser: pid, then };
  setPhase(s, 'lose', LOSE_MS, ctx);
}

function cont(s, then, ctx) {
  if (alivePlayers(s).length <= 1) return nextTurn(s, ctx);
  const p = s.pending;
  if (then === 'next' || !p) return nextTurn(s, ctx);
  if (then === 'afterChallengeWon') {
    if (ACTIONS[p.type].blockers.length && !ACTIONS[p.type].anyBlock && p.target && isAlive(s, p.target)) {
      p.passed = [];
      setPhase(s, 'block', RESPOND_MS, ctx);
      return;
    }
    return resolveAction(s, ctx);
  }
  if (then === 'actionFails' || then === 'blockHolds') return nextTurn(s, ctx);
  if (then === 'blockFails') return resolveAction(s, ctx);
  return nextTurn(s, ctx);
}

function resolveAction(s, ctx) {
  const p = s.pending;
  const a = p.actor, t = p.target;
  if (!isAlive(s, a)) return nextTurn(s, ctx);
  switch (p.type) {
    case 'foreign': s.coins[a] += 2; log(s, `💰 ${nameOf(s, a)}님이 해외 원조로 동전 2개를 받았어요.`, ctx); break;
    case 'tax': s.coins[a] += 3; log(s, `💰 ${nameOf(s, a)}님이 세금으로 동전 3개를 걷었어요.`, ctx); break;
    case 'steal': {
      const amt = Math.min(2, s.coins[t]);
      s.coins[t] -= amt;
      s.coins[a] += amt;
      log(s, `🦹 ${nameOf(s, a)}님이 ${nameOf(s, t)}님에게서 동전 ${amt}개를 빼앗았어요.`, ctx);
      break;
    }
    case 'assassinate':
      if (isAlive(s, t)) {
        log(s, `🗡️ ${nameOf(s, a)}님의 암살 성공! ${nameOf(s, t)}님이 카드를 잃어요.`, ctx);
        return loseCard(s, t, 'next', ctx);
      }
      break;
    case 'exchange': {
      const drawn = [s.deck.pop(), s.deck.pop()].filter(Boolean);
      p.options = [...aliveCards(s, a).map((c) => c.role), ...drawn];
      p.keep = aliveCards(s, a).length;
      setPhase(s, 'exchange', EXCHANGE_MS, ctx);
      return;
    }
  }
  nextTurn(s, ctx);
}

function challenge(s, claimant, role, challenger, context, ctx) {
  const idx = s.hands[claimant].findIndex((c) => !c.dead && c.role === role);
  log(s, `❗ ${nameOf(s, challenger)}님이 ${nameOf(s, claimant)}님의 [${ROLE_NAMES[role]}]을(를) 의심했어요!`, ctx);
  if (idx >= 0) {
    s.deck.push(role);
    shuffle(s.deck, ctx.rng);
    s.hands[claimant][idx] = { role: s.deck.pop(), dead: false };
    log(s, `😎 ${nameOf(s, claimant)}님은 진짜 [${ROLE_NAMES[role]}]였어요! 카드를 바꾸고, ${nameOf(s, challenger)}님이 카드를 잃어요.`, ctx);
    loseCard(s, challenger, context === 'action' ? 'afterChallengeWon' : 'blockHolds', ctx);
  } else {
    log(s, `🤥 ${nameOf(s, claimant)}님의 거짓말이 들켰어요!`, ctx);
    if (context === 'action' && s.pending.type === 'assassinate') s.coins[claimant] += 3;
    loseCard(s, claimant, context === 'action' ? 'actionFails' : 'blockFails', ctx);
  }
}

function action(s, pid, a, ctx) {
  const me = requirePlayer(s, pid);
  if (s.over) fail('게임이 끝났어요.');
  if (!isAlive(s, pid)) fail('탈락했어요.');
  const p = s.pending;
  switch (a.type) {
    case 'act': {
      if (s.phase !== 'action' || me !== s.turn) fail('내 차례가 아니에요.');
      const A = ACTIONS[a.action];
      if (!A) fail('알 수 없는 행동이에요.');
      if (s.coins[pid] >= 10 && a.action !== 'coup') fail('동전이 10개 이상이면 쿠데타를 해야 해요.');
      if (s.coins[pid] < A.cost) fail(`동전이 ${A.cost}개 필요해요.`);
      let target = null;
      if (A.target) {
        target = a.target;
        if (!s.players.some((x) => x.id === target) || target === pid || !isAlive(s, target)) fail('대상을 골라 주세요.');
      }
      s.coins[pid] -= A.cost;
      s.pending = { type: a.action, actor: pid, target, blocker: null, blockRole: null, passed: [] };
      const claim = A.claim ? ` [${ROLE_NAMES[A.claim]}]` : '';
      log(s, `▶ ${nameOf(s, pid)}님:${claim} ${A.name}${target ? ` → ${nameOf(s, target)}` : ''}`, ctx);
      if (a.action === 'income') {
        s.coins[pid] += 1;
        return nextTurn(s, ctx);
      }
      if (a.action === 'coup') return loseCard(s, target, 'next', ctx);
      return openRespond(s, ctx);
    }
    case 'pass': {
      if (!['respond', 'block', 'blockrespond'].includes(s.phase)) fail('지금은 할 수 없어요.');
      if (!responders(s).includes(pid)) fail('응답할 차례가 아니에요.');
      if (!p.passed.includes(pid)) p.passed.push(pid);
      if (responders(s).every((id) => p.passed.includes(id))) finishWindow(s, ctx);
      return;
    }
    case 'challenge': {
      if (!responders(s).includes(pid)) fail('지금은 의심할 수 없어요.');
      if (s.phase === 'respond') {
        const claim = ACTIONS[p.type].claim;
        if (!claim) fail('이 행동은 의심할 수 없어요.');
        return challenge(s, p.actor, claim, pid, 'action', ctx);
      }
      if (s.phase === 'blockrespond') return challenge(s, p.blocker, p.blockRole, pid, 'block', ctx);
      fail('지금은 의심할 수 없어요.');
      return;
    }
    case 'block': {
      if (s.phase !== 'respond' && s.phase !== 'block') fail('지금은 막을 수 없어요.');
      if (!responders(s).includes(pid) || !canBlock(s, pid)) fail('이 행동을 막을 수 없어요.');
      const role = a.role;
      if (!ACTIONS[p.type].blockers.includes(role)) fail('그 인물로는 막을 수 없어요.');
      p.blocker = pid;
      p.blockRole = role;
      p.passed = [];
      log(s, `🛡️ ${nameOf(s, pid)}님이 [${ROLE_NAMES[role]}](으)로 막았어요!`, ctx);
      setPhase(s, 'blockrespond', RESPOND_MS, ctx);
      return;
    }
    case 'lose': {
      if (s.phase !== 'lose' || p.loser !== pid) fail('지금은 카드를 고를 수 없어요.');
      const i = Number(a.i);
      const c = s.hands[pid][i];
      if (!c || c.dead) fail('살아 있는 카드를 골라 주세요.');
      c.dead = true;
      log(s, `💀 ${nameOf(s, pid)}님이 [${ROLE_NAMES[c.role]}] 카드를 잃었어요.`, ctx);
      if (!isAlive(s, pid)) log(s, `☠️ ${nameOf(s, pid)}님이 탈락했어요.`, ctx);
      const then = p.then;
      p.loser = null;
      return cont(s, then, ctx);
    }
    case 'keep': {
      if (s.phase !== 'exchange' || p.actor !== pid) fail('지금은 고를 수 없어요.');
      const idx = Array.isArray(a.idx) ? [...new Set(a.idx.map(Number))] : [];
      if (idx.length !== p.keep || idx.some((i) => !(i >= 0 && i < p.options.length))) fail(`카드 ${p.keep}장을 골라 주세요.`);
      const keep = idx.map((i) => p.options[i]);
      const back = p.options.filter((_, i) => !idx.includes(i));
      let k = 0;
      for (const c of s.hands[pid]) if (!c.dead) c.role = keep[k++];
      s.deck.push(...back);
      shuffle(s.deck, ctx.rng);
      log(s, `🔄 ${nameOf(s, pid)}님이 카드를 교환했어요.`, ctx);
      return nextTurn(s, ctx);
    }
  }
  fail('알 수 없는 동작이에요.');
}

function finishWindow(s, ctx) {
  const p = s.pending;
  if (s.phase === 'respond' || s.phase === 'block') return resolveAction(s, ctx);
  if (s.phase === 'blockrespond') {
    log(s, `🛡️ ${ACTIONS[p.type].name}이(가) 막혔어요.`, ctx);
    return nextTurn(s, ctx);
  }
}

// ─── 봇 ───
function seen(s, pid, role) {
  let n = 0;
  for (const p of s.players) for (const c of s.hands[p.id]) if (c.role === role && (c.dead || p.id === pid)) n++;
  return n;
}

function botAct(s, pid, rng) {
  const p = s.pending;
  const has = (r) => aliveCards(s, pid).some((c) => c.role === r);
  const others = alivePlayers(s).filter((id) => id !== pid);
  const richest = others.slice().sort((x, y) => s.coins[y] - s.coins[x] || aliveCards(s, y).length - aliveCards(s, x).length)[0];
  if (s.phase === 'action') {
    if (s.coins[pid] >= 7) return { type: 'act', action: 'coup', target: richest };
    if (has('assassin') && s.coins[pid] >= 3) return { type: 'act', action: 'assassinate', target: richest };
    if (has('duke')) return { type: 'act', action: 'tax' };
    if (has('captain')) {
      const rich = others.find((id) => s.coins[id] >= 2);
      if (rich) return { type: 'act', action: 'steal', target: rich };
    }
    if (has('ambassador') && rng() < 0.4) return { type: 'act', action: 'exchange' };
    return { type: 'act', action: rng() < 0.3 ? 'foreign' : 'income' };
  }
  if (s.phase === 'respond' || s.phase === 'block') {
    if (canBlock(s, pid)) {
      const role = ACTIONS[p.type].blockers.find((r) => has(r));
      if (role && (p.type !== 'foreign' || rng() < 0.6)) return { type: 'block', role };
      if (p.type === 'assassinate' && aliveCards(s, pid).length === 1 && rng() < 0.5) return { type: 'block', role: 'contessa' };
    }
    const claim = ACTIONS[p.type].claim;
    if (s.phase === 'respond' && claim && seen(s, pid, claim) >= 3) return { type: 'challenge' };
    return { type: 'pass' };
  }
  if (s.phase === 'blockrespond') {
    if (p.actor === pid && seen(s, pid, p.blockRole) >= 3) return { type: 'challenge' };
    return { type: 'pass' };
  }
  if (s.phase === 'lose') {
    const cards = s.hands[pid].map((c, i) => ({ c, i })).filter((x) => !x.c.dead).sort((x, y) => VALUE[x.c.role] - VALUE[y.c.role]);
    return { type: 'lose', i: cards[0].i };
  }
  if (s.phase === 'exchange') {
    const order = p.options.map((r, i) => ({ r, i })).sort((x, y) => VALUE[y.r] - VALUE[x.r]);
    return { type: 'keep', idx: order.slice(0, p.keep).map((x) => x.i) };
  }
  return null;
}

export default {
  setup(players, opts, ctx) {
    const ps = shuffle(players.map((p) => ({ id: p.id, name: p.name })), ctx.rng);
    const deck = shuffle(ROLES.flatMap((r) => [r, r, r]), ctx.rng);
    const hands = {}, coins = {};
    for (const p of ps) {
      hands[p.id] = [{ role: deck.pop(), dead: false }, { role: deck.pop(), dead: false }];
      coins[p.id] = ps.length === 2 && p === ps[0] ? 1 : 2;
    }
    const s = { players: ps, hands, coins, deck, turn: 0, phase: 'action', pending: null, log: [], over: null };
    startTurn(s, ctx);
    return s;
  },
  actors(s) {
    if (s.over) return [];
    if (s.phase === 'action') return [s.players[s.turn].id];
    if (s.phase === 'lose') return [s.pending.loser];
    if (s.phase === 'exchange') return [s.pending.actor];
    return responders(s).filter((id) => !s.pending.passed.includes(id));
  },
  action,
  auto(s, pid, ctx) {
    return botAct(s, pid, ctx.rng);
  },
  botDelay: (s) => (s.phase === 'action' ? 1500 : 900) + Math.random() * 700,
  timeout(s, ctx) {
    const p = s.pending;
    if (s.phase === 'action') {
      const pid = s.players[s.turn].id;
      const others = alivePlayers(s).filter((id) => id !== pid);
      action(s, pid, s.coins[pid] >= 10 ? { type: 'act', action: 'coup', target: pick(others, ctx.rng) } : { type: 'act', action: 'income' }, ctx);
    } else if (s.phase === 'lose') {
      const alive = s.hands[p.loser].map((c, i) => (c.dead ? -1 : i)).filter((i) => i >= 0);
      action(s, p.loser, { type: 'lose', i: pick(alive, ctx.rng) }, ctx);
    } else if (s.phase === 'exchange') {
      action(s, p.actor, { type: 'keep', idx: Array.from({ length: p.keep }, (_, i) => i) }, ctx);
    } else finishWindow(s, ctx);
  },
  view(s, pid) {
    const p = s.pending;
    const hands = {};
    for (const pl of s.players) {
      hands[pl.id] = s.hands[pl.id].map((c) => (pl.id === pid || c.dead || s.over ? { role: c.role, dead: c.dead } : { role: null, dead: false }));
    }
    let can = null;
    if (!s.over && pid && isAlive(s, pid) && p && ['respond', 'block', 'blockrespond'].includes(s.phase) && responders(s).includes(pid) && !p.passed.includes(pid)) {
      can = {
        challenge: (s.phase === 'respond' && !!ACTIONS[p.type].claim) || s.phase === 'blockrespond',
        block: s.phase !== 'blockrespond' && canBlock(s, pid) ? ACTIONS[p.type].blockers : [],
      };
    }
    return {
      players: s.players, hands, coins: s.coins, deck: s.deck.length, turn: s.turn, phase: s.phase,
      pending: p ? { type: p.type, actor: p.actor, target: p.target, blocker: p.blocker, blockRole: p.blockRole, passed: p.passed || [], loser: p.loser || null } : null,
      exchange: s.phase === 'exchange' && p.actor === pid ? { options: p.options, keep: p.keep } : null,
      can, log: s.log.slice(-12), timer: s.timer, over: s.over,
      alive: Object.fromEntries(s.players.map((pl) => [pl.id, isAlive(s, pl.id)])),
    };
  },
};
