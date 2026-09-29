import { fail, requirePlayer, shuffle, timer, range } from './util.js';

// 카드 id: 과일 = floor(id / 14), 개수 = COUNTS[id % 14]
const COUNTS = [1, 1, 1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 5];
export const card = (id) => ({ f: Math.floor(id / 14), n: COUNTS[id % 14] });
const FLIP_MS = 6000;
const GAME_MS = 5 * 60 * 1000;

export function fiveShowing(s) {
  const sum = [0, 0, 0, 0];
  for (const p of s.players) {
    const pile = s.piles[p.id];
    if (pile.length) {
      const c = card(pile[pile.length - 1]);
      sum[c.f] += c.n;
    }
  }
  return sum.includes(5);
}

function activeIds(s) {
  return s.players.filter((p) => !s.out[p.id]).map((p) => p.id);
}

function total(s, pid) {
  return s.decks[pid].length + s.piles[pid].length;
}

function finish(s, reason) {
  let best = -1;
  for (const p of s.players) best = Math.max(best, s.decks[p.id].length);
  const winners = s.players.filter((p) => s.decks[p.id].length === best && best > 0).map((p) => p.id);
  const names = s.players.filter((p) => winners.includes(p.id)).map((p) => p.name).join(', ');
  s.over = { winners, text: winners.length ? `${reason ? reason + ' ' : ''}${names}님 승리! (카드 ${best}장)` : '무승부예요.' };
}

function setDeadline(s, ms, ctx) {
  s.deadline = Math.min(ctx.now + ms, s.endAt);
}

// 다음에 카드를 뒤집을 사람을 찾습니다. 카드가 없으면 탈락 처리
function advance(s, from, ctx) {
  const n = s.players.length;
  for (let k = 0; k < n; k++) {
    const i = (from + k) % n;
    const p = s.players[i];
    if (s.out[p.id]) continue;
    if (!s.decks[p.id].length) {
      s.out[p.id] = true;
      ctx.sys?.(`${p.name}님이 카드를 모두 잃어 탈락했어요.`);
      continue;
    }
    s.turn = i;
    break;
  }
  const act = activeIds(s);
  if (act.length <= 1) {
    finish(s, '');
    return false;
  }
  if (s.out[s.players[s.turn].id]) s.turn = s.players.findIndex((p) => !s.out[p.id]);
  return true;
}

function flip(s, ctx) {
  const p = s.players[s.turn];
  const id = s.decks[p.id].pop();
  s.piles[p.id].push(id);
  s.flips++;
  if (!advance(s, s.turn + 1, ctx)) return;
  setDeadline(s, FLIP_MS, ctx);
}

function action(s, pid, a, ctx) {
  const me = requirePlayer(s, pid);
  if (s.over) fail('게임이 끝났어요.');
  if (s.out[pid]) fail('탈락했어요.');
  if (a.type === 'flip') {
    if (s.phase !== 'play') fail('잠시만 기다려 주세요.');
    if (me !== s.turn) fail('내 차례가 아니에요.');
    flip(s, ctx);
  } else if (a.type === 'ring') {
    if (s.phase !== 'play') fail('이미 누군가 종을 쳤어요!');
    const ok = fiveShowing(s);
    s.ringSeq++;
    if (ok) {
      const won = [];
      for (const p of s.players) { won.push(...s.piles[p.id]); s.piles[p.id] = []; }
      shuffle(won, ctx.rng);
      s.decks[pid].unshift(...won);
      s.ring = { pid, ok: true, n: won.length, seq: s.ringSeq };
      s.turn = me;
    } else {
      let given = 0;
      for (const p of s.players) {
        if (p.id === pid || s.out[p.id] || !s.decks[pid].length) continue;
        s.decks[p.id].unshift(s.decks[pid].pop());
        given++;
      }
      s.ring = { pid, ok: false, n: given, seq: s.ringSeq };
    }
    s.phase = 'pause';
    setDeadline(s, ok ? 1800 : 1300, ctx);
  } else fail('알 수 없는 동작이에요.');
}

function resume(s, ctx) {
  s.phase = 'play';
  if (!advance(s, s.turn, ctx)) return;
  setDeadline(s, FLIP_MS, ctx);
}

export default {
  setup(players, opts, ctx) {
    const ps = shuffle(players.map((p) => ({ id: p.id, name: p.name })), ctx.rng);
    const cards = shuffle(range(56), ctx.rng);
    const decks = {}, piles = {}, out = {};
    ps.forEach((p) => { decks[p.id] = []; piles[p.id] = []; out[p.id] = false; });
    const per = Math.floor(56 / ps.length);
    ps.forEach((p, i) => { decks[p.id] = cards.slice(i * per, (i + 1) * per); });
    const endAt = ctx.now + GAME_MS;
    return {
      players: ps, decks, piles, out, turn: 0, phase: 'pause', ring: null, ringSeq: 0, flips: 0,
      endAt, deadline: ctx.now + 2500, timer: { end: endAt, total: GAME_MS }, over: null,
    };
  },
  actors(s) {
    if (s.over) return [];
    const list = [];
    if (s.phase === 'play') {
      list.push(s.players[s.turn].id);
      if (fiveShowing(s)) for (const id of activeIds(s)) if (!list.includes(id)) list.push(id);
    }
    return list;
  },
  action,
  auto(s, pid) {
    if (s.over || s.phase !== 'play' || s.out[pid]) return null;
    if (fiveShowing(s)) return { type: 'ring' };
    if (s.players[s.turn].id === pid) return { type: 'flip' };
    return null;
  },
  botDelay: (s) => (fiveShowing(s) ? 1100 + Math.random() * 1400 : 900 + Math.random() * 600),
  timeout(s, ctx) {
    if (ctx.now >= s.endAt - 50) {
      finish(s, '시간 종료!');
      return;
    }
    if (s.phase === 'pause') resume(s, ctx);
    else flip(s, ctx);
  },
  leave(s, pid, ctx) {
    s.out[pid] = true;
    if (s.phase === 'play' && s.players[s.turn].id === pid) {
      if (advance(s, s.turn + 1, ctx)) setDeadline(s, FLIP_MS, ctx);
    } else if (activeIds(s).length <= 1) finish(s, '');
  },
  view(s) {
    const tops = {}, decks = {}, piles = {};
    for (const p of s.players) {
      const pile = s.piles[p.id];
      tops[p.id] = pile.length ? card(pile[pile.length - 1]) : null;
      decks[p.id] = s.decks[p.id].length;
      piles[p.id] = pile.length;
    }
    return {
      players: s.players, tops, decks, piles, out: s.out, turn: s.turn, phase: s.phase, ring: s.ring,
      flips: s.flips, timer: s.timer, flipEnd: s.phase === 'play' ? s.deadline : null, over: s.over,
      totals: Object.fromEntries(s.players.map((p) => [p.id, total(s, p.id)])),
    };
  },
};
