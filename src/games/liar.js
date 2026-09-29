import { fail, requirePlayer, shuffle, pick, timer, norm, tally, nameOf } from './util.js';
import { LIAR_TOPICS } from './words.js';

const HINT_MS = 30000;
const VOTE_MS = 30000;
const GUESS_MS = 30000;

function active(s) {
  return s.players.filter((p) => !s.gone[p.id]);
}

function setPhase(s, phase, ms, ctx) {
  s.phase = phase;
  s.deadline = ctx.now + ms;
  s.timer = timer(ms, ctx.now);
}

function currentHinter(s) {
  const n = s.players.length;
  return s.players[s.hintTurn % n];
}

function nextHint(s, ctx) {
  const total = s.players.length * s.rounds;
  while (s.hintTurn < total && s.gone[currentHinter(s).id]) s.hintTurn++;
  if (s.hintTurn >= total) {
    ctx.sys?.('💬 설명이 끝났어요! 자유롭게 토론하고 라이어를 찾아보세요.');
    setPhase(s, 'discuss', s.discussMs, ctx);
    s.skip = {};
    return;
  }
  setPhase(s, 'hint', HINT_MS, ctx);
}

function startVote(s, ctx) {
  s.votes = {};
  ctx.sys?.('🗳️ 투표 시간! 라이어라고 생각하는 사람을 골라 주세요.');
  setPhase(s, 'vote', VOTE_MS, ctx);
}

function liarWins(s, why) {
  s.over = {
    winners: [s.liar],
    text: `${why} 라이어 ${nameOf(s, s.liar)}님 승리! (제시어: ${s.word})`,
  };
}

function citizensWin(s, why) {
  s.over = {
    winners: s.players.filter((p) => p.id !== s.liar).map((p) => p.id),
    text: `${why} 시민 승리! (라이어: ${nameOf(s, s.liar)}, 제시어: ${s.word})`,
  };
}

function resolveVote(s, ctx) {
  const t = tally(s.votes);
  s.voteResult = { count: t.count, votes: { ...s.votes } };
  if (t.top.length !== 1) {
    liarWins(s, '표가 갈려 라이어를 찾지 못했어요.');
    return;
  }
  s.accused = t.top[0];
  if (s.accused !== s.liar) {
    liarWins(s, `${nameOf(s, s.accused)}님은 라이어가 아니었어요!`);
    return;
  }
  ctx.sys?.(`😱 ${nameOf(s, s.liar)}님이 라이어였어요! 제시어를 맞히면 라이어가 이겨요.`);
  setPhase(s, 'guess', GUESS_MS, ctx);
}

function allVoted(s) {
  return active(s).every((p) => s.votes[p.id] != null);
}

function action(s, pid, a, ctx) {
  requirePlayer(s, pid);
  if (s.over) fail('게임이 끝났어요.');
  if (a.type === 'hint') {
    if (s.phase !== 'hint' || currentHinter(s).id !== pid) fail('내 설명 차례가 아니에요.');
    const text = String(a.text ?? '').replace(/\s+/g, ' ').trim().slice(0, 40);
    if (!text) fail('설명을 입력해 주세요.');
    const mine = pid === s.liar ? s.foolWord : s.word;
    if (mine && norm(text).includes(norm(mine))) fail('제시어를 그대로 말하면 안 돼요!');
    s.hints.push({ pid, text });
    s.hintTurn++;
    nextHint(s, ctx);
  } else if (a.type === 'skip') {
    if (s.phase !== 'discuss') fail('지금은 할 수 없어요.');
    s.skip[pid] = true;
    const n = active(s).length;
    if (Object.keys(s.skip).filter((id) => !s.gone[id]).length > n / 2) startVote(s, ctx);
  } else if (a.type === 'vote') {
    if (s.phase !== 'vote') fail('투표 시간이 아니에요.');
    const target = s.players.find((p) => p.id === a.target);
    if (!target || s.gone[target.id]) fail('투표할 사람을 골라 주세요.');
    if (target.id === pid) fail('자기 자신에게는 투표할 수 없어요.');
    s.votes[pid] = target.id;
    if (allVoted(s)) resolveVote(s, ctx);
  } else if (a.type === 'guess') {
    if (s.phase !== 'guess' || pid !== s.liar) fail('라이어만 정답을 말할 수 있어요.');
    const text = String(a.text ?? '').trim().slice(0, 30);
    if (!text) fail('제시어를 입력해 주세요.');
    s.guess = text;
    if (norm(text) === norm(s.word)) liarWins(s, `라이어가 제시어 "${s.word}"를 맞혔어요!`);
    else citizensWin(s, `라이어의 답 "${text}"은(는) 틀렸어요!`);
  } else fail('알 수 없는 동작이에요.');
}

