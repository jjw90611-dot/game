import { fail, requirePlayer, shuffle, timer, nameOf, norm } from './util.js';
import { SPY_WORDS } from './words.js';

const CLUE_MS = 120000;
const GUESS_MS = 120000;
const TEAM_NAME = { r: '빨강', b: '파랑' };
const other = (t) => (t === 'r' ? 'b' : 'r');

function setPhase(s, phase, ms, ctx) {
  s.phase = phase;
  s.deadline = ctx.now + ms;
  s.timer = timer(ms, ctx.now);
}

function remaining(s, team) {
  return s.key.filter((k, i) => k === team && !s.revealed[i]).length;
}

function win(s, team, why) {
  s.over = {
    winners: s.players.filter((p) => s.teams[p.id] === team).map((p) => p.id),
    text: `${why} ${TEAM_NAME[team]} 팀 승리!`,
  };
}

function endTurn(s, ctx) {
  s.turn = other(s.turn);
  s.clue = null;
  s.guesses = 0;
  s.marks = {};
  setPhase(s, 'clue', CLUE_MS, ctx);
}

function isOperative(s, pid, team) {
  if (s.teams[pid] !== team) return false;
  if (s.spy[team] !== pid) return true;
  // 팀에 스파이 마스터만 남았으면 직접 고를 수 있어요
  return !s.players.some((p) => p.id !== pid && s.teams[p.id] === team && !s.gone[p.id]);
}

function action(s, pid, a, ctx) {
  requirePlayer(s, pid);
  if (s.over) fail('게임이 끝났어요.');
  if (a.type === 'clue') {
    if (s.phase !== 'clue' || s.spy[s.turn] !== pid) fail('지금은 우리 팀 스파이 마스터의 힌트 차례가 아니에요.');
    const word = String(a.word ?? '').replace(/\s+/g, ' ').trim().slice(0, 20);
    if (!word) fail('힌트 단어를 입력해 주세요.');
    if (s.words.some((w, i) => !s.revealed[i] && norm(w) === norm(word))) fail('판에 있는 단어는 힌트로 쓸 수 없어요.');
    const num = a.num === 'inf' ? 'inf' : Number(a.num);
    if (num !== 'inf' && !(Number.isInteger(num) && num >= 0 && num <= 9)) fail('숫자를 골라 주세요.');
    s.clue = { word, num, team: s.turn };
    s.guesses = num === 'inf' || num === 0 ? 99 : num + 1;
    s.log.push({ team: s.turn, word, num, picks: [] });
    ctx.sys?.(`🕵️ ${TEAM_NAME[s.turn]} 팀 힌트: "${word}" ${num === 'inf' ? '∞' : num}`);
    s.marks = {};
    setPhase(s, 'guess', GUESS_MS, ctx);
  } else if (a.type === 'mark') {
    if (s.phase !== 'guess' || !isOperative(s, pid, s.turn)) fail('지금은 우리 팀 차례가 아니에요.');
    const i = Number(a.i);
    if (!(i >= 0 && i < 25) || s.revealed[i]) return;
    const list = s.marks[i] || [];
    s.marks[i] = list.includes(pid) ? list.filter((x) => x !== pid) : [...list, pid];
  } else if (a.type === 'guess') {
    if (s.phase !== 'guess' || !isOperative(s, pid, s.turn)) fail('지금은 우리 팀 차례가 아니에요.');
    const i = Number(a.i);
    if (!(i >= 0 && i < 25) || s.revealed[i]) fail('이미 공개된 단어예요.');
    s.revealed[i] = true;
    const color = s.key[i];
    s.log[s.log.length - 1]?.picks.push({ i, color, by: pid });
    s.last = { i, color, by: pid };
    delete s.marks[i];
    if (color === 'a') {
      win(s, other(s.turn), `${TEAM_NAME[s.turn]} 팀이 암살자 "${s.words[i]}"를 골랐어요!`);
      return;
    }
    if (remaining(s, 'r') === 0) { win(s, 'r', '빨강 팀 요원을 모두 찾았어요!'); return; }
    if (remaining(s, 'b') === 0) { win(s, 'b', '파랑 팀 요원을 모두 찾았어요!'); return; }
    if (color === s.turn) {
      s.guesses--;
      if (s.guesses <= 0) endTurn(s, ctx);
    } else {
      ctx.sys?.(color === 'n' ? `"${s.words[i]}"는 시민이었어요. 차례가 넘어가요.` : `"${s.words[i]}"는 상대 팀 요원이었어요! 차례가 넘어가요.`);
      endTurn(s, ctx);
    }
  } else if (a.type === 'end') {
    if (s.phase !== 'guess' || !isOperative(s, pid, s.turn)) fail('지금은 우리 팀 차례가 아니에요.');
    ctx.sys?.(`${TEAM_NAME[s.turn]} 팀이 차례를 마쳤어요.`);
    endTurn(s, ctx);
  } else fail('알 수 없는 동작이에요.');
}

