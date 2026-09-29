// 라이어 다이스: 컵 속 주사위를 몰래 보고, 전체 주사위에 대해 입찰하거나 "라이어!"를 외치는 블러핑 게임
import { fail, requirePlayer, shuffle, timer } from './util.js';

const BID_MS = 30000;
const SHOW_MS = 6500;

const alive = (s) => s.players.filter((p) => s.count[p.id] > 0);
const total = (s) => alive(s).reduce((n, p) => n + s.count[p.id], 0);

function roll(s, ctx) {
  s.dice = {};
  for (const p of alive(s)) s.dice[p.id] = Array.from({ length: s.count[p.id] }, () => 1 + Math.floor(ctx.rng() * 6)).sort();
}

export function countFace(s, f) {
  let n = 0;
  for (const d of Object.values(s.dice)) for (const x of d) if (x === f || (s.wild && x === 1 && f !== 1)) n++;
  return n;
}

export function validBid(s, q, f) {
  if (!Number.isInteger(q) || !Number.isInteger(f) || f < (s.wild ? 2 : 1) || f > 6 || q < 1 || q > total(s)) return false;
  if (!s.bid) return true;
  return q > s.bid.q || (q === s.bid.q && f > s.bid.f);
}

function startRound(s, ctx) {
  const al = alive(s);
  if (al.length <= 1) {
    s.over = { winners: al.map((p) => p.id), text: `${al[0]?.name ?? ''}님이 마지막까지 주사위를 지켰어요. 승리!` };
    return;
  }
  s.round++;
  roll(s, ctx);
  s.bid = null;
  s.history = [];
  s.show = null;
  s.phase = 'bid';
  let i = s.starter;
  while (s.count[s.players[i].id] <= 0) i = (i + 1) % s.players.length;
  s.turn = i;
  s.deadline = ctx.now + BID_MS;
  s.timer = timer(BID_MS, ctx.now);
}

function nextAlive(s, i) {
  for (let k = 1; k <= s.players.length; k++) {
    const j = (i + k) % s.players.length;
    if (s.count[s.players[j].id] > 0) return j;
  }
  return i;
}

function action(s, pid, a, ctx) {
  const me = requirePlayer(s, pid);
  if (s.over) fail('게임이 끝났어요.');
  if (s.phase !== 'bid') fail('지금은 입찰 시간이 아니에요.');
  if (me !== s.turn) fail('내 차례가 아니에요.');
  const name = s.players[me].name;
  if (a.type === 'bid') {
    const q = Number(a.q), f = Number(a.f);
    if (!validBid(s, q, f)) fail(s.bid ? `"${s.bid.q}개의 ${s.bid.f}"보다 높게 불러야 해요.` : '올바른 입찰이 아니에요.');
    s.bid = { q, f, by: pid };
    s.history.push({ q, f, by: pid });
    s.log = `${name}님: "${f}이(가) ${q}개 이상 있다!"`;
    s.turn = nextAlive(s, s.turn);
    s.deadline = ctx.now + BID_MS;
    s.timer = timer(BID_MS, ctx.now);
    return;
  }
  if (a.type !== 'call') fail('알 수 없는 동작이에요.');
  if (!s.bid) fail('첫 차례에는 입찰해야 해요.');
  const real = countFace(s, s.bid.f);
  const truth = real >= s.bid.q;
  const loser = truth ? pid : s.bid.by;
  s.count[loser]--;
  const lname = s.players.find((p) => p.id === loser).name;
  s.show = { dice: s.dice, bid: s.bid, caller: pid, real, truth, loser };
  s.log = `${name}님이 "라이어!"를 외쳤어요. 실제로 ${s.bid.f}은(는) ${real}개 → ${truth ? '입찰이 맞았어요' : '거짓말이었어요'}! ${lname}님이 주사위 1개를 잃어요.${s.count[loser] === 0 ? ` ${lname}님 탈락!` : ''}`;
  const li = s.players.findIndex((p) => p.id === loser);
  s.starter = s.count[loser] > 0 ? li : nextAlive(s, li);
  s.phase = 'show';
  s.deadline = ctx.now + SHOW_MS;
  s.timer = timer(SHOW_MS, ctx.now);
}

