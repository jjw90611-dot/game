// 인디언 포커: 내 카드만 못 보고 남의 카드는 다 보이는 상태에서 칩을 거는 블러핑 게임
import { fail, requirePlayer, shuffle, timer } from './util.js';

const BET_MS = 25000;
const SHOW_MS = 5500;
const DECK = [];
for (let n = 1; n <= 10; n++) DECK.push(n, n);

const inRound = (s) => s.players.filter((p) => s.cards[p.id] != null);
const live = (s) => inRound(s).filter((p) => !s.folded[p.id]);

function pay(s, pid, amt) {
  const x = Math.max(0, Math.min(amt, s.chips[pid]));
  s.chips[pid] -= x;
  s.pot += x;
  return x;
}

function finish(s) {
  let best = -1;
  for (const p of s.players) best = Math.max(best, s.chips[p.id]);
  const winners = s.players.filter((p) => s.chips[p.id] === best).map((p) => p.id);
  s.over = { winners, text: `${winners.map((id) => s.players.find((p) => p.id === id).name).join(', ')}님 승리! (칩 ${best}개)` };
}

function startRound(s, ctx) {
  s.round++;
  const alive = s.players.filter((p) => s.chips[p.id] > 0);
  if (alive.length <= 1 || (s.maxRounds && s.round > s.maxRounds)) { finish(s); return; }
  if (s.deck.length < alive.length) { s.deck = shuffle([...s.deck, ...s.discard], ctx.rng); s.discard = []; }
  s.cards = {};
  s.bets = {};
  s.folded = {};
  s.acted = {};
  s.cur = 0;
  s.show = null;
  for (const p of alive) {
    pay(s, p.id, 1);
    s.cards[p.id] = s.deck.pop();
    s.bets[p.id] = 0;
  }
  s.cap = Math.min(...alive.map((p) => s.chips[p.id]));
  // 딜러 다음 사람부터
  for (let k = 1; k <= s.players.length; k++) {
    const p = s.players[(s.dealer + k) % s.players.length];
    if (s.cards[p.id] != null) { s.turn = s.players.indexOf(p); break; }
  }
  s.phase = 'bet';
  s.log = `${s.round}라운드! 참가비 1개씩 냈어요.`;
  if (s.cap <= 0) { showdown(s, ctx); return; }
  s.deadline = ctx.now + BET_MS;
  s.timer = timer(BET_MS, ctx.now);
}

function showdown(s, ctx, only = null) {
  const rem = live(s);
  let winners;
  if (only) winners = [only];
  else {
    const top = Math.max(...rem.map((p) => s.cards[p.id]));
    winners = rem.filter((p) => s.cards[p.id] === top).map((p) => p.id);
  }
  const share = Math.floor(s.pot / winners.length);
  let extra = s.pot - share * winners.length;
  const gains = {};
  for (const id of winners) {
    const g = share + (extra > 0 ? 1 : 0);
    extra = Math.max(0, extra - 1);
    s.chips[id] += g;
    gains[id] = g;
  }
  s.show = { cards: { ...s.cards }, winners, gains, pot: s.pot, folded: { ...s.folded }, byFold: !!only };
  const names = winners.map((id) => s.players.find((p) => p.id === id).name).join(', ');
  s.log = only ? `모두 죽어서 ${names}님이 칩 ${s.pot}개를 가져가요.` : `${names}님이 가장 높은 카드! 칩 ${s.pot}개를 가져가요.`;
  s.pot = 0;
  s.phase = 'show';
  s.deadline = ctx.now + SHOW_MS;
  s.timer = timer(SHOW_MS, ctx.now);
}

function advance(s, ctx) {
  const rem = live(s);
  if (rem.length === 1) { showdown(s, ctx, rem[0].id); return; }
  if (rem.every((p) => s.acted[p.id] && s.bets[p.id] === s.cur)) { showdown(s, ctx); return; }
  for (let k = 1; k <= s.players.length; k++) {
    const i = (s.turn + k) % s.players.length;
    const p = s.players[i];
    if (s.cards[p.id] != null && !s.folded[p.id]) { s.turn = i; break; }
  }
  s.deadline = ctx.now + BET_MS;
  s.timer = timer(BET_MS, ctx.now);
}

