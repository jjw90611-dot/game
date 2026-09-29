import { fail, requirePlayer, timer, cleanDrawing } from './util.js';

const TEXT_MS = 45000;
const GRACE = 2500; // 화면 시간이 끝난 뒤 자동 제출을 기다리는 여유
const ALBUM_TEXT_MS = 4500;
const ALBUM_DRAW_MS = 6500;

const kindOf = (step) => (step % 2 === 0 ? 'text' : 'draw');

function bookOf(s, idx, step) {
  const n = s.players.length;
  return (((idx - step) % n) + n) % n;
}

function stepMs(s) {
  return kindOf(s.step) === 'draw' ? s.drawMs : s.step === 0 ? 60000 : TEXT_MS;
}

function startStep(s, ctx) {
  s.submitted = {};
  const ms = stepMs(s);
  s.timer = timer(ms, ctx.now);
  s.deadline = ctx.now + ms + GRACE;
}

function activeIdx(s) {
  return s.players.map((p, i) => i).filter((i) => !s.gone[s.players[i].id]);
}

function finishStep(s, ctx) {
  // 안 낸 사람은 빈 페이지로 채워요
  s.players.forEach((p, i) => {
    const b = s.books[bookOf(s, i, s.step)];
    if (!b.pages[s.step]) {
      b.pages[s.step] = kindOf(s.step) === 'text'
        ? { by: p.id, kind: 'text', text: s.gone[p.id] ? '(나간 사람의 페이지)' : '(시간 초과로 비었어요)' }
        : { by: p.id, kind: 'draw', key: `${s.books.indexOf(b)}:${s.step}`, empty: true };
    }
  });
  s.step++;
  if (s.step >= s.steps) {
    s.phase = 'album';
    s.album = { book: 0, page: 0 };
    ctx.sys?.('📖 모두 완성! 앨범을 함께 넘겨 보세요.');
    setAlbumTimer(s, ctx);
    return;
  }
  startStep(s, ctx);
}

function setAlbumTimer(s, ctx) {
  const page = s.books[s.album.book].pages[s.album.page];
  const ms = page?.kind === 'draw' ? ALBUM_DRAW_MS : ALBUM_TEXT_MS;
  s.deadline = ctx.now + ms;
  s.timer = timer(ms, ctx.now);
}

function albumNext(s, ctx) {
  s.album.page++;
  if (s.album.page >= s.steps) {
    s.album.book++;
    s.album.page = 0;
  }
  if (s.album.book >= s.books.length) {
    s.over = { winners: [], text: '모든 앨범을 다 봤어요! 다 같이 수고했어요 👏' };
    return;
  }
  setAlbumTimer(s, ctx);
}

function action(s, pid, a, ctx) {
  const idx = requirePlayer(s, pid);
  if (s.over) fail('게임이 끝났어요.');
  if (a.type === 'submit') {
    if (s.phase !== 'play') fail('지금은 제출할 수 없어요.');
    const b = bookOf(s, idx, s.step);
    const kind = kindOf(s.step);
    if (kind === 'text') {
      const text = String(a.text ?? '').replace(/\s+/g, ' ').trim().slice(0, 60);
      if (!text) fail('문장을 입력해 주세요.');
      s.books[b].pages[s.step] = { by: pid, kind, text };
    } else {
      const strokes = cleanDrawing(a.strokes, 9000);
      const key = `${b}:${s.step}`;
      ctx.vol.drawings ||= {};
      ctx.vol.drawings[key] = strokes;
      s.books[b].pages[s.step] = { by: pid, kind, key, empty: !strokes.length };
    }
    s.submitted[pid] = true;
    if (activeIdx(s).every((i) => s.submitted[s.players[i].id])) finishStep(s, ctx);
  } else if (a.type === 'next') {
    if (s.phase !== 'album') fail('지금은 넘길 수 없어요.');
    if (Number(a.book) !== s.album.book || Number(a.page) !== s.album.page) return;
    albumNext(s, ctx);
  } else fail('알 수 없는 동작이에요.');
}

export default {
  setup(players, opts, ctx) {
    const ps = players.map((p) => ({ id: p.id, name: p.name }));
    const s = {
      players: ps, steps: ps.length, step: 0, phase: 'play', drawMs: (Number(opts.time) || 90) * 1000,
      books: ps.map((p) => ({ owner: p.id, pages: [] })), submitted: {}, album: null, gone: {}, over: null,
    };
    ctx.vol.drawings = {};
    ctx.sys?.('✏️ 첫 문장을 적어 주세요! 재미있을수록 좋아요.');
    startStep(s, ctx);
    return s;
  },
  keepMin: 2,
  actors: () => [],
  action,
  auto: () => null,
  timeout(s, ctx) {
    if (s.phase === 'play') finishStep(s, ctx);
    else if (s.phase === 'album') albumNext(s, ctx);
  },
  leave(s, pid, ctx) {
    s.gone[pid] = true;
    if (s.phase === 'play' && activeIdx(s).every((i) => s.submitted[s.players[i].id])) finishStep(s, ctx);
  },
  // 그림 데이터 요청 (필요할 때만 받아요)
  fetch(s, pid, key, vol) {
    if (typeof key !== 'string' || !/^\d+:\d+$/.test(key)) return null;
    const [b, k] = key.split(':').map(Number);
    const idx = s.players.findIndex((p) => p.id === pid);
    let ok = s.phase !== 'play' || !!s.over;
    if (!ok && idx >= 0) ok = b === bookOf(s, idx, s.step) && k === s.step - 1;
    if (!ok) return null;
    return vol.drawings?.[key] || [];
  },
  view(s, pid) {
    const idx = s.players.findIndex((p) => p.id === pid);
    const base = {
      players: s.players, phase: s.phase, step: s.step, steps: s.steps, kind: s.phase === 'play' ? kindOf(s.step) : null,
      submitted: Object.keys(s.submitted), gone: s.gone, timer: s.timer, over: s.over,
    };
    if (s.phase === 'play' && idx >= 0) {
      const b = bookOf(s, idx, s.step);
      const prev = s.step > 0 ? s.books[b].pages[s.step - 1] : null;
      base.task = { book: b, prompt: prev ? { kind: prev.kind, text: prev.text, key: prev.key, empty: prev.empty } : null, done: !!s.submitted[pid] };
    }
    if (s.phase === 'album' || s.over) {
      base.album = s.album;
      const upto = (bi) => (s.over || bi < s.album.book ? s.steps : bi === s.album.book ? s.album.page + 1 : 0);
      base.books = s.books.map((bk, bi) => ({
        owner: bk.owner,
        pages: bk.pages.slice(0, upto(bi)).map((p) => ({ by: p.by, kind: p.kind, text: p.text, key: p.key, empty: p.empty })),
      }));
    }
    return base;
  },
};
