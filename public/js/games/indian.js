// 인디언 포커 화면
import { esc, avatar } from './common.js';

function card(n, cls = '') {
  if (n == null) return `<div class="ip-card back ${cls}"><span>?</span></div>`;
  return `<div class="ip-card ${cls} ${n >= 8 ? 'hi' : n <= 3 ? 'lo' : ''}"><b>${n}</b><i>${n}</i></div>`;
}

export default function create() {
  let root, api, view;

  function render() {
    const v = view;
    const me = api.me();
    const cur = v.players[v.turn];
    const mine = !v.over && v.phase === 'bet' && cur?.id === me;
    const show = v.phase === 'show' ? v.show : null;
    const seats = v.players.map((p, i) => {
      const inRound = v.cards[p.id] !== undefined;
      const folded = v.folded[p.id];
      const c = show ? show.cards[p.id] : v.cards[p.id];
      const won = show?.winners.includes(p.id);
      const isMe = p.id === me;
      return `<div class="ip-seat ${!v.over && v.phase === 'bet' && v.turn === i ? 'active' : ''} ${folded ? 'folded' : ''} ${won ? 'won' : ''} ${!inRound ? 'out' : ''} ${isMe ? 'me' : ''}" data-pid="${esc(p.id)}">
        <div class="ip-cardslot">${inRound ? card(c, isMe && !show ? 'mine' : '') : '<div class="ip-card empty"></div>'}${isMe && !show && inRound ? '<em class="ip-forehead">내 이마 위 카드</em>' : ''}</div>
        <div class="ip-who">${avatar(p.id, p.name, 'sm', api.isBot(p.id))}<b>${esc(p.name)}</b>${isMe ? '<em class="tag me">나</em>' : ''}</div>
        <div class="ip-stat"><span class="ip-chips">${v.chips[p.id]}</span>${inRound && v.bets[p.id] ? `<span class="ip-bet">베팅 ${v.bets[p.id]}</span>` : ''}${folded ? '<span class="ip-fold">다이</span>' : ''}${won ? `<span class="ip-win">+${show.gains[p.id]}</span>` : ''}${!inRound && v.chips[p.id] <= 0 ? '<span class="ip-fold">파산</span>' : ''}</div>
      </div>`;
    }).join('');
    const raises = [];
    const room = v.cap - v.cur;
    for (const n of [1, 2, 3, 5]) if (n <= room) raises.push(n);
    if (room > 0 && !raises.includes(room)) raises.push(room);
    root.innerHTML = `<div class="indian">
      <div class="ip-head"><span>${v.round}${v.maxRounds ? ` / ${v.maxRounds}` : ''} 라운드</span><span>남은 카드 ${v.deckLeft}장</span>${v.penalty ? '<span>10 다이 벌칙 ON</span>' : ''}</div>
      <div class="ip-table">
        <div class="ip-seats">${seats}</div>
        <div class="ip-pot"><span>판돈</span><b>${show ? show.pot : v.pot}</b><small>${v.cur ? `최고 베팅 ${v.cur} · 최대 ${v.cap}` : `이번 판 최대 ${v.cap}개`}</small></div>
      </div>
      <div class="gbanner ${mine ? 'mine' : ''}">${v.over ? esc(v.over.text) : show ? esc(v.log) : mine ? `내 차례예요! ${v.toCall ? `${v.toCall}개를 더 내면 콜할 수 있어요` : '체크하거나 칩을 올려 보세요'}` : `${esc(cur?.name || '')}님이 고민 중… · ${esc(v.log)}`}</div>
      ${mine ? `<div class="ip-actions">
        <button class="btn bad lg" type="button" data-a="fold">다이</button>
        <button class="btn primary lg" type="button" data-a="call">${v.toCall ? `콜 (${v.toCall})` : '체크'}</button>
        ${raises.length ? `<div class="ip-raise"><span>레이즈</span>${raises.map((n) => `<button class="btn accent" type="button" data-raise="${n}">+${n}</button>`).join('')}</div>` : ''}
      </div>` : ''}
    </div>`;
  }

  return {
    mount(el, a) {
      root = el;
      api = a;
      root.addEventListener('click', (e) => {
        const b = e.target.closest('[data-a]');
        if (b) api.send({ type: b.dataset.a });
        const r = e.target.closest('[data-raise]');
        if (r) api.send({ type: 'raise', amt: Number(r.dataset.raise) });
      });
    },
    update(v) { view = v; render(); },
    myTurn: (v) => !!v && !v.over && v.phase === 'bet' && v.players[v.turn]?.id === api.me(),
    unmount() {},
  };
}
