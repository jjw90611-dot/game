// 윷놀이: 윷을 던져 말 4개를 먼저 한 바퀴 돌려 내보내면 승리
// 칸 이름: 바깥 o1~o19, 출발·도착 칸 o0(참먹이), 대각선 a1 a2 (방) a3 a4 / b1 b2 (방) b3 b4, 방 = c
import { fail, requirePlayer, shuffle, timer } from './util.js';

export const NAMES = { '-1': '뒷도', 1: '도', 2: '개', 3: '걸', 4: '윷', 5: '모' };
const ACT_MS = 20000;

// 한 칸 이동 (line: 대각선 A/B 중 어느 길인지)
function stepOnce(node, line) {
  if (node === 'o0') return { node: 'out', line: null };
  if (node[0] === 'o') {
    const k = Number(node.slice(1));
    return { node: k === 19 ? 'o0' : `o${k + 1}`, line: null };
  }
  switch (node) {
    case 'a1': return { node: 'a2', line: 'A' };
    case 'a2': return { node: 'c', line: 'A' };
    case 'a3': return { node: 'a4', line: 'A' };
    case 'a4': return { node: 'o15', line: null };
    case 'b1': return { node: 'b2', line: 'B' };
    case 'b2': return { node: 'c', line: 'B' };
    case 'b3': return { node: 'b4', line: 'B' };
    case 'b4': return { node: 'o0', line: null };
    case 'c': return line === 'A' ? { node: 'a3', line: 'A' } : { node: 'b3', line: 'B' };
  }
  return { node: 'out', line: null };
}

// node에서 출발해 n칸 이동한 경로 (null = 아직 안 나온 말)
export function path(node, line, n) {
  const out = [];
  let cur = node, ln = line;
  for (let i = 0; i < n; i++) {
    let nx;
    if (cur == null) nx = { node: 'o1', line: null };
    else if (i === 0 && cur === 'o5') nx = { node: 'a1', line: 'A' };
    else if (i === 0 && cur === 'o10') nx = { node: 'b1', line: 'B' };
    else if (i === 0 && cur === 'c') nx = { node: 'b3', line: 'B' };
    else nx = stepOnce(cur, ln);
    cur = nx.node;
    ln = nx.line;
    out.push(cur);
    if (cur === 'out') break;
  }
  return { node: cur, line: ln, trail: out };
}

export function back(node, line) {
  if (node === 'o0') return { node: 'o19', line: null };
  if (node === 'o1') return { node: 'o0', line: null };
  if (node[0] === 'o') return { node: `o${Number(node.slice(1)) - 1}`, line: null };
  const map = { a1: ['o5', null], a2: ['a1', 'A'], a3: ['c', 'A'], a4: ['a3', 'A'], b1: ['o10', null], b2: ['b1', 'B'], b3: ['c', 'B'], b4: ['b3', 'B'] };
  if (node === 'c') return line === 'A' ? { node: 'a2', line: 'A' } : { node: 'b2', line: 'B' };
  const [n, l] = map[node];
  return { node: n, line: l };
}

// 도착까지 남은 칸 수 (지름길을 탄다고 가정한 대략값)
const DIST = {};
function dist(node, line) {
  if (node === 'out') return 0;
  const key = `${node}|${line}`;
  if (DIST[key] != null) return DIST[key];
  let n = 0, cur = node, ln = line;
  while (cur !== 'out' && n < 40) {
    const p = path(cur, ln, 1);
    cur = p.node;
    ln = p.line;
    n++;
  }
  DIST[key] = n;
  return n;
}

function throwSticks(rng, backdo) {
  const sticks = [0, 1, 2, 3].map(() => rng() < 0.5); // true = 평평한 면(배)
  const flat = sticks.filter(Boolean).length;
  let v = flat === 0 ? 5 : flat;
  if (backdo && flat === 1 && sticks[0]) v = -1; // 표시된 윷 하나만 뒤집히면 뒷도
  return { sticks, v };
}

