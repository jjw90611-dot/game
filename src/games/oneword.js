// 한 단어 (저스트 원 스타일): 모두 힘을 합쳐 술래가 제시어를 맞히도록 한 단어 힌트를 주는 협력 게임
// 같은 힌트를 쓴 사람이 있으면 그 힌트들은 모두 지워져요.
import { fail, requirePlayer, shuffle, timer, norm, nameOf } from './util.js';
import { DRAW_WORDS } from './words.js';

const CLUE_MS = 60000;
const GUESS_MS = 45000;
const REVEAL_MS = 6000;

const helpers = (s) => s.players.filter((p) => p.id !== s.guesser && !s.gone[p.id]);

function rating(score, total) {
  const r = score / total;
  if (r >= 1) return '완벽해요! 환상의 호흡이에요.';
  if (r >= 0.8) return '대단해요! 거의 텔레파시 수준이에요.';
  if (r >= 0.6) return '잘했어요! 팀워크가 좋아요.';
  if (r >= 0.4) return '나쁘지 않아요. 다음엔 더 잘할 수 있어요!';
  return '연습이 조금 더 필요해요.';
}

function startRound(s, ctx) {
  if (s.cardsLeft <= 0) {
    s.over = { winners: s.players.filter((p) => !s.gone[p.id]).map((p) => p.id), text: `팀 점수 ${s.score}/${s.total} — ${rating(s.score, s.total)}` };
    return;
  }
  s.roundNo++;
  const alive = s.order.filter((id) => !s.gone[id]);
  s.guesser = alive[(s.roundNo - 1) % alive.length];
  s.word = s.queue.pop();
  s.clues = {};
  s.dup = {};
  s.guess = null;
  s.result = null;
  s.phase = 'clue';
  s.deadline = ctx.now + CLUE_MS;
  s.timer = timer(CLUE_MS, ctx.now);
}

function toGuess(s, ctx) {
  const groups = {};
  for (const [id, c] of Object.entries(s.clues)) (groups[norm(c)] ||= []).push(id);
  s.dup = {};
  for (const ids of Object.values(groups)) if (ids.length > 1) for (const id of ids) s.dup[id] = true;
  s.phase = 'guess';
  s.deadline = ctx.now + GUESS_MS;
  s.timer = timer(GUESS_MS, ctx.now);
}

function endRound(s, ctx, result) {
  s.result = result;
  s.cardsLeft--;
  if (result === 'ok') s.score++;
  if (result === 'wrong' && s.cardsLeft > 0) s.cardsLeft--;
  s.phase = 'reveal';
  s.deadline = ctx.now + REVEAL_MS;
  s.timer = timer(REVEAL_MS, ctx.now);
}

function action(s, pid, a, ctx) {
  requirePlayer(s, pid);
  if (s.over) fail('게임이 끝났어요.');
  if (a.type === 'clue') {
    if (s.phase !== 'clue') fail('지금은 힌트를 쓸 시간이 아니에요.');
    if (pid === s.guesser) fail('이번 차례에는 내가 맞히는 사람이에요.');
    const t = String(a.text ?? '').trim();
    if (!t || /\s/.test(t)) fail('띄어쓰기 없이 한 단어만 써 주세요.');
    if ([...t].length > 12) fail('힌트는 12글자까지 쓸 수 있어요.');
    if (norm(t).includes(norm(s.word)) || norm(s.word).includes(norm(t))) fail('제시어가 들어간 힌트는 쓸 수 없어요.');
    s.clues[pid] = t;
    if (helpers(s).every((p) => s.clues[p.id])) toGuess(s, ctx);
    return;
  }
  if (a.type === 'guess') {
    if (s.phase !== 'guess' || pid !== s.guesser) fail('지금은 맞힐 수 없어요.');
    if (a.pass) { s.guess = null; endRound(s, ctx, 'pass'); return; }
    const t = String(a.text ?? '').trim();
    if (!t) fail('정답을 입력해 주세요.');
    s.guess = t.slice(0, 20);
    endRound(s, ctx, norm(t) === norm(s.word) ? 'ok' : 'wrong');
    return;
  }
  fail('알 수 없는 동작이에요.');
}

export default {
  setup(players, opts, ctx) {
    const ps = players.map((p) => ({ id: p.id, name: p.name }));
    const total = Number(opts.cards) || 10;
    const s = {
      players: ps, order: shuffle(ps.map((p) => p.id), ctx.rng), queue: shuffle([...DRAW_WORDS], ctx.rng).slice(0, 30),
      total, cardsLeft: total, score: 0, roundNo: 0, guesser: null, word: null, clues: {}, dup: {}, guess: null, result: null,
      phase: 'clue', gone: {}, over: null,
    };
    startRound(s, ctx);
    return s;
  },
  keepMin: 3,
  actors: (s) => {
    if (s.over) return [];
    if (s.phase === 'clue') return helpers(s).filter((p) => !s.clues[p.id]).map((p) => p.id);
    if (s.phase === 'guess') return [s.guesser];
    return [];
  },
  action,
  // 테스트·자동 진행용 (사람만 하는 게임이라 실제로는 쓰이지 않아요)
  auto(s, pid, ctx) {
    if (s.phase === 'clue' && pid !== s.guesser && !s.clues[pid]) return { type: 'clue', text: ['동그란', '빨간', '맛있는', '동물', '탈것', '작다'][Math.floor(ctx.rng() * 6)] };
    if (s.phase === 'guess' && pid === s.guesser) return ctx.rng() < 0.5 ? { type: 'guess', text: s.word } : { type: 'guess', pass: true };
    return null;
  },
  timeout(s, ctx) {
    if (s.phase === 'clue') toGuess(s, ctx);
    else if (s.phase === 'guess') endRound(s, ctx, 'pass');
    else startRound(s, ctx);
  },
  leave(s, pid, ctx) {
    s.gone[pid] = true;
    if (s.over) return;
    if (pid === s.guesser && s.phase !== 'reveal') { ctx.sys?.('맞히는 사람이 나가서 다음 카드로 넘어가요.'); endRound(s, ctx, 'pass'); return; }
    if (s.phase === 'clue' && helpers(s).every((p) => s.clues[p.id])) toGuess(s, ctx);
  },
  chat(s, pid) {
    if (s.over || s.phase === 'reveal') return;
    if (!s.players.some((p) => p.id === pid) || s.gone[pid]) return { to: [], spect: true, ch: '관전' };
    // 힌트를 주는 사람끼리의 대화는 맞히는 사람에게 보이지 않아요
    if (pid !== s.guesser) return { to: helpers(s).map((p) => p.id), spect: true, ch: '팀' };
  },
  view(s, pid) {
    const guesser = pid === s.guesser;
    const see = s.phase === 'reveal' || !!s.over;
    let clues = {};
    for (const [id, c] of Object.entries(s.clues)) {
      if (see || (s.phase === 'guess' && (!guesser || !s.dup[id])) || id === pid) clues[id] = c;
      else clues[id] = s.phase === 'guess' && guesser && s.dup[id] ? null : '?';
    }
    return {
      players: s.players, order: s.order, total: s.total, cardsLeft: s.cardsLeft, score: s.score, roundNo: s.roundNo,
      guesser: s.guesser, word: guesser && !see ? null : s.word, clues, dup: s.phase === 'clue' ? {} : s.dup,
      submitted: Object.keys(s.clues), guess: s.guess, result: s.result, phase: s.phase, gone: s.gone, timer: s.timer, over: s.over,
    };
  },
};
