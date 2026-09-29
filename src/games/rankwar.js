// 계급 전쟁 (달무티 스타일): 숫자가 작을수록 강한 카드. 같은 숫자 묶음을 더 강하게 내며 손패를 먼저 비우는 게임
// 1은 1장, 2는 2장 … 12는 12장, 광대(13) 2장은 다른 숫자와 함께 내면 그 숫자로 쓰여요.
import { fail, requirePlayer, shuffle, timer } from './util.js';

export const JESTER = 13;
const TURN_MS = 30000;
const RESULT_MS = 7000;
export const TITLES = ['왕', '귀족', '시민', '시민', '시민', '시민', '하인', '노예'];

export function titleOf(place, n) {
  if (place === 0) return '왕';
  if (place === n - 1) return '노예';
  if (n >= 4 && place === 1) return '귀족';
  if (n >= 4 && place === n - 2) return '하인';
  return '시민';
}

function newDeck(rng) {
  const d = [];
  for (let r = 1; r <= 12; r++) for (let k = 0; k < r; k++) d.push(r);
  d.push(JESTER, JESTER);
  return shuffle(d, rng);
}

const sortHand = (h) => h.sort((a, b) => a - b);
const active = (s) => s.order.filter((id) => !s.finished.includes(id));
const nameOf = (s, id) => s.players.find((p) => p.id === id)?.name ?? '???';

function nextActive(s, id) {
  const ord = s.order;
  const i = ord.indexOf(id);
  for (let k = 1; k <= ord.length; k++) {
    const x = ord[(i + k) % ord.length];
    if (!s.finished.includes(x) && !s.gone[x]) return x;
  }
  return id;
}

function take(hand, card) {
  const i = hand.indexOf(card);
  if (i < 0) return false;
  hand.splice(i, 1);
  return true;
}

function startRound(s, ctx) {
  s.round++;
  const deck = newDeck(ctx.rng);
  s.hands = {};
  for (const id of s.order) s.hands[id] = [];
  let k = 0;
  while (deck.length) { s.hands[s.order[k % s.order.length]].push(deck.pop()); k++; }
  for (const id of s.order) sortHand(s.hands[id]);
  s.tax = [];
  const n = s.order.length;
  if (s.round > 1 && n >= 3) {
    const swap = (hi, lo, cnt) => {
      const low = s.hands[lo], high = s.hands[hi];
      const give = low.filter((c) => c !== JESTER).slice(0, cnt);
      for (const c of give) { take(low, c); high.push(c); }
      sortHand(high);
      const back = high.filter((c) => c !== JESTER).slice(-cnt);
      for (const c of back) { take(high, c); low.push(c); }
      sortHand(low);
      s.tax.push({ from: lo, to: hi, give, back });
    };
    swap(s.order[0], s.order[n - 1], 2);
    if (n >= 4) swap(s.order[1], s.order[n - 2], 1);
  }
  s.finished = [];
  s.trick = null;
  s.passes = 0;
  s.lastPlay = null;
  s.turnId = s.order.find((id) => !s.gone[id]) ?? s.order[0];
  s.phase = 'play';
  s.log = s.round === 1 ? `${nameOf(s, s.turnId)}님이 왕 자리에서 먼저 시작해요.` : '세금을 걷고 새 라운드를 시작해요.';
  s.deadline = ctx.now + TURN_MS;
  s.timer = timer(TURN_MS, ctx.now);
}

function endRound(s, ctx) {
  const rest = active(s).filter((id) => !s.gone[id]);
  const gone = s.order.filter((id) => s.gone[id] && !s.finished.includes(id));
  const finalOrder = [...s.finished, ...rest, ...gone];
  const n = finalOrder.length;
  finalOrder.forEach((id, i) => { s.scores[id] += n - 1 - i; });
  s.results.push(finalOrder);
  s.order = finalOrder;
  s.phase = 'result';
  s.log = `${s.round}라운드 결과: ${finalOrder.map((id, i) => `${titleOf(i, n)} ${nameOf(s, id)}`).join(' · ')}`;
  if (s.round >= s.rounds) {
    let best = -1;
    for (const p of s.players) best = Math.max(best, s.scores[p.id]);
    const winners = s.players.filter((p) => s.scores[p.id] === best && !s.gone[p.id]).map((p) => p.id);
    s.over = { winners, text: `${winners.map((id) => nameOf(s, id)).join(', ')}님 승리! (총 ${best}점)` };
    return;
  }
  s.deadline = ctx.now + RESULT_MS;
  s.timer = timer(RESULT_MS, ctx.now);
}

function afterMove(s, ctx, playedBy) {
  const act = active(s).filter((id) => !s.gone[id]);
  if (act.length <= 1) { endRound(s, ctx); return; }
  if (s.trick) {
    const byActive = act.includes(s.trick.by);
    const need = byActive ? act.length - 1 : act.length;
    if (s.passes >= need) {
      const lead = byActive ? s.trick.by : nextActive(s, s.trick.by);
      s.trick = null;
      s.passes = 0;
      s.turnId = lead;
      s.log += ` 모두 넘겨서 ${nameOf(s, lead)}님이 새로 시작해요.`;
      s.deadline = ctx.now + TURN_MS;
      s.timer = timer(TURN_MS, ctx.now);
      return;
    }
  }
  s.turnId = nextActive(s, playedBy);
  s.deadline = ctx.now + TURN_MS;
  s.timer = timer(TURN_MS, ctx.now);
}

