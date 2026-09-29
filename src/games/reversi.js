import { fail, requirePlayer, shuffle, timer } from './util.js';

const N = 8;
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
const W = [
  100, -20, 10, 5, 5, 10, -20, 100,
  -20, -50, -2, -2, -2, -2, -50, -20,
  10, -2, 1, 1, 1, 1, -2, 10,
  5, -2, 1, 0, 0, 1, -2, 5,
  5, -2, 1, 0, 0, 1, -2, 5,
  10, -2, 1, 1, 1, 1, -2, 10,
  -20, -50, -2, -2, -2, -2, -50, -20,
  100, -20, 10, 5, 5, 10, -20, 100,
];

export function flips(b, i, color) {
  if (b[i]) return [];
  const x0 = i % N, y0 = (i / N) | 0, out = [];
  for (const [dx, dy] of DIRS) {
    const line = [];
    let x = x0 + dx, y = y0 + dy;
    while (x >= 0 && y >= 0 && x < N && y < N && b[y * N + x] === 3 - color) {
      line.push(y * N + x);
      x += dx; y += dy;
    }
    if (line.length && x >= 0 && y >= 0 && x < N && y < N && b[y * N + x] === color) out.push(...line);
  }
  return out;
}

export function validMoves(b, color) {
  const out = [];
  for (let i = 0; i < N * N; i++) if (!b[i] && flips(b, i, color).length) out.push(i);
  return out;
}

function counts(b) {
  let x = 0, o = 0;
  for (const v of b) { if (v === 1) x++; else if (v === 2) o++; }
  return [x, o];
}

function finish(s) {
  const [b, w] = counts(s.board);
  if (b === w) s.over = { winners: [], text: `무승부! (${b} : ${w})` };
  else {
    const wi = b > w ? 0 : 1;
    s.over = { winners: [s.players[wi].id], text: `${s.players[wi].name}님(${wi ? '백' : '흑'}) 승리! (${b} : ${w})` };
  }
}

function advance(s, ctx) {
  const next = 1 - s.turn;
  if (validMoves(s.board, next + 1).length) {
    s.turn = next;
    s.passed = false;
  } else if (validMoves(s.board, s.turn + 1).length) {
    s.passed = true; // 상대가 둘 곳이 없어 차례 유지
    ctx.sys?.(`${s.players[next].name}님은 둘 곳이 없어 차례를 넘겨요.`);
  } else {
    finish(s);
    return;
  }
  s.valid = validMoves(s.board, s.turn + 1);
  s.deadline = ctx.now + s.time;
  s.timer = timer(s.time, ctx.now);
}

function action(s, pid, a, ctx) {
  const me = requirePlayer(s, pid);
  if (s.over) fail('게임이 끝났어요.');
  if (a.type === 'resign') {
    s.over = { winners: [s.players[1 - me].id], text: `${s.players[me].name}님이 기권했어요. ${s.players[1 - me].name}님 승리!` };
    return;
  }
  if (a.type !== 'place') fail('알 수 없는 동작이에요.');
  if (me !== s.turn) fail('상대 차례예요.');
  const i = Number(a.i);
  if (!Number.isInteger(i) || i < 0 || i >= N * N) fail('잘못된 위치예요.');
  const f = flips(s.board, i, me + 1);
  if (!f.length) fail('상대 돌을 뒤집을 수 있는 곳에만 둘 수 있어요.');
  s.board[i] = me + 1;
  for (const j of f) s.board[j] = me + 1;
  s.last = i;
  s.flipped = f;
  advance(s, ctx);
}

function auto(s, pid, ctx) {
  if (s.over || s.players[s.turn].id !== pid) return null;
  const color = s.turn + 1;
  let best = -1, bestScore = -Infinity;
  for (const i of validMoves(s.board, color)) {
    const f = flips(s.board, i, color);
    // 한 수 앞의 상대 이동 가능 수를 줄이는 쪽을 선호
    const b2 = s.board.slice();
    b2[i] = color;
    for (const j of f) b2[j] = color;
    const oppMob = validMoves(b2, 3 - color).length;
    const score = W[i] * 3 + f.length - oppMob * 2 + ctx.rng() * 2;
    if (score > bestScore) { bestScore = score; best = i; }
  }
  return best < 0 ? null : { type: 'place', i: best };
}

export default {
  setup(players, opts, ctx) {
    const order = shuffle(players.map((p) => ({ id: p.id, name: p.name })), ctx.rng);
    const board = Array(N * N).fill(0);
    board[27] = 2; board[28] = 1; board[35] = 1; board[36] = 2;
    const time = (Number(opts.time) || 30) * 1000;
    return {
      players: order, board, turn: 0, last: -1, flipped: [], passed: false, time,
      valid: validMoves(board, 1), deadline: ctx.now + time, timer: timer(time, ctx.now), over: null,
    };
  },
  actors: (s) => (s.over ? [] : [s.players[s.turn].id]),
  action,
  auto,
  timeout(s, ctx) {
    const pid = s.players[s.turn].id;
    const a = auto(s, pid, ctx);
    if (a) action(s, pid, a, ctx);
    else finish(s);
  },
  view: (s) => ({ ...s, deadline: undefined, count: counts(s.board) }),
};
