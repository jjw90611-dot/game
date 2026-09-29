import { fail, requirePlayer, shuffle, timer } from './util.js';
import { CARDS, NOBLES, payment } from '../../public/js/shared/gems.js';

const TURN_MS = 60000;
const sum = (a) => a.reduce((x, y) => x + y, 0);

function refill(s, tier, slot) {
  s.board[tier][slot] = s.decks[tier].length ? s.decks[tier].pop() : null;
}

function nextTurn(s, pid, ctx) {
  const me = s.p[pid];
  // 귀족 방문
  const ni = s.nobles.findIndex((id) => NOBLES[id].req.every((r, k) => me.bonus[k] >= r));
  if (ni >= 0) {
    const id = s.nobles.splice(ni, 1)[0];
    me.nobles.push(id);
    me.pts += 3;
    ctx.sys?.(`👑 귀족이 ${s.players[s.turn].name}님을 방문했어요! (+3점)`);
  }
  if (me.pts >= 15 && !s.final) {
    s.final = true;
    ctx.sys?.(`${s.players[s.turn].name}님이 15점에 도달! 이번 바퀴가 마지막이에요.`);
  }
  const next = (s.turn + 1) % s.players.length;
  if (s.final && next === 0) {
    let best = -1;
    for (const p of s.players) best = Math.max(best, s.p[p.id].pts);
    let top = s.players.filter((p) => s.p[p.id].pts === best);
    const minCards = Math.min(...top.map((p) => s.p[p.id].cards.length));
    top = top.filter((p) => s.p[p.id].cards.length === minCards);
    s.over = { winners: top.map((p) => p.id), text: `${top.map((p) => p.name).join(', ')}님 승리! (${best}점)` };
    return;
  }
  s.turn = next;
  s.phase = 'main';
  s.deadline = ctx.now + TURN_MS;
  s.timer = timer(TURN_MS, ctx.now);
}

function afterMain(s, pid, ctx) {
  const extra = sum(s.p[pid].tok) - 10;
  if (extra > 0) {
    s.phase = 'discard';
    s.discard = extra;
    s.deadline = ctx.now + 30000;
    s.timer = timer(30000, ctx.now);
  } else nextTurn(s, pid, ctx);
}

function cardAt(s, a) {
  if (a.res != null) {
    const r = s.p[a.pid].res[Number(a.res)];
    if (!r) fail('예약한 카드가 없어요.');
    return r.id;
  }
  const tier = Number(a.tier), slot = Number(a.slot);
  if (!(tier >= 0 && tier < 3 && slot >= 0 && slot < 4)) fail('잘못된 카드예요.');
  const id = s.board[tier][slot];
  if (id == null) fail('빈 자리예요.');
  return id;
}

