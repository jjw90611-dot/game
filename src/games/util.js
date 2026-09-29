// 게임 모듈 공용 도우미

export class UserError extends Error {
  constructor(msg) {
    super(msg);
    this.user = true;
  }
}

// 사용자에게 보여줄 오류를 던집니다. (상태를 바꾸기 전에 호출해야 해요)
export function fail(msg) {
  throw new UserError(msg);
}

export function shuffle(arr, rng = Math.random) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function pick(arr, rng = Math.random) {
  return arr[Math.floor(rng() * arr.length)];
}

export function range(n) {
  return Array.from({ length: n }, (_, i) => i);
}

export function playerIndex(state, pid) {
  return state.players.findIndex((p) => p.id === pid);
}

export function requirePlayer(state, pid) {
  const i = playerIndex(state, pid);
  if (i < 0) fail('게임 참가자가 아니에요.');
  return i;
}

export function nameOf(state, pid) {
  return state.players.find((p) => p.id === pid)?.name ?? '???';
}

// 한글 정답 비교용: 공백/기호 제거 + 소문자
export function norm(s) {
  return String(s ?? '').toLowerCase().replace(/[\s.,!?~'"`\-_·()[\]{}]/g, '');
}

export function timer(ms, now) {
  return { end: now + ms, total: ms };
}

// 가장 많은 표를 받은 대상을 구합니다. votes: {voter: target}
export function tally(votes) {
  const count = {};
  for (const t of Object.values(votes)) {
    if (t == null || t === '') continue;
    count[t] = (count[t] || 0) + 1;
  }
  let max = 0;
  for (const c of Object.values(count)) max = Math.max(max, c);
  const top = Object.keys(count).filter((k) => count[k] === max && max > 0);
  return { count, max, top };
}

const clampInt = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(Number(v) || 0)));

// 그림 데이터(획) 처리: {k:'s'} 새 획, {k:'p'} 점 추가, {k:'u'} 되돌리기, {k:'c'} 모두 지우기
// 좌표는 0~1000 정수. 정리된 데이터를 돌려주고, 잘못된 데이터면 null
export function applyStroke(vol, d, maxPoints = 40000) {
  if (!vol.strokes) vol.strokes = [];
  if (!d || typeof d !== 'object') return null;
  if (d.k === 'c') {
    vol.strokes = [];
    vol.points = 0;
    return { k: 'c' };
  }
  if (d.k === 'u') {
    const st = vol.strokes.pop();
    if (st) vol.points = Math.max(0, (vol.points || 0) - st.p.length / 2);
    return { k: 'u' };
  }
  if (d.k !== 's' && d.k !== 'p') return null;
  const pts = Array.isArray(d.p) ? d.p.slice(0, 600).map((n) => clampInt(n, 0, 1000)) : [];
  if (pts.length % 2) pts.pop();
  if ((vol.points || 0) + pts.length / 2 > maxPoints) return null;
  vol.points = (vol.points || 0) + pts.length / 2;
  if (d.k === 's') {
    if (vol.strokes.length >= 4000) return null;
    const st = { c: clampInt(d.c, 0, 15), w: clampInt(d.w, 0, 3), p: pts };
    vol.strokes.push(st);
    return { k: 's', c: st.c, w: st.w, p: pts };
  }
  const last = vol.strokes[vol.strokes.length - 1];
  if (!last) return null;
  last.p.push(...pts);
  return { k: 'p', p: pts };
}

// 제출된 그림(획 목록)을 검사하고 정리합니다.
export function cleanDrawing(strokes, maxPoints = 8000) {
  const vol = { strokes: [] };
  if (!Array.isArray(strokes)) return [];
  for (const st of strokes.slice(0, 1500)) {
    if (!st || !Array.isArray(st.p)) continue;
    const p = st.p;
    if (!applyStroke(vol, { k: 's', c: st.c, w: st.w, p: p.slice(0, 600) }, maxPoints)) break;
    for (let i = 600; i < p.length; i += 600) if (!applyStroke(vol, { k: 'p', p: p.slice(i, i + 600) }, maxPoints)) break;
  }
  return vol.strokes;
}
