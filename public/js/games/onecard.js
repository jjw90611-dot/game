// 컬러 원카드 화면
import { esc, avatar } from './common.js';
import { openModal } from '../ui.js';
import { DECK, canPlay, COLOR_NAMES } from '../shared/onecard.js';

const LABEL = { skip: '⊘', rev: '⇄', draw2: '+2', wild: 'W', wild4: '+4' };
const SUB = { skip: '건너뛰기', rev: '방향 전환', draw2: '2장 먹이기', wild: '색 바꾸기', wild4: '4장 먹이기' };

export function cardHTML(id, { playable = false, dim = false, big = false, color = null } = {}) {
  const c = DECK[id];
  const label = LABEL[c.v] ?? c.v;
  const cls = c.c === 4 ? 'wild' : `oc${c.c}`;
  return `<button type="button" class="ocard ${cls} ${playable ? 'play' : ''} ${dim ? 'dim' : ''} ${big ? 'big' : ''}" data-card="${id}" ${color != null ? `style="--wc:var(--oc${color})"` : ''}>
    <span class="corner">${label}</span><span class="oval"><b>${label}</b></span>${big && SUB[c.v] ? `<span class="sub">${SUB[c.v]}</span>` : ''}</button>`;
}

export default function create() {
  let root, api, view;

  function chooseColor(id) {
    const close = openModal({
      title: '바꿀 색을 골라 주세요',
      body: `<div class="oc-colors">${COLOR_NAMES.map((n, i) => `<button type="button" class="oc-color oc${i}" data-c="${i}">${n}</button>`).join('')}</div>`,
      onOpen: (el) => {
        el.addEventListener('click', (e) => {
          const b = e.target.closest('[data-c]');
          if (!b) return;
          api.send({ type: 'play', id, color: Number(b.dataset.c) });
          close();
        });
      },
    });
  }

  function render() {
    const v = view;
    const me = api.me();
    const myIdx = v.players.findIndex((p) => p.id === me);
    const mine = !v.over && myIdx === v.turn;
    const cur = v.players[v.turn];
    const others = v.players.map((p, i) => `
      <div class="pchip ${i === v.turn && !v.over ? 'active' : ''} ${p.id === me ? 'me' : ''}">
        ${avatar(p.id, p.name, 'sm', api.isBot(p.id))}
        <div class="pc-main"><div class="pc-name">${esc(p.name)}</div><div class="pc-sub">🂠 ${v.counts[p.id]}장${v.counts[p.id] === 1 ? ' <b class="uno">원카드!</b>' : ''}</div></div>
      </div>`).join('');
    let lastText = '';
    const L = v.last;
    if (L) {
      const who = esc(api.name(L.pid));
      if (L.drew) lastText = `${who}님이 카드를 가져갔어요`;
      else if (L.id != null) {
        const c = DECK[L.id];
        lastText = `${who}님이 ${c.c === 4 ? '' : COLOR_NAMES[c.c] + ' '}${LABEL[c.v] ?? c.v}을(를) 냈어요${c.c === 4 ? ` → ${COLOR_NAMES[L.color]}` : ''}${L.victim ? ` · ${esc(api.name(L.victim))}님 +${L.k}장` : ''}`;
      }
    }
    const hand = (v.hand || []).slice().sort((a, b) => (DECK[a].c - DECK[b].c) || String(DECK[a].v).localeCompare(String(DECK[b].v)));
    const playableOf = (id) => mine && (v.drew == null ? canPlay(id, v.top, v.color) : id === v.drew);
    root.innerHTML = `<div class="onecard">
      <div class="pstrip oc-players">${others}<span class="oc-dir" title="진행 방향">${v.dir === 1 ? '↻' : '↺'}</span></div>
      <div class="gbanner ${mine ? 'mine' : ''}">${v.over ? '게임 끝!' : mine ? (v.drew != null ? '가져온 카드를 낼까요? 아니면 넘기세요' : '내 차례! 낼 카드를 눌러 주세요') : `${esc(cur.name)}님 차례예요`}</div>
      <div class="oc-table">
        <button type="button" class="oc-deck" data-draw ${mine && v.drew == null ? '' : 'disabled'}><span>🂠</span><b>${v.deck}</b><small>${mine && v.drew == null ? '가져오기' : '카드 더미'}</small></button>
        <div class="oc-top">${cardHTML(v.top, { big: true, color: v.color })}</div>
        <div class="oc-cur oc${v.color}"><small>지금 색</small><b>${COLOR_NAMES[v.color]}</b></div>
      </div>
      <div class="oc-last">${lastText}</div>
      ${v.hand ? `<div class="oc-hand-head"><span>내 카드 ${hand.length}장</span>${mine && v.drew != null ? '<button class="btn sm" type="button" data-pass>넘기기</button>' : ''}${mine && v.drew == null ? '<button class="btn sm accent" type="button" data-draw>카드 가져오기</button>' : ''}</div>
      <div class="oc-hand">${hand.map((id) => cardHTML(id, { playable: playableOf(id), dim: mine && !playableOf(id) })).join('')}</div>` : '<p class="muted small" style="text-align:center">관전 중이에요</p>'}
    </div>`;
  }

  return {
    mount(el, a) {
      root = el;
      api = a;
      root.addEventListener('click', (e) => {
        if (!view) return;
        const c = e.target.closest('.oc-hand [data-card]');
        if (c) {
          const id = Number(c.dataset.card);
          if (!c.classList.contains('play')) {
            if (view.players[view.turn]?.id === api.me()) api.toast('낼 수 없는 카드예요.', 'err');
            return;
          }
          if (DECK[id].c === 4) chooseColor(id);
          else api.send({ type: 'play', id });
          return;
        }
        if (e.target.closest('[data-draw]')) api.send({ type: 'draw' });
        if (e.target.closest('[data-pass]')) api.send({ type: 'pass' });
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