export default {
  setup(players, opts, ctx) {
    const ps = shuffle(players.map((p) => ({ id: p.id, name: p.name })), ctx.rng);
    const teams = {};
    ps.forEach((p, i) => { teams[p.id] = i % 2 ? 'b' : 'r'; });
    const spy = { r: ps[0].id, b: ps[1].id };
    const first = ctx.rng() < 0.5 ? 'r' : 'b';
    const key = shuffle([...Array(9).fill(first), ...Array(8).fill(other(first)), ...Array(7).fill('n'), 'a'], ctx.rng);
    const words = shuffle(SPY_WORDS.slice(), ctx.rng).slice(0, 25);
    const s = {
      players: ps, teams, spy, words, key, revealed: Array(25).fill(false), turn: first, first, phase: 'clue', clue: null,
      guesses: 0, marks: {}, log: [], last: null, gone: {}, over: null,
    };
    ctx.sys?.(`🎯 ${TEAM_NAME[first]} 팀이 먼저 시작해요! 스파이 마스터: 빨강 ${nameOf(s, spy.r)}, 파랑 ${nameOf(s, spy.b)}`);
    setPhase(s, 'clue', CLUE_MS, ctx);
    return s;
  },
  keepMin: 2,
  actors: () => [],
  action,
  auto: () => null,
  timeout(s, ctx) {
    if (s.phase === 'clue') ctx.sys?.(`⏰ ${TEAM_NAME[s.turn]} 팀 스파이 마스터가 시간 안에 힌트를 주지 못했어요.`);
    else ctx.sys?.(`⏰ ${TEAM_NAME[s.turn]} 팀의 시간이 끝났어요.`);
    endTurn(s, ctx);
  },
  leave(s, pid, ctx) {
    s.gone[pid] = true;
    const team = s.teams[pid];
    const left = s.players.filter((p) => s.teams[p.id] === team && !s.gone[p.id]);
    if (!left.length) {
      win(s, other(team), `${TEAM_NAME[team]} 팀이 모두 나갔어요.`);
      return;
    }
    if (s.spy[team] === pid) {
      s.spy[team] = left[0].id;
      ctx.sys?.(`${TEAM_NAME[team]} 팀의 새 스파이 마스터는 ${left[0].name}님이에요.`);
    }
  },
  view(s, pid) {
    const isSpy = s.spy.r === pid || s.spy.b === pid;
    const seeKey = isSpy || !!s.over;
    return {
      players: s.players, teams: s.teams, spy: s.spy, words: s.words,
      key: s.key.map((k, i) => (seeKey || s.revealed[i] ? k : null)), revealed: s.revealed,
      turn: s.turn, first: s.first, phase: s.phase, clue: s.clue, guesses: s.guesses, marks: s.marks, log: s.log,
      last: s.last, left: { r: remaining(s, 'r'), b: remaining(s, 'b') }, gone: s.gone, timer: s.timer, over: s.over,
      myTeam: s.teams[pid] || null, amSpy: isSpy,
      canGuess: !!pid && s.phase === 'guess' && !s.over && isOperative(s, pid, s.turn),
    };
  },
};