export default {
  setup(players, opts, ctx) {
    const ps = shuffle(players.map((p) => ({ id: p.id, name: p.name })), ctx.rng);
    const topic = pick(Object.keys(LIAR_TOPICS), ctx.rng);
    const words = shuffle(LIAR_TOPICS[topic].slice(), ctx.rng);
    const fool = Number(opts.fool) === 1;
    const s = {
      players: ps, topic, word: words[0], foolWord: fool ? words[1] : null, fool,
      liar: pick(ps, ctx.rng).id, rounds: Number(opts.rounds) === 2 ? 2 : 1,
      discussMs: (Number(opts.discuss) || 90) * 1000, phase: 'hint', hints: [], hintTurn: 0, skip: {},
      votes: {}, voteResult: null, accused: null, guess: null, gone: {}, over: null,
    };
    ctx.sys?.(`🎭 주제는 "${topic}"! 차례대로 제시어를 한 줄로 설명해 주세요.`);
    nextHint(s, ctx);
    return s;
  },
  actors(s) {
    if (s.over) return [];
    if (s.phase === 'hint') return [currentHinter(s).id];
    if (s.phase === 'vote') return active(s).filter((p) => s.votes[p.id] == null).map((p) => p.id);
    if (s.phase === 'guess') return [s.liar];
    return [];
  },
  action,
  auto(s, pid) {
    if (s.phase === 'hint' && currentHinter(s).id === pid) return { type: 'hint', text: '(패스)' };
    return null;
  },
  timeout(s, ctx) {
    if (s.phase === 'hint') {
      s.hints.push({ pid: currentHinter(s).id, text: '(시간 초과)' });
      s.hintTurn++;
      nextHint(s, ctx);
    } else if (s.phase === 'discuss') startVote(s, ctx);
    else if (s.phase === 'vote') resolveVote(s, ctx);
    else if (s.phase === 'guess') citizensWin(s, '라이어가 시간 안에 답하지 못했어요.');
  },
  leave(s, pid, ctx) {
    s.gone[pid] = true;
    if (pid === s.liar) {
      citizensWin(s, '라이어가 게임을 떠났어요.');
      return;
    }
    if (s.phase === 'hint' && currentHinter(s).id === pid) {
      s.hintTurn++;
      nextHint(s, ctx);
    } else if (s.phase === 'vote') {
      for (const [v, t] of Object.entries(s.votes)) if (t === pid || v === pid) delete s.votes[v];
      if (allVoted(s) && Object.keys(s.votes).length) resolveVote(s, ctx);
    }
  },
  chat(s, pid, text) {
    // 제시어를 아는 사람은 채팅에 제시어를 쓸 수 없어요 (라이어의 말은 막지 않음 → 정보 노출 방지)
    if (s.over) return;
    const isPlayer = s.players.some((p) => p.id === pid);
    if (!isPlayer) return;
    const known = pid === s.liar ? s.foolWord : s.word;
    if (known && norm(text).includes(norm(known))) fail('제시어는 채팅에 쓸 수 없어요!');
  },
  view(s, pid) {
    const isPlayer = s.players.some((p) => p.id === pid);
    const over = !!s.over;
    let myWord = null, amLiar = false;
    if (isPlayer) {
      if (pid === s.liar) {
        if (s.fool) myWord = s.foolWord;
        else amLiar = true;
      } else myWord = s.word;
    }
    return {
      players: s.players, topic: s.topic, phase: s.phase, rounds: s.rounds, hints: s.hints,
      hinter: s.phase === 'hint' ? currentHinter(s).id : null, hintTurn: s.hintTurn,
      myWord, amLiar, fool: s.fool, isPlayer,
      voted: Object.keys(s.votes), myVote: s.votes[pid] ?? null, skip: Object.keys(s.skip || {}),
      voteResult: s.voteResult, accused: s.accused, gone: s.gone, timer: s.timer, over: s.over,
      reveal: over || s.phase === 'guess' ? { liar: s.liar } : null,
      answer: over ? { word: s.word, foolWord: s.foolWord, liar: s.liar, guess: s.guess } : null,
    };
  },
};