function action(s, pid, a, ctx) {
  const idx = requirePlayer(s, pid);
  if (s.over) fail('게임이 끝났어요.');
  if (idx !== s.turn) fail('내 차례가 아니에요.');
  const me = s.p[pid];
  if (s.phase === 'discard') {
    if (a.type !== 'discard') fail('보석을 10개로 맞춰 주세요.');
    const cols = Array.isArray(a.colors) ? a.colors.map(Number) : [];
    if (cols.length !== s.discard) fail(`보석 ${s.discard}개를 반납해야 해요.`);
    const cnt = [0, 0, 0, 0, 0, 0];
    for (const c of cols) { if (!(c >= 0 && c <= 5)) fail('잘못된 보석이에요.'); cnt[c]++; }
    for (let k = 0; k < 6; k++) if (cnt[k] > me.tok[k]) fail('가진 것보다 많이 반납할 수 없어요.');
    for (let k = 0; k < 6; k++) { me.tok[k] -= cnt[k]; s.bank[k] += cnt[k]; }
    s.discard = 0;
    nextTurn(s, pid, ctx);
    return;
  }
  if (a.type === 'take') {
    const cols = Array.isArray(a.colors) ? a.colors.map(Number) : [];
    if (!cols.length || cols.length > 3 || cols.some((c) => !(c >= 0 && c <= 4))) fail('가져올 보석을 골라 주세요.');
    if (cols.length === 2 && cols[0] === cols[1]) {
      if (s.bank[cols[0]] < 4) fail('같은 보석 2개는 4개 이상 남아 있을 때만 가져올 수 있어요.');
      s.bank[cols[0]] -= 2;
      me.tok[cols[0]] += 2;
    } else {
      if (new Set(cols).size !== cols.length) fail('서로 다른 보석을 골라 주세요.');
      if (cols.some((c) => s.bank[c] < 1)) fail('남아 있지 않은 보석이에요.');
      for (const c of cols) { s.bank[c]--; me.tok[c]++; }
    }
    s.last = { pid, type: 'take', colors: cols };
  } else if (a.type === 'reserve') {
    if (me.res.length >= 3) fail('카드는 3장까지만 예약할 수 있어요.');
    const tier = Number(a.tier);
    let id, hidden = false;
    if (Number(a.slot) === -1) {
      if (!(tier >= 0 && tier < 3) || !s.decks[tier].length) fail('카드 더미가 비었어요.');
      id = s.decks[tier].pop();
      hidden = true;
    } else {
      id = cardAt(s, { ...a, res: null });
      refill(s, tier, Number(a.slot));
    }
    me.res.push({ id, hidden });
    if (s.bank[5] > 0) { s.bank[5]--; me.tok[5]++; }
    s.last = { pid, type: 'reserve', id: hidden ? null : id, tier };
  } else if (a.type === 'buy') {
    const fromRes = a.res != null;
    const id = cardAt(s, { ...a, pid });
    const pay = payment(me, id);
    if (!pay) fail('보석이 부족해요.');
    for (let k = 0; k < 6; k++) { me.tok[k] -= pay[k]; s.bank[k] += pay[k]; }
    const card = CARDS[id];
    me.cards.push(id);
    me.bonus[card.color]++;
    me.pts += card.pts;
    if (fromRes) me.res.splice(Number(a.res), 1);
    else refill(s, Number(a.tier), Number(a.slot));
    s.last = { pid, type: 'buy', id };
  } else if (a.type === 'pass') {
    s.last = { pid, type: 'pass' };
  } else fail('알 수 없는 동작이에요.');
  afterMain(s, pid, ctx);
}

function pickDiscard(s, pid) {
  const me = s.p[pid];
  const tok = me.tok.slice();
  const out = [];
  while (out.length < s.discard) {
    let best = -1;
    for (let k = 0; k < 5; k++) if (tok[k] > 0 && (best < 0 || tok[k] > tok[best])) best = k;
    if (best < 0) best = 5;
    tok[best]--;
    out.push(best);
  }
  return out;
}

