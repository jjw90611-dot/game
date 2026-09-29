// 오목 화면
import { esc, avatar, coarse } from './common.js';
import { openModal } from '../ui.js';

const N = 15;
const C = 40;
const M = 20;
const STARS = [[3, 3], [3, 11], [7, 7], [11, 3], [11, 11]];

export default function create() {
  let root, api, view;
  let preview = -1;

  function myIndex() {
    return view ? view.players.findIndex((p) => p.id === api.me()) : -1;
  }

  function render() {
    const v = view;
    const me = myIndex();
    const turnP = v.players[v.turn];
    const mine = !v.over && me === v.turn;
    const top = v.players.map((p, i) => `
      <div class="om-player ${!v.over && v.turn === i ? 'active' : ''}">
        <span class="om-stone ${i ? 'white' : 'black'}"></span>
        ${avatar(p.id, p.name, 'sm', api.isBot(p.id))}
        <b>${esc(p.name)}</b>${p.id === api.me() ? '<em class="tag me">나</em>' : ''}
      </div>`).join('<span class="om-vs">VS</span>');
    root.querySelector('.om-top').innerHTML = top;
    let msg;
    if (v.over) msg = '게임이 끝났어요';
    else if (mine) msg = `내 차례예요! ${me === 0 ? '흑(●)' : '백(○)'}을 놓아 주세요${coarse() ? ' · 두 번 눌러 확정' : ''}`;
    else msg = `${esc(turnP.name)}님이 생각 중이에요…`;
    const st = root.querySelector('.om-status');
    st.innerHTML = msg;
    st.classList.toggle('mine', mine);

    const win = new Set(v.win || []);
    let stones = '';
    v.board.forEach((c, i) => {
      if (!c) return;
      const x = M + (i % N) * C, y = M + Math.floor(i / N) * C;
      stones += `<circle cx="${x}" cy="${y}" r="17.5" fill="url(#${c === 1 ? 'gb' : 'gw'})" class="${win.has(i) ? 'win' : ''}" ${c === 2 ? 'stroke="#bbb" stroke-width=".8"' : ''}/>`;
    });
    if (v.last >= 0) {
      const x = M + (v.last % N) * C, y = M + Math.floor(v.last / N) * C;
      stones += `<circle cx="${x}" cy="${y}" r="5" fill="#ff4d4f"/>`;
    }
    if (mine && preview >= 0 && !v.board[preview]) {
      const x = M + (preview % N) * C, y = M + Math.floor(preview / N) * C;
      stones += `<circle cx="${x}" cy="${y}" r="17.5" fill="${me === 0 ? '#111' : '#fff'}" opacity=".55" stroke="#ff4d4f" stroke-width="2" stroke-dasharray="4 3"/>`;
    }
    root.querySelector('.om-stones').innerHTML = stones;
    const acts = root.querySelector('.om-actions');
    const canConfirm = mine && preview >= 0 && !v.board[preview];
    acts.innerHTML = `${canConfirm ? '<button class="btn primary lg" type="button" data-confirm>여기에 두기</button>' : ''}
      ${!v.over && me >= 0 ? '<button class="btn sm ghost" type="button" data-resign>🏳️ 기권</button>' : ''}`;
  }

  function boardIndex(e) {
    const svg = root.querySelector('.om-board');
    const r = svg.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * (N * C);
    const y = ((e.clientY - r.top) / r.height) * (N * C);
    const cx = Math.round((x - M) / C), cy = Math.round((y - M) / C);
    if (cx < 0 || cy < 0 || cx >= N || cy >= N) return -1;
    return cy * N + cx;
  }

  function place(i) {
    preview = -1;
    api.send({ type: 'place', i });
  }

  return {
    mount(el, a) {
      root = el;
      api = a;
      const lines = [];
      for (let k = 0; k < N; k++) {
        lines.push(`<line x1="${M}" y1="${M + k * C}" x2="${M + (N - 1) * C}" y2="${M + k * C}"/>`);
        lines.push(`<line x1="${M + k * C}" y1="${M}" x2="${M + k * C}" y2="${M + (N - 1) * C}"/>`);
      }
      root.innerHTML = `<div class="omok">
        <div class="om-top"></div>
        <div class="om-status gbanner"></div>
        <div class="om-wrap"><svg class="om-board" viewBox="0 0 ${N * C} ${N * C}">
          <defs>
            <radialGradient id="gb" cx="35%" cy="30%" r="70%"><stop offset="0" stop-color="#6b6b6b"/><stop offset=".5" stop-color="#222"/><stop offset="1" stop-color="#000"/></radialGradient>
            <radialGradient id="gw" cx="35%" cy="30%" r="75%"><stop offset="0" stop-color="#fff"/><stop offset=".7" stop-color="#f1f1f1"/><stop offset="1" stop-color="#cfcfcf"/></radialGradient>
          </defs>
          <rect x="0" y="0" width="${N * C}" height="${N * C}" rx="10" fill="#e3b566"/>
          <g stroke="#6d4c1d" stroke-width="1.3">${lines.join('')}</g>
          ${STARS.map(([x, y]) => `<circle cx="${M + x * C}" cy="${M + y * C}" r="4.5" fill="#6d4c1d"/>`).join('')}
          <g class="om-stones"></g>
        </svg></div>
        <div class="om-actions"></div>
      </div>`;
      const svg = root.querySelector('.om-board');
      svg.addEventListener('click', (e) => {
        if (!view || view.over) return;
        const me = myIndex();
        if (me !== view.turn) return;
        const i = boardIndex(e);
        if (i < 0 || view.board[i]) return;
        if (coarse() && preview !== i) {
          preview = i;
          render();
          return;
        }
        place(i);
      });
      root.addEventListener('click', (e) => {
        if (e.target.closest('[data-confirm]') && preview >= 0) place(preview);
        if (e.target.closest('[data-resign]')) {
          openModal({ title: '기권할까요?', body: '<p>기권하면 상대가 승리해요.</p>', actions: [{ label: '계속하기' }, { label: '기권', cls: 'bad', onClick: () => api.send({ type: 'resign' }) }] });
        }
      });
    },
    update(v) {
      if (view && v.last !== view.last) preview = -1;
      view = v;
      render();
    },
    myTurn(v) {
      return !!v && !v.over && v.players[v.turn]?.id === api.me();
    },
    unmount() {},
  };
}
