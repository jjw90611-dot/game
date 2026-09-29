// 그림 맞히기 화면
import { esc, avatar } from './common.js';
import { DrawBoard, toolbarHTML, bindToolbar } from '../draw.js';

export default function create() {
  let root, api, view, board;
  let turnNo = -1;

  function isDrawer() {
    return view && view.drawer === api.me() && !view.over;
  }

  function render() {
    const v = view;
    const me = api.me();
    const drawer = isDrawer();
    const guessed = v.guessed.includes(me);
    // 제시어 표시
    let word = '';
    if (v.phase === 'choose') word = drawer ? '그릴 제시어를 골라 주세요!' : `${esc(api.name(v.drawer))}님이 제시어를 고르는 중…`;
    else if (v.word) word = `<span class="dg-word">${esc(v.word)}</span>`;
    else if (v.mask) word = `<span class="dg-mask">${v.mask.map((c) => (c === ' ' ? '<i class="sp"></i>' : c ? `<b>${esc(c)}</b>` : '<b class="q">?</b>')).join('')}</span><span class="dg-len">${v.mask.filter((c) => c !== ' ').length}글자</span>`;
    root.querySelector('.dg-word-box').innerHTML = word;
    const st = root.querySelector('.dg-status');
    if (v.over) st.textContent = '게임 끝!';
    else if (v.phase === 'draw') st.innerHTML = drawer ? '✏️ 그림을 그려 주세요! (글자·숫자 쓰기 금지)' : guessed ? '🎉 정답! 다른 사람들을 기다려요' : '🤔 채팅창에 정답을 입력하세요!';
    else if (v.phase === 'reveal') st.innerHTML = `정답은 <b>${esc(v.word || '')}</b>!`;
    else st.innerHTML = `${v.round}/${v.rounds} 바퀴`;
    st.classList.toggle('mine', (drawer && v.phase === 'draw') || (!drawer && !guessed && v.phase === 'draw'));

    // 제시어 고르기
    const choose = root.querySelector('.dg-choose');
    if (v.phase === 'choose' && drawer && v.choices) {
      choose.hidden = false;
      choose.innerHTML = `<div class="dg-choose-box"><h3>무엇을 그릴까요?</h3><div class="dg-choices">${v.choices.map((w, i) => `<button class="btn primary lg" type="button" data-choose="${i}">${esc(w)}</button>`).join('')}</div></div>`;
    } else if (v.phase === 'reveal' && v.gains) {
      choose.hidden = false;
      const gains = Object.entries(v.gains).sort((a, b) => b[1] - a[1]);
      choose.innerHTML = `<div class="dg-choose-box"><h3>정답: ${esc(v.word || '')}</h3>${gains.length ? `<div class="dg-gains">${gains.map(([id, g]) => `<div>${esc(api.name(id))} <b>+${g}</b></div>`).join('')}</div>` : '<p class="muted">아무도 맞히지 못했어요 😢</p>'}</div>`;
    } else choose.hidden = true;

    // 도구
    root.querySelector('.dg-tools').hidden = !(drawer && v.phase === 'draw');
    board?.setEditable(drawer && v.phase === 'draw');

    // 점수판
    const order = v.order.map((id) => v.players.find((p) => p.id === id)).filter(Boolean);
    root.querySelector('.dg-scores').innerHTML = order.map((p) => `
      <div class="dg-sc ${p.id === v.drawer ? 'drawer' : ''} ${v.guessed.includes(p.id) ? 'ok' : ''} ${v.gone[p.id] ? 'gone' : ''}">
        ${avatar(p.id, p.name, 'sm')}<span class="n">${esc(p.name)}</span><b>${v.scores[p.id]}</b>
        ${p.id === v.drawer ? '<span class="ic">✏️</span>' : v.guessed.includes(p.id) ? '<span class="ic">✅</span>' : ''}
      </div>`).join('');
    api.setChatHint(v.phase === 'draw' && !drawer && !guessed ? '정답을 입력하세요!' : '메시지 입력');
  }

  return {
    chatHint: '정답을 입력하세요!',
    mount(el, a) {
      root = el;
      api = a;
      root.innerHTML = `<div class="drawguess">
        <div class="dg-head"><div class="dg-status gbanner"></div><div class="dg-word-box"></div></div>
        <div class="dg-main">
          <div class="dg-canvas-wrap"><canvas class="dg-canvas"></canvas><div class="dg-choose" hidden></div></div>
          <div class="dg-tools" hidden>${toolbarHTML()}</div>
        </div>
        <div class="dg-scores"></div>
      </div>`;
      board = new DrawBoard(root.querySelector('.dg-canvas'), { editable: false, onSend: (d) => api.raw({ t: 'draw', d }) });
      bindToolbar(root.querySelector('.dg-tools'), board);
      root.addEventListener('click', (e) => {
        const c = e.target.closest('[data-choose]');
        if (c) api.send({ type: 'choose', i: Number(c.dataset.choose) });
      });
    },
    update(v) {
      if (turnNo !== -1 && v.turnNo !== turnNo) board?.setStrokes([]);
      turnNo = v.turnNo;
      view = v;
      render();
    },
    onDraw(d) {
      board?.apply(d);
    },
    onVol(vol) {
      board?.setStrokes(vol.strokes || []);
    },
    myTurn(v) {
      if (!v || v.over) return false;
      return v.drawer === api.me() && (v.phase === 'choose' || v.phase === 'draw');
    },
    unmount() {
      board?.destroy();
      api?.setChatHint('');
    },
  };
}