function action(s, pid, a, ctx) {
  requirePlayer(s, pid);
  if (s.over) fail('게임이 끝났어요.');
  if (s.phase !== 'play') fail('지금은 카드를 낼 수 없어요.');
  if (s.turnId !== pid) fail('내 차례가 아니에요.');
  const name = nameOf(s, pid);
  if (a.type === 'pass') {
    if (!s.trick) fail('새로 시작하는 차례에는 카드를 내야 해요.');
    s.passes++;
    s.log = `${name}님 패스`;
    afterMove(s, ctx, pid);
    return;
  }
  if (a.type !== 'play') fail('알 수 없는 동작이에요.');
  const cards = Array.isArray(a.cards) ? a.cards.map(Number) : [];
  if (!cards.length) fail('낼 카드를 골라 주세요.');
  const normal = cards.filter((c) => c !== JESTER);
  if (normal.some((c) => c !== normal[0] || !(c >= 1 && c <= 12))) fail('같은 숫자끼리만 함께 낼 수 있어요. (광대는 어디든 섞을 수 있어요)');
  const rank = normal.length ? normal[0] : JESTER;
  const hand = [...s.hands[pid]];
  for (const c of cards) if (!take(hand, c)) fail('가지고 있지 않은 카드예요.');
  if (s.trick) {
    if (cards.length !== s.trick.count) fail(`${s.trick.count}장을 함께 내야 해요.`);
    if (!(rank < s.trick.rank)) fail(`${s.trick.rank}보다 작은(강한) 숫자를 내야 해요.`);
  }
  s.hands[pid] = hand;
  s.trick = { rank, count: cards.length, by: pid, cards };
  s.lastPlay = { by: pid, rank, cards };
  s.passes = 0;
  s.log = `${name}님이 ${rank === JESTER ? '광대' : rank} ${cards.length}장을 냈어요.`;
  if (!hand.length) {
    s.finished.push(pid);
    s.log += ` ${name}님 손패를 모두 비웠어요! (${s.finished.length}등)`;
  }
  afterMove(s, ctx, pid);
}

function counts(hand) {
  const c = {};
  for (const x of hand) c[x] = (c[x] || 0) + 1;
  return c;
}

function auto(s, pid, ctx) {
  if (s.over || s.phase !== 'play' || s.turnId !== pid) return null;
  const hand = s.hands[pid];
  const c = counts(hand);
  const jest = c[JESTER] || 0;
  const ranks = Object.keys(c).map(Number).filter((r) => r !== JESTER).sort((a, b) => b - a);
  if (!s.trick) {
    if (!ranks.length) return { type: 'play', cards: Array(jest).fill(JESTER) };
    const r = ranks[0];
    return { type: 'play', cards: Array(c[r]).fill(r) };
  }
  const need = s.trick.count;
  const ok = ranks.filter((r) => r < s.trick.rank && c[r] >= need);
  if (ok.length) {
    const exact = ok.filter((r) => c[r] === need);
    const r = (exact.length ? exact : ok)[0];
    if (r <= 3 && hand.length > 10 && ctx.rng() < 0.5) return { type: 'pass' };
    return { type: 'play', cards: Array(need).fill(r) };
  }
  if (jest && (hand.length < 12 || ctx.rng() < 0.3)) {
    const r = ranks.find((x) => x < s.trick.rank && c[x] + jest >= need);
    if (r) return { type: 'play', cards: [...Array(c[r] >= need ? need : c[r]).fill(r), ...Array(Math.max(0, need - c[r])).fill(JESTER)] };
    if (!ranks.length && jest >= need && s.trick.rank > JESTER) return { type: 'play', cards: Array(need).fill(JESTER) };
  }
  return { type: 'pass' };
}

export default {
  setup(players, opts, ctx) {
    const ps = players.map((p) => ({ id: p.id, name: p.name }));
    const scores = {};
    for (const p of ps) scores[p.id] = 0;
    const s = {
      players: ps, order: shuffle(ps.map((p) => p.id), ctx.rng), scores, rounds: Number(opts.rounds) || 2, round: 0,
      hands: {}, finished: [], trick: null, passes: 0, lastPlay: null, turnId: null, tax: [], results: [], gone: {},
      phase: 'play', log: '', over: null,
    };
    startRound(s, ctx);
    return s;
  },
  keepMin: 2,
  actors: (s) => (s.over || s.phase !== 'play' ? [] : [s.turnId]),
  action,
  auto,
  botDelay: () => 1200,
  timeout(s, ctx) {
    if (s.phase === 'result') { startRound(s, ctx); return; }
    const pid = s.turnId;
    action(s, pid, s.trick ? { type: 'pass' } : auto(s, pid, ctx), ctx);
  },
  leave(s, pid, ctx) {
    if (s.over) return;
    s.gone[pid] = true;
    if (s.phase === 'play') {
      if (s.turnId === pid) afterMove(s, ctx, pid);
      else if (active(s).filter((id) => !s.gone[id]).length <= 1) endRound(s, ctx);
    }
  },
  view(s, pid) {
    const handCount = {};
    for (const [id, h] of Object.entries(s.hands)) handCount[id] = h.length;
    return {
      players: s.players, order: s.order, scores: s.scores, rounds: s.rounds, round: s.round, hand: pid ? s.hands[pid] || [] : null,
      handCount, finished: s.finished, trick: s.trick, turnId: s.turnId, tax: s.tax, results: s.results, gone: s.gone,
      phase: s.phase, log: s.log, timer: s.timer, over: s.over,
    };
  },
};
