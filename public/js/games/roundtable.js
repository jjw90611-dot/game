// 원탁의 스파이 화면
import { esc, avatar } from './common.js';

const ROLE = {
  merlin: { name: '멀린', icon: '🧙', side: 'good', desc: '악의 편이 누구인지 알고 있어요. 하지만 암살자에게 들키면 안 돼요!' },
  percival: { name: '퍼시벌', icon: '🛡️', side: 'good', desc: '멀린 후보 2명을 알고 있어요. 한 명은 가짜(모르가나)예요.' },
  servant: { name: '원탁의 기사', icon: '⚔️', side: 'good', desc: '선의 편이에요. 원정을 성공시켜 악을 물리치세요!' },
  assassin: { name: '암살자', icon: '🗡️', side: 'evil', desc: '악의 편이에요. 선이 3번 성공하면 멀린을 암살해 역전할 수 있어요.' },
  morgana: { name: '모르가나', icon: '🔮', side: 'evil', desc: '악의 편이에요. 퍼시벌에게 멀린처럼 보여요.' },
  minion: { name: '모드레드의 부하', icon: '👺', side: 'evil', desc: '악의 편이에요. 원정에 실패 카드를 몰래 섞으세요!' },
};

export default function create() {
  let root, api, view;
  let picks = [];

  function render() {
    const v = view;
    const me = api.me();
    const leader = v.players[v.leader];
    const size = v.sizes[v.quest];
    const iAmLeader = leader?.id === me && !v.over;
    if (v.phase === 'team' && !iAmLeader) picks = v.picking.slice();

    const role = v.myRole ? ROLE[v.myRole] : null;
    const knownList = Object.entries(v.known).map(([id, label]) => `<span class="rtb-known ${label === '악' ? 'evil' : ''}">${esc(api.name(id))} · ${label}</span>`).join('');
    const roleCard = role
      ? `<div class="rtb-role ${role.side}"><div class="rtb-ricon">${role.icon}</div><div class="rtb-rbody">
          <div class="rtb-rname">나는 <b>${role.name}</b> <span class="rtb-side">${role.side === 'good' ? '선의 편' : '악의 편'}</span></div>
          <div class="rtb-rdesc">${role.desc}</div>${knownList ? `<div class="rtb-knowns">${knownList}</div>` : ''}</div></div>`
      : '<div class="rtb-role watch"><div class="rtb-ricon">👀</div><div class="rtb-rbody"><div class="rtb-rname">관전 중</div></div></div>';

    // 원정 트랙
    const track = v.sizes.map((n, i) => {
      const r = v.results[i];
      return `<div class="rtb-quest ${r === true ? 'ok' : r === false ? 'fail' : ''} ${i === v.quest && !v.over ? 'cur' : ''}">
        <b>${r === true ? '✓' : r === false ? '✕' : n}</b><span>${i + 1}번째${v.need2 && i === 3 ? '<br>실패 2장' : ''}</span></div>`;
    }).join('');
    const rejects = [0, 1, 2, 3, 4].map((i) => `<i class="${i < v.rejects ? 'on' : ''}"></i>`).join('');

    // 안내 + 행동
    let guide = '', act = '';
    if (!v.over) {
      if (v.phase === 'team') {
        if (iAmLeader) {
          guide = `👑 내가 대표예요! 원정대 <b>${size}명</b>을 골라 주세요 (${picks.length}/${size})`;
          act = `<button class="btn primary lg" type="button" data-team ${picks.length === size ? '' : 'disabled'}>원정대 확정</button>`;
        } else guide = `👑 대표 ${esc(leader.name)}님이 원정대 ${size}명을 고르고 있어요`;
      } else if (v.phase === 'vote') {
        const voted = v.voted.includes(me);
        guide = `🗳️ 이 원정대를 보낼까요? (${v.voted.length}/${v.players.length}명 투표)`;
        if (v.isPlayer && !voted) act = '<button class="btn good lg" type="button" data-vote="1">👍 찬성</button><button class="btn bad lg" type="button" data-vote="0">👎 반대</button>';
        else if (v.isPlayer) act = `<span class="muted">투표했어요 (${v.myVote ? '찬성' : '반대'})</span>`;
      } else if (v.phase === 'quest') {
        const onTeam = v.team.includes(me);
        guide = `🏰 원정 중… (${v.qvoted.length}/${v.team.length}명 제출)`;
        if (onTeam && v.myQuest == null) {
          act = `<button class="btn primary lg" type="button" data-quest="1">🏆 성공</button>
            <button class="btn bad lg" type="button" data-quest="0" ${v.mySide === 'good' ? 'disabled title="선의 편은 성공만 낼 수 있어요"' : ''}>💥 실패</button>`;
        } else if (onTeam) act = '<span class="muted">카드를 냈어요. 결과를 기다려요…</span>';
      } else if (v.phase === 'assassin') {
        if (v.myRole === 'assassin') {
          guide = '🗡️ 멀린이라고 생각하는 사람을 골라 암살하세요!';
          act = `<button class="btn bad lg" type="button" data-kill ${picks.length === 1 ? '' : 'disabled'}>암살하기</button>`;
        } else guide = '🗡️ 암살자가 멀린을 찾고 있어요… 들키지 마세요!';
      }
    }

    const last = v.history[v.history.length - 1];
    const players = v.players.map((p, i) => {
      const onTeam = v.phase === 'team' ? picks.includes(p.id) : v.team.includes(p.id);
      const lastVote = last && (v.phase === 'team' || v.phase === 'quest') && last.votes[p.id] != null ? last.votes[p.id] : null;
      const selectable = (v.phase === 'team' && iAmLeader) || (v.phase === 'assassin' && v.myRole === 'assassin' && v.known[p.id] !== '악' && p.id !== me);
      const role = v.roles?.[p.id];
      return `<button type="button" class="rtb-p ${onTeam ? 'team' : ''} ${selectable ? 'can' : ''} ${v.phase === 'assassin' && picks.includes(p.id) ? 'target' : ''}" data-pid="${esc(p.id)}" ${selectable ? '' : 'disabled'}>
        ${i === v.leader && !v.over ? '<span class="rtb-crown">👑</span>' : ''}
        ${avatar(p.id, p.name)}
        <div class="rtb-pname">${esc(p.name)}${p.id === me ? ' (나)' : ''}</div>
        ${v.known[p.id] ? `<div class="rtb-plabel ${v.known[p.id] === '악' ? 'evil' : ''}">${v.known[p.id]}</div>` : ''}
        ${role ? `<div class="rtb-plabel ${ROLE[role].side === 'evil' ? 'evil' : 'good'}">${ROLE[role].icon} ${ROLE[role].name}</div>` : ''}
        ${onTeam ? '<span class="rtb-shield">🛡️</span>' : ''}
        ${v.phase === 'vote' && v.voted.includes(p.id) ? '<span class="rtb-voted">✓</span>' : ''}
        ${lastVote != null ? `<span class="rtb-lv ${lastVote ? 'y' : 'n'}">${lastVote ? '찬' : '반'}</span>` : ''}
      </button>`;
    }).join('');

    const history = v.history.slice().reverse().slice(0, 8).map((h) => `<div class="rtb-h ${h.approved ? (h.fails == null ? '' : h.fails >= (v.need2 && h.quest === 3 ? 2 : 1) ? 'fail' : 'ok') : 'rej'}">
      <b>${h.quest + 1}번째 원정</b> · 대표 ${esc(api.name(h.leader))} · ${h.team.map((id) => esc(api.name(id))).join(', ')}
      <div class="small">${h.approved ? '가결' : '부결'} (찬성 ${Object.values(h.votes).filter(Boolean).length} / 반대 ${Object.values(h.votes).filter((x) => !x).length})${h.fails != null ? ` · 실패 카드 ${h.fails}장` : ''}</div></div>`).join('');

    root.innerHTML = `<div class="roundtable">
      ${roleCard}
      <div class="rtb-track">${track}</div>
      <div class="rtb-rejects"><span>연속 부결</span>${rejects}</div>
      ${guide ? `<div class="gbanner ${act && !act.includes('muted') ? 'mine' : ''}">${guide}</div>` : ''}
      <div class="rtb-players">${players}</div>
      ${act ? `<div class="rtb-act">${act}</div>` : ''}
      ${history ? `<div class="rtb-history"><h4>원정 기록</h4>${history}</div>` : ''}
    </div>`;
  }

  return {
    mount(el, a) {
      root = el;
      api = a;
      root.addEventListener('click', (e) => {
        if (!view) return;
        const p = e.target.closest('.rtb-p');
        if (p && !p.disabled) {
          const id = p.dataset.pid;
          if (view.phase === 'team') {
            const size = view.sizes[view.quest];
            if (picks.includes(id)) picks = picks.filter((x) => x !== id);
            else if (picks.length < size) picks = [...picks, id];
            else api.toast(`원정대는 ${size}명이에요.`);
            api.send({ type: 'pick', pids: picks });
          } else if (view.phase === 'assassin') picks = [id];
          render();
          return;
        }
        if (e.target.closest('[data-team]')) api.send({ type: 'team', pids: picks });
        const vb = e.target.closest('[data-vote]');
        if (vb) api.send({ type: 'vote', approve: vb.dataset.vote === '1' });
        const qb = e.target.closest('[data-quest]');
        if (qb && !qb.disabled) api.send({ type: 'quest', success: qb.dataset.quest === '1' });
        if (e.target.closest('[data-kill]') && picks.length === 1) api.send({ type: 'assassinate', target: picks[0] });
      });
    },
    update(v) {
      if (view && (view.phase !== v.phase || view.quest !== v.quest || view.leader !== v.leader)) picks = [];
      view = v;
      render();
    },
    myTurn(v) {
      if (!v || v.over || !v.isPlayer) return false;
      const me = api.me();
      if (v.phase === 'team') return v.players[v.leader]?.id === me;
      if (v.phase === 'vote') return !v.voted.includes(me);
      if (v.phase === 'quest') return v.team.includes(me) && v.myQuest == null;
      if (v.phase === 'assassin') return v.myRole === 'assassin';
      return false;
    },
    unmount() {},
  };
}
