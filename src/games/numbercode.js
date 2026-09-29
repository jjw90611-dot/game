import { fail, requirePlayer, shuffle, timer, range, pick } from './util.js';

// 타일 id = 숫자 * 2 + 색 (0 검정, 1 흰색) → id 순서가 곧 정렬 순서
const TURN_MS = 30000;
const numOf = (id) => id >> 1;
const colorOf = (id) => id & 1;

function alive(s, pid) {
  return s.hands[pid].some((t) => !t.open);
}

function insert(hand, id, open) {
  hand.push({ id, open });
  hand.sort((a, b) => a.id - b.id);
}

function startTurn(s, idx, ctx) {
  s.turn = idx;
  s.drawn = s.pool.length ? s.pool.pop() : null;
  s.phase = 'guess';
  s.streak = 0;
  s.deadline = ctx.now + TURN_MS;
  s.timer = timer(TURN_MS, ctx.now);
}

function nextAlive(s, from) {
  const n = s.players.length;
  for (let k = 1; k <= n; k++) {
    const i = (from + k) % n;
    if (alive(s, s.players[i].id)) return i;
  }
  return from;
}

function checkEnd(s) {
  const left = s.players.filter((p) => alive(s, p.id));
  if (left.length <= 1) {
    s.over = { winners: left.map((p) => p.id), text: left.length ? `${left[0].name}님 승리! 마지막까지 암호를 지켰어요.` : '무승부' };
    return true;
  }
  return false;
}

function endTurn(s, ctx) {
  if (checkEnd(s)) return;
  startTurn(s, nextAlive(s, s.turn), ctx);
}

function action(s, pid, a, ctx) {
  const me = requirePlayer(s, pid);
  if (s.over) fail('게임이 끝났어요.');
  if (me !== s.turn) fail('내 차례가 아니에요.');
  if (a.type === 'guess') {
    if (s.phase !== 'guess' && s.phase !== 'continue') fail('지금은 추리할 수 없어요.');
    const target = s.players.find((p) => p.id === a.target);
    if (!target || target.id === pid) fail('상대를 골라 주세요.');
    const hand = s.hands[target.id];
    const i = Number(a.index);
    const n = Number(a.num);
    if (!(i >= 0 && i < hand.length) || hand[i].open) fail('숨겨진 타일을 골라 주세요.');
    if (!(Number.isInteger(n) && n >= 0 && n <= 11)) fail('0~11 중에서 골라 주세요.');
    const t = hand[i];
    const ok = numOf(t.id) === n;
    s.lastGuess = { by: pid, target: target.id, index: i, num: n, ok, id: ok ? t.id : null };
    if (ok) {
      t.open = true;
      s.streak++;
      ctx.sys?.(`🎯 ${s.players[me].name}님이 ${target.name}님의 ${n}을(를) 맞혔어요!`);
      if (checkEnd(s)) return;
      s.phase = 'continue';
      s.deadline = ctx.now + TURN_MS;
      s.timer = timer(TURN_MS, ctx.now);
    } else {
      ctx.sys?.(`❌ ${s.players[me].name}님의 추리가 틀렸어요. (${target.name}님 타일 ≠ ${n})`);
      if (s.drawn != null) {
        insert(s.hands[pid], s.drawn, true);
        s.lastGuess.revealed = s.drawn;
        s.drawn = null;
        endTurn(s, ctx);
      } else if (alive(s, pid)) {
        s.phase = 'penalty';
        s.deadline = ctx.now + 15000;
        s.timer = timer(15000, ctx.now);
      } else endTurn(s, ctx);
    }
  } else if (a.type === 'stop') {
    if (s.phase !== 'continue') fail('지금은 멈출 수 없어요.');
    if (s.drawn != null) insert(s.hands[pid], s.drawn, false);
    s.drawn = null;
    endTurn(s, ctx);
  } else if (a.type === 'reveal') {
    if (s.phase !== 'penalty') fail('지금은 공개할 수 없어요.');
    const hand = s.hands[pid];
    const i = Number(a.index);
    if (!(i >= 0 && i < hand.length) || hand[i].open) fail('숨겨진 내 타일을 골라 주세요.');
    hand[i].open = true;
    s.lastGuess = { ...s.lastGuess, revealed: hand[i].id };
    endTurn(s, ctx);
  } else fail('알 수 없는 동작이에요.');
}

