// 사목 화면
import { esc, avatar } from './common.js';
import { openModal } from '../ui.js';

const W = 7, H = 6, C = 80;

export default function create() {
  let root, api, view, prev = null, hover = -1;

  function render() {
    const v = view;
    const me = api.me();
    const myIdx = v.players.findIndex((p) => p.id === me);
    const mine = !v.over && myIdx === v.turn;
    root.querySelector('.c4-top').innerHTML = v.players.map((p, i) => `
      <div class="om-player ${!v.over && v.turn === i ? 'active' : ''}"><span class="c4-disc sm ${i ? 'y' : 'r'}"></span>${avatar(p.id, p.name, 'sm', api.isBot(p.id))}<b>${esc(p.name)}</b></div>`).join('<span class="om-vs">VS</span>');
    const st = root.querySelector('.c4-status');
    st.innerHTML = v.over ? '게임이 끝났어요' : mine ? `내 차례예요! ${myIdx ? '노랑' : '빨강'} 돌을 떨어뜨릴 줄을 눌러 주세요` : `${esc(v.players[v.turn].name)}님이 생각 중이에요…`;
    st.classList.toggle('mine', mine);
    const win = new Set(v.win || []);
    let g = '';
    v.board.forEach((c, i) => {
      if (!c) return;
      const x = (i % W) * C + C / 2, y = Math.floor(i / W) * C + C / 2;
      const drop = prev && !prev[i] && i === v.last;
      g += `<circle cx="${x}" cy="${y}" r="31" class="c4d ${c === 1 ? 'r' : 'y'} ${win.has(i) ? 'win' : ''} ${drop ? 'drop' : ''}" style="--dy:${-(y + C)}px"/>`;
    });
    root.querySelector('.c4-discs').innerHTML = g;
    root.querySelector('.c4-hover').innerHTML = mine && hover >= 0 ? `<circle cx="${hover * C + C / 2}" cy="${-C / 2 + 4}" r="28" class="c4d ghost ${myIdx ? 'y' : 'r'}"/>` : '';
    root.querySelector('.c4-actions').innerHTML = !v.over && myIdx >= 0 ? '<button class="btn sm ghost" type="button" data-resign>기권</button>' : '';
    prev = v.board.slice();
  }

  return {
    mount(el, a) {
      root = el;
      api = a;
      let holes = '';
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) holes += `<circle cx="${x * C + C / 2}" cy="${y * C + C / 2}" r="31"/>`;
      root.innerHTML = `<div class="omok c4">
        <div class="om-top c4-top"></div>
        <div class="om-status gbanner c4-status"></div>
        <div class="c4-wrap"><svg class="c4-board" viewBox="0 ${-C} ${W * C} ${(H + 1) * C}">
          <defs><mask id="c4m"><rect x="0" y="0" width="${W * C}" height="${H * C}" fill="#fff"/><g fill="#000">${holes}</g></mask></defs>
          <g class="c4-hover"></g>
          <rect x="0" y="0" width="${W * C}" height="${H * C}" fill="#dfe6f3"/>
          <g class="c4-discs"></g>
          <rect x="0" y="0" width="${W * C}" height="${H * C}" rx="14" fill="#2456d6" mask="url(#c4m)"/>
          ${Array.from({ length: W }, (_, x) => `<rect x="${x * C}" y="${-C}" width="${C}" height="${(H + 1) * C}" fill="transparent" data-col="${x}" class="c4-col"/>`).join('')}
        </svg></div>
        <div class="om-actions c4-actions"></div>
      </div>`;
      const svg = root.querySelector('.c4-board');
      svg.addEventListener('pointermove', (e) => {
        const c = e.target.closest('[data-col]');
        const h = c ? Number(c.dataset.col) : -1;
        if (h !== hover) { hover = h; if (view) render(); }
      });
      svg.addEventListener('pointerleave', () => { hover = -1; if (view) render(); });
      root.addEventListener('click', (e) => {
        const c = e.target.closest('[data-col]');
        if (c) api.send({ type: 'drop', col: Number(c.dataset.col) });
        if (e.target.closest('[data-resign]')) {
          openModal({ title: '기권할까요?', body: '<p>기권하면 상대가 승리해요.</p>', actions: [{ label: '계속하기' }, { label: '기권', cls: 'bad', onClick: () => api.send({ type: 'resign' }) }] });
        }
      });
    },
    update(v) { view = v; render(); },
    myTurn: (v) => !!v && !v.over && v.players[v.turn]?.id === api.me(),
    unmount() {},
  };
}
