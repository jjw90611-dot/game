// 계급 전쟁 화면
import { esc, avatar } from './common.js';

const J = 13;
const HUE = (r) => (r === J ? 'jester' : `r${Math.min(12, r)}`);
function titleOf(place, n) {
  if (place === 0) return '왕';
  if (place === n - 1) return '노예';
  if (n >= 4 && place === 1) return '귀족';
  if (n >= 4 && place === n - 2) return '하인';
  return '시민';
}
const cardHTML = (r, cls = '') => `<span class="rw-card ${HUE(r)} ${cls}"><b>${r === J ? '광대' : r}</b>${r === J ? '<i>★</i>' : `<i>${r}</i>`}</span>`;

export default function create() {
  let root, api, view, pick = {};

  function counts(hand) {
    const c = {};
    for (const x of hand) c[x] = (c[x] || 0) + 1;
    return c;
  }

  function render() {
    const v = view;
    const me = api.me();
    const mine = !v.over && v.phase === 'play' && v.turnId === me;
    const n = v.order.length;
    const hand = v.hand || [];
    const c = counts(hand);
    for (const k of Object.keys(pick)) if (!c[k] || pick[k] > c[k]) delete pick[k];
    const cards = Object.entries(pick).flatMap(([r, k]) => Array(k).fill(Number(r)));
    const seats = v.order.map((id, i) => {
      const fin = v.finished.indexOf(id);
      return `<div class="rw-seat ${v.turnId === id && v.phase === 'play' ? 'active' : ''} ${fin >= 0 ? 'done' : ''} ${v.gone[id] ? 'gone' : ''}" data-pid="${esc(id)}">
        <span class="rw-title t${i}">${v.round > 1 || v.phase === 'result' ? titleOf(i, n) : '자리 ' + (i + 1)}</span>
        ${avatar(id, api.name(id), 'sm', api.isBot(id))}<b>${esc(api.name(id))}</b>
        <span class="rw-cnt">${fin >= 0 ? `${fin + 1}등` : `${v.handCount[id] ?? 0}장`}</span>
        <span class="rw-score">${v.scores[id]}점</span>
      </div>`;
    }).join('');
    const trick = v.trick ? `<div class="rw-trick"><div class="rw-tcards">${v.trick.cards.map((r) => cardHTML(r, 'sm')).join('')}</div><small>${esc(api.name(v.trick.by))}님이 ${v.trick.rank === J ? '광대' : v.trick.rank} ${v.trick.count}장</small></div>`
      : '<div class="rw-trick empty"><small>새로 시작하는 차례예요. 아무 숫자나 원하는 만큼 낼 수 있어요</small></div>';
    const tax = v.tax?.length && v.phase === 'play' && !v.trick && v.finished.length === 0 && Object.values(v.handCount).reduce((a, b) => a + b, 0) >= 78
      ? `<div class="rw-tax">${v.tax.map((t) => `<span>${esc(api.name(t.from))} → ${esc(api.name(t.to))}: ${t.give.join(', ')} 바침 / ${t.back.join(', ')} 돌려받음</span>`).join('')}</div>` : '';
    const result = v.phase === 'result' || v.over ? `<div class="rw-result">${(v.results[v.results.length - 1] || []).map((id, i) => `<span class="t${i}"><b>${titleOf(i, n)}</b>${esc(api.name(id))}</span>`).join('')}</div>` : '';
    const groups = Object.keys(c).map(Number).sort((a, b) => a - b);
    root.innerHTML = `<div class="rankwar">
      <div class="rw-head"><span>${v.round} / ${v.rounds} 라운드</span><span>숫자가 작을수록 강해요 · 광대는 아무 숫자로</span></div>
      <div class="rw-seats">${seats}</div>
      ${tax}${result}
      <div class="rw-center">${trick}</div>
      <div class="gbanner ${mine ? 'mine' : ''}">${v.over ? esc(v.over.text) : v.phase === 'result' ? esc(v.log) : mine ? (v.trick ? `${v.trick.count}장, ${v.trick.rank === J ? '광대' : v.trick.rank}보다 작은 숫자를 내거나 패스하세요` : '원하는 숫자 묶음을 골라 내세요') : `${esc(api.name(v.turnId))}님 차례 · ${esc(v.log)}`}</div>
      ${v.hand ? `<div class="rw-hand">${groups.map((r) => `<button type="button" class="rw-group ${pick[r] ? 'on' : ''}" data-r="${r}" ${mine ? '' : 'disabled'}>
          <span class="rw-stack">${Array(Math.min(c[r], 4)).fill(0).map(() => cardHTML(r)).join('')}</span>
          <span class="rw-gc">×${c[r]}${pick[r] ? ` <em>${pick[r]}장 선택</em>` : ''}</span></button>`).join('') || '<div class="muted small">손패를 모두 냈어요!</div>'}</div>` : ''}
      ${mine ? `<div class="rw-actions">
        <button class="btn" type="button" data-clear ${cards.length ? '' : 'disabled'}>선택 취소</button>
        ${v.trick ? '<button class="btn lg" type="button" data-pass>패스</button>' : ''}
        <button class="btn primary lg" type="button" data-play ${cards.length ? '' : 'disabled'}>${cards.length ? `${cards.length}장 내기` : '카드를 골라 주세요'}</button>
      </div>` : ''}
    </div>`;
  }

  return {
    mount(el, a) {
      root = el;
      api = a;
      root.addEventListener('click', (e) => {
        const g = e.target.closest('[data-r]');
        if (g && !g.disabled) {
          const r = Number(g.dataset.r);
          const have = (view.hand || []).filter((x) => x === r).length;
          const need = view.trick?.count;
          if (need && r !== J) pick[r] = pick[r] ? 0 : Math.min(have, need);
          else pick[r] = ((pick[r] || 0) + 1) % (have + 1);
          if (!pick[r]) delete pick[r];
          render();
        }
        if (e.target.closest('[data-clear]')) { pick = {}; render(); }
        if (e.target.closest('[data-pass]')) { pick = {}; api.send({ type: 'pass' }); }
        if (e.target.closest('[data-play]')) {
          const cards = Object.entries(pick).flatMap(([r, k]) => Array(k).fill(Number(r)));
          pick = {};
          api.send({ type: 'play', cards });
        }
      });
    },
    update(v) { view = v; render(); },
    myTurn: (v) => !!v && !v.over && v.phase === 'play' && v.turnId === api.me(),
    unmount() {},
  };
}
