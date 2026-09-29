// 하룻밤 늑대인간 화면
import { esc, avatar } from './common.js';

const ROLE = {
  werewolf: { name: '늑대인간', icon: '🐺', team: 'wolf', desc: '밤에 동료 늑대인간을 확인해요. 혼자라면 가운데 카드 1장을 볼 수 있어요.' },
  seer: { name: '예언자', icon: '🔮', team: 'village', desc: '다른 사람 1명의 카드, 또는 가운데 카드 2장을 볼 수 있어요.' },
  robber: { name: '강도', icon: '🦹', team: 'village', desc: '다른 사람과 카드를 바꾸고, 새로 받은 카드를 확인해요.' },
  troublemaker: { name: '말썽쟁이', icon: '🃏', team: 'village', desc: '나를 뺀 두 사람의 카드를 몰래 바꿔요. (보지는 못해요)' },
  drunk: { name: '주정뱅이', icon: '🍺', team: 'village', desc: '가운데 카드 1장과 내 카드를 바꿔요. 무엇이 됐는지 몰라요!' },
  insomniac: { name: '불면증 환자', icon: '😵', team: 'village', desc: '밤이 끝날 때 내 카드를 다시 확인해요.' },
  villager: { name: '마을 주민', icon: '🧑‍🌾', team: 'village', desc: '특별한 능력은 없어요. 추리로 늑대인간을 찾으세요!' },
  hunter: { name: '사냥꾼', icon: '🏹', team: 'village', desc: '내가 처형되면, 내가 투표한 사람도 함께 죽어요.' },
  tanner: { name: '무두장이', icon: '🧑‍🔧', team: 'tanner', desc: '삶이 지긋지긋해요. 내가 처형되면 나 혼자 승리!' },
};

