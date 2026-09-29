// 쿠데타 화면
import { esc, avatar } from './common.js';

const ROLE = {
  duke: { name: '공작', icon: '👑', desc: '세금 +3 · 해외 원조 막기' },
  assassin: { name: '암살자', icon: '🗡️', desc: '동전 3개로 암살' },
  captain: { name: '사령관', icon: '⚓', desc: '2개 갈취 · 갈취 막기' },
  ambassador: { name: '대사', icon: '🕊️', desc: '카드 교환 · 갈취 막기' },
  contessa: { name: '백작부인', icon: '💃', desc: '암살 막기' },
};
const ACT = {
  income: { name: '소득', sub: '+1', claim: null, cost: 0, target: false },
  foreign: { name: '해외 원조', sub: '+2', claim: null, cost: 0, target: false },
  coup: { name: '쿠데타', sub: '-7 · 카드 제거', claim: null, cost: 7, target: true },
  tax: { name: '세금', sub: '+3', claim: 'duke', cost: 0, target: false },
  assassinate: { name: '암살', sub: '-3 · 카드 제거', claim: 'assassin', cost: 3, target: true },
  steal: { name: '갈취', sub: '2개 빼앗기', claim: 'captain', cost: 0, target: true },
  exchange: { name: '교환', sub: '카드 바꾸기', claim: 'ambassador', cost: 0, target: false },
};

function cardHTML(c, { mine = false, can = false, sel = false, attrs = '' } = {}) {
  if (!c.role) return '<div class="cp-card back"><span>?</span></div>';
  const r = ROLE[c.role];
  return `<button type="button" class="cp-card r-${c.role} ${c.dead ? 'dead' : ''} ${can ? 'can' : ''} ${sel ? 'sel' : ''}" ${attrs} ${can ? '' : 'disabled'}>
    <span class="ci">${r.icon}</span><b>${r.name}</b>${mine && !c.dead ? `<small>${r.desc}</small>` : ''}${c.dead ? '<i>탈락</i>' : ''}</button>`;
}

