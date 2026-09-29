import { fail, requirePlayer, shuffle, timer, norm, nameOf, applyStroke } from './util.js';
import { DRAW_WORDS } from './words.js';

const CHOOSE_MS = 12000;
const REVEAL_MS = 5000;

function activeGuessers(s) {
  return s.players.filter((p) => p.id !== s.drawer && !s.gone[p.id]);
}

function finish(s) {
  let best = -1;
  for (const p of s.players) best = Math.max(best, s.scores[p.id]);
  const winners = s.players.filter((p) => s.scores[p.id] === best && !s.gone[p.id]).map((p) => p.id);
  s.over = { winners, text: `${winners.map((id) => nameOf(s, id)).join(', ')}님 승리! (${best}점)` };
}

function startTurn(s, ctx) {
  for (;;) {
    if (s.turnIdx >= s.order.length) { s.turnIdx = 0; s.round++; }
    if (s.round > s.rounds) { finish(s); return; }
    if (!s.gone[s.order[s.turnIdx]]) break;
    s.turnIdx++;
  }
  s.drawer = s.order[s.turnIdx];
  s.turnNo++;
  const pool = shuffle(DRAW_WORDS.filter((w) => !s.used.includes(w)), ctx.rng);
  s.choices = pool.slice(0, 3);
  s.word = null;
  s.guessed = {};
  s.hint = [];
  s.gains = {};
  if (ctx.vol) { ctx.vol.strokes = []; ctx.vol.points = 0; }
  s.phase = 'choose';
  s.deadline = ctx.now + CHOOSE_MS;
  s.timer = timer(CHOOSE_MS, ctx.now);
}

function setDrawDeadline(s) {
  s.deadline = s.hintsGiven < s.maxHints ? s.hintTimes[s.hintsGiven] : s.drawEnd;
}

function beginDraw(s, word, ctx) {
  s.word = word;
  s.used.push(word);
  s.phase = 'draw';
  s.drawEnd = ctx.now + s.drawMs;
  const len = [...word].length;
  s.maxHints = len >= 3 ? 2 : len === 2 ? 1 : 0;
  s.hintsGiven = 0;
  s.hintTimes = [ctx.now + s.drawMs * 0.5, ctx.now + s.drawMs * 0.75];
  s.timer = timer(s.drawMs, ctx.now);
  setDrawDeadline(s);
}

function endDraw(s, ctx) {
  if (s.word) ctx.sys?.(`✏️ 정답은 "${s.word}"였어요!`);
  s.phase = 'reveal';
  s.deadline = ctx.now + REVEAL_MS;
  s.timer = timer(REVEAL_MS, ctx.now);
}

function action(s, pid, a, ctx) {
  requirePlayer(s, pid);
  if (s.over) fail('게임이 끝났어요.');
  if (a.type === 'choose') {
    if (s.phase !== 'choose' || pid !== s.drawer) fail('지금은 고를 수 없어요.');
    const i = Number(a.i);
    if (!(i >= 0 && i < s.choices.length)) fail('제시어를 골라 주세요.');
    beginDraw(s, s.choices[i], ctx);
  } else fail('알 수 없는 동작이에요.');
}

