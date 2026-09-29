import { fail, requirePlayer, shuffle, timer } from './util.js';

export const N = 15;
const DIRS = [[1, 0], [0, 1], [1, 1], [1, -1]];

function at(b, x, y) {
  return x < 0 || y < 0 || x >= N || y >= N ? -1 : b[y * N + x];
}

function runThrough(b, i, color, dx, dy) {
  const x0 = i % N, y0 = (i / N) | 0;
  let a = 0, c = 0;
  while (at(b, x0 - dx * (a + 1), y0 - dy * (a + 1)) === color) a++;
  while (at(b, x0 + dx * (c + 1), y0 + dy * (c + 1)) === color) c++;
  return { a, c, len: a + c + 1 };
}

export function winLine(b, i, color) {
  const x0 = i % N, y0 = (i / N) | 0;
  for (const [dx, dy] of DIRS) {
    const r = runThrough(b, i, color, dx, dy);
    if (r.len >= 5) {
      const line = [];
      for (let k = -r.a; k <= r.c; k++) line.push((y0 + dy * k) * N + x0 + dx * k);
      return line;
    }
  }
  return null;
}

function straightFour(b, i, dx, dy) {
  const x0 = i % N, y0 = (i / N) | 0;
  const r = runThrough(b, i, 1, dx, dy);
  if (r.len !== 4) return false;
  return at(b, x0 - dx * (r.a + 1), y0 - dy * (r.a + 1)) === 0 && at(b, x0 + dx * (r.c + 1), y0 + dy * (r.c + 1)) === 0;
}

// b[i]에 흑돌이 놓인 상태에서 해당 방향에 "열린 3"이 생겼는지 검사
function openThreeDir(b, i, dx, dy) {
  if (runThrough(b, i, 1, dx, dy).len >= 4) return false; // 이미 4 이상이면 3이 아님
  const x0 = i % N, y0 = (i / N) | 0;
  for (let k = -4; k <= 4; k++) {
    if (!k) continue;
    const x = x0 + dx * k, y = y0 + dy * k;
    if (at(b, x, y) !== 0) continue;
    b[y * N + x] = 1;
    const ok = straightFour(b, i, dx, dy);
    b[y * N + x] = 0;
    if (ok) return true;
  }
  return false;
}

export function isDoubleThree(b, i) {
  let n = 0;
  for (const [dx, dy] of DIRS) if (openThreeDir(b, i, dx, dy)) n++;
  return n >= 2;
}

function forbidden(b, i, color, ban33) {
  if (color !== 1 || !ban33 || b[i]) return false;
  b[i] = 1;
  const bad = !winLine(b, i, 1) && isDoubleThree(b, i);
  b[i] = 0;
  return bad;
}

const WEIGHT = [1, 10, 70, 800, 100000];

function evalCell(b, i, color) {
  const x0 = i % N, y0 = (i / N) | 0;
  let score = 0;
  for (const [dx, dy] of DIRS) {
    for (let s = -4; s <= 0; s++) {
      let cnt = 0, blocked = false;
      for (let k = s; k < s + 5; k++) {
        const v = at(b, x0 + dx * k, y0 + dy * k);
        if (v === -1 || v === 3 - color) { blocked = true; break; }
        if (v === color) cnt++;
      }
      if (!blocked) score += WEIGHT[cnt];
    }
  }
  return score;
}

function near(b, i, d) {
  const x0 = i % N, y0 = (i / N) | 0;
  for (let y = y0 - d; y <= y0 + d; y++) for (let x = x0 - d; x <= x0 + d; x++) if (at(b, x, y) > 0) return true;
  return false;
}

export function bestMove(b, color, ban33, rng = Math.random) {
  if (b.every((v) => v === 0)) return ((N / 2) | 0) * N + ((N / 2) | 0);
  let best = -1, bestScore = -Infinity;
  for (let i = 0; i < N * N; i++) {
    if (b[i] || !near(b, i, 2) || forbidden(b, i, color, ban33)) continue;
    const s = evalCell(b, i, color) + evalCell(b, i, 3 - color) * 0.92 + rng() * 3;
    if (s > bestScore) { bestScore = s; best = i; }
  }
  if (best < 0) best = b.findIndex((v, i) => v === 0 && !forbidden(b, i, color, ban33));
  if (best < 0) best = b.indexOf(0);
  return best;
}

function place(s, pid, a, ctx) {
  const me = requirePlayer(s, pid);
  if (s.over) fail('게임이 끝났어요.');
  if (a.type === 'resign') {
    s.over = { winners: [s.players[1 - me].id], text: `${s.players[me].name}님이 기권했어요. ${s.players[1 - me].name}님 승리!` };
    return;
  }
  if (a.type !== 'place') fail('알 수 없는 동작이에요.');
  if (me !== s.turn) fail('상대 차례예요.');
  const i = Number(a.i);
  if (!Number.isInteger(i) || i < 0 || i >= N * N || s.board[i]) fail('여기에는 둘 수 없어요.');
  const color = me + 1;
  if (forbidden(s.board, i, color, s.ban33)) fail('쌍삼(3-3)은 둘 수 없어요.');
  s.board[i] = color;
  s.last = i;
  s.moves++;
  const line = winLine(s.board, i, color);
  if (line) {
    s.win = line;
    s.over = { winners: [pid], text: `${s.players[me].name}님(${color === 1 ? '흑' : '백'}) 승리!` };
  } else if (s.moves >= N * N) {
    s.over = { winners: [], text: '무승부예요!' };
  } else {
    s.turn = 1 - s.turn;
    s.deadline = ctx.now + s.time;
    s.timer = timer(s.time, ctx.now);
  }
}

function auto(s, pid, ctx) {
  if (s.over || s.players[s.turn].id !== pid) return null;
  return { type: 'place', i: bestMove(s.board, s.turn + 1, s.ban33, ctx.rng) };
}

export default {
  setup(players, opts, ctx) {
    const order = shuffle(players.map((p) => ({ id: p.id, name: p.name })), ctx.rng);
    const time = (Number(opts.time) || 30) * 1000;
    return {
      players: order, board: Array(N * N).fill(0), turn: 0, last: -1, moves: 0,
      ban33: Number(opts.ban33) !== 0, time, deadline: ctx.now + time, timer: timer(time, ctx.now), win: null, over: null,
    };
  },
  actors: (s) => (s.over ? [] : [s.players[s.turn].id]),
  action: place,
  auto,
  timeout(s, ctx) {
    const pid = s.players[s.turn].id;
    place(s, pid, auto(s, pid, ctx), ctx);
  },
  view: (s) => ({ ...s, deadline: undefined }),
};