function expected(s, pid, f) {
  const mine = s.dice[pid].filter((x) => x === f || (s.wild && x === 1 && f !== 1)).length;
  const unknown = total(s) - s.dice[pid].length;
  return mine + unknown * (s.wild && f !== 1 ? 1 / 3 : 1 / 6);
}

function auto(s, pid, ctx) {
  if (s.over || s.phase !== 'bid' || s.players[s.turn].id !== pid) return null;
  const noise = () => (ctx.rng() - 0.5) * 1.2;
  if (s.bid && s.bid.q > expected(s, pid, s.bid.f) + 0.9 + noise()) return { type: 'call' };
  let best = null, bestV = -Infinity;
  for (let f = s.wild ? 2 : 1; f <= 6; f++) {
    let q = s.bid ? (f > s.bid.f ? s.bid.q : s.bid.q + 1) : 1;
    if (!s.bid) q = Math.max(1, Math.floor(expected(s, pid, f) * 0.8));
    if (!validBid(s, q, f)) continue;
    const v = expected(s, pid, f) - q + noise() * 0.6;
    if (v > bestV) { bestV = v; best = { type: 'bid', q, f }; }
  }
  if (!best || (s.bid && bestV < -1.6)) return s.bid ? { type: 'call' } : { type: 'bid', q: 1, f: 6 };
  return best;
}

export default {
  setup(players, opts, ctx) {
    const ps = shuffle(players.map((p) => ({ id: p.id, name: p.name })), ctx.rng);
    const n = Number(opts.dice) || 5;
    const count = {};
    for (const p of ps) count[p.id] = n;
    const s = {
      players: ps, count, dice: {}, bid: null, history: [], turn: 0, starter: 0, round: 0, wild: Number(opts.wild ?? 1) !== 0,
      phase: 'bid', show: null, log: '', over: null,
    };
    startRound(s, ctx);
    s.log = `${ps[0].name}님부터 입찰을 시작해요.`;
    return s;
  },
  keepMin: 2,
  actors: (s) => (s.over || s.phase !== 'bid' ? [] : [s.players[s.turn].id]),
  action,
  auto,
  botDelay: () => 1700,
  timeout(s, ctx) {
    if (s.phase === 'show') { startRound(s, ctx); return; }
    const pid = s.players[s.turn].id;
    action(s, pid, auto(s, pid, ctx), ctx);
  },
  leave(s, pid, ctx) {
    if (s.over || !(s.count[pid] > 0)) return;
    s.count[pid] = 0;
    delete s.dice[pid];
    if (s.bid?.by === pid) s.bid = null;
    if (alive(s).length <= 1) { startRound(s, ctx); return; }
    if (s.phase === 'bid' && s.players[s.turn].id === pid) {
      s.turn = nextAlive(s, s.turn);
      s.deadline = ctx.now + BID_MS;
      s.timer = timer(BID_MS, ctx.now);
    }
    if (s.players[s.starter].id === pid) s.starter = nextAlive(s, s.starter);
  },
  chat(s, pid) {
    if (s.over || s.players.some((p) => p.id === pid)) return;
    return { to: [], spect: true, ch: '관전' };
  },
  view(s, pid) {
    const dice = {};
    for (const p of s.players) {
      if (!s.dice[p.id]) continue;
      dice[p.id] = s.phase === 'show' || s.over || p.id === pid || !pid ? s.dice[p.id] : null;
    }
    return {
      players: s.players, count: s.count, dice, bid: s.bid, history: s.history.slice(-8), turn: s.turn, round: s.round,
      wild: s.wild, phase: s.phase, show: s.show, log: s.log, total: total(s), timer: s.timer, over: s.over,
    };
  },
};
