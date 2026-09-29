import { fail, requirePlayer, shuffle, timer, range } from './util.js';
import { DECK, canPlay } from '../../public/js/shared/onecard.js';

const TURN_MS = 20000;

function nextIdx(s, steps = 1) {
  const n = s.players.length;
  return (((s.turn + s.dir * steps) % n) + n) % n;
}

function drawOne(s) {
  if (!s.deck.length) {
    const top = s.discard.pop();
    s.deck = shuffle(s.discard, Math.random);
    s.discard = [top];
  }
  return s.deck.length ? s.deck.pop() : null;
}

function giveCards(s, pid, n) {
  let got = 0;
  for (let k = 0; k < n; k++) {
    const id = drawOne(s);
    if (id == null) break;
    s.hands[pid].push(id);
    got++;
  }
  return got;
}

function setTurn(s, idx, ctx) {
  s.turn = idx;
  s.drew = null;
  s.deadline = ctx.now + TURN_MS;
  s.timer = timer(TURN_MS, ctx.now);
}

function bestColor(hand) {
  const cnt = [0, 0, 0, 0];
  for (const id of hand) if (DECK[id].c < 4) cnt[DECK[id].c]++;
  let best = 0;
  for (let c = 1; c < 4; c++) if (cnt[c] > cnt[best]) best = c;
  return best;
}

function action(s, pid, a, ctx) {
  const me = requirePlayer(s, pid);
  if (s.over) fail('게임이 끝났어요.');
  if (me !== s.turn) fail('내 차례가 아니에요.');
  const hand = s.hands[pid];
  const topId = s.discard[s.discard.length - 1];
  if (a.type === 'play') {
    const id = Number(a.id);
    if (!hand.includes(id)) fail('가지고 있지 않은 카드예요.');
    if (s.drew != null && id !== s.drew) fail('방금 가져온 카드만 낼 수 있어요.');
    if (!canPlay(id, topId, s.color)) fail('낼 수 없는 카드예요.');
    const card = DECK[id];
    const color = Number(a.color);
    if (card.c === 4 && !(color >= 0 && color <= 3)) fail('바꿀 색을 골라 주세요.');
    hand.splice(hand.indexOf(id), 1);
    s.discard.push(id);
    s.color = card.c === 4 ? color : card.c;
    s.last = { pid, id, color: s.color };
    let steps = 1;
    const n = s.players.length;
    if (card.v === 'rev') {
      if (n === 2) steps = 2;
      else s.dir = -s.dir;
    } else if (card.v === 'skip') steps = 2;
    else if (card.v === 'draw2' || card.v === 'wild4') {
      const victim = s.players[nextIdx(s, 1)];
      const k = card.v === 'draw2' ? 2 : 4;
      giveCards(s, victim.id, k);
      s.last.victim = victim.id;
      s.last.k = k;
      steps = 2;
    }
    if (!hand.length) {
      s.over = { winners: [pid], text: `${s.players[me].name}님이 카드를 모두 냈어요! 승리!` };
      return;
    }
    if (hand.length === 1) ctx.sys?.(`📣 ${s.players[me].name}: 원카드!`);
    setTurn(s, nextIdx(s, steps), ctx);
  } else if (a.type === 'draw') {
    if (s.drew != null) fail('이미 카드를 가져왔어요.');
    const id = drawOne(s);
    s.last = { pid, drew: true };
    if (id == null) {
      setTurn(s, nextIdx(s, 1), ctx);
      return;
    }
    hand.push(id);
    if (canPlay(id, topId, s.color)) {
      s.drew = id;
      s.deadline = ctx.now + 10000;
      s.timer = timer(10000, ctx.now);
    } else setTurn(s, nextIdx(s, 1), ctx);
  } else if (a.type === 'pass') {
    if (s.drew == null) fail('먼저 카드를 가져와야 해요.');
    setTurn(s, nextIdx(s, 1), ctx);
  } else fail('알 수 없는 동작이에요.');
}

function auto(s, pid) {
  if (s.over || s.players[s.turn].id !== pid) return null;
  const hand = s.hands[pid];
  const topId = s.discard[s.discard.length - 1];
  if (s.drew != null) return { type: 'play', id: s.drew, color: bestColor(hand.filter((x) => x !== s.drew)) };
  const playable = hand.filter((id) => canPlay(id, topId, s.color));
  if (!playable.length) return { type: 'draw' };
  const nextCount = s.hands[s.players[nextIdx(s, 1)].id].length;
  const rank = (id) => {
    const c = DECK[id];
    if (c.v === 'wild4') return nextCount <= 2 ? 50 : -20;
    if (c.v === 'wild') return -10;
    if (c.v === 'draw2' || c.v === 'skip') return nextCount <= 3 ? 40 : 15;
    if (c.v === 'rev') return 12;
    return Number(c.v) + (c.c === s.color ? 3 : 0);
  };
  playable.sort((x, y) => rank(y) - rank(x));
  const id = playable[0];
  return { type: 'play', id, color: bestColor(hand.filter((x) => x !== id)) };
}

export default {
  setup(players, opts, ctx) {
    const ps = shuffle(players.map((p) => ({ id: p.id, name: p.name })), ctx.rng);
    const deck = shuffle(range(DECK.length), ctx.rng);
    const hands = {};
    for (const p of ps) hands[p.id] = deck.splice(0, 7);
    // 첫 카드는 숫자 카드로
    let idx = deck.findIndex((id) => /^\d$/.test(DECK[id].v));
    const first = deck.splice(idx, 1)[0];
    return {
      players: ps, hands, deck, discard: [first], color: DECK[first].c, turn: 0, dir: 1, drew: null,
      last: null, deadline: ctx.now + TURN_MS, timer: timer(TURN_MS, ctx.now), over: null,
    };
  },
  actors: (s) => (s.over ? [] : [s.players[s.turn].id]),
  action,
  auto,
  botDelay: () => 1000 + Math.random() * 700,
  timeout(s, ctx) {
    const pid = s.players[s.turn].id;
    const a = auto(s, pid);
    try {
      action(s, pid, a, ctx);
    } catch {
      setTurn(s, nextIdx(s, 1), ctx);
    }
  },
  view(s, pid) {
    const counts = {};
    for (const p of s.players) counts[p.id] = s.hands[p.id].length;
    return {
      players: s.players, hand: s.hands[pid] ?? null, counts, top: s.discard[s.discard.length - 1],
      color: s.color, turn: s.turn, dir: s.dir, drew: s.players[s.turn]?.id === pid ? s.drew : null,
      deck: s.deck.length, last: s.last, timer: s.timer, over: s.over,
    };
  },
};
