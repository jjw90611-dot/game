// 초성 퀴즈: 주제와 초성(ㄱㄴㄷ)만 보고 단어를 가장 먼저 채팅으로 맞히는 게임
import { fail, requirePlayer, shuffle, timer, norm, nameOf } from './util.js';
import { LIAR_TOPICS } from './words.js';

const Q_MS = 30000;
const REVEAL_MS = 4000;
const CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';

export function chosung(word) {
  return [...word].map((ch) => {
    const c = ch.charCodeAt(0) - 0xac00;
    return c >= 0 && c < 11172 ? CHO[Math.floor(c / 588)] : ch;
  }).join('');
}

const isHangul = (w) => /^[가-힣]+$/.test(w);
export const POOL = Object.entries(LIAR_TOPICS).flatMap(([cat, words]) => words.filter((w) => isHangul(w) && w.length >= 2).map((w) => ({ cat, w })));

function nextQuestion(s, ctx) {
  s.qNo++;
  if (s.qNo > s.total) {
    let best = -1;
    for (const p of s.players) best = Math.max(best, s.scores[p.id]);
    const winners = best > 0 ? s.players.filter((p) => s.scores[p.id] === best && !s.gone[p.id]).map((p) => p.id) : [];
    s.over = { winners, text: winners.length ? `${winners.map((id) => nameOf(s, id)).join(', ')}님 승리! (${best}점)` : '아무도 점수를 얻지 못했어요. 무승부!' };
    return;
  }
  const q = s.queue.pop();
  s.word = q.w;
  s.cat = q.cat;
  s.cho = chosung(q.w);
  s.hint = [];
  s.solver = null;
  s.gains = {};
  s.phase = 'q';
  s.qEnd = ctx.now + Q_MS;
  s.hintAt = [ctx.now + Q_MS * 0.4, ctx.now + Q_MS * 0.7];
  s.deadline = s.hintAt[0];
  s.timer = timer(Q_MS, ctx.now);
}

function reveal(s, ctx) {
  s.phase = 'reveal';
  s.deadline = ctx.now + REVEAL_MS;
  s.timer = timer(REVEAL_MS, ctx.now);
}

export default {
  setup(players, opts, ctx) {
    const ps = players.map((p) => ({ id: p.id, name: p.name }));
    const scores = {};
    for (const p of ps) scores[p.id] = 0;
    const s = {
      players: ps, scores, total: Number(opts.rounds) || 10, qNo: 0, queue: shuffle([...POOL], ctx.rng).slice(0, 40),
      word: null, cat: null, cho: '', hint: [], solver: null, phase: 'q', qEnd: 0, hintAt: [], gone: {}, gains: {}, over: null,
    };
    nextQuestion(s, ctx);
    return s;
  },
  keepMin: 2,
  actors: () => [],
  action(s, pid) {
    requirePlayer(s, pid);
    fail('정답은 채팅창에 입력해 주세요.');
  },
  timeout(s, ctx) {
    if (s.phase === 'reveal') { nextQuestion(s, ctx); return; }
    const chars = [...s.word];
    const maxHints = Math.min(2, chars.length - 1);
    if (s.hint.length < maxHints && ctx.now < s.qEnd - 500) {
      const hidden = chars.map((_, i) => i).filter((i) => !s.hint.includes(i));
      s.hint.push(hidden[Math.floor(ctx.rng() * hidden.length)]);
      s.deadline = s.hint.length < maxHints ? s.hintAt[1] : s.qEnd;
      return;
    }
    ctx.sys?.(`⏰ 시간 끝! 정답은 "${s.word}"였어요.`);
    reveal(s, ctx);
  },
  leave(s, pid) {
    s.gone[pid] = true;
  },
  chat(s, pid, text, ctx) {
    if (s.over || s.phase !== 'q') return;
    if (!s.players.some((p) => p.id === pid) || s.gone[pid]) {
      if (norm(text) === norm(s.word)) fail('관전 중에는 정답을 쓸 수 없어요.');
      return;
    }
    const t = norm(text);
    const ok = t === norm(s.word) || POOL.some((q) => q.cat === s.cat && norm(q.w) === t && chosung(q.w) === s.cho);
    if (!ok) return;
    const gain = Math.max(4, 10 - s.hint.length * 3);
    s.scores[pid] += gain;
    s.gains = { [pid]: gain };
    s.solver = pid;
    if (t !== norm(s.word)) s.word = POOL.find((q) => q.cat === s.cat && norm(q.w) === t).w;
    ctx.sys?.(`🎉 ${nameOf(s, pid)}님 정답! "${s.word}" (+${gain}점)`, null);
    reveal(s, ctx);
    return { consume: true, changed: true };
  },
  view(s) {
    const see = s.phase === 'reveal' || !!s.over;
    return {
      players: s.players, scores: s.scores, total: s.total, qNo: s.qNo, cat: s.cat, cho: s.cho,
      hint: [...(s.word || '')].map((ch, i) => (see || s.hint.includes(i) ? ch : null)), word: see ? s.word : null,
      solver: s.solver, gains: s.gains, phase: s.phase, gone: s.gone, timer: s.timer, over: s.over,
    };
  },
};