export default {
  setup(players, opts, ctx) {
    const ps = players.map((p) => ({ id: p.id, name: p.name }));
    const scores = {};
    for (const p of ps) scores[p.id] = 0;
    const s = {
      players: ps, order: shuffle(ps.map((p) => p.id), ctx.rng), scores, rounds: Number(opts.rounds) || 2, round: 1,
      turnIdx: 0, turnNo: 0, drawer: null, phase: 'choose', choices: [], word: null, used: [], guessed: {}, hint: [],
      gains: {}, drawMs: (Number(opts.time) || 80) * 1000, drawEnd: 0, hintTimes: [], hintsGiven: 0, maxHints: 0,
      gone: {}, over: null,
    };
    startTurn(s, ctx);
    return s;
  },
  keepMin: 2,
  actors: (s) => (s.over || s.phase !== 'choose' ? [] : [s.drawer]),
  action,
  auto: (s) => (s.phase === 'choose' ? { type: 'choose', i: 0 } : null),
  timeout(s, ctx) {
    if (s.phase === 'choose') beginDraw(s, s.choices[Math.floor(ctx.rng() * s.choices.length)], ctx);
    else if (s.phase === 'draw') {
      if (s.hintsGiven < s.maxHints && ctx.now < s.drawEnd - 500) {
        const chars = [...s.word];
        const hidden = chars.map((ch, i) => i).filter((i) => !s.hint.includes(i) && chars[i] !== ' ');
        if (hidden.length > 1) s.hint.push(hidden[Math.floor(ctx.rng() * hidden.length)]);
        s.hintsGiven++;
        setDrawDeadline(s);
      } else endDraw(s, ctx);
    } else if (s.phase === 'reveal') {
      s.turnIdx++;
      startTurn(s, ctx);
    }
  },
  leave(s, pid, ctx) {
    s.gone[pid] = true;
    if (pid === s.drawer && (s.phase === 'choose' || s.phase === 'draw')) {
      ctx.sys?.('그리는 사람이 나가서 다음 차례로 넘어가요.');
      endDraw(s, ctx);
    } else if (s.phase === 'draw' && activeGuessers(s).every((p) => s.guessed[p.id])) endDraw(s, ctx);
  },
  chat(s, pid, text, ctx) {
    if (s.over || s.phase !== 'draw' || !s.word) return;
    const w = norm(s.word);
    const t = norm(text);
    if (pid === s.drawer) {
      if (t.includes(w)) fail('정답을 채팅에 쓰면 안 돼요!');
      return;
    }
    if (s.guessed[pid]) return { ch: 'guessed', to: [s.drawer, ...Object.keys(s.guessed)] };
    const isPlayer = s.players.some((p) => p.id === pid) && !s.gone[pid];
    if (!isPlayer) {
      if (t.includes(w)) fail('관전 중에는 정답을 쓸 수 없어요.');
      return;
    }
    if (t === w) {
      const remain = Math.max(0, s.drawEnd - ctx.now) / s.drawMs;
      const first = Object.keys(s.guessed).length === 0;
      const gain = 30 + Math.round(70 * remain) + (first ? 10 : 0);
      s.scores[pid] += gain;
      s.gains[pid] = gain;
      s.guessed[pid] = ctx.now;
      s.scores[s.drawer] += 15;
      s.gains[s.drawer] = (s.gains[s.drawer] || 0) + 15;
      ctx.sys?.(`🎉 ${nameOf(s, pid)}님이 정답을 맞혔어요! (+${gain})`);
      if (activeGuessers(s).every((p) => s.guessed[p.id])) endDraw(s, ctx);
      return { consume: true, changed: true };
    }
    return;
  },
  stream(s, pid, d, ctx) {
    if (s.over || s.phase !== 'draw' || pid !== s.drawer) return null;
    return applyStroke(ctx.vol, d);
  },
  volView: (vol) => ({ strokes: vol.strokes || [] }),
  view(s, pid) {
    const see = pid === s.drawer || !!s.guessed[pid] || s.phase === 'reveal' || !!s.over;
    return {
      players: s.players, order: s.order, scores: s.scores, round: s.round, rounds: s.rounds, turnNo: s.turnNo,
      phase: s.phase, drawer: s.drawer, choices: pid === s.drawer && s.phase === 'choose' ? s.choices : null,
      word: see ? s.word : null,
      mask: s.word ? [...s.word].map((ch, i) => (ch === ' ' ? ' ' : s.hint.includes(i) ? ch : null)) : null,
      guessed: Object.keys(s.guessed), gains: s.phase === 'reveal' || s.over ? s.gains : null,
      gone: s.gone, timer: s.timer, over: s.over,
    };
  },
};
