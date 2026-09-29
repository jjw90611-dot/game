// 그림판 (그림 맞히기 · 그림 릴레이 공용)
// 좌표: 가로·세로 모두 0~1000, 화면 비율 4:3
export const PALETTE = ['#1d2433', '#ffffff', '#e03131', '#f76707', '#fcc419', '#40c057', '#1c7ed6', '#7048e8', '#e64980', '#8d5a2b', '#868e96', '#74c0fc'];
export const WIDTHS = [4, 9, 18, 40];

export class DrawBoard {
  constructor(canvas, { editable = false, onSend = null } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.strokes = [];
    this.editable = editable;
    this.onSend = onSend;
    this.color = 0;
    this.width = 1;
    this.cur = null;
    this.pending = null;
    this.flushTimer = null;
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(canvas);
    this.resize();
    if (editable) this.bind();
  }

  destroy() {
    this.ro.disconnect();
    clearInterval(this.flushTimer);
    this.unbind?.();
  }

  setEditable(on) {
    if (on === this.editable) return;
    this.editable = on;
    if (on) this.bind();
    else this.unbind?.();
    this.canvas.classList.toggle('editable', on);
  }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    if (!r.width) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.round(r.width * dpr), h = Math.round(r.width * 0.75 * dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.redraw();
  }

  sx(x) { return (x / 1000) * this.canvas.width; }
  sy(y) { return (y / 1000) * this.canvas.height; }

  redraw() {
    const c = this.ctx;
    c.fillStyle = '#fff';
    c.fillRect(0, 0, this.canvas.width, this.canvas.height);
    for (const st of this.strokes) this.drawStroke(st, 0);
  }

  drawStroke(st, from) {
    const c = this.ctx, p = st.p;
    if (p.length < 2) return;
    c.strokeStyle = PALETTE[st.c] || '#000';
    c.lineWidth = (WIDTHS[st.w] || 6) * (this.canvas.width / 1000);
    c.lineCap = 'round';
    c.lineJoin = 'round';
    c.beginPath();
    const start = Math.max(0, from - 2);
    c.moveTo(this.sx(p[start]), this.sy(p[start + 1]));
    if (p.length === 2) c.lineTo(this.sx(p[0]) + 0.01, this.sy(p[1]));
    for (let i = start + 2; i < p.length; i += 2) c.lineTo(this.sx(p[i]), this.sy(p[i + 1]));
    c.stroke();
  }

  setStrokes(strokes) {
    this.strokes = (strokes || []).map((s) => ({ c: s.c, w: s.w, p: s.p.slice() }));
    this.redraw();
  }

  // 서버에서 받은 그림 데이터 적용
  apply(d) {
    if (!d) return;
    if (d.k === 'c') { this.strokes = []; this.redraw(); }
    else if (d.k === 'u') { this.strokes.pop(); this.redraw(); }
    else if (d.k === 's') { const st = { c: d.c, w: d.w, p: d.p.slice() }; this.strokes.push(st); this.drawStroke(st, 0); }
    else if (d.k === 'p') {
      const st = this.strokes[this.strokes.length - 1];
      if (!st) return;
      const from = st.p.length;
      st.p.push(...d.p);
      this.drawStroke(st, from);
    }
  }

  point(e) {
    const r = this.canvas.getBoundingClientRect();
    const x = Math.round(((e.clientX - r.left) / r.width) * 1000);
    const y = Math.round(((e.clientY - r.top) / r.height) * 1000);
    return [Math.max(0, Math.min(1000, x)), Math.max(0, Math.min(1000, y))];
  }