const cur = (s) => s.players[s.turn];

export function legalMoves(s, pid, v) {
  const list = [];
  const seen = new Set();
  s.pieces[pid].forEach((p, i) => {
    if (p.node === 'out') return;
    const key = p.node ?? 'home';
    if (seen.has(key)) return;
    if (v === -1 && p.node == null) return;
    seen.add(key);
    const dest = v === -1 ? back(p.node, p.line) : path(p.node, p.line, v);
    list.push({ i, from: p.node, to: dest.node, line: dest.line });
  });
  return list;
}

function anyLegal(s, pid) {
  return s.pend.some((v) => legalMoves(s, pid, v).length);
}

function nextTurn(s, ctx) {
  s.turn = (s.turn + 1) % s.players.length;
  s.throws = 1;
  s.pend = [];
  s.phase = 'throw';
  s.deadline = ctx.now + ACT_MS;
  s.timer = timer(ACT_MS, ctx.now);
}

function settle(s, ctx) {
  const pid = cur(s).id;
  if (s.throws > 0) s.phase = 'throw';
  else if (s.pend.length && anyLegal(s, pid)) s.phase = 'move';
  else {
    if (s.pend.length) s.log = `${cur(s).name}님은 움직일 말이 없어서 차례를 넘겨요.`;
    nextTurn(s, ctx);
    return;
  }
  s.deadline = ctx.now + ACT_MS;
  s.timer = timer(ACT_MS, ctx.now);
}

function action(s, pid, a, ctx) {
  requirePlayer(s, pid);
  if (s.over) fail('게임이 끝났어요.');
  if (cur(s).id !== pid) fail('내 차례가 아니에요.');
  if (a.type === 'throw') {
    if (s.phase !== 'throw') fail('먼저 말을 움직여 주세요.');
    const t = throwSticks(ctx.rng, s.backdo);
    s.throws--;
    s.throwNo++;
    s.lastThrow = { sticks: t.sticks, v: t.v, by: pid, no: s.throwNo };
    s.pend.push(t.v);
    if (t.v >= 4) s.throws++;
    s.log = `${cur(s).name}님: ${NAMES[t.v]}!${t.v >= 4 ? ' 한 번 더 던져요.' : ''}`;
    s.moved = null;
    settle(s, ctx);
    return;
  }
  if (a.type !== 'move') fail('알 수 없는 동작이에요.');
  if (s.phase !== 'move') fail('먼저 윷을 던져 주세요.');
  const r = Number(a.r);
  if (!(r >= 0 && r < s.pend.length)) fail('사용할 윷을 골라 주세요.');
  const v = s.pend[r];
  const pc = s.pieces[pid][Number(a.piece)];
  if (!pc || pc.node === 'out') fail('움직일 말을 골라 주세요.');
  const mv = legalMoves(s, pid, v).find((m) => m.from === pc.node);
  if (!mv) fail('그 말은 움직일 수 없어요.');
  const mine = s.pieces[pid];
  const movers = mv.from == null ? [mv.i] : mine.map((p, i) => (p.node === mv.from ? i : -1)).filter((i) => i >= 0);
  for (const i of movers) { mine[i].node = mv.to; mine[i].line = mv.line; }
  s.pend.splice(r, 1);
  let caught = 0;
  const caughtNames = [];
  if (mv.to !== 'out') {
    for (const p of s.players) {
      if (p.id === pid) continue;
      let hit = 0;
      for (const q of s.pieces[p.id]) if (q.node === mv.to) { q.node = null; q.line = null; hit++; }
      if (hit) { caught += hit; caughtNames.push(p.name); }
    }
  }
  s.moved = { pid, to: mv.to, n: movers.length, caught };
  const nm = NAMES[v];
  if (caught) {
    s.throws++;
    s.log = `${cur(s).name}님이 ${nm}(으)로 ${caughtNames.join(', ')}님의 말을 잡았어요! 한 번 더 던져요.`;
  } else if (mv.to === 'out') s.log = `${cur(s).name}님의 말 ${movers.length}개가 들어왔어요!`;
  else s.log = `${cur(s).name}님이 ${nm}${movers.length > 1 ? ` (말 ${movers.length}개 업고)` : ''} 이동했어요.`;
  if (mine.every((p) => p.node === 'out')) {
    s.over = { winners: [pid], text: `${cur(s).name}님이 말을 모두 내보냈어요. 승리!` };
    return;
  }
  settle(s, ctx);
}

