// 숫자 암호 화면
import { esc, avatar } from './common.js';

function tileHTML(t, { sel = false, can = false, idx = null, pid = null, mine = false } = {}) {
  return `<button type="button" class="nc-tile ${t.c ? 'white' : 'black'} ${t.open ? 'open' : ''} ${sel ? 'sel' : ''} ${can ? 'can' : ''} ${mine && !t.open ? 'secret' : ''}"
    ${idx != null ? `data-idx="${idx}" data-pid="${esc(pid)}"` : ''} ${can ? '' : 'disabled'}>
    <b>${t.n == null ? '?' : t.n}</b>${t.open ? '<i>공개</i>' : mine ? '<i>비밀</i>' : ''}</button>`;
}

export default function create() {
  let root, api, view;
  let target = null; // { pid, idx }

  function render() {
    const v = view;
    const me = api.me();
    const myIdx = v.players.findIndex((p) => p.id === me);
    const mine = !v.over && myIdx === v.turn;
    const cur = v.players[v.turn];
    const canGuess = mine && (v.phase === 'guess' || v.phase === 'continue');
    if (!canGuess) target = null;

    let guide;
    if (v.over) guide = '게임 끝!';
    else if (mine && v.phase === 'guess') guide = '🔍 상대의 숨겨진 타일을 누르고 숫자를 맞혀 보세요';
    else if (mine && v.phase === 'continue') guide = '🎯 정답! 계속 맞히거나 멈출 수 있어요 (멈추면 뽑은 타일은 비밀로 남아요)';
    else if (mine && v.phase === 'penalty') guide = '😢 틀렸어요. 공개할 내 타일을 하나 골라 주세요';
    else guide = `${esc(cur.name)}님이 추리하고 있어요…`;

    let lastText = '';
    const g = v.lastGuess;
    if (g) lastText = `${esc(api.name(g.by))}님: ${esc(api.name(g.target))}님의 ${g.index + 1}번째 타일은 ${g.num}? → ${g.ok ? '<b class="ok">정답!</b>' : '<b class="no">틀림</b>'}`;

    const rows = v.players.filter((p) => p.id !== me).map((p) => {
      const tiles = v.hands[p.id].map((t, i) => tileHTML(t, {
        sel: target && target.pid === p.id && target.idx === i,
        can: canGuess && !t.open && !v.out[p.id], idx: i, pid: p.id,
      })).join('');
      return `<div class="nc-row ${v.players[v.turn].id === p.id && !v.over ? 'turn' : ''} ${v.out[p.id] ? 'out' : ''}">
        <div class="nc-who">${avatar(p.id, p.name, 'sm', api.isBot(p.id))}<b>${esc(p.name)}</b>${v.out[p.id] ? '<span class="tag off">탈락</span>' : ''}</div>
        <div class="nc-tiles">${tiles}</div></div>`;
    }).join('');

    let picker = '';
    if (canGuess && target) {
      const t = v.hands[target.pid][target.idx];
      picker = `<div class="nc-picker"><div class="nc-picker-title">${esc(api.name(target.pid))}님의 ${t.c ? '흰색' : '검은색'} 타일 숫자는?</div>
        <div class="nc-nums">${Array.from({ length: 12 }, (_, n) => `<button type="button" class="nc-num ${t.c ? 'white' : 'black'}" data-num="${n}">${n}</button>`).join('')}</div></div>`;
    }

    const myHand = v.hands[me];
    const penalty = mine && v.phase === 'penalty';
    root.innerHTML = `<div class="numbercode">
      <div class="gbanner ${mine ? 'mine' : ''}">${guide}</div>
      ${lastText ? `<div class="nc-last">${lastText}</div>` : ''}
      <div class="nc-rows">${rows}</div>
      ${picker}
      ${mine && v.phase === 'continue' ? '<div class="nc-acts"><button class="btn" type="button" data-stop>✋ 멈추기</button><span class="muted small">또는 다른 타일을 눌러 계속 추리</span></div>' : ''}
      ${myHand ? `<div class="nc-mine ${v.out[me] ? 'out' : ''}">
        <div class="nc-who"><b>내 타일</b>${v.out[me] ? '<span class="tag off">탈락</span>' : ''}<span class="muted small">남은 타일 더미 ${v.pool}개</span></div>
        <div class="nc-tiles">${myHand.map((t, i) => (penalty && !t.open ? tileHTML(t, { can: true, idx: i, pid: me, mine: true }) : tileHTML(t, { mine: true }))).join('')}
        ${v.drawn && mine ? `<span class="nc-drawn-wrap"><small>뽑은 타일</small>${tileHTML({ ...v.drawn, open: false }, { mine: true })}</span>` : ''}</div>
      </div>` : ''}
      ${!mine && v.drawn ? `<div class="nc-last muted">${esc(cur.name)}님이 ${v.drawn.c ? '흰색' : '검은색'} 타일을 뽑았어요</div>` : ''}
    </div>`;
  }

  return {
    mount(el, a) {
      root = el;
      api = a;
      root.addEventListener('click', (e) => {
        if (!view) return;
        const me = api.me();
        const t = e.target.closest('.nc-tile[data-idx]');
        if (t && !t.disabled) {
          const pid = t.dataset.pid, idx = Number(t.dataset.idx);
          if (pid === me) api.send({ type: 'reveal', index: idx });
          else {
            target = { pid, idx };
            render();
            root.querySelector('.nc-picker')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
          }
          return;
        }
        const n = e.target.closest('[data-num]');
        if (n && target) {
          api.send({ type: 'guess', target: target.pid, index: target.idx, num: Number(n.dataset.num) });
          target = null;
        }
        if (e.target.closest('[data-stop]')) api.send({ type: 'stop' });
      });
    },
    update(v) {
      view = v;
      if (target && (v.hands[target.pid]?.[target.idx]?.open ?? true)) target = null;
      render();
    },
    myTurn: (v) => !!v && !v.over && v.players[v.turn]?.id === api.me(),
    unmount() {},
  };
}
