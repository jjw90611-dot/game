// 보석 상인 화면
import { esc, avatar } from './common.js';
import { CARDS, NOBLES, payment } from '../shared/gems.js';

const TIER_NAME = ['Ⅰ', 'Ⅱ', 'Ⅲ'];
const gemDot = (c, n, cls = '') => `<span class="gm-dot g${c} ${cls}">${n}</span>`;

function cardHTML(id, { buyable = false, sel = false, attrs = '' } = {}) {
  if (id == null) return '<div class="gm-card empty"></div>';
  const c = CARDS[id];
  return `<button type="button" class="gm-card t${c.tier} ${buyable ? 'buyable' : ''} ${sel ? 'sel' : ''}" ${attrs}>
    <div class="gm-ctop"><b>${c.pts || ''}</b><span class="gm-gem g${c.color}"></span></div>
    <div class="gm-cost">${c.cost.map((n, k) => (n ? gemDot(k, n) : '')).join('')}</div>
  </button>`;
}

function nobleHTML(id) {
  const n = NOBLES[id];
  return `<div class="gm-noble"><b>3</b><div class="gm-nreq">${n.req.map((r, k) => (r ? `<span class="gm-sq g${k}">${r}</span>` : '')).join('')}</div></div>`;
}

export default function create() {
  let root, api, view;
  let pickTok = []; // 가져올 보석 선택
  let sel = null; // 선택한 카드 { tier, slot } | { res } | { deck: tier }
  let discard = [];

  const isMine = () => view && !view.over && view.players[view.turn]?.id === api.me();

  function takeValid() {
    if (!pickTok.length) return false;
    if (pickTok.length === 2 && pickTok[0] === pickTok[1]) return view.bank[pickTok[0]] >= 4;
    return new Set(pickTok).size === pickTok.length && pickTok.length <= 3;
  }

  function render() {
    const v = view;
    const me = api.me();
    const mine = isMine();
    const my = v.p[me];
    const cur = v.players[v.turn];

    const strip = v.players.map((p, i) => {
      const x = v.p[p.id];
      return `<div class="gm-player ${i === v.turn && !v.over ? 'active' : ''} ${p.id === me ? 'me' : ''}">
        <div class="gm-ph">${avatar(p.id, p.name, 'sm', api.isBot(p.id))}<b class="gm-pname">${esc(p.name)}</b><span class="gm-pts">${x.pts}점</span></div>
        <div class="gm-prow">${[0, 1, 2, 3, 4, 5].map((k) => (x.tok[k] ? gemDot(k, x.tok[k], 'tok') : '')).join('') || '<span class="muted small">보석 없음</span>'}</div>
        <div class="gm-prow">${[0, 1, 2, 3, 4].map((k) => (x.bonus[k] ? `<span class="gm-sq g${k}">${x.bonus[k]}</span>` : '')).join('')}${x.res.length ? `<span class="gm-res">예약 ${x.res.length}</span>` : ''}${x.nobles.length ? `<span class="gm-res">👑${x.nobles.length}</span>` : ''}</div>
      </div>`;
    }).join('');

    let guide;
    if (v.over) guide = '게임이 끝났어요!';
    else if (mine && v.phase === 'discard') guide = `보석이 10개를 넘었어요. <b>${v.discard}개</b>를 골라 반납해 주세요`;
    else if (mine) guide = '내 차례! 보석을 고르거나(최대 3개), 카드를 눌러 구매·예약하세요';
    else guide = `${esc(cur.name)}님 차례예요${v.final ? ' · 마지막 바퀴!' : ''}`;

    const rows = [2, 1, 0].map((t) => `<div class="gm-row">
      <button type="button" class="gm-deck t${t} ${sel?.deck === t ? 'sel' : ''}" data-deck="${t}" ${mine && v.phase === 'main' && v.decks[t] ? '' : 'disabled'}><b>${TIER_NAME[t]}</b><small>${v.decks[t]}장</small></button>
      ${v.board[t].map((id, slot) => cardHTML(id, {
        buyable: mine && my && id != null && !!payment(my, id),
        sel: sel && sel.tier === t && sel.slot === slot,
        attrs: id != null && mine && v.phase === 'main' ? `data-card="${t}:${slot}"` : 'disabled',
      })).join('')}
    </div>`).join('');

    const bank = [0, 1, 2, 3, 4, 5].map((k) => {
      const n = pickTok.filter((x) => x === k).length;
      return `<button type="button" class="gm-token g${k} ${n ? 'picked' : ''}" data-tok="${k}" ${mine && v.phase === 'main' && k < 5 && v.bank[k] > 0 ? '' : 'disabled'}>
        <b>${v.bank[k]}</b>${n ? `<i>+${n}</i>` : ''}</button>`;
    }).join('');

    // 선택한 카드 행동
    let sheet = '';
    if (mine && sel && v.phase === 'main') {
      const id = sel.deck != null ? null : sel.res != null ? my.res[sel.res]?.id : v.board[sel.tier][sel.slot];
      const can = id != null && !!payment(my, id);
      const pay = id != null ? payment(my, id) : null;
      sheet = `<div class="gm-sheet">
        ${id != null ? cardHTML(id, {}) : `<div class="gm-deck t${sel.deck}"><b>${TIER_NAME[sel.deck]}</b><small>맨 위 카드</small></div>`}
        <div class="gm-sheet-body">
          ${id != null ? `<div class="small">${can ? `지불: ${pay.map((n, k) => (n ? gemDot(k, n) : '')).join('') || '무료!'}` : '보석이 부족해요'}</div>` : '<div class="small">카드 더미 맨 위 카드를 몰래 예약해요</div>'}
          <div class="gm-sheet-btns">
            ${id != null ? `<button class="btn primary" type="button" data-buy ${can ? '' : 'disabled'}>💎 구매</button>` : ''}
            ${sel.res == null ? `<button class="btn" type="button" data-reserve ${my.res.length < 3 ? '' : 'disabled'}>📌 예약${v.bank[5] > 0 ? ' (+황금)' : ''}</button>` : ''}
            <button class="btn ghost" type="button" data-cancel>취소</button>
          </div>
        </div></div>`;
    }

    let mineBox = '';
    if (my) {
      const discardPick = mine && v.phase === 'discard';
      mineBox = `<div class="gm-mine">
        <div class="gm-mine-head"><b>내 보석</b> <span class="muted small">${my.tok.reduce((a, b) => a + b, 0)}/10개</span></div>
        <div class="gm-mytok">${[0, 1, 2, 3, 4, 5].map((k) => `<button type="button" class="gm-token sm g${k} ${discard.filter((x) => x === k).length ? 'picked' : ''}" data-back="${k}" ${discardPick && my.tok[k] > discard.filter((x) => x === k).length ? '' : 'disabled'}>
          <b>${my.tok[k]}</b>${discard.filter((x) => x === k).length ? `<i>-${discard.filter((x) => x === k).length}</i>` : ''}</button>`).join('')}
          <span class="gm-bonus">보너스 ${[0, 1, 2, 3, 4].map((k) => `<span class="gm-sq g${k}">${my.bonus[k]}</span>`).join('')}</span></div>
        ${my.res.length ? `<div class="gm-mine-head"><b>예약한 카드</b></div><div class="gm-resrow">${my.res.map((r, i) => cardHTML(r.id, { buyable: mine && !!payment(my, r.id), sel: sel?.res === i, attrs: mine && v.phase === 'main' ? `data-res="${i}"` : 'disabled' })).join('')}</div>` : ''}
        ${discardPick ? `<div class="gm-acts"><button class="btn primary" type="button" data-discard ${discard.length === v.discard ? '' : 'disabled'}>반납하기 (${discard.length}/${v.discard})</button></div>` : ''}
      </div>`;
    }

    root.innerHTML = `<div class="gems">
      <div class="gm-players">${strip}</div>
      <div class="gbanner ${mine ? 'mine' : ''}">${guide}</div>
      <div class="gm-board">
        <div class="gm-nobles">${v.nobles.map(nobleHTML).join('')}</div>
        ${rows}
        <div class="gm-bank">${bank}</div>
        ${mine && v.phase === 'main' ? `<div class="gm-acts">
          <button class="btn primary" type="button" data-take ${takeValid() ? '' : 'disabled'}>보석 가져오기 ${pickTok.length ? `(${pickTok.length})` : ''}</button>
          ${pickTok.length ? '<button class="btn ghost" type="button" data-clear>선택 취소</button>' : ''}
          <span class="muted small">서로 다른 3개, 또는 같은 색 2개(4개 이상 남았을 때)</span></div>` : ''}
      </div>
      ${sheet}
      ${mineBox}
    </div>`;
  }

  return {
    mount(el, a) {
      root = el;
      api = a;
      root.addEventListener('click', (e) => {
        if (!view) return;
        const t = e.target.closest('[data-tok]');
        if (t && !t.disabled) {
          const k = Number(t.dataset.tok);
          sel = null;
          const n = pickTok.filter((x) => x === k).length;
          if (n === 2) pickTok = pickTok.filter((x) => x !== k);
          else if (n === 1) {
            if (pickTok.length === 1 && view.bank[k] >= 4) pickTok = [k, k];
            else pickTok = pickTok.filter((x) => x !== k);
          } else if (pickTok.length < 3 && !(pickTok.length === 2 && pickTok[0] === pickTok[1])) pickTok = [...pickTok, k];
          render();
          return;
        }
        const c = e.target.closest('[data-card]');
        if (c && !c.disabled) {
          const [tier, slot] = c.dataset.card.split(':').map(Number);
          sel = { tier, slot };
          pickTok = [];
          render();
          return;
        }
        const r = e.target.closest('[data-res]');
        if (r && !r.disabled) {
          sel = { res: Number(r.dataset.res) };
          pickTok = [];
          render();
          return;
        }
        const d = e.target.closest('[data-deck]');
        if (d && !d.disabled) {
          sel = { deck: Number(d.dataset.deck) };
          pickTok = [];
          render();
          return;
        }
        const b = e.target.closest('[data-back]');
        if (b && !b.disabled) {
          if (discard.length < view.discard) discard.push(Number(b.dataset.back));
          render();
          return;
        }
        if (e.target.closest('[data-take]')) api.send({ type: 'take', colors: pickTok });
        if (e.target.closest('[data-clear]')) { pickTok = []; render(); }
        if (e.target.closest('[data-cancel]')) { sel = null; render(); }
        if (e.target.closest('[data-buy]') && sel) api.send(sel.res != null ? { type: 'buy', res: sel.res } : { type: 'buy', tier: sel.tier, slot: sel.slot });
        if (e.target.closest('[data-reserve]') && sel) api.send(sel.deck != null ? { type: 'reserve', tier: sel.deck, slot: -1 } : { type: 'reserve', tier: sel.tier, slot: sel.slot });
        if (e.target.closest('[data-discard]')) api.send({ type: 'discard', colors: discard });
      });
    },
    update(v) {
      const changed = !view || view.turn !== v.turn || view.phase !== v.phase || JSON.stringify(view.bank) !== JSON.stringify(v.bank);
      if (changed) { pickTok = []; sel = null; discard = []; }
      view = v;
      render();
    },
    myTurn: (v) => !!v && !v.over && v.players[v.turn]?.id === api.me(),
    unmount() {},
  };
}
