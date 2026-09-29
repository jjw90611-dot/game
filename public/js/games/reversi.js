// 리버시 화면
import { esc, avatar } from './common.js';
import { openModal } from '../ui.js';

const N = 8;
const C = 60;

export default function create() {
  let root, api, view;
  let prevBoard = null;

  function render() {
    const v = view;
    const me = api.me();
    const myIdx = v.players.findIndex((p) => p.id === me);
    const mine = !v.over && myIdx === v.turn;
    root.querySelector('.rv-top').innerHTML = v.players.map((p, i) => `
      <div class="om-player ${!v.over && v.turn === i ? 'active' : ''}">
        <span class="om-stone ${i ? 'white' : 'black'}"></span>${avatar(p.id, p.name, 'sm', api.isBot(p.id))}
        <b>${esc(p.name)}</b><span class="rv-count">${v.count[i]}</span></div>`).join('<span class="om-vs">VS</span>');
    const st = root.querySelector('.rv-status');
    st.innerHTML = v.over ? '게임이 끝났어요' : mine ? `내 차례예요! ${myIdx === 0 ? '흑' : '백'} 돌을 둘 곳을 눌러 주세요 (점으로 표시)` : `${esc(v.players[v.turn].name)}님이 생각 중이에요…`;
    st.classList.toggle('mine', mine);
    const flipped = new Set(v.flipped || []);
    let g = '';
    v.board.forEach((c, i) => {
      const x = (i % N) * C + C / 2, y = Math.floor(i / N) * C + C / 2;
      if (c) {
        const anim = prevBoard && prevBoard[i] && prevBoard[i] !== c && flipped.has(i);
        g += `<circle cx="${x}" cy="${y}" r="24" fill="url(#${c === 1 ? 'rb' : 'rw'})" class="${anim ? 'flip' : ''}" style="transform-origin:${x}px ${y}px"/>`;
      } else if (mine && v.valid.includes(i)) {
        g += `<circle cx="${x}" cy="${y}" r="7" class="rv-hint"/><rect x="${x - C / 2}" y="${y - C / 2}" width="${C}" height="${C}" fill="transparent" data-i="${i}" class="rv-cell"/>`;
      }
    });
    if (v.last >= 0) {
      const x = (v.last % N) * C + C / 2, y = Math.floor(v.last / N) * C + C / 2;
      g += `<circle cx="${x}" cy="${y}" r="5" fill="#ff4d4f"/>`;
    }
    root.querySelector('.rv-discs').innerHTML = g;
    root.querySelector('.rv-actions').innerHTML = !v.over && myIdx >= 0 ? '<button class="btn sm ghost" type="button" data-resign>🏳️ 기권</button>' : '';
    prevBoard = v.board.slice();
  }

  return {
    mount(el, a) {
      root = el;
      api = a;
      const lines = [];
      for (let k = 1; k < N; k++) {
        lines.push(`<line x1="0" y1="${k * C}" x2="${N * C}" y2="${k * C}"/>`, `<line x1="${k * C}" y1="0" x2="${k * C}" y2="${N * C}"/>`);
      }
      root.innerHTML = `<div class="omok reversi">
        <div class="om-top rv-top"></div>
        <div class="om-status gbanner rv-status"></div>
        <div class="om-wrap"><svg class="om-board rv-board" viewBox="0 0 ${N * C} ${N * C}">
          <defs>
            <radialGradient id="rb" cx="35%" cy="30%" r="70%"><stop offset="0" stop-color="#666"/><stop offset=".6" stop-color="#1b1b1b"/><stop offset="1" stop-color="#000"/></radialGradient>
            <radialGradient id="rw" cx="35%" cy="30%" r="75%"><stop offset="0" stop-color="#fff"/><stop offset=".7" stop-color="#eee"/><stop offset="1" stop-color="#c9c9c9"/></radialGradient>
          </defs>
          <rect width="${N * C}" height="${N * C}" rx="8" fill="#2f9e44"/>
          <g stroke="#1e7a31" stroke-width="2">${lines.join('')}</g>
          ${[[2, 2], [6, 2], [2, 6], [6, 6]].map(([x, y]) => `<circle cx="${x * C}" cy="${y * C}" r="5" fill="#1e7a31"/>`).join('')}
          <g class="rv-discs"></g>
        </svg></div>
        <div class="om-actions rv-actions"></div>
      </div>`;
      root.addEventListener('click', (e) => {
        const cell = e.target.closest('[data-i]');
        if (cell) api.send({ type: 'place', i: Number(cell.dataset.i) });
        if (e.target.closest('[data-resign]')) {
          openModal({ title: '기권할까요?', body: '<p>기권하면 상대가 승리해요.</p>', actions: [{ label: '계속하기' }, { label: '기권', cls: 'bad', onClick: () => api.send({ type: 'resign' }) }] });
        }
      });
    },
    update(v) {
      view = v;
      render();
    },
    myTurn: (v) => !!v && !v.over && v.players[v.turn]?.id === api.me(),
    unmount() {},
  };
}
