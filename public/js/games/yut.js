// 윷놀이 화면
import { esc, avatar } from './common.js';

const NAMES = { '-1': '뒷도', 1: '도', 2: '개', 3: '걸', 4: '윷', 5: '모' };
const COLORS = ['#e03131', '#1c7ed6', '#2f9e44', '#f08c00'];
const POS = {};
for (let k = 0; k <= 5; k++) {
  POS[`o${k}`] = [540, 540 - 96 * k];
  POS[`o${5 + k}`] = [540 - 96 * k, 60];
  POS[`o${10 + k}`] = [60, 60 + 96 * k];
  if (k < 5) POS[`o${15 + k}`] = [60 + 96 * k, 540];
}
Object.assign(POS, {
  a1: [460, 140], a2: [380, 220], c: [300, 300], a3: [220, 380], a4: [140, 460],
  b1: [140, 140], b2: [220, 220], b3: [380, 380], b4: [460, 460],
});
const BIG = new Set(['o0', 'o5', 'o10', 'o15', 'c']);

function sticksSVG(sticks) {
  return `<div class="yt-sticks">${sticks.map((flat, i) => `<span class="yt-stick ${flat ? 'flat' : 'round'} ${i === 0 ? 'mark' : ''}" style="--r:${(i - 1.5) * 7}deg"></span>`).join('')}</div>`;
}

