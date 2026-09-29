// 노래 맞히기: 1초 듣고 제목 맞히기! 못 맞히면 3초 → 7초 → 15초로 점점 길게 들려줘요.
// 음악은 유튜브 공식 뮤직비디오를 모든 사람이 같은 순간에 재생해요.
import { fail, requirePlayer, shuffle, timer, norm, nameOf } from './util.js';
import { songsFor, ERAS } from './songs.js';
import { chosung } from './chosung.js';

export const CLIPS = [1000, 3000, 7000, 15000];
export const POINTS = [10, 7, 5, 3];
const LOAD_MS = 4000; // 영상 불러오는 시간
const GAP_MS = 7000; // 들려준 뒤 맞히는 시간
const REVEAL_MS = 9000;
const NEXT_MS = 1200;

const answers = (song) => [song.title, ...(song.a || [])].map(norm);
const strip = (s) => norm(String(s).replace(/\([^)]*\)/g, ''));

export function isAnswer(song, text) {
  const t = norm(text);
  if (!t) return false;
  return answers(song).includes(t) || strip(song.title) === t;
}

function startSong(s, ctx) {
  s.qNo++;
  if (s.qNo > s.total || !s.queue.length) { finish(s); return; }
  s.song = s.queue.pop();
  s.t = s.song.t ?? 45 + Math.floor(ctx.rng() * 30);
  s.stage = 0;
  s.solver = null;
  s.gains = {};
  s.phase = 'play';
  s.playAt = ctx.now + LOAD_MS;
  s.deadline = s.playAt + CLIPS[0] + GAP_MS;
  s.timer = timer(s.deadline - ctx.now, ctx.now);
}

function finish(s) {
  let best = -1;
  for (const p of s.players) best = Math.max(best, s.scores[p.id]);
  const winners = best > 0 ? s.players.filter((p) => s.scores[p.id] === best && !s.gone[p.id]).map((p) => p.id) : [];
  s.over = { winners, text: winners.length ? `${winners.map((id) => nameOf(s, id)).join(', ')}님 승리! (${best}점)` : '아무도 맞히지 못했어요. 무승부!' };
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
    const era = ERAS[opts.era] ? String(opts.era) : 'latest';
    const s = {
      players: ps, scores, era, total: Number(opts.rounds) || 10, qNo: 0, queue: shuffle([...songsFor(era)], ctx.rng),
      song: null, t: 0, stage: 0, playAt: 0, phase: 'play', solver: null, gains: {}, bad: [], gone: {}, over: null,
    };
    s.total = Math.min(s.total, s.queue.length);
    startSong(s, ctx);
    return s;
  },
  keepMin: 1,
  actors: () => [],
  action(s, pid, a, ctx) {
    requirePlayer(s, pid);
    if (s.over) fail('게임이 끝났어요.');
    // 재생할 수 없는 영상(외부 재생 금지 등)이면 다음 곡으로
    if (a.type === 'bad') {
      if (!s.song || a.y !== s.song.y || s.phase !== 'play') return;
      s.bad.push(s.song.y);
      ctx.sys?.('이 곡은 재생할 수 없어서 다른 곡으로 바꿀게요.');
      s.qNo--;
      startSong(s, ctx);
      return;
    }
    fail('정답은 채팅창에 입력해 주세요.');
  },
  timeout(s, ctx) {
    if (s.phase === 'reveal') { startSong(s, ctx); return; }
    if (s.stage < CLIPS.length - 1) {
      s.stage++;
      s.playAt = ctx.now + NEXT_MS;
      s.deadline = s.playAt + CLIPS[s.stage] + GAP_MS;
      s.timer = timer(s.deadline - ctx.now, ctx.now);
      return;
    }
    ctx.sys?.(`⏰ 아무도 못 맞혔어요! 정답은 ${s.song.artist} - "${s.song.title}"`);
    reveal(s, ctx);
  },
  leave(s, pid) {
    s.gone[pid] = true;
  },
  chat(s, pid, text, ctx) {
    if (s.over || s.phase !== 'play' || !s.song) return;
    if (!s.players.some((p) => p.id === pid) || s.gone[pid]) {
      if (isAnswer(s.song, text)) fail('관전 중에는 정답을 쓸 수 없어요.');
      return;
    }
    if (!isAnswer(s.song, text)) return;
    if (ctx.now < s.playAt) fail('아직 노래가 나오기 전이에요!');
    const gain = POINTS[s.stage];
    s.scores[pid] += gain;
    s.gains = { [pid]: gain };
    s.solver = pid;
    ctx.sys?.(`🎉 ${nameOf(s, pid)}님 정답! ${s.song.artist} - "${s.song.title}" (+${gain}점)`);
    reveal(s, ctx);
    return { consume: true, changed: true };
  },
  view(s) {
    const see = s.phase === 'reveal' || !!s.over;
    const song = s.song;
    return {
      players: s.players, scores: s.scores, era: s.era, eraName: ERAS[s.era], total: s.total, qNo: s.qNo,
      y: song?.y, t: s.t, stage: s.stage, clips: CLIPS, points: POINTS, playAt: s.playAt, phase: s.phase,
      hintArtist: see || s.stage >= 2 ? song?.artist : null,
      hintLen: song ? [...song.title].map((ch) => (ch === ' ' ? ' ' : see ? ch : s.stage >= 3 ? chosung(ch) : '○')) : [],
      title: see ? song?.title : null, artist: see ? song?.artist : null,
      solver: s.solver, gains: s.gains, gone: s.gone, timer: s.timer, over: s.over,
    };
  },
};
