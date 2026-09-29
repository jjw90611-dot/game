// 한 단어 화면
import { esc, avatar } from './common.js';

export default function create() {
  let root, api, view, draft = '';

  function render() {
    const v = view;
    const me = api.me();
    const guesser = v.guesser === me;
    const isPlayer = v.players.some((p) => p.id === me) && !v.gone[me];
    const inp = root.querySelector('input');
    if (inp) draft = inp.value;
    const helpers = v.players.filter((p) => p.id !== v.guesser && !v.gone[p.id]);
    const clueCard = (p) => {
      const c = v.clues[p.id];
      const sent = v.submitted.includes(p.id);
      const dup = v.dup[p.id];
      let body;
      if (c == null && v.phase === 'guess' && guesser) body = '<span class="ow-x">지워짐</span>';
      else if (c === '?' || (c == null && sent)) body = '<span class="ow-q">작성 완료</span>';
      else if (c) body = `<b>${esc(c)}</b>`;
      else body = '<span class="ow-wait">생각 중…</span>';
      return `<div class="ow-clue ${dup ? 'dup' : ''} ${sent ? 'sent' : ''}" data-pid="${esc(p.id)}">${body}<small>${avatar(p.id, p.name, 'sm')}${esc(p.name)}</small>${dup && (v.phase !== 'guess' || !guesser) ? '<em>겹쳐서 지워져요</em>' : ''}</div>`;
    };
    let act = '';
    if (!v.over && isPlayer) {
      if (v.phase === 'clue' && !guesser) {
        act = `<form class="qz-form" data-form="clue"><input class="input" maxlength="12" placeholder="힌트 한 단어 (띄어쓰기 없이)" value="${esc(v.clues[me] && v.clues[me] !== '?' ? v.clues[me] : draft)}" autocomplete="off" enterkeyhint="send"><button class="btn primary" type="submit">${v.submitted.includes(me) ? '수정' : '제출'}</button></form>`;
      } else if (v.phase === 'guess' && guesser) {
        act = `<form class="qz-form" data-form="guess"><input class="input" maxlength="20" placeholder="정답은?" autocomplete="off" enterkeyhint="send"><button class="btn accent" type="submit">정답!</button></form>
          <div class="ow-pass"><button class="btn ghost" type="button" data-pass>모르겠어요, 패스</button></div>`;
      }
    }
    const res = v.phase === 'reveal' ? { ok: '정답! 팀 점수 +1', wrong: `아쉬워요! "${esc(v.guess || '')}"는 오답 (카드 1장 추가로 잃어요)`, pass: '패스했어요' }[v.result] : '';
    root.innerHTML = `<div class="oneword">
      <div class="ow-head"><span>카드 ${v.total - v.cardsLeft} / ${v.total}</span><span class="ow-team">팀 점수 <b>${v.score}</b></span></div>
      <div class="ow-word ${guesser && v.phase !== 'reveal' ? 'hidden' : ''}">
        <small>${esc(api.name(v.guesser))}님이 맞힐 제시어</small>
        <b>${guesser && v.phase !== 'reveal' ? '???' : esc(v.word || '')}</b>
      </div>
      <div class="gbanner ${(v.phase === 'clue' && !guesser && !v.submitted.includes(me)) || (v.phase === 'guess' && guesser) ? 'mine' : ''}">${v.over ? esc(v.over.text) : res || (v.phase === 'clue'
    ? (guesser ? '다른 사람들이 힌트를 쓰는 중이에요. 잠시 눈을 감고 기다려 주세요!' : '서로 상의하지 말고 힌트 한 단어를 쓰세요. 다른 사람과 겹치면 지워져요!')
    : guesser ? '남은 힌트를 보고 정답을 맞혀 보세요!' : `${esc(api.name(v.guesser))}님이 정답을 고민 중이에요…`)}</div>
      <div class="ow-clues">${helpers.map(clueCard).join('')}</div>
      ${act}
    </div>`;
    const ni = root.querySelector('input');
    if (ni && !('ontouchstart' in window)) ni.focus();
  }

  return {
    mount(el, a) {
      root = el;
      api = a;
      root.addEventListener('submit', (e) => {
        const f = e.target.closest('[data-form]');
        if (!f) return;
        e.preventDefault();
        const t = f.querySelector('input').value.trim();
        if (!t) return;
        if (f.dataset.form === 'clue') { draft = t; api.send({ type: 'clue', text: t }); } else api.send({ type: 'guess', text: t });
      });
      root.addEventListener('click', (e) => {
        if (e.target.closest('[data-pass]')) api.send({ type: 'guess', pass: true });
      });
    },
    update(v) {
      if (view && v.roundNo !== view.roundNo) draft = '';
      view = v;
      render();
    },
    myTurn: (v) => !!v && !v.over && ((v.phase === 'clue' && v.guesser !== api.me() && !v.submitted.includes(api.me())) || (v.phase === 'guess' && v.guesser === api.me())),
    unmount() {},
  };
}
