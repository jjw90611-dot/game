// 라이어 게임 화면
import { esc, avatar } from './common.js';

export default function create() {
  let root, api, view;
  let draft = '';

  function render() {
    const v = view;
    const me = api.me();
    const name = (id) => esc(api.name(id));
    // 제시어 카드
    let card;
    if (!v.isPlayer) card = `<div class="lr-card watch"><div class="lr-topic">주제: ${esc(v.topic)}</div><div class="lr-word">관전 중</div><div class="lr-hint">참가자만 제시어를 볼 수 있어요</div></div>`;
    else if (v.amLiar) card = `<div class="lr-card liar"><div class="lr-topic">주제: ${esc(v.topic)}</div><div class="lr-word">🤥 당신은 라이어!</div><div class="lr-hint">제시어를 모르는 척 들키지 말고, 다른 사람 설명으로 제시어를 추리하세요</div></div>`;
    else card = `<div class="lr-card"><div class="lr-topic">주제: ${esc(v.topic)}</div><div class="lr-word">${esc(v.myWord)}</div><div class="lr-hint">${v.fool ? '바보 모드: 라이어도 자기가 시민인 줄 알아요!' : '라이어에게 들키지 않게 살짝만 설명하세요'}</div></div>`;
    if (v.over && v.answer) {
      card = `<div class="lr-card reveal"><div class="lr-topic">주제: ${esc(v.topic)}</div><div class="lr-word">제시어: ${esc(v.answer.word)}</div>
        <div class="lr-hint">라이어는 <b>${name(v.answer.liar)}</b>님${v.answer.foolWord ? ` (라이어의 제시어: ${esc(v.answer.foolWord)})` : ''}${v.answer.guess ? ` · 라이어의 답: "${esc(v.answer.guess)}"` : ''}</div></div>`;
    }

    // 설명 목록
    const hints = v.players.map((p) => {
      const list = v.hints.filter((h) => h.pid === p.id).map((h) => `<span class="lr-h">${esc(h.text)}</span>`).join('');
      const speaking = v.phase === 'hint' && v.hinter === p.id && !v.over;
      const liarMark = v.over && v.answer?.liar === p.id;
      return `<div class="lr-row ${speaking ? 'speaking' : ''} ${v.gone[p.id] ? 'gone' : ''} ${liarMark ? 'liar' : ''}">
        ${avatar(p.id, p.name, 'sm')}<div class="lr-name">${name(p.id)}${p.id === me ? ' <em class="tag me">나</em>' : ''}${liarMark ? ' <span class="tag" style="background:#ffe3e3;color:#c92a2a">라이어</span>' : ''}</div>
        <div class="lr-hints">${list || (speaking ? '<span class="lr-typing">설명 중…</span>' : '<span class="muted small">-</span>')}</div>
        ${v.voteResult?.count?.[p.id] ? `<span class="lr-votes">🗳️ ${v.voteResult.count[p.id]}</span>` : ''}
      </div>`;
    }).join('');

    // 단계별 행동
    let act = '';
    const inGame = v.isPlayer && !v.gone[me];
    if (!v.over) {
      if (v.phase === 'hint') {
        if (v.hinter === me) {
          act = `<div class="gbanner mine">내 차례예요! 제시어를 한 줄로 설명해 주세요</div>
            <form class="lr-form" data-form="hint"><input class="input" maxlength="40" placeholder="예) 여름에 자주 먹어요" value="${esc(draft)}" autocomplete="off" enterkeyhint="send"><button class="btn primary" type="submit">설명하기</button></form>`;
        } else act = `<div class="gbanner">${name(v.hinter)}님이 설명하고 있어요 · ${Math.min(v.hintTurn + 1, v.players.length * v.rounds)}/${v.players.length * v.rounds}</div>`;
      } else if (v.phase === 'discuss') {
        const skipped = v.skip.includes(me);
        act = `<div class="gbanner">💬 자유 토론 시간! 채팅으로 라이어를 추리해 보세요</div>
          ${inGame ? `<div class="lr-acts"><button class="btn ${skipped ? '' : 'primary'}" type="button" data-skip ${skipped ? 'disabled' : ''}>${skipped ? '투표 준비 완료' : '바로 투표하기'} (${v.skip.length}/${v.players.filter((p) => !v.gone[p.id]).length})</button></div>` : ''}`;
      } else if (v.phase === 'vote') {
        act = `<div class="gbanner mine">🗳️ 라이어라고 생각하는 사람을 골라 주세요 (${v.voted.length}/${v.players.filter((p) => !v.gone[p.id]).length}명 투표)</div>
          ${inGame ? `<div class="lr-vote">${v.players.filter((p) => p.id !== me && !v.gone[p.id]).map((p) => `<button type="button" class="lr-vbtn ${v.myVote === p.id ? 'on' : ''}" data-vote="${esc(p.id)}">${avatar(p.id, p.name, 'sm')}<span>${name(p.id)}</span></button>`).join('')}</div>` : ''}`;
      } else if (v.phase === 'guess') {
        if (v.amLiar || (v.reveal?.liar === me)) {
          act = `<div class="gbanner mine">😱 들켰어요! 제시어를 맞히면 역전승이에요</div>
            <form class="lr-form" data-form="guess"><input class="input" maxlength="30" placeholder="제시어를 입력하세요" autocomplete="off" enterkeyhint="send"><button class="btn accent" type="submit">정답!</button></form>`;
        } else act = `<div class="gbanner">😱 라이어는 ${name(v.reveal?.liar)}님! 라이어가 제시어를 추리하고 있어요…</div>`;
      }
    }
    root.innerHTML = `<div class="liar">${card}${act}<div class="lr-list">${hints}</div></div>`;
    const inp = root.querySelector('.lr-form input');
    if (inp && !('ontouchstart' in window)) inp.focus();
    if (inp) inp.addEventListener('input', () => { draft = inp.value; });
  }

  return {
    mount(el, a) {
      root = el;
      api = a;
      root.addEventListener('submit', (e) => {
        e.preventDefault();
        const f = e.target.closest('[data-form]');
        if (!f) return;
        const text = f.querySelector('input').value.trim();
        if (!text) return;
        if (f.dataset.form === 'hint') {
          api.send({ type: 'hint', text });
          draft = '';
        } else api.send({ type: 'guess', text });
      });
      root.addEventListener('click', (e) => {
        if (e.target.closest('[data-skip]')) api.send({ type: 'skip' });
        const vb = e.target.closest('[data-vote]');
        if (vb) api.send({ type: 'vote', target: vb.dataset.vote });
      });
    },
    update(v) {
      const active = document.activeElement;
      const typing = active && root.contains(active) && active.tagName === 'INPUT' && view && view.phase === v.phase && view.hinter === v.hinter;
      view = v;
      if (typing) {
        // 입력 중에는 목록만 갱신
        const val = active.value;
        render();
        const inp = root.querySelector('.lr-form input');
        if (inp) { inp.value = val; inp.focus(); }
        return;
      }
      render();
    },
    myTurn(v) {
      if (!v || v.over) return false;
      const me = api.me();
      if (v.phase === 'hint') return v.hinter === me;
      if (v.phase === 'vote') return v.isPlayer && !v.voted.includes(me);
      if (v.phase === 'guess') return v.reveal?.liar === me;
      return false;
    },
    unmount() {},
  };
}