export default function create() {
  let root, api, view;
  let picks = [];
  let mode = null; // seer: 'player' | 'center'

  function nightUI(v) {
    const role = v.myRole;
    const me = api.me();
    if (v.myAct) return `<div class="ww-done">✅ 행동을 마쳤어요. 아침을 기다려요… (${v.acted.length}/${v.players.length})</div>`;
    const others = v.players.filter((p) => p.id !== me);
    const playerBtns = (multi) => `<div class="ww-pick">${others.map((p) => `<button type="button" class="ww-pbtn ${picks.includes(p.id) ? 'on' : ''}" data-pp="${esc(p.id)}" data-multi="${multi ? 1 : 0}">${avatar(p.id, p.name, 'sm')}${esc(p.name)}</button>`).join('')}</div>`;
    const centerBtns = (max) => `<div class="ww-centers">${[0, 1, 2].map((k) => `<button type="button" class="ww-cbtn ${picks.includes(k) ? 'on' : ''}" data-cc="${k}" data-max="${max}">🂠<small>${k + 1}번</small></button>`).join('')}</div>`;
    switch (role) {
      case 'werewolf':
        if (v.lone) return `<p>혼자인 늑대인간! 가운데 카드 1장을 엿볼 수 있어요.</p>${centerBtns(1)}<div class="ww-acts"><button class="btn primary" type="button" data-go ${picks.length === 1 ? '' : 'disabled'}>엿보기</button><button class="btn ghost" type="button" data-sleep>안 볼래요</button></div>`;
        return '<p>동료 늑대인간을 확인할게요. (아침에 알려 드려요)</p><div class="ww-acts"><button class="btn primary" type="button" data-sleep>확인</button></div>';
      case 'seer':
        if (mode === 'center') return `<p>가운데 카드 2장을 골라 주세요.</p>${centerBtns(2)}<div class="ww-acts"><button class="btn primary" type="button" data-go ${picks.length === 2 ? '' : 'disabled'}>보기</button><button class="btn ghost" type="button" data-mode="player">사람 카드 보기로</button></div>`;
        return `<p>카드를 볼 사람을 고르거나, 가운데 카드 2장을 볼 수 있어요.</p>${playerBtns(false)}<div class="ww-acts"><button class="btn primary" type="button" data-go ${picks.length === 1 ? '' : 'disabled'}>보기</button><button class="btn" type="button" data-mode="center">가운데 2장 보기</button></div>`;
      case 'robber':
        return `<p>카드를 훔칠 사람을 골라 주세요.</p>${playerBtns(false)}<div class="ww-acts"><button class="btn primary" type="button" data-go ${picks.length === 1 ? '' : 'disabled'}>훔치기</button><button class="btn ghost" type="button" data-sleep>안 훔칠래요</button></div>`;
      case 'troublemaker':
        return `<p>카드를 서로 바꿀 두 사람을 골라 주세요.</p>${playerBtns(true)}<div class="ww-acts"><button class="btn primary" type="button" data-go ${picks.length === 2 ? '' : 'disabled'}>바꾸기</button><button class="btn ghost" type="button" data-sleep>안 바꿀래요</button></div>`;
      case 'drunk':
        return `<p>내 카드와 바꿀 가운데 카드를 골라 주세요.</p>${centerBtns(1)}<div class="ww-acts"><button class="btn primary" type="button" data-go ${picks.length === 1 ? '' : 'disabled'}>바꾸기</button></div>`;
      default:
        return `<p>${role === 'insomniac' ? '밤이 끝나면 내 카드를 다시 확인해요.' : '밤에는 할 일이 없어요. 푹 주무세요!'}</p><div class="ww-acts"><button class="btn primary" type="button" data-sleep>😴 잠들기</button></div>`;
    }
  }

  function render() {
    const v = view;
    const me = api.me();
    const role = v.myRole ? ROLE[v.myRole] : null;
    root.classList.toggle('night', v.phase === 'night' && !v.over);
    const deck = `<div class="ww-deck">${v.deckRoles.map((r) => `<span title="${ROLE[r].desc}">${ROLE[r].icon} ${ROLE[r].name}</span>`).join('')}</div>`;
    const card = role ? `<div class="ww-role ${role.team}"><div class="ww-ricon">${role.icon}</div><div><div class="ww-rname">처음 받은 카드: <b>${role.name}</b></div><div class="ww-rdesc">${role.desc}</div></div></div>`
      : '<div class="ww-role"><div class="ww-ricon">👀</div><div><div class="ww-rname">관전 중</div></div></div>';

    let body = '';
    if (v.over && v.reveal) {
      const R = v.reveal;
      body = `<div class="ww-reveal">${v.players.map((p) => `<div class="ww-rv ${R.dead.includes(p.id) ? 'dead' : ''} ${v.over.winners.includes(p.id) ? 'win' : ''}">
        ${avatar(p.id, p.name, 'sm')}<b>${esc(p.name)}</b>
        <span>${ROLE[R.initial[p.id]].icon}${ROLE[R.initial[p.id]].name} → <b>${ROLE[R.cards[p.id]].icon}${ROLE[R.cards[p.id]].name}</b></span>
        <span class="muted small">🗳️${R.count?.[p.id] || 0} · ${R.votes[p.id] ? `${esc(api.name(R.votes[p.id]))}에게 투표` : ''}</span>
        ${R.dead.includes(p.id) ? '<span class="ww-dead">☠️ 처형</span>' : ''}${v.over.winners.includes(p.id) ? '<span class="ww-win">🏆</span>' : ''}</div>`).join('')}
        <div class="ww-center">가운데 카드: ${R.center.map((r) => `${ROLE[r].icon} ${ROLE[r].name}`).join(' · ')}</div></div>`;
    } else if (v.phase === 'night') {
      body = v.isPlayer ? `<div class="ww-night">${nightUI(v)}</div>` : '<div class="gbanner">🌙 밤이에요…</div>';
    } else {
      const info = v.info.length ? `<div class="ww-info"><b>🌙 밤에 알게 된 것</b>${v.info.map((t) => `<div>${esc(t)}</div>`).join('')}</div>` : '';
      let act = '';
      if (v.phase === 'day') {
        const skipped = v.skip.includes(me);
        act = `<div class="gbanner">☀️ 토론 시간! 누가 늑대인간일까요? (거짓말도 전략이에요)</div>
          ${v.isPlayer ? `<div class="ww-acts"><button class="btn ${skipped ? '' : 'primary'}" type="button" data-skip ${skipped ? 'disabled' : ''}>${skipped ? '투표 준비 완료' : '바로 투표하기'} (${v.skip.length}/${v.players.length})</button></div>` : ''}`;
      } else if (v.phase === 'vote') {
        act = `<div class="gbanner mine">🗳️ 처형할 사람을 골라 주세요 (${v.voted.length}/${v.players.length}명 투표)</div>
          ${v.isPlayer ? `<div class="ww-pick">${v.players.filter((p) => p.id !== me).map((p) => `<button type="button" class="ww-pbtn ${v.myVote === p.id ? 'on' : ''}" data-vote="${esc(p.id)}">${avatar(p.id, p.name, 'sm')}${esc(p.name)}</button>`).join('')}</div>` : ''}`;
      }
      body = `${info}${act}`;
    }
    root.innerHTML = `<div class="werewolf">
      <div class="ww-phase"><span>${v.over ? '🏁 결과' : v.phase === 'night' ? '🌙 밤' : v.phase === 'day' ? '☀️ 낮 토론' : '🗳️ 투표'}</span></div>
      ${card}${body}${deck}
    </div>`;
  }

  return {
    mount(el, a) {
      root = el;
      api = a;
      root.addEventListener('click', (e) => {
        if (!view) return;
        const pp = e.target.closest('[data-pp]');
        if (pp) {
          const id = pp.dataset.pp;
          if (pp.dataset.multi === '1') picks = picks.includes(id) ? picks.filter((x) => x !== id) : [...picks, id].slice(-2);
          else picks = [id];
          render();
          return;
        }
        const cc = e.target.closest('[data-cc]');
        if (cc) {
          const k = Number(cc.dataset.cc), max = Number(cc.dataset.max);
          picks = picks.includes(k) ? picks.filter((x) => x !== k) : [...picks.filter((x) => typeof x === 'number'), k].slice(-max);
          render();
          return;
        }
        const md = e.target.closest('[data-mode]');
        if (md) { mode = md.dataset.mode; picks = []; render(); return; }
        if (e.target.closest('[data-sleep]')) api.send({ type: 'night' });
        if (e.target.closest('[data-go]')) {
          const r = view.myRole;
          if (r === 'werewolf' || r === 'drunk') api.send({ type: 'night', center: picks[0] });
          else if (r === 'seer') api.send(mode === 'center' ? { type: 'night', centers: picks } : { type: 'night', target: picks[0] });
          else if (r === 'robber') api.send({ type: 'night', target: picks[0] });
          else if (r === 'troublemaker') api.send({ type: 'night', targets: picks });
        }
        if (e.target.closest('[data-skip]')) api.send({ type: 'skip' });
        const vb = e.target.closest('[data-vote]');
        if (vb) api.send({ type: 'vote', target: vb.dataset.vote });
      });
    },
    update(v) {
      if (view && view.phase !== v.phase) { picks = []; mode = null; }
      view = v;
      render();
    },
    myTurn(v) {
      if (!v || v.over || !v.isPlayer) return false;
      if (v.phase === 'night') return !v.myAct;
      if (v.phase === 'vote') return !v.myVote;
      return false;
    },
    unmount() {
      root?.classList.remove('night');
    },
  };
}
