import { fail, requirePlayer, shuffle, timer, range } from './util.js';
import { tile, tileValue, analyzeSet, checkProposal } from '../../public/js/shared/rummy.js';

function findSets(ids) {
  const ts = ids.map(tile).filter((t) => !t.j);
  const used = new Set();
  const sets = [];
  for (let c = 0; c < 4; c++) {
    const byN = new Map();
    for (const t of ts) if (t.c === c && !byN.has(t.n)) byN.set(t.n, t.id);
    let run = [];
    for (let n = 1; n <= 14; n++) {
      if (byN.has(n)) run.push(byN.get(n));
      else {
        if (run.length >= 3) { sets.push(run); run.forEach((id) => used.add(id)); }
        run = [];
      }
    }
  }
  for (let n = 1; n <= 13; n++) {
    const byC = new Map();
    for (const t of ts) if (!used.has(t.id) && t.n === n && !byC.has(t.c)) byC.set(t.c, t.id);
    if (byC.size >= 3) {
      const g = [...byC.values()];
      sets.push(g);
      g.forEach((id) => used.add(id));
    }
  }
  return sets;
}

export function botMove(s, pid) {
  const rack = s.racks[pid];
  const sets = findSets(rack);
  const table = s.table.map((x) => x.slice());
  if (!s.melded[pid]) {
    const value = sets.reduce((a, set) => a + analyzeSet(set).value, 0);
    if (value >= 30 && sets.length) return { type: 'play', table: [...table, ...sets] };
    return { type: 'draw' };
  }
  const used = new Set(sets.flat());
  table.push(...sets);
  const remaining = rack.filter((id) => !used.has(id));
  let changed = true;
  while (changed) {
    changed = false;
    for (const id of remaining.slice()) {
      for (let k = 0; k < table.length; k++) {
        const r = analyzeSet([...table[k], id]);
        if (r.ok) {
          table[k] = r.order;
          remaining.splice(remaining.indexOf(id), 1);
          changed = true;
          break;
        }
      }
    }
  }
  if (remaining.length === rack.length) return { type: 'draw' };
  return { type: 'play', table };
}

function endTurn(s, ctx) {
  s.turn = (s.turn + 1) % s.players.length;
  s.deadline = ctx.now + s.time;
  s.timer = timer(s.time, ctx.now);
}

function finishByPoints(s) {
  let best = Infinity;
  const pts = {};
  for (const p of s.players) {
    pts[p.id] = s.racks[p.id].reduce((a, id) => a + tileValue(id), 0);
    best = Math.min(best, pts[p.id]);
  }
  const winners = s.players.filter((p) => pts[p.id] === best).map((p) => p.id);
  s.over = { winners, text: `타일이 모두 떨어졌어요. 남은 점수가 가장 적은 ${s.players.filter((p) => winners.includes(p.id)).map((p) => p.name).join(', ')}님 승리!` };
}

function action(s, pid, a, ctx) {
  const me = requirePlayer(s, pid);
  if (s.over) fail('게임이 끝났어요.');
  if (me !== s.turn) fail('내 차례가 아니에요.');
  if (a.type === 'play') {
    const err = checkProposal(s.table, s.racks[pid], a.table, s.melded[pid]);
    if (err) fail(err);
    const oldSet = new Set(s.table.flat());
    const added = a.table.flat().filter((id) => !oldSet.has(id));
    const addedSet = new Set(added);
    if (!s.melded[pid]) {
      s.melded[pid] = true;
      ctx.sys?.(`${s.players[me].name}님이 등록했어요!`);
    }
    s.table = a.table.map((set) => analyzeSet(set).order);
    s.racks[pid] = s.racks[pid].filter((id) => !addedSet.has(id));
    s.last = { pid, added, drew: false };
    s.passes = 0;
    if (!s.racks[pid].length) {
      s.over = { winners: [pid], text: `${s.players[me].name}님이 타일을 모두 내려놓았어요! 승리!` };
      return;
    }
    endTurn(s, ctx);
  } else if (a.type === 'draw') {
    if (s.pool.length) {
      s.racks[pid].push(s.pool.pop());
      s.passes = 0;
    } else {
      s.passes++;
      if (s.passes >= s.players.length) {
        finishByPoints(s);
        return;
      }
    }
    s.last = { pid, added: [], drew: true };
    endTurn(s, ctx);
  } else fail('알 수 없는 동작이에요.');
}

export default {
  setup(players, opts, ctx) {
    const ps = shuffle(players.map((p) => ({ id: p.id, name: p.name })), ctx.rng);
    const pool = shuffle(range(106), ctx.rng);
    const racks = {}, melded = {};
    for (const p of ps) {
      racks[p.id] = pool.splice(0, 14);
      melded[p.id] = false;
    }
    const time = (Number(opts.time) || 90) * 1000;
    return {
      players: ps, racks, pool, table: [], melded, turn: 0, passes: 0, last: null, time,
      deadline: ctx.now + time, timer: timer(time, ctx.now), over: null,
    };
  },
  actors: (s) => (s.over ? [] : [s.players[s.turn].id]),
  action,
  auto(s, pid) {
    if (s.over || s.players[s.turn].id !== pid) return null;
    return botMove(s, pid);
  },
  botDelay: () => 1600 + Math.random() * 900,
  timeout(s, ctx) {
    const pid = s.players[s.turn].id;
    action(s, pid, { type: 'draw' }, ctx);
    ctx.sys?.(`${s.players.find((p) => p.id === pid).name}님 시간 초과로 타일을 한 장 가져갔어요.`);
  },
  view(s, pid) {
    const counts = {};
    for (const p of s.players) counts[p.id] = s.racks[p.id].length;
    return {
      players: s.players, turn: s.turn, table: s.table, melded: s.melded, pool: s.pool.length,
      rack: s.racks[pid] ?? null, counts, last: s.last, timer: s.timer, over: s.over,
      racks: s.over ? s.racks : undefined,
    };
  },
};
