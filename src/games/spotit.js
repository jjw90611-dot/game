// 같은 그림 찾기 (도블 스타일): 어떤 카드 두 장이든 딱 하나의 그림만 겹쳐요. 가장 먼저 찾으면 가운데 카드를 가져가요.
import { fail, requirePlayer, shuffle } from './util.js';

const ORDER = 7; // 카드당 그림 8개, 카드 57장, 그림 57종
const FREEZE_MS = 2000;

// 사영평면으로 카드 만들기: 어떤 두 카드든 공통 그림이 정확히 하나
export function makeCards(n = ORDER) {
  const cards = [];
  for (let i = 0; i <= n; i++) {
    const c = [0];
    for (let j = 0; j < n; j++) c.push(j + 1 + i * n);
    cards.push(c);
  }
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const c = [i + 1];
      for (let k = 0; k < n; k++) c.push(n + 1 + n * k + ((i * k + j) % n));
      cards.push(c);
    }
  }
  return cards;
}
const CARDS = makeCards();

export function common(a, b) {
  const set = new Set(CARDS[a]);
  return CARDS[b].find((x) => set.has(x));
}

function action(s, pid, a, ctx) {
  requirePlayer(s, pid);
  if (s.over) fail('게임이 끝났어요.');
  if (a.type !== 'match') fail('알 수 없는 동작이에요.');
  if ((s.freeze[pid] || 0) > ctx.now) fail('틀려서 잠깐 쉬는 중이에요!');
  if (a.center != null && Number(a.center) !== s.center) fail('아쉬워요! 다른 사람이 먼저 가져갔어요.');
  const sym = Number(a.sym);
  const ans = common(s.hands[pid], s.center);
  if (sym !== ans) {
    s.freeze[pid] = ctx.now + FREEZE_MS;
    s.miss = { pid, at: ctx.now, n: (s.miss?.n || 0) + 1 };
    s.deadline = Math.max(s.deadline || 0, s.freeze[pid]); // 쉬는 시간이 끝나면 다시 진행
    return;
  }
  s.scores[pid]++;
  s.won = { pid, sym, card: s.center, n: s.taken + 1 };
  s.taken++;
  s.hands[pid] = s.center;
  if (!s.deck.length) {
    let best = -1;
    for (const p of s.players) best = Math.max(best, s.scores[p.id]);
    const winners = s.players.filter((p) => s.scores[p.id] === best).map((p) => p.id);
    s.over = { winners, text: `${winners.map((id) => s.players.find((p) => p.id === id).name).join(', ')}님 승리! (${best}장)` };
    return;
  }
  s.center = s.deck.pop();
}

export default {
  setup(players, opts, ctx) {
    const ps = players.map((p) => ({ id: p.id, name: p.name }));
    const ids = shuffle(CARDS.map((_, i) => i), ctx.rng);
    const hands = {}, scores = {};
    for (const p of ps) { hands[p.id] = ids.pop(); scores[p.id] = 0; }
    const center = ids.pop();
    const n = Math.min(ids.length, Number(opts.cards) || 30);
    return {
      players: ps, hands, scores, center, deck: ids.slice(0, n - 1), total: n, taken: 0, freeze: {}, miss: null, won: null,
      over: null,
    };
  },
  keepMin: 2,
  actors: (s) => (s.over ? [] : s.players.map((p) => p.id)),
  action,
  auto: (s, pid, ctx) => (s.over || (s.freeze[pid] || 0) > ctx.now ? null : { type: 'match', sym: common(s.hands[pid], s.center), center: s.center }),
  botDelay: () => 2600 + Math.floor(Math.random() * 3200),
  timeout(s) { s.deadline = null; },
  view: (s) => ({
    deadline: undefined,
    players: s.players, scores: s.scores, center: s.center, centerSyms: CARDS[s.center], hands: s.hands,
    handSyms: Object.fromEntries(Object.entries(s.hands).map(([id, c]) => [id, CARDS[c]])),
    left: s.deck.length, total: s.total, taken: s.taken, freeze: s.freeze, miss: s.miss, won: s.won, over: s.over,
  }),
};
