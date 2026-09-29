// 마피아 화면
import { esc, avatar } from './common.js';

const ROLE = {
  mafia: { name: '마피아', icon: '🔪', desc: '밤마다 동료와 함께 시민 한 명을 지목해요. 정체를 숨기세요!', cls: 'mafia' },
  police: { name: '경찰', icon: '🚓', desc: '밤마다 한 명을 조사해 마피아인지 알 수 있어요.', cls: 'police' },
  doctor: { name: '의사', icon: '💉', desc: '밤마다 한 명을 골라 마피아의 공격에서 살릴 수 있어요.', cls: 'doctor' },
  citizen: { name: '시민', icon: '🙂', desc: '토론과 투표로 마피아를 찾아내세요!', cls: 'citizen' },
};
const PHASE = { night: '🌙 밤', day: '☀️ 낮 토론', vote: '🗳️ 투표', defense: '⚖️ 최후의 변론', confirm: '🔨 찬반 투표' };

export default function create() {
  let root, api, view;
  const this_myTurn = (v) => {
    if (!v || v.over || !v.role || !v.alive[api.me()]) return false;
    if (v.phase === 'night') return v.role !== 'citizen' && v.myNight == null;
    if (v.phase === 'vote') return v.myVote == null;
    if (v.phase === 'confirm') return v.accused !== api.me() && v.myConfirm == null;
    return false;
  };

  function render() {
    const v = view;
    const me = api.me();
    const alive = v.alive[me];
    const role = v.role ? ROLE[v.role] : null;
    const night = v.phase === 'night' && !v.over;
    root.classList.toggle('night', night);

    let roleCard = '';
    if (role) {
      roleCard = `<div class="mf-role ${role.cls} ${alive ? '' : 'dead'}">
        <div class="mf-ricon">${role.icon}</div>
        <div><div class="mf-rname">나는 <b>${role.name}</b>${alive ? '' : ' (사망)'}</div><div class="mf-rdesc">${alive ? role.desc : '죽은 사람끼리만 대화할 수 있어요. 모든 역할이 보여요.'}</div></div>
      </div>`;
    } else roleCard = '<div class="mf-role watch"><div class="mf-ricon">👀</div><div><div class="mf-rname">관전 중</div><div class="mf-rdesc">관전자는 죽은 사람들과 따로 대화해요.</div></div></div>';

    // 안내
    let guide = '';
    if (!v.over) {
      if (v.phase === 'night') {
        if (alive && v.role === 'mafia') guide = v.myNight ? `🔪 ${esc(api.name(v.myNight))}님을 지목했어요. (바꿀 수 있어요)` : '🔪 제거할 사람을 골라 주세요. 마피아끼리 채팅할 수 있어요.';
        else if (alive && v.role === 'doctor') guide = v.myNight ? `💉 ${esc(api.name(v.myNight))}님을 치료해요.` : '💉 오늘 밤 살릴 사람을 골라 주세요.';
        else if (alive && v.role === 'police') guide = v.myNight ? '🚓 조사를 마쳤어요. 결과를 확인하세요.' : '🚓 조사할 사람을 골라 주세요.';
        else guide = '🌙 밤이 되었어요… 아침을 기다려 주세요.';
      } else if (v.phase === 'day') guide = '☀️ 토론 시간! 채팅으로 마피아를 찾아보세요.';
      else if (v.phase === 'vote') guide = alive ? (v.myVote != null ? '투표했어요. 다른 사람을 눌러 바꿀 수 있어요.' : '🗳️ 마피아로 의심되는 사람을 눌러 투표하세요.') : '🗳️ 살아 있는 사람들이 투표 중이에요.';
      else if (v.phase === 'defense') guide = `⚖️ ${esc(api.name(v.accused))}님의 최후의 변론 시간이에요.${v.accused === me ? ' 채팅으로 해명하세요!' : ''}`;
      else if (v.phase === 'confirm') guide = v.accused === me ? '다른 사람들이 찬반 투표 중이에요…' : `🔨 ${esc(api.name(v.accused))}님을 처형할까요?`;
    }

    const canTarget = (pid) => {
      if (v.over || !alive || !v.alive[pid]) return false;
      if (v.phase === 'night') {
        if (v.role === 'mafia') return v.roles[pid] !== 'mafia';
        if (v.role === 'doctor') return v.myNight == null;
        if (v.role === 'police') return v.myNight == null && pid !== me;
        return false;
      }
      if (v.phase === 'vote') return pid !== me;
      return false;
    };

    const grid = v.players.map((p) => {
      const dead = !v.alive[p.id];
      const r = v.roles[p.id];
      const picks = v.mafiaPicks ? Object.entries(v.mafiaPicks).filter(([, t]) => t === p.id).length : 0;
      const votes = v.voteCounts?.[p.id] || 0;
      const police = v.policeLog?.filter((x) => x.target === p.id).pop();
      const selected = (v.phase === 'night' && v.myNight === p.id) || (v.phase === 'vote' && v.myVote === p.id);
      return `<button type="button" class="mf-p ${dead ? 'dead' : ''} ${selected ? 'sel' : ''} ${v.accused === p.id && (v.phase === 'defense' || v.phase === 'confirm') ? 'accused' : ''} ${canTarget(p.id) ? 'can' : ''}" data-pid="${esc(p.id)}" ${canTarget(p.id) ? '' : 'disabled'}>
        <div class="mf-av">${avatar(p.id, p.name, 'lg')}${dead ? '<span class="mf-x">✝</span>' : ''}</div>
        <div class="mf-name">${esc(p.name)}${p.id === me ? ' (나)' : ''}</div>
        ${r ? `<div class="mf-tag ${ROLE[r].cls}">${ROLE[r].icon} ${ROLE[r].name}</div>` : ''}
        ${police ? `<div class="mf-tag ${police.mafia ? 'mafia' : 'citizen'}">🚓 ${police.mafia ? '마피아!' : '시민'}</div>` : ''}
        ${picks ? `<span class="mf-count red">🔪${picks}</span>` : ''}
        ${votes ? `<span class="mf-count">🗳️${votes}</span>` : ''}
      </button>`;
    }).join('');

    let confirm = '';
    if (!v.over && v.phase === 'confirm' && alive && v.accused !== me) {
      confirm = `<div class="mf-confirm">
        <button class="btn bad lg ${v.myConfirm === true ? 'on' : ''}" type="button" data-yes="1">👍 찬성 (처형)</button>
        <button class="btn lg ${v.myConfirm === false ? 'on' : ''}" type="button" data-yes="0">👎 반대 (살림)</button></div>`;
    }
    let extra = '';
    if (!v.over && v.phase === 'day' && alive) {
      const skipped = v.skip.includes(me);
      const aliveN = v.players.filter((p) => v.alive[p.id]).length;
      extra = `<div class="mf-acts"><button class="btn ${skipped ? '' : 'primary'}" type="button" data-skip ${skipped ? 'disabled' : ''}>${skipped ? '투표 준비 완료' : '바로 투표하기'} (${v.skip.length}/${aliveN})</button></div>`;
    }
    if (!v.over && v.phase === 'vote' && alive) {
      extra = `<div class="mf-acts"><button class="btn sm ${v.myVote === '' ? 'primary' : ''}" type="button" data-abstain>기권 (아무도 뽑지 않기)</button></div>`;
    }
    const last = v.lastNight && v.phase !== 'night' ? `<div class="mf-news">${v.lastNight.killed ? `어젯밤 <b>${esc(api.name(v.lastNight.killed))}</b>님이 마피아에게 당했어요.` : v.lastNight.saved ? '어젯밤 의사가 누군가를 살렸어요! 💉' : '어젯밤은 조용히 지나갔어요.'}</div>` : '';

    root.innerHTML = `<div class="mafia">
      <div class="mf-phase"><span>${v.day}일차 · ${PHASE[v.phase] || ''}</span></div>
      ${roleCard}
      ${last}
      ${guide ? `<div class="gbanner ${this_myTurn(v) ? 'mine' : ''}">${guide}</div>` : ''}
      ${confirm}
      <div class="mf-grid">${grid}</div>
      ${extra}
    </div>`;
  }

  return {
    mount(el, a) {
      root = el;
      api = a;
      root.addEventListener('click', (e) => {
        if (!view) return;
        const p = e.target.closest('.mf-p');
        if (p && !p.disabled) {
          if (view.phase === 'night') api.send({ type: 'night', target: p.dataset.pid });
          else if (view.phase === 'vote') api.send({ type: 'vote', target: p.dataset.pid });
        }
        const y = e.target.closest('[data-yes]');
        if (y) api.send({ type: 'confirm', yes: y.dataset.yes === '1' });
        if (e.target.closest('[data-skip]')) api.send({ type: 'skip' });
        if (e.target.closest('[data-abstain]')) api.send({ type: 'vote', target: 'none' });
      });
    },
    update(v) {
      view = v;
      render();
    },
    myTurn: (v) => this_myTurn(v),
    unmount() {
      root?.classList.remove('night');
    },
  };
}