export default function create() {
  let root, api, view, sel = 0, lastNo = 0;

  function render() {
    const v = view;
    const me = api.me();
    const cur = v.players[v.turn];
    const mine = !v.over && cur.id === me;
    const colorOf = (pid) => COLORS[v.players.findIndex((p) => p.id === pid)];
    if (sel >= v.pend.length) sel = 0;
    const moves = mine && v.moves ? v.moves[sel] || [] : [];
    // 보드
    let g = '';
    const lines = [['o0', 'o5'], ['o5', 'o10'], ['o10', 'o15'], ['o15', 'o0'], ['o5', 'o15'], ['o10', 'o0']];
    g += lines.map(([a, b]) => `<line x1="${POS[a][0]}" y1="${POS[a][1]}" x2="${POS[b][0]}" y2="${POS[b][1]}"/>`).join('');
    for (const [id, [x, y]] of Object.entries(POS)) g += `<circle cx="${x}" cy="${y}" r="${BIG.has(id) ? 26 : 17}" class="yt-node ${BIG.has(id) ? 'big' : ''}"/>`;
    g += `<text x="${POS.o0[0]}" y="${POS.o0[1] + 50}" class="yt-label">출발 · 도착</text>`;
    // 이동 가능 표시
    const movable = new Set(moves.filter((m) => m.from).map((m) => m.from));
    for (const m of moves) {
      if (m.to === 'out') continue;
      const [x, y] = POS[m.to];
      g += `<circle cx="${x}" cy="${y}" r="22" class="yt-dest"/>`;
    }
    // 말
    const stacks = {};
    v.players.forEach((p) => v.pieces[p.id].forEach((pc, i) => {
      if (!pc.node || pc.node === 'out') return;
      (stacks[pc.node] ||= { pid: p.id, n: 0, i });
      stacks[pc.node].n++;
    }));
    for (const [node, s] of Object.entries(stacks)) {
      const [x, y] = POS[node];
      const can = s.pid === me && movable.has(node);
      g += `<g class="yt-piece ${can ? 'can' : ''} ${v.moved?.to === node ? 'moved' : ''}" data-piece="${s.i}" ${can ? '' : 'data-off'} transform="translate(${x} ${y})">
        <circle r="19" fill="${colorOf(s.pid)}" class="yt-tok"/><circle r="12" fill="none" stroke="rgba(255,255,255,.55)" stroke-width="2"/>
        ${s.n > 1 ? `<g transform="translate(15 -15)"><circle r="10" fill="#fff" stroke="${colorOf(s.pid)}" stroke-width="2"/><text y="4" text-anchor="middle" class="yt-cnt" fill="${colorOf(s.pid)}">${s.n}</text></g>` : ''}
      </g>`;
    }
    root.querySelector('.yt-g').innerHTML = g;
    // 참가자
    root.querySelector('.yt-players').innerHTML = v.players.map((p, i) => {
      const ps = v.pieces[p.id];
      const home = ps.filter((x) => !x.node).length;
      const out = ps.filter((x) => x.node === 'out').length;
      return `<div class="yt-p ${!v.over && v.turn === i ? 'active' : ''}" data-pid="${esc(p.id)}" style="--pc:${COLORS[i]}">
        ${avatar(p.id, p.name, 'sm', api.isBot(p.id))}<div class="yt-pn"><b>${esc(p.name)}</b>
        <span class="yt-pieces">${ps.map((x) => `<i class="${x.node === 'out' ? 'out' : x.node ? 'on' : ''}"></i>`).join('')}</span></div>
        <span class="yt-pstat">대기 ${home} · 완주 ${out}</span></div>`;
    }).join('');
    // 상태 · 행동
    const t = v.lastThrow;
    const throwBox = root.querySelector('.yt-throw');
    if (t && t.no !== lastNo) {
      lastNo = t.no;
      throwBox.classList.remove('pop');
      void throwBox.offsetWidth;
      throwBox.classList.add('pop');
      api.beep(t.v >= 4 ? 880 : 520, 90);
    }
    throwBox.innerHTML = t ? `${sticksSVG(t.sticks)}<b class="yt-res ${t.v >= 4 ? 'big' : t.v < 0 ? 'back' : ''}">${NAMES[t.v]}</b>` : sticksSVG([true, false, true, false]);
    const st = root.querySelector('.yt-status');
    st.classList.toggle('mine', mine);
    st.innerHTML = v.over ? esc(v.over.text) : mine ? (v.phase === 'throw' ? '내 차례! 윷을 던지세요' : '쓸 윷을 고르고, 움직일 말(반짝이는 말)을 눌러 주세요') : `${esc(cur.name)}님 차례 · ${esc(v.log || '')}`;
    const homeMove = moves.find((m) => m.from == null);
    root.querySelector('.yt-act').innerHTML = !mine ? `<div class="yt-log">${esc(v.log || '')}</div>` : v.phase === 'throw'
      ? `<button class="btn primary lg yt-go" type="button" data-throw>윷 던지기${v.pend.length ? ` <small>(${v.pend.map((x) => NAMES[x]).join(' · ')})</small>` : ''}</button>`
      : `<div class="yt-pend">${v.pend.map((x, i) => `<button type="button" class="yt-chip ${i === sel ? 'on' : ''} ${(v.moves[i] || []).length ? '' : 'dead'}" data-sel="${i}">${NAMES[x]}</button>`).join('')}</div>
         ${homeMove ? `<button class="btn good" type="button" data-piece="${homeMove.i}">새 말 올리기 (${NAMES[v.pend[sel]]})</button>` : ''}`;
  }

  return {
    mount(el, a) {
      root = el;
      api = a;
      root.innerHTML = `<div class="yut">
        <div class="yt-players"></div>
        <div class="gbanner yt-status"></div>
        <div class="yt-main">
          <div class="yt-boardwrap"><svg class="yt-board" viewBox="0 0 600 600"><rect x="10" y="10" width="580" height="580" rx="28" class="yt-bg"/><g class="yt-g"></g></svg></div>
          <div class="yt-side"><div class="yt-throw"></div><div class="yt-act"></div></div>
        </div>
      </div>`;
      root.addEventListener('click', (e) => {
        if (e.target.closest('[data-throw]')) api.send({ type: 'throw' });
        const s = e.target.closest('[data-sel]');
        if (s) { sel = Number(s.dataset.sel); render(); }
        const p = e.target.closest('[data-piece]');
        if (p && !p.hasAttribute('data-off')) api.send({ type: 'move', r: sel, piece: Number(p.dataset.piece) });
      });
    },
    update(v) { view = v; render(); },
    myTurn: (v) => !!v && !v.over && v.players[v.turn]?.id === api.me(),
    unmount() {},
  };
}