function danger(s, pid, node) {
  if (!node || node === 'out') return 0;
  let d = 0;
  for (const p of s.players) {
    if (p.id === pid) continue;
    for (const q of s.pieces[p.id]) {
      if (q.node === 'out') continue;
      for (let n = 1; n <= 5; n++) if (path(q.node, q.line, n).node === node) { d++; break; }
    }
  }
  return d;
}

function auto(s, pid, ctx) {
  if (s.over || cur(s).id !== pid) return null;
  if (s.phase === 'throw') return { type: 'throw' };
  let best = null, bestV = -Infinity;
  s.pend.forEach((v, r) => {
    for (const m of legalMoves(s, pid, v)) {
      const mine = s.pieces[pid];
      const movers = m.from == null ? 1 : mine.filter((p) => p.node === m.from).length;
      const p0 = mine[m.i];
      let sc = (dist(p0.node, p0.line) - dist(m.to, m.line)) * movers;
      if (m.to === 'out') sc += 25 * movers;
      else {
        for (const p of s.players) if (p.id !== pid) sc += 30 * s.pieces[p.id].filter((q) => q.node === m.to).length;
        if (['o5', 'o10', 'c'].includes(m.to)) sc += 6;
        if (mine.some((q) => q.node === m.to)) sc += 5;
        sc -= Math.min(2, danger(s, pid, m.to)) * 7 * movers;
        if (m.from) sc += Math.min(2, danger(s, pid, m.from)) * 4 * movers;
      }
      sc += ctx.rng() * 3;
      if (sc > bestV) { bestV = sc; best = { type: 'move', r, piece: m.i }; }
    }
  });
  return best;
}

export default {
  setup(players, opts, ctx) {
    const n = [2, 3, 4].includes(Number(opts.pieces)) ? Number(opts.pieces) : 4;
    const ps = shuffle(players.map((p) => ({ id: p.id, name: p.name })), ctx.rng);
    const pieces = {};
    for (const p of ps) pieces[p.id] = Array.from({ length: n }, () => ({ node: null, line: null }));
    return {
      players: ps, pieces, turn: 0, throws: 1, pend: [], phase: 'throw', backdo: Number(opts.backdo ?? 1) !== 0,
      lastThrow: null, throwNo: 0, moved: null, log: `${ps[0].name}님부터 윷을 던져요.`,
      deadline: ctx.now + ACT_MS, timer: timer(ACT_MS, ctx.now), over: null,
    };
  },
  actors: (s) => (s.over ? [] : [cur(s).id]),
  action,
  auto,
  botDelay: (s) => (s.phase === 'throw' ? 1100 : 1300),
  timeout(s, ctx) {
    const pid = cur(s).id;
    action(s, pid, auto(s, pid, ctx), ctx);
  },
  leave(s, pid, ctx) {
    if (!s.over && cur(s).id === pid) {
      // 나간 사람 차례는 봇처럼 자동 진행 (hub가 isAuto로 처리)
      s.deadline = ctx.now + 800;
    }
  },
  view: (s) => ({
    ...s, deadline: undefined,
    moves: s.phase === 'move' && !s.over ? s.pend.map((v) => legalMoves(s, cur(s).id, v)) : null,
  }),
};