// 상대 타일마다 가능한 숫자 후보를 계산합니다.
export function candidates(s, viewer, targetId) {
  const known = new Set();
  for (const p of s.players) for (const t of s.hands[p.id]) if (t.open || p.id === viewer) known.add(t.id);
  if (s.drawn != null && s.players[s.turn].id === viewer) known.add(s.drawn);
  const hand = s.hands[targetId];
  return hand.map((t, i) => {
    if (t.open) return null;
    let lo = -1, loIdx = -1;
    for (let k = i - 1; k >= 0; k--) if (hand[k].open) { lo = hand[k].id; loIdx = k; break; }
    let hi = 24, hiIdx = hand.length;
    for (let k = i + 1; k < hand.length; k++) if (hand[k].open) { hi = hand[k].id; hiIdx = k; break; }
    const min = lo + (i - loIdx);
    const max = hi - (hiIdx - i);
    const c = colorOf(t.id);
    const out = [];
    for (let id = Math.max(0, min); id <= Math.min(23, max); id++) if (colorOf(id) === c && !known.has(id)) out.push(numOf(id));
    return out;
  });
}

function auto(s, pid, ctx) {
  if (s.over || s.players[s.turn].id !== pid) return null;
  if (s.phase === 'penalty') {
    const hidden = s.hands[pid].map((t, i) => (t.open ? -1 : i)).filter((i) => i >= 0);
    return { type: 'reveal', index: pick(hidden, ctx.rng) };
  }
  let best = null;
  for (const p of s.players) {
    if (p.id === pid || !alive(s, p.id)) continue;
    candidates(s, pid, p.id).forEach((cands, i) => {
      if (!cands || !cands.length) return;
      if (!best || cands.length < best.cands.length) best = { target: p.id, index: i, cands };
    });
  }
  if (s.phase === 'continue' && (!best || best.cands.length > 1)) return { type: 'stop' };
  if (!best) {
    // 후보 계산이 실패하면 아무 숨겨진 타일이나 추리
    for (const p of s.players) {
      if (p.id === pid) continue;
      const i = s.hands[p.id].findIndex((t) => !t.open);
      if (i >= 0) return { type: 'guess', target: p.id, index: i, num: Math.floor(ctx.rng() * 12) };
    }
    return { type: 'stop' };
  }
  return { type: 'guess', target: best.target, index: best.index, num: pick(best.cands, ctx.rng) };
}

export default {
  setup(players, opts, ctx) {
    const ps = shuffle(players.map((p) => ({ id: p.id, name: p.name })), ctx.rng);
    const pool = shuffle(range(24), ctx.rng);
    const each = ps.length >= 4 ? 3 : 4;
    const hands = {};
    for (const p of ps) {
      hands[p.id] = [];
      for (let k = 0; k < each; k++) insert(hands[p.id], pool.pop(), false);
    }
    const s = { players: ps, hands, pool, turn: 0, drawn: null, phase: 'guess', streak: 0, lastGuess: null, over: null };
    startTurn(s, 0, ctx);
    return s;
  },
  actors: (s) => (s.over ? [] : [s.players[s.turn].id]),
  action,
  auto,
  botDelay: () => 1400 + Math.random() * 900,
  timeout(s, ctx) {
    const pid = s.players[s.turn].id;
    if (s.phase === 'continue') return action(s, pid, { type: 'stop' }, ctx);
    const a = auto(s, pid, ctx);
    try {
      action(s, pid, a, ctx);
    } catch {
      if (s.drawn != null) insert(s.hands[pid], s.drawn, true);
      s.drawn = null;
      endTurn(s, ctx);
    }
  },
  view(s, pid) {
    const hands = {};
    for (const p of s.players) {
      hands[p.id] = s.hands[p.id].map((t) => ({
        c: colorOf(t.id), open: t.open, n: t.open || p.id === pid || s.over ? numOf(t.id) : null,
      }));
    }
    const mine = s.players[s.turn]?.id === pid;
    return {
      players: s.players, hands, pool: s.pool.length, turn: s.turn, phase: s.phase,
      drawn: s.drawn == null ? null : { c: colorOf(s.drawn), n: mine || s.over ? numOf(s.drawn) : null },
      lastGuess: s.lastGuess, streak: s.streak, timer: s.timer, over: s.over,
      out: Object.fromEntries(s.players.map((p) => [p.id, !alive(s, p.id)])),
    };
  },
};
