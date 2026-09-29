// 사목 (커넥트 포 스타일): 7칸 × 6줄, 가로·세로·대각선으로 4개를 먼저 이으면 승리
import { fail, requirePlayer, shuffle, timer } from './util.js';

export const W = 7;
export const H = 6;
const DIRS = [[1, 0], [0, 1], [1, 1], [1, -1]];

const at = (b, x, y) => (x < 0 || y < 0 || x >= W || y >= H ? -1 : b[y * W + x]);

// 해당 열에 돌을 놓았을 때 들어갈 칸 (y=0이 맨 위), 꽉 찼으면 -1
export function dropRow(b, col) {
  for (let y = H - 1; y >= 0; y--) if (!b[y * W + col]) return y;
  return -1;
}

export function lineAt(b, i) {
  const c = b[i];
  if (!c) return null;
  const x0 = i % W, y0 = (i / W) | 0;
  for (const [dx, dy] of DIRS) {
    let a = 0, z = 0;
    while (at(b, x0 - dx * (a + 1), y0 - dy * (a + 1)) === c) a++;
    while (at(b, x0 + dx * (z + 1), y0 + dy * (z + 1)) === c) z++;
    if (a + z + 1 >= 4) {
      const line = [];
      for (let k = -a; k <= z; k++) line.push((y0 + dy * k) * W + x0 + dx * k);
      return line;
    }
  }
  return null;
}

function scoreWindow(cells, me) {
  const op = 3 - me;
  const m = cells.filter((v) => v === me).length;
  const o = cells.filter((v) => v === op).length;
  const e = cells.filter((v) => v === 0).length;
  if (m === 4) return 100000;
  if (o === 4) return -100000;
  if (m === 3 && e === 1) return 60;
  if (m === 2 && e === 2) return 8;
  if (o === 3 && e === 1) return -80;
  if (o === 2 && e === 2) return -6;
  return 0;
}

function evaluate(b, me) {
  let s = 0;
  for (let y = 0; y < H; y++) if (b[y * W + 3] === me) s += 5;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      for (const [dx, dy] of DIRS) {
        const ex = x + dx * 3, ey = y + dy * 3;
        if (ex < 0 || ex >= W || ey < 0 || ey >= H) continue;
        s += scoreWindow([0, 1, 2, 3].map((k) => b[(y + dy * k) * W + x + dx * k]), me);
      }
    }
  }
  return s;
}

const ORDER = [3, 2, 4, 1, 5, 0, 6];

function negamax(b, depth, alpha, beta, color, me) {
  let best = -Infinity;
  let any = false;
  for (const col of ORDER) {
    const y = dropRow(b, col);
    if (y < 0) continue;
    any = true;
    const i = y * W + col;
    b[i] = color;
    let v;
    if (lineAt(b, i)) v = 1000000 + depth;
    else if (depth <= 1) v = (color === me ? 1 : -1) * evaluate(b, me);
    else v = -negamax(b, depth - 1, -beta, -alpha, 3 - color, me);
    b[i] = 0;
    if (v > best) best = v;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break;
  }
  return any ? best : 0;
}

export function bestColumn(b, color, depth = 5, rng = Math.random) {
  let best = -1, bestV = -Infinity;
  for (const col of ORDER) {
    const y = dropRow(b, col);
    if (y < 0) continue;
    const i = y * W + col;
    b[i] = color;
    const v = lineAt(b, i) ? 1e9 : -negamax(b, depth - 1, -Infinity, Infinity, 3 - color, color) + rng() * 2;
    b[i] = 0;
    if (v > bestV) { bestV = v; best = col; }
  }
  return best;
}

function play(s, pid, a, ctx) {
  const me = requirePlayer(s, pid);
  if (s.over) fail('게임이 끝났어요.');
  if (a.type === 'resign') {
    s.over = { winners: [s.players[1 - me].id], text: `${s.players[me].name}님이 기권했어요. ${s.players[1 - me].name}님 승리!` };
    return;
  }
  if (a.type !== 'drop') fail('알 수 없는 동작이에요.');
  if (me !== s.turn) fail('상대 차례예요.');
  const col = Number(a.col);
  if (!Number.isInteger(col) || col < 0 || col >= W) fail('놓을 줄을 골라 주세요.');
  const y = dropRow(s.board, col);
  if (y < 0) fail('이 줄은 꽉 찼어요.');
  const i = y * W + col;
  s.board[i] = me + 1;
  s.last = i;
  s.moves++;
  const line = lineAt(s.board, i);
  if (line) {
    s.win = line;
    s.over = { winners: [pid], text: `${s.players[me].name}님(${me ? '노랑' : '빨강'}) 승리!` };
  } else if (s.moves >= W * H) {
    s.over = { winners: [], text: '판이 가득 찼어요. 무승부!' };
  } else {
    s.turn = 1 - s.turn;
    s.deadline = ctx.now + s.time;
    s.timer = timer(s.time, ctx.now);
  }
}

function auto(s, pid, ctx) {
  if (s.over || s.players[s.turn].id !== pid) return null;
  return { type: 'drop', col: bestColumn(s.board.slice(), s.turn + 1, 5, ctx.rng) };
}

export default {
  setup(players, opts, ctx) {
    const time = (Number(opts.time) || 20) * 1000;
    return {
      players: shuffle(players.map((p) => ({ id: p.id, name: p.name })), ctx.rng), board: Array(W * H).fill(0),
      turn: 0, last: -1, moves: 0, win: null, time, deadline: ctx.now + time, timer: timer(time, ctx.now), over: null,
    };
  },
  actors: (s) => (s.over ? [] : [s.players[s.turn].id]),
  action: play,
  auto,
  botDelay: () => 900,
  timeout(s, ctx) {
    const pid = s.players[s.turn].id;
    play(s, pid, auto(s, pid, ctx), ctx);
  },
  view: (s) => ({ ...s, deadline: undefined }),
};