function botAction(s, pid, rng) {
  const me = s.p[pid];
  if (s.phase === 'discard') return { type: 'discard', colors: pickDiscard(s, pid) };
  const cands = [];
  s.board.forEach((row, tier) => row.forEach((id, slot) => { if (id != null) cands.push({ id, tier, slot }); }));
  me.res.forEach((r, i) => cands.push({ id: r.id, res: i }));
  let buy = null, bs = -1;
  for (const c of cands) {
    if (!payment(me, c.id)) continue;
    const card = CARDS[c.id];
    const nobleHelp = s.nobles.filter((n) => NOBLES[n].req[card.color] > me.bonus[card.color]).length;
    const score = card.pts * 10 + nobleHelp * 2 + card.tier + (c.res != null ? 2 : 0) + rng();
    if (score > bs) { bs = score; buy = c; }
  }
  if (buy) return buy.res != null ? { type: 'buy', res: buy.res } : { type: 'buy', tier: buy.tier, slot: buy.slot };
  let target = null, ts = -Infinity;
  for (const c of cands) {
    const card = CARDS[c.id];
    let missing = 0;
    for (let k = 0; k < 5; k++) missing += Math.max(0, card.cost[k] - me.bonus[k] - me.tok[k]);
    missing = Math.max(0, missing - me.tok[5]);
    const score = (card.pts * 3 + 3) / (1 + missing) + rng() * 0.1;
    if (score > ts) { ts = score; target = c; }
  }
  const need = [0, 0, 0, 0, 0];
  if (target) {
    const card = CARDS[target.id];
    for (let k = 0; k < 5; k++) need[k] = Math.max(0, card.cost[k] - me.bonus[k] - me.tok[k]);
  }
  const order = [0, 1, 2, 3, 4].filter((k) => s.bank[k] > 0).sort((x, y) => need[y] - need[x] || s.bank[y] - s.bank[x]);
  const bigNeed = order.find((k) => need[k] >= 2 && s.bank[k] >= 4);
  if (bigNeed != null && order.filter((k) => need[k] > 0).length === 1) return { type: 'take', colors: [bigNeed, bigNeed] };
  if (order.length) return { type: 'take', colors: order.slice(0, 3) };
  if (target && me.res.length < 3 && target.res == null) return { type: 'reserve', tier: target.tier, slot: target.slot };
  return { type: 'pass' };
}

export default {
  setup(players, opts, ctx) {
    const ps = shuffle(players.map((p) => ({ id: p.id, name: p.name })), ctx.rng);
    const n = ps.length;
    const t = n === 2 ? 4 : n === 3 ? 5 : 7;
    const decks = [0, 1, 2].map((tier) => shuffle(CARDS.filter((c) => c.tier === tier).map((c) => c.id), ctx.rng));
    const board = decks.map((d) => d.splice(0, 4));
    const nobles = shuffle(NOBLES.map((x) => x.id), ctx.rng).slice(0, n + 1);
    const p = {};
    for (const pl of ps) p[pl.id] = { tok: [0, 0, 0, 0, 0, 0], cards: [], bonus: [0, 0, 0, 0, 0], res: [], pts: 0, nobles: [] };
    return {
      players: ps, bank: [t, t, t, t, t, 5], decks, board, nobles, p, turn: 0, final: false, phase: 'main', discard: 0,
      last: null, deadline: ctx.now + TURN_MS, timer: timer(TURN_MS, ctx.now), over: null,
    };
  },
  actors: (s) => (s.over ? [] : [s.players[s.turn].id]),
  action,
  auto(s, pid, ctx) {
    if (s.over || s.players[s.turn].id !== pid) return null;
    return botAction(s, pid, ctx.rng);
  },
  botDelay: () => 1500 + Math.random() * 800,
  timeout(s, ctx) {
    const pid = s.players[s.turn].id;
    if (s.phase === 'discard') action(s, pid, { type: 'discard', colors: pickDiscard(s, pid) }, ctx);
    else {
      ctx.sys?.(`${s.players[s.turn].name}님이 시간 초과로 차례를 넘겼어요.`);
      action(s, pid, { type: 'pass' }, ctx);
    }
  },
  view(s, pid) {
    const p = {};
    for (const pl of s.players) {
      const x = s.p[pl.id];
      p[pl.id] = { ...x, res: x.res.map((r) => (pl.id === pid || !r.hidden || s.over ? r : { id: null, hidden: true, tier: 0 })) };
    }
    for (const pl of s.players) {
      p[pl.id].res = p[pl.id].res.map((r, i) => (r.id == null ? { id: null, hidden: true, tier: s.p[pl.id].res[i] ? tierOf(s.p[pl.id].res[i].id) : 0 } : r));
    }
    return {
      players: s.players, bank: s.bank, decks: s.decks.map((d) => d.length), board: s.board, nobles: s.nobles, p,
      turn: s.turn, final: s.final, phase: s.phase, discard: s.discard, last: s.last, timer: s.timer, over: s.over,
    };
  },
};

function tierOf(id) {
  return CARDS[id]?.tier ?? 0;
}
