// 과일 종치기 화면
import { esc, avatar } from './common.js';

const FRUIT = ['🍓', '🍌', '🍋', '🍇'];
const FRUIT_NAME = ['딸기', '바나나', '라임', '포도'];
const POS = { 1: [[50, 50]], 2: [[30, 30], [70, 70]], 3: [[25, 25], [50, 50], [75, 75]], 4: [[28, 28], [72, 28], [28, 72], [72, 72]], 5: [[28, 25], [72, 25], [50, 50], [28, 75], [72, 75]] };

function cardHTML(c) {
  if (!c) return '<div class="fb-card empty"></div>';
  return `<div class="fb-card f${c.f}" title="${FRUIT_NAME[c.f]} ${c.n}개">${POS[c.n].map(([x, y]) => `<span style="left:${x}%;top:${y}%">${FRUIT[c.f]}</span>`).join('')}</div>`;
}

export default function create() {
  let root, api, view;
  let lastRing = 0;
  let keyHandler = null;

  function render() {
    const v = view;
    const me = api.me();
    const myIdx = v.players.findIndex((p) => p.id === me);
    const inGame = myIdx >= 0 && !v.out[me] && !v.over;
    const myTurn = inGame && v.turn === myIdx && v.phase === 'play';
    const seats = v.players.map((p, i) => `
      <div class="fb-seat ${i === v.turn && v.phase === 'play' && !v.over ? 'turn' : ''} ${v.out[p.id] ? 'out' : ''} ${p.id === me ? 'me' : ''}">
        <div class="fb-who">${avatar(p.id, p.name, 'sm', api.isBot(p.id))}<b>${esc(p.name)}</b></div>
        <div class="fb-pile">${cardHTML(v.tops[p.id])}${v.piles[p.id] > 1 ? `<span class="fb-n">${v.piles[p.id]}</span>` : ''}</div>
        <div class="fb-deck"><span class="fb-back"></span>${v.decks[p.id]}장${v.out[p.id] ? ' · 탈락' : ''}</div>
      </div>`).join('');
    const r = v.ring;
    let ringMsg = '';
    if (r && v.phase === 'pause') ringMsg = r.ok ? `🎉 ${esc(api.name(r.pid))}님 정답! 카드 ${r.n}장 획득` : `😵 ${esc(api.name(r.pid))}님 땡! 카드를 ${r.n}장 나눠줬어요`;
    root.innerHTML = `<div class="fruitbell">
      <div class="gbanner ${myTurn ? 'mine' : ''}">${v.over ? '게임 끝!' : ringMsg || (myTurn ? '내 차례! 카드를 뒤집으세요 (Enter)' : v.phase === 'pause' ? '준비…' : `${esc(v.players[v.turn].name)}님이 뒤집을 차례 · 같은 과일 5개면 종!`)}</div>
      <div class="fb-table">${seats}</div>
      <div class="fb-controls">
        <button type="button" class="fb-bell ${r && v.phase === 'pause' ? (r.ok ? 'ok' : 'no') : ''}" data-ring ${inGame ? '' : 'disabled'}><span>🔔</span><b>종 치기!</b><small>스페이스바</small></button>
        ${myIdx >= 0 ? `<button type="button" class="btn primary lg fb-flip" data-flip ${myTurn ? '' : 'disabled'}>🃏 뒤집기</button>` : ''}
      </div>
    </div>`;
  }

  return {
    mount(el, a) {
      root = el;
      api = a;
      root.addEventListener('pointerdown', (e) => {
        if (!view) return;
        const b = e.target.closest('[data-ring]');
        if (b && !b.disabled) {
          e.preventDefault();
          api.send({ type: 'ring' });
          b.classList.add('hit');
        }
        const f = e.target.closest('[data-flip]');
        if (f && !f.disabled) {
          e.preventDefault();
          api.send({ type: 'flip' });
        }
      });
      keyHandler = (e) => {
        if (!view || e.target.closest?.('input, textarea')) return;
        if (e.code === 'Space') {
          e.preventDefault();
          if (!view.over && !view.out[api.me()]) api.send({ type: 'ring' });
        } else if (e.key === 'Enter') {
          const myIdx = view.players.findIndex((p) => p.id === api.me());
          if (view.turn === myIdx && view.phase === 'play') api.send({ type: 'flip' });
        }
      };
      window.addEventListener('keydown', keyHandler);
    },
    update(v) {
      if (v.ring && v.ring.seq !== lastRing) {
        lastRing = v.ring.seq;
        api.beep(v.ring.ok ? 1180 : 220, v.ring.ok ? 200 : 260, v.ring.ok ? 'triangle' : 'sawtooth');
      }
      view = v;
      render();
    },
    myTurn(v) {
      if (!v || v.over || v.phase !== 'play') return false;
      return v.players[v.turn]?.id === api.me();
    },
    unmount() {
      window.removeEventListener('keydown', keyHandler);
    },
  };
}
