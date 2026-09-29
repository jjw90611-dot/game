import { fail, requirePlayer, timer } from './util.js';

import { CATS, UPPER, scoreFor, totals } from '../../public/js/shared/yacht.js';

export { CATS, scoreFor, totals };
const EXPECT = { ones: 2, twos: 5, threes: 8, fours: 11, fives: 14, sixes: 17, choice: 21, fourkind: 12, fullhouse: 14, sstraight: 9, lstraight: 7, yacht: 6 };
const TURN_MS = 45000;

function util(cat, dice, sc) {
  const v = scoreFor(cat, dice);
  let u = v - EXPECT[cat];
  const idx = UPPER.indexOf(cat);
  if (idx >= 0 && v >= (idx + 1) * 3 && totals(sc).upper < 63) u += 4;
  return u;
}

function bestCat(dice, sc) {
  let best = null, bu = -Infinity;
  for (const c of CATS) {
    if (sc[c] != null) continue;
    const u = util(c, dice, sc);
    if (u > bu) { bu = u; best = c; }
  }
  return { cat: best, u: bu };
}

function chooseHold(dice, sc, rng) {
  let bestMask = 31, bestVal = bestCat(dice, sc).u;
  for (let m = 0; m < 31; m++) {
    let total = 0;
    const K = 40;
    for (let k = 0; k < K; k++) {
      const d = dice.map((v, i) => (m & (1 << i) ? v : 1 + Math.floor(rng() * 6)));
      total += bestCat(d, sc).u;
    }
    const val = total / K;
    if (val > bestVal + 0.3) { bestVal = val; bestMask = m; }
  }
  return dice.map((_, i) => !!(bestMask & (1 << i)));
}

function rollDice(s, ctx) {
  s.dice = s.dice.map((v, i) => (s.rolls > 0 && s.held[i] ? v : 1 + Math.floor(ctx.rng() * 6)));
  s.rolls++;
  s.rollId++;
  if (s.rolls >= 3) s.held = [false, false, false, false, false];
}

function nextTurn(s, ctx) {
  s.turn = (s.turn + 1) % s.players.length;
  if (s.turn === 0) s.round++;
  if (s.round > 12) {
    let best = -1;
    const tot = s.players.map((p) => totals(s.scores[p.id]).total);
    for (const t of tot) best = Math.max(best, t);
    const winners = s.players.filter((_, i) => tot[i] === best).map((p) => p.id);
    const names = s.players.filter((p) => winners.includes(p.id)).map((p) => p.name).join(', ');
    s.over = {
      winners: s.players.length === 1 ? [] : winners,
      text: s.players.length === 1 ? `최종 점수 ${best}점!` : `${names}님 승리! (${best}점)`,
    };
    return;
  }
  s.rolls = 0;
  s.held = [false, false, false, false, false];
  s.deadline = ctx.now + TURN_MS;
  s.timer = timer(TURN_MS, ctx.now);
}

function action(s, pid, a, ctx) {
  const me = requirePlayer(s, pid);
  if (s.over) fail('게임이 끝났어요.');
  if (me !== s.turn) fail('내 차례가 아니에요.');
  const sc = s.scores[pid];
  if (a.type === 'roll') {
    if (s.rolls >= 3) fail('더 이상 굴릴 수 없어요.');
    if (Array.isArray(a.hold) && s.rolls > 0) s.held = s.dice.map((_, i) => !!a.hold[i]);
    if (s.rolls > 0 && s.held.every(Boolean)) fail('모든 주사위가 고정되어 있어요.');
    rollDice(s, ctx);
  } else if (a.type === 'hold') {
    const i = Number(a.i);
    if (s.rolls === 0 || s.rolls >= 3) fail('지금은 고정할 수 없어요.');
    if (!(i >= 0 && i < 5)) fail('잘못된 주사위예요.');
    s.held[i] = !s.held[i];
  } else if (a.type === 'score') {
    if (s.rolls === 0) fail('먼저 주사위를 굴려 주세요.');
    if (!CATS.includes(a.cat) || sc[a.cat] != null) fail('이미 기록했거나 없는 칸이에요.');
    sc[a.cat] = scoreFor(a.cat, s.dice);
    s.lastScore = { pid, cat: a.cat, v: sc[a.cat] };
    nextTurn(s, ctx);
  } else fail('알 수 없는 동작이에요.');
}

function auto(s, pid, ctx) {
  if (s.over || s.players[s.turn].id !== pid) return null;
  const sc = s.scores[pid];
  if (s.rolls === 0) return { type: 'roll' };
  if (s.rolls < 3) {
    const hold = chooseHold(s.dice, sc, ctx.rng);
    if (!hold.every(Boolean)) return { type: 'roll', hold };
  }
  return { type: 'score', cat: bestCat(s.dice, sc).cat };
}

export default {
  setup(players, opts, ctx) {
    const ps = players.map((p) => ({ id: p.id, name: p.name }));
    const scores = {};
    for (const p of ps) scores[p.id] = {};
    return {
      players: ps, scores, turn: 0, round: 1, dice: [1, 2, 3, 4, 5], held: [false, false, false, false, false],
      rolls: 0, rollId: 0, lastScore: null, deadline: ctx.now + TURN_MS, timer: timer(TURN_MS, ctx.now), over: null,
    };
  },
  actors: (s) => (s.over ? [] : [s.players[s.turn].id]),
  action,
  auto,
  botDelay: (s) => (s.rolls === 0 ? 900 : 1300),
  timeout(s, ctx) {
    const pid = s.players[s.turn].id;
    if (s.rolls === 0) rollDice(s, ctx);
    action(s, pid, { type: 'score', cat: bestCat(s.dice, s.scores[pid]).cat }, ctx);
  },
  view(s) {
    const tot = {};
    for (const p of s.players) tot[p.id] = totals(s.scores[p.id]);
    return { ...s, deadline: undefined, totals: tot };
  },
};
