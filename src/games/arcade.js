// 팀 아케이드: 한 방에서 25가지 짧은 순발력 게임 중 하나를 골라 겨뤄요.
// 각 참가자는 한 팀을 대표하며, 클라이언트가 계산한 0~1000점 결과를 한 번 제출합니다.
import { fail, requirePlayer } from './util.js';

export const ARCADE_MODES = [
  ['tap', '번개 탭'],
  ['rhythm', '리듬 펄스'],
  ['shake', '쉐이크 러시'],
  ['swipe', '스와이프 스프린트'],
  ['target', '팝 타겟'],
  ['rps', '순간 가위바위보'],
  ['runner', '터보 러너'],
  ['piano', '멜로디 스텝'],
  ['timestop', '타임 스톱'],
  ['gauge', '밸런스 게이지'],
  ['reaction', '라이트닝 터치'],
  ['stack', '스택 타워'],
  ['lines', '라인 클리어'],
  ['wires', '컬러 와이어'],
  ['dodge', '코스믹 닷지'],
  ['parity', '홀짝 브레인'],
  ['sorter', '스위치 분류'],
  ['balloon', '컬러 트랩'],
  ['multiply', '곱셈 대시'],
  ['numbers', '넘버 헌트'],
  ['memory', '네온 메모리'],
  ['safe', '시크릿 넘버'],
  ['oddcolor', '틴트 헌터'],
  ['initials', '첫소리 챌린지'],
  ['trivia', '퀴즈 스프린트'],
];

const MODE_IDS = new Set(ARCADE_MODES.map(([id]) => id));
const clampScore = (value) => Math.max(0, Math.min(1000, Math.round(Number(value) || 0)));

function finish(state) {
  if (state.over) return;
  for (const p of state.players) {
    if (!state.done[p.id]) state.scores[p.id] = state.scores[p.id] || 0;
    state.done[p.id] = true;
  }
  const best = Math.max(0, ...Object.values(state.scores));
  const winners = state.players.filter((p) => state.scores[p.id] === best).map((p) => p.id);
  const names = winners.map((id) => state.players.find((p) => p.id === id)?.name).filter(Boolean).join(', ');
  state.over = { winners, text: `${names || '참가자'} 승리! (${best}점)` };
  state.deadline = null;
}

export default {
  setup(players, opts, ctx) {
    const mode = MODE_IDS.has(opts.mode) ? opts.mode : ARCADE_MODES[0][0];
    const duration = [45, 60, 90].includes(Number(opts.duration)) ? Number(opts.duration) : 60;
    const ps = players.map((p) => ({ id: p.id, name: p.name }));
    return {
      players: ps,
      mode,
      duration,
      seed: Math.floor(ctx.rng() * 0x7fffffff),
      readyAt: ctx.now + 3000,
      deadline: ctx.now + (duration + 3) * 1000,
      scores: Object.fromEntries(ps.map((p) => [p.id, 0])),
      details: {},
      done: {},
      over: null,
    };
  },

  keepMin: 1,

  actors(state) {
    return state.over ? [] : state.players.filter((p) => !state.done[p.id]).map((p) => p.id);
  },

  action(state, pid, action) {
    requirePlayer(state, pid);
    if (state.over) fail('게임이 끝났어요.');
    if (state.done[pid]) fail('이미 결과를 제출했어요.');
    if (action.type !== 'finish') fail('알 수 없는 동작이에요.');
    state.scores[pid] = clampScore(action.score);
    state.details[pid] = String(action.detail || '').replace(/[<>]/g, '').slice(0, 48);
    state.done[pid] = true;
    if (state.players.every((p) => state.done[p.id])) finish(state);
  },

  auto(state, pid, ctx) {
    if (state.over || state.done[pid]) return null;
    return { type: 'finish', score: 420 + Math.floor(ctx.rng() * 481), detail: '자동 플레이' };
  },

  botDelay: () => 4500 + Math.floor(Math.random() * 4500),

  timeout(state) {
    finish(state);
  },

  view: (state) => ({
    players: state.players,
    mode: state.mode,
    modeName: ARCADE_MODES.find(([id]) => id === state.mode)?.[1] || '팀 아케이드',
    duration: state.duration,
    seed: state.seed,
    readyAt: state.readyAt,
    deadline: state.deadline,
    timer: state.deadline ? { end: state.deadline, total: (state.duration + 3) * 1000 } : null,
    scores: state.scores,
    details: state.details,
    done: state.done,
    over: state.over,
  }),
};