function action(s, pid, a, ctx) {
  const me = requirePlayer(s, pid);
  if (s.over) fail('게임이 끝났어요.');
  if (s.phase !== 'bet') fail('지금은 베팅 시간이 아니에요.');
  if (me !== s.turn) fail('내 차례가 아니에요.');
  const name = s.players[me].name;
  const toCall = s.cur - s.bets[pid];
  if (a.type === 'call') {
    pay(s, pid, toCall);
    s.bets[pid] = s.cur;
    s.acted[pid] = true;
    s.log = toCall ? `${name}님 콜 (${toCall}개)` : `${name}님 체크`;
  } else if (a.type === 'raise') {
    const amt = Math.floor(Number(a.amt));
    if (!(amt >= 1)) fail('올릴 칩 개수를 정해 주세요.');
    const total = s.cur + amt;
    if (total > s.cap) fail(`이번 판은 최대 ${s.cap}개까지 걸 수 있어요.`);
    pay(s, pid, total - s.bets[pid]);
    s.bets[pid] = total;
    s.cur = total;
    s.acted = { [pid]: true };
    s.log = `${name}님 레이즈! ${amt}개 더 (총 ${total}개)`;
  } else if (a.type === 'fold') {
    s.folded[pid] = true;
    s.acted[pid] = true;
    s.log = `${name}님 다이`;
    if (s.penalty && s.cards[pid] === 10) {
      const x = pay(s, pid, 5);
      if (x) s.log += ` — 10을 들고 죽어서 벌칙 칩 ${x}개!`;
    }
  } else fail('알 수 없는 동작이에요.');
  advance(s, ctx);
}

function winChance(s, pid) {
  const others = live(s).filter((p) => p.id !== pid).map((p) => s.cards[p.id]);
  const top = Math.max(...others);
  const pool = [...DECK];
  for (const c of [...others, ...s.discard]) {
    const i = pool.indexOf(c);
    if (i >= 0) pool.splice(i, 1);
  }
  if (!pool.length) return 0.5;
  let w = 0;
  for (const c of pool) w += c > top ? 1 : c === top ? 0.5 : 0;
  return w / pool.length;
}

function auto(s, pid, ctx) {
  if (s.over || s.phase !== 'bet' || s.players[s.turn].id !== pid) return null;
  const p = winChance(s, pid) + (ctx.rng() - 0.5) * 0.15;
  const toCall = s.cur - s.bets[pid];
  const room = s.cap - s.cur;
  if (room > 0 && (p > 0.72 || ctx.rng() < 0.06)) return { type: 'raise', amt: Math.min(room, 1 + Math.floor(ctx.rng() * 3)) };
  if (toCall === 0 || p > 0.42 || (p > 0.25 && toCall <= 2)) return { type: 'call' };
  return { type: 'fold' };
}

export default {
  setup(players, opts, ctx) {
    const ps = shuffle(players.map((p) => ({ id: p.id, name: p.name })), ctx.rng);
    const start = Number(opts.chips) || 20;
    const chips = {};
    for (const p of ps) chips[p.id] = start;
    const s = {
      players: ps, chips, deck: shuffle([...DECK], ctx.rng), discard: [], cards: {}, bets: {}, folded: {}, acted: {},
      pot: 0, cur: 0, cap: 0, turn: 0, dealer: ps.length - 1, round: 0, maxRounds: Number(opts.rounds) || 10,
      penalty: Number(opts.penalty ?? 1) !== 0, phase: 'bet', show: null, log: '', over: null,
    };
    startRound(s, ctx);
    return s;
  },
  keepMin: 2,
  actors: (s) => (s.over || s.phase !== 'bet' ? [] : [s.players[s.turn].id]),
  action,
  auto,
  botDelay: () => 1600,
  timeout(s, ctx) {
    if (s.phase === 'show') {
      for (const id of Object.keys(s.cards)) s.discard.push(s.cards[id]);
      s.cards = {};
      s.dealer = (s.dealer + 1) % s.players.length;
      startRound(s, ctx);
      return;
    }
    const pid = s.players[s.turn].id;
    action(s, pid, { type: s.cur - s.bets[pid] === 0 ? 'call' : 'fold' }, ctx);
  },
  leave(s, pid, ctx) {
    if (s.over || s.cards[pid] == null) return;
    if (!s.folded[pid]) {
      s.folded[pid] = true;
      s.acted[pid] = true;
      if (s.phase === 'bet') {
        if (s.players[s.turn].id === pid) advance(s, ctx);
        else if (live(s).length === 1) showdown(s, ctx, live(s)[0].id);
      }
    }
    s.chips[pid] = 0;
  },
  // 게임 중 관전자 채팅은 관전자끼리만 (카드가 보이므로)
  chat(s, pid) {
    if (s.over || s.players.some((p) => p.id === pid)) return;
    return { to: [], spect: true, ch: '관전' };
  },
  view(s, pid) {
    const reveal = s.phase === 'show' || !!s.over;
    const cards = {};
    for (const [id, c] of Object.entries(s.cards)) cards[id] = reveal || id !== pid ? c : null;
    const toCall = pid && s.bets[pid] != null ? s.cur - s.bets[pid] : 0;
    return {
      players: s.players, chips: s.chips, cards, bets: s.bets, folded: s.folded, pot: s.pot, cur: s.cur, cap: s.cap,
      turn: s.turn, dealer: s.dealer, round: s.round, maxRounds: s.maxRounds, penalty: s.penalty, phase: s.phase,
      show: s.show, log: s.log, toCall, timer: s.timer, over: s.over, deckLeft: s.deck.length,
    };
  },
};