  bind() {
    const cv = this.canvas;
    cv.classList.add('editable');
    const down = (e) => {
      if (!this.editable) return;
      e.preventDefault();
      cv.setPointerCapture?.(e.pointerId);
      const [x, y] = this.point(e);
      this.cur = { c: this.color, w: this.width, p: [x, y] };
      this.strokes.push(this.cur);
      this.drawStroke(this.cur, 0);
      this.pending = { k: 's', c: this.color, w: this.width, p: [x, y] };
      this.flush();
    };
    const move = (e) => {
      if (!this.cur) return;
      e.preventDefault();
      const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
      for (const ev of evs.length ? evs : [e]) {
        const [x, y] = this.point(ev);
        const p = this.cur.p;
        const lx = p[p.length - 2], ly = p[p.length - 1];
        if (Math.abs(x - lx) + Math.abs(y - ly) < 3) continue;
        const from = p.length;
        p.push(x, y);
        this.drawStroke(this.cur, from);
        if (!this.pending) this.pending = { k: 'p', p: [] };
        this.pending.p.push(x, y);
      }
    };
    const up = () => {
      if (!this.cur) return;
      this.cur = null;
      this.flush();
    };
    cv.addEventListener('pointerdown', down);
    cv.addEventListener('pointermove', move);
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', up);
    cv.addEventListener('pointerleave', up);
    this.flushTimer = setInterval(() => this.flush(), 60);
    this.unbind = () => {
      cv.removeEventListener('pointerdown', down);
      cv.removeEventListener('pointermove', move);
      cv.removeEventListener('pointerup', up);
      cv.removeEventListener('pointercancel', up);
      cv.removeEventListener('pointerleave', up);
      clearInterval(this.flushTimer);
      this.unbind = null;
    };
  }

  flush() {
    const d = this.pending;
    if (!d) return;
    if (d.k === 'p' && !d.p.length) return;
    this.pending = null;
    if (!this.onSend) return;
    // 한 번에 너무 많이 보내지 않도록 나눔
    if (d.p.length > 500) {
      this.onSend({ ...d, p: d.p.slice(0, 500) });
      for (let i = 500; i < d.p.length; i += 500) this.onSend({ k: 'p', p: d.p.slice(i, i + 500) });
    } else this.onSend(d);
  }

  undo() {
    this.flush();
    this.strokes.pop();
    this.redraw();
    this.onSend?.({ k: 'u' });
  }

  clear() {
    this.flush();
    this.strokes = [];
    this.redraw();
    this.onSend?.({ k: 'c' });
  }

  getStrokes() {
    return this.strokes.map((s) => ({ c: s.c, w: s.w, p: s.p }));
  }
}

// 도구 막대 HTML
export function toolbarHTML() {
  return `<div class="dtools">
    <div class="dcolors">${PALETTE.map((c, i) => `<button type="button" class="dcolor ${i === 0 ? 'on' : ''}" data-color="${i}" style="--c:${c}" title="${i === 1 ? '지우개(흰색)' : '색'}">${i === 1 ? '🧽' : ''}</button>`).join('')}</div>
    <div class="dsizes">${WIDTHS.map((w, i) => `<button type="button" class="dsize ${i === 1 ? 'on' : ''}" data-size="${i}"><i style="width:${4 + i * 4}px;height:${4 + i * 4}px"></i></button>`).join('')}
      <button type="button" class="btn sm" data-undo>↶ 되돌리기</button><button type="button" class="btn sm" data-clear>🗑 모두 지우기</button></div>
  </div>`;
}

export function bindToolbar(root, board) {
  root.addEventListener('click', (e) => {
    const c = e.target.closest('[data-color]');
    if (c) {
      board.color = Number(c.dataset.color);
      root.querySelectorAll('.dcolor').forEach((b) => b.classList.toggle('on', b === c));
    }
    const s = e.target.closest('[data-size]');
    if (s) {
      board.width = Number(s.dataset.size);
      root.querySelectorAll('.dsize').forEach((b) => b.classList.toggle('on', b === s));
    }
    if (e.target.closest('[data-undo]')) board.undo();
    if (e.target.closest('[data-clear]')) board.clear();
  });
}
