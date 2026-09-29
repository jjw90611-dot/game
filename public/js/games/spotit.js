// 같은 그림 찾기 화면
import { esc, avatar } from './common.js';

export const SYMBOLS = [
  '🍎', '🍌', '🍇', '🍓', '🍉', '🍒', '🥕', '🌽', '🍄', '🧀', '🍩', '🍦', '🍕', '🍔', '🥨',
  '🐶', '🐱', '🐭', '🐰', '🦊', '🐻', '🐼', '🐸', '🐵', '🐧', '🐤', '🦋', '🐢', '🐙', '🐳',
  '⭐', '🌙', '☀️', '⚡', '❄️', '🔥', '💧', '🌈', '🌵', '🌻', '🍀', '🌷',
  '🚗', '🚀', '⚓', '🎈', '🎁', '🔑', '🔔', '⏰', '💡', '✏️', '🎸', '⚽', '🎲', '👑', '❤️',
];

function hash(n) {
  let x = (n + 1) * 2654435761;
  x ^= x >>> 13;
  return (x >>> 0) / 4294967296;
}

// 카드 안 그림 배치: 가운데 1개 + 둘레 7개, 크기와 기울기는 카드마다 다르게
function cardSVG(cardId, syms, cls, clickable) {
  const pos = [[0, 0]];
  const rot0 = hash(cardId * 7) * Math.PI * 2;
  for (let k = 0; k < 7; k++) {
    const a = rot0 + (k / 7) * Math.PI * 2;
    pos.push([Math.cos(a) * 64, Math.sin(a) * 64]);
  }
  const order = syms.map((s, i) => [s, hash(cardId * 31 + i)]).sort((a, b) => a[1] - b[1]).map((x) => x[0]);
  return `<svg class="sp-card ${cls}" viewBox="-110 -110 220 220">
    <circle r="104" class="sp-face"/>
    ${order.map((s, i) => {
      const [x, y] = pos[i];
      const size = (i === 0 ? 46 : 30) + hash(cardId * 13 + s) * 16;
      const rot = Math.round(hash(cardId * 17 + s) * 360);
      return `<g class="sp-sym" ${clickable ? `data-sym="${s}"` : ''} transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${rot})">
        <circle r="${(size * 0.62).toFixed(1)}" class="sp-hit"/><text font-size="${size.toFixed(1)}" text-anchor="middle" dominant-baseline="central">${SYMBOLS[s]}</text></g>`;
    }).join('')}
  </svg>`;
}

export default function create() {
  let root, api, view, lastWon = 0, lastMiss = 0, frzTimer = null;

  function render() {
    const v = view;
    const me = api.me();
    const isPlayer = v.players.some((p) => p.id === me);
    const frozen = (v.freeze[me] || 0) > api.now();
    const rank = [...v.players].sort((a, b) => v.scores[b.id] - v.scores[a.id]);
    const flash = v.won && v.won.n !== lastWon ? v.won : null;
    if (flash) {
      lastWon = v.won.n;
      if (v.won.pid === me) api.beep(880, 110);
    }
    if (v.miss && v.miss.pid === me && v.miss.n !== lastMiss) {
      lastMiss = v.miss.n;
      api.beep(200, 160);
    }
    root.innerHTML = `<div class="spotit ${frozen ? 'frozen' : ''}">
      <div class="sp-score">${rank.map((p) => `<span class="${p.id === me ? 'me' : ''}" data-pid="${esc(p.id)}">${avatar(p.id, p.name, 'sm', api.isBot(p.id))}<b>${esc(p.name)}</b><em>${v.scores[p.id]}</em></span>`).join('')}</div>
      <div class="gbanner ${isPlayer && !v.over ? 'mine' : ''}">${v.over ? esc(v.over.text) : isPlayer ? '내 카드와 가운데 카드에 똑같이 있는 그림을 찾아 누르세요!' : '관전 중이에요'} <small>(남은 카드 ${v.left}장)</small></div>
      <div class="sp-table">
        <div class="sp-col"><small>가운데 카드</small>${cardSVG(v.center, v.centerSyms, 'center', isPlayer && !v.over)}</div>
        ${isPlayer ? `<div class="sp-col"><small>내 카드</small>${cardSVG(v.hands[me], v.handSyms[me], 'mine', !v.over)}</div>` : ''}
      </div>
      ${flash ? `<div class="sp-flash ${flash.pid === me ? 'me' : ''}"><span>${SYMBOLS[flash.sym]}</span>${esc(api.name(flash.pid))}님이 찾았어요!</div>` : ''}
      ${frozen ? '<div class="sp-freeze">틀렸어요! 잠깐 쉬어요…</div>' : ''}
    </div>`;
    clearTimeout(frzTimer);
    if (frozen) frzTimer = setTimeout(render, Math.max(50, v.freeze[me] - api.now() + 30));
  }

  return {
    mount(el, a) {
      root = el;
      api = a;
      root.addEventListener('pointerdown', (e) => {
        const s = e.target.closest('[data-sym]');
        if (!s || !view || view.over) return;
        if ((view.freeze[api.me()] || 0) > api.now()) return;
        s.classList.add('tap');
        api.send({ type: 'match', sym: Number(s.dataset.sym), center: view.center });
      });
    },
    update(v) { view = v; render(); },
    myTurn: () => false,
    unmount() { clearTimeout(frzTimer); },
  };
}
