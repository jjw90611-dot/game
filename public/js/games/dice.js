// 라이어 다이스 화면
import { esc, avatar } from './common.js';

const PIPS = { 1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]], 4: [[-1, -1], [1, -1], [-1, 1], [1, 1]], 5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]], 6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]] };
export function die(n, cls = '') {
  if (n == null) return `<span class="ld-die hidden ${cls}"></span>`;
  return `<svg class="ld-die ${cls}" viewBox="-12 -12 24 24"><rect x="-11" y="-11" width="22" height="22" rx="5" class="f"/>${PIPS[n].map(([x, y]) => `<circle cx="${x * 5.5}" cy="${y * 5.5}" r="2.2" class="${n === 1 ? 'one' : ''}"/>`).join('')}</svg>`;
}

export default function create() {
  let root, api, view, q = 1, f = 2, bidKey = '';

  function minBid(v) {
    if (!v.bid) return { q: 1, f: v.wild ? 2 : 1 };
    return v.bid.f < 6 ? { q: v.bid.q, f: v.bid.f + 1 } : { q: v.bid.q + 1, f: v.wild ? 2 : 1 };
  }
  const valid = (v) => q >= 1 && q <= v.total && f >= (v.wild ? 2 : 1) && f <= 6 && (!v.bid || q > v.bid.q || (q === v.bid.q && f > v.bid.f));

  function render() {
    const v = view;
    const me = api.me();
    const cur = v.players[v.turn];
    const mine = !v.over && v.phase === 'bid' && cur?.id === me;
    const key = `${v.round}:${v.history.length}`;
    if (mine && key !== bidKey) { bidKey = key; ({ q, f } = minBid(v)); }
    const show = v.phase === 'show' ? v.show : null;
    const rows = v.players.map((p, i) => {
      const n = v.count[p.id];
      const dice = show ? show.dice[p.id] : v.dice[p.id];
      const hit = (x) => show && (x === show.bid.f || (v.wild && x === 1 && show.bid.f !== 1));
      return `<div class="ld-row ${!v.over && v.phase === 'bid' && v.turn === i ? 'active' : ''} ${n <= 0 ? 'out' : ''} ${show?.loser === p.id ? 'lost' : ''}" data-pid="${esc(p.id)}">
        ${avatar(p.id, p.name, 'sm', api.isBot(p.id))}<b class="ld-name">${esc(p.name)}${p.id === me ? ' <em class="tag me">나</em>' : ''}</b>
        <div class="ld-cup">${n <= 0 ? '<span class="muted small">탈락</span>' : (dice || Array(n).fill(null)).map((x) => die(x, hit(x) ? 'hit' : '')).join('')}</div>
        ${v.bid?.by === p.id && !show ? `<span class="ld-said">${v.bid.q}개 × ${die(v.bid.f, 'sm')}</span>` : ''}
      </div>`;
    }).join('');
    const hist = v.history.map((h) => `<span>${esc(api.name(h.by))} <b>${h.q}×${h.f}</b></span>`).join('<i>→</i>');
    root.innerHTML = `<div class="ldice">
      <div class="ld-head"><span>${v.round}라운드</span><span>전체 주사위 ${v.total}개</span>${v.wild ? `<span>${die(1, 'sm')} = 만능</span>` : ''}</div>
      <div class="ld-bidnow">${v.bid ? `<small>현재 입찰</small><div><b>${v.bid.q}</b>개 이상의 ${die(v.bid.f, 'lg')}</div><small>${esc(api.name(v.bid.by))}님</small>` : '<small>아직 입찰이 없어요</small><div>첫 입찰을 기다리는 중</div>'}</div>
      ${show ? `<div class="gbanner ${show.truth ? '' : 'mine'}">실제 ${die(show.bid.f, 'sm')} 개수: <b>${show.real}개</b> → ${show.truth ? '입찰이 맞았어요!' : '거짓말이었어요!'} ${esc(api.name(show.loser))}님 주사위 -1</div>` : ''}
      <div class="ld-rows">${rows}</div>
      ${hist ? `<div class="ld-hist">${hist}</div>` : ''}
      <div class="gbanner ${mine ? 'mine' : ''}">${v.over ? esc(v.over.text) : show ? '다음 라운드를 준비하고 있어요…' : mine ? '내 차례! 더 높게 입찰하거나 "라이어!"를 외치세요' : `${esc(cur?.name || '')}님이 고민 중… · ${esc(v.log || '')}`}</div>
      ${mine ? `<div class="ld-ctrl">
        <div class="ld-pick"><button type="button" class="btn" data-q="-1">−</button><b class="ld-q">${q}개</b><button type="button" class="btn" data-q="1">+</button></div>
        <div class="ld-faces">${[1, 2, 3, 4, 5, 6].filter((x) => x >= (v.wild ? 2 : 1)).map((x) => `<button type="button" class="ld-face ${x === f ? 'on' : ''}" data-f="${x}">${die(x)}</button>`).join('')}</div>
        <div class="ld-btns"><button class="btn primary lg" type="button" data-bid ${valid(v) ? '' : 'disabled'}>${q}개 × ${f} 입찰</button>${v.bid ? '<button class="btn accent lg" type="button" data-call>라이어!</button>' : ''}</div>
      </div>` : ''}
    </div>`;
  }

  return {
    mount(el, a) {
      root = el;
      api = a;
      root.addEventListener('click', (e) => {
        const b = e.target.closest('[data-q]');
        if (b) { q = Math.max(1, Math.min(view.total, q + Number(b.dataset.q))); render(); }
        const fb = e.target.closest('[data-f]');
        if (fb) { f = Number(fb.dataset.f); render(); }
        if (e.target.closest('[data-bid]')) api.send({ type: 'bid', q, f });
        if (e.target.closest('[data-call]')) api.send({ type: 'call' });
      });
    },
    update(v) { view = v; render(); },
    myTurn: (v) => !!v && !v.over && v.phase === 'bid' && v.players[v.turn]?.id === api.me(),
    unmount() {},
  };
}