export default function create() {
  let root, api, view;
  let chosen = null; // 대상을 고를 행동
  let keep = [];

  function render() {
    const v = view;
    const me = api.me();
    const myIdx = v.players.findIndex((p) => p.id === me);
    const mine = !v.over && myIdx === v.turn && v.phase === 'action';
    const p = v.pending;
    const name = (id) => esc(api.name(id));
    if (!mine) chosen = null;

    // 상태 안내
    let guide = '';
    if (v.over) guide = '게임이 끝났어요!';
    else if (v.phase === 'action') guide = mine ? (chosen ? `${ACT[chosen].name}할 대상을 골라 주세요` : '내 차례! 행동을 골라 주세요 (가진 척 거짓말도 가능!)') : `${name(v.players[v.turn].id)}님이 행동을 고르고 있어요`;
    else if (p) {
      const A = ACT[p.type];
      const claim = A.claim ? `[${ROLE[A.claim].icon}${ROLE[A.claim].name}] ` : '';
      const what = `${name(p.actor)}님의 ${claim}${A.name}${p.target ? ` → ${name(p.target)}` : ''}`;
      if (v.phase === 'respond') guide = `${what} · 의심하거나 막을 사람?`;
      else if (v.phase === 'block') guide = `${what} · ${name(p.target)}님, 막을까요?`;
      else if (v.phase === 'blockrespond') guide = `${name(p.blocker)}님이 [${ROLE[p.blockRole].icon}${ROLE[p.blockRole].name}](으)로 막으려 해요 · 의심할 사람?`;
      else if (v.phase === 'lose') guide = p.loser === me ? '😱 잃을 카드를 한 장 골라 주세요' : `${name(p.loser)}님이 잃을 카드를 고르고 있어요`;
      else if (v.phase === 'exchange') guide = p.actor === me ? `남길 카드 ${v.exchange?.keep}장을 골라 주세요` : `${name(p.actor)}님이 카드를 교환하고 있어요`;
    }
    const myTurnish = mine || !!v.can || (v.phase === 'lose' && p?.loser === me) || (v.phase === 'exchange' && p?.actor === me);

    const others = v.players.filter((pl) => pl.id !== me).map((pl) => {
      const i = v.players.indexOf(pl);
      const targetable = mine && chosen && ACT[chosen].target && v.alive[pl.id];
      return `<button type="button" class="cp-seat ${i === v.turn && !v.over ? 'turn' : ''} ${v.alive[pl.id] ? '' : 'out'} ${targetable ? 'can' : ''} ${p && (p.target === pl.id) ? 'targeted' : ''}" data-target="${esc(pl.id)}" ${targetable ? '' : 'disabled'}>
        <div class="cp-who">${avatar(pl.id, pl.name, 'sm', api.isBot(pl.id))}<b>${esc(pl.name)}</b><span class="cp-coins">🪙 ${v.coins[pl.id]}</span></div>
        <div class="cp-cards">${v.hands[pl.id].map((c) => cardHTML(c)).join('')}</div>
        ${p && p.passed.includes(pl.id) && ['respond', 'block', 'blockrespond'].includes(v.phase) ? '<span class="cp-pass">통과</span>' : ''}
      </button>`;
    }).join('');

    // 내 영역
    const myHand = v.hands[me];
    let myBox = '';
    if (myHand) {
      const loseMode = v.phase === 'lose' && p?.loser === me;
      myBox = `<div class="cp-mine ${v.alive[me] ? '' : 'out'} ${myIdx === v.turn && !v.over ? 'turn' : ''}">
        <div class="cp-who"><b>내 카드</b><span class="cp-coins big">🪙 ${v.coins[me]}</span></div>
        <div class="cp-cards">${myHand.map((c, i) => cardHTML(c, { mine: true, can: loseMode && !c.dead, attrs: `data-lose="${i}"` })).join('')}</div>
      </div>`;
    }

    // 행동 버튼
    let actions = '';
    if (mine) {
      const coins = v.coins[me];
      const must = coins >= 10;
      actions = `<div class="cp-actions">${Object.entries(ACT).map(([k, A]) => {
        const dis = (must && k !== 'coup') || coins < A.cost;
        const has = A.claim && myHand.some((c) => !c.dead && c.role === A.claim);
        return `<button type="button" class="cp-act ${A.claim ? `r-${A.claim}` : 'basic'} ${chosen === k ? 'sel' : ''} ${A.claim && !has ? 'bluff' : ''}" data-act="${k}" ${dis ? 'disabled' : ''}>
          <b>${A.claim ? ROLE[A.claim].icon + ' ' : ''}${A.name}</b><small>${A.sub}${A.claim && !has ? ' · 블러핑' : ''}</small></button>`;
      }).join('')}</div>${chosen ? '<div class="cp-hint">위에서 대상을 눌러 주세요 · <button class="btn sm ghost" type="button" data-cancel>취소</button></div>' : ''}`;
    }
    if (v.can) {
      actions = `<div class="cp-respond">
        ${v.can.challenge ? '<button class="btn bad lg" type="button" data-challenge>❗ 의심하기</button>' : ''}
        ${v.can.block.map((r) => `<button class="btn primary lg" type="button" data-block="${r}">🛡️ ${ROLE[r].icon}${ROLE[r].name}(으)로 막기</button>`).join('')}
        <button class="btn lg" type="button" data-pass>👌 통과</button></div>`;
    }
    if (v.exchange) {
      actions = `<div class="cp-exchange"><div class="cp-cards">${v.exchange.options.map((r, i) => cardHTML({ role: r, dead: false }, { mine: true, can: true, sel: keep.includes(i), attrs: `data-keep="${i}"` })).join('')}</div>
        <button class="btn primary lg" type="button" data-keepok ${keep.length === v.exchange.keep ? '' : 'disabled'}>이 카드로 할게요 (${keep.length}/${v.exchange.keep})</button></div>`;
    }

    root.innerHTML = `<div class="coup">
      <div class="cp-seats">${others}</div>
      <div class="gbanner ${myTurnish ? 'mine' : ''}">${guide}</div>
      ${actions}
      ${myBox}
      <div class="cp-log">${v.log.slice().reverse().map((t) => `<div>${esc(t)}</div>`).join('')}</div>
      <div class="cp-legend">${Object.entries(ROLE).map(([k, r]) => `<span>${r.icon} <b>${r.name}</b> ${r.desc}</span>`).join('')}<span class="muted">덱: 인물마다 3장씩 · 남은 카드 ${v.deck}장</span></div>
    </div>`;
  }

  return {
    mount(el, a) {
      root = el;
      api = a;
      root.addEventListener('click', (e) => {
        if (!view) return;
        const act = e.target.closest('[data-act]');
        if (act && !act.disabled) {
          const k = act.dataset.act;
          if (ACT[k].target) { chosen = chosen === k ? null : k; render(); }
          else api.send({ type: 'act', action: k });
          return;
        }
        const t = e.target.closest('[data-target]');
        if (t && !t.disabled && chosen) {
          api.send({ type: 'act', action: chosen, target: t.dataset.target });
          chosen = null;
          return;
        }
        if (e.target.closest('[data-cancel]')) { chosen = null; render(); }
        if (e.target.closest('[data-challenge]')) api.send({ type: 'challenge' });
        const b = e.target.closest('[data-block]');
        if (b) api.send({ type: 'block', role: b.dataset.block });
        if (e.target.closest('[data-pass]')) api.send({ type: 'pass' });
        const l = e.target.closest('[data-lose]');
        if (l && !l.disabled) api.send({ type: 'lose', i: Number(l.dataset.lose) });
        const kp = e.target.closest('[data-keep]');
        if (kp) {
          const i = Number(kp.dataset.keep);
          keep = keep.includes(i) ? keep.filter((x) => x !== i) : [...keep, i].slice(-(view.exchange?.keep || 1));
          render();
        }
        if (e.target.closest('[data-keepok]')) api.send({ type: 'keep', idx: keep });
      });
    },
    update(v) {
      if (!v.exchange) keep = [];
      view = v;
      render();
    },
    myTurn(v) {
      if (!v || v.over) return false;
      const me = api.me();
      const p = v.pending;
      return (v.phase === 'action' && v.players[v.turn]?.id === me) || !!v.can || (v.phase === 'lose' && p?.loser === me) || (v.phase === 'exchange' && p?.actor === me);
    },
    unmount() {},
  };
}
