// 그림 릴레이 화면
import { esc, avatar } from './common.js';
import { DrawBoard, toolbarHTML, bindToolbar } from '../draw.js';

const IDEAS = ['하늘을 나는 고양이', '라면 먹는 호랑이', '월요일 아침 출근길', '춤추는 브로콜리', '우주에서 치킨 배달', '헬스하는 판다', '지하철 탄 공룡', '냉장고 속 코끼리', '서핑하는 펭귄', '노래방에서 열창하는 할머니', '굴뚝에 낀 산타', '택배 상자 속 고양이', '바나나 껍질에 미끄러짐', '비 오는 날 우산 없는 강아지', '마법사의 토끼 모자'];

export default function create() {
  let root, api, view;
  let board = null;
  let boardKey = '';
  const cache = new Map(); // 그림 key → strokes
  const waiting = new Set();
  let autoSent = '';
  let tick = null;
  const albumBoards = [];

  function stepKey(v) {
    return `${v.step}:${v.task?.book}`;
  }

  function need(key) {
    if (!key || cache.has(key) || waiting.has(key)) return;
    waiting.add(key);
    api.raw({ t: 'fetch', key });
  }

  function drawInto(canvas, key) {
    const b = new DrawBoard(canvas, { editable: false });
    albumBoards.push(b);
    if (cache.has(key)) b.setStrokes(cache.get(key));
    canvas.dataset.key = key;
    return b;
  }

  function destroyAlbum() {
    while (albumBoards.length) albumBoards.pop().destroy();
  }

  function submitNow(auto = false) {
    const v = view;
    if (!v || v.phase !== 'play' || !v.task) return;
    if (v.kind === 'draw') {
      if (!board) return;
      api.send({ type: 'submit', strokes: board.getStrokes() });
    } else {
      const inp = root.querySelector('.rl-text');
      let text = inp?.value.trim() || '';
      if (!text && auto) text = v.step === 0 ? IDEAS[Math.floor(Math.random() * IDEAS.length)] : '...?';
      if (!text) return api.toast('문장을 입력해 주세요.', 'err');
      api.send({ type: 'submit', text });
    }
  }

  function renderPlay() {
    const v = view;
    const t = v.task;
    const key = stepKey(v);
    const doneCount = v.submitted.length;
    const total = v.players.filter((p) => !v.gone[p.id]).length;
    if (!t) {
      destroyBoard();
      root.innerHTML = `<div class="relay"><div class="gbanner">참가자들이 ${v.kind === 'draw' ? '그림을 그리고' : '문장을 쓰고'} 있어요… (${doneCount}/${total})</div></div>`;
      return;
    }
    if (boardKey === key && root.querySelector('.relay')) {
      // 같은 단계: 진행 상황만 갱신
      root.querySelector('.rl-progress').textContent = `${doneCount}/${total}명 완료`;
      root.querySelector('.rl-done').hidden = !t.done;
      return;
    }
    destroyBoard();
    boardKey = key;
    const stepLabel = `${v.step + 1} / ${v.steps} 단계`;
    let prompt = '';
    if (t.prompt?.kind === 'draw') prompt = `<div class="rl-prompt draw"><canvas class="rl-view"></canvas></div>`;
    let banner = '✏️ 재미있는 문장을 적어 주세요!';
    if (v.kind === 'draw') banner = `🎨 <span class="rl-q">"${esc(t.prompt?.text || '')}"</span> 을(를) 그려 주세요!`;
    else if (v.step > 0) banner = '🤔 받은 그림을 보고 무엇인지 문장으로 적어 주세요!';
    const body = v.kind === 'draw'
      ? `<div class="rl-board"><canvas class="rl-canvas"></canvas></div><div class="rl-tools">${toolbarHTML()}</div>
         <button class="btn primary lg rl-submit" type="button" data-submit>✔ 그림 완성</button>`
      : `<form class="rl-form" data-form><input class="input rl-text" maxlength="60" placeholder="${v.step === 0 ? '예) 라면 먹는 호랑이' : '이 그림을 한 문장으로 설명해 주세요'}" autocomplete="off" enterkeyhint="done">
         <button class="btn primary" type="submit">완료</button></form>
         ${v.step === 0 ? '<button class="btn sm ghost" type="button" data-idea>🎲 아이디어 추천</button>' : ''}`;
    root.innerHTML = `<div class="relay">
      <div class="rl-head"><span class="rl-step">${stepLabel}</span><span class="rl-progress">${doneCount}/${total}명 완료</span></div>
      <div class="gbanner mine">${banner}</div>
      ${prompt}
      ${body}
      <div class="rl-done" ${t.done ? '' : 'hidden'}>✅ 제출했어요! 다른 사람들을 기다리는 중… (다시 제출하면 수정돼요)</div>
    </div>`;
    if (t.prompt?.kind === 'draw') {
      const cv = root.querySelector('.rl-view');
      need(t.prompt.key);
      drawInto(cv, t.prompt.key);
    }
    if (v.kind === 'draw') {
      board = new DrawBoard(root.querySelector('.rl-canvas'), { editable: true });
      bindToolbar(root.querySelector('.rl-tools'), board);
    }
  }

  function destroyBoard() {
    board?.destroy();
    board = null;
    boardKey = '';
    destroyAlbum();
  }

  function renderAlbum() {
    const v = view;
    destroyBoard();
    const books = v.books || [];
    const cur = v.over ? null : v.album;
    const bi = cur ? cur.book : Math.min(Number(root.dataset.book || 0), books.length - 1);
    const book = books[bi];
    if (!book) return;
    const pages = book.pages.map((p, k) => `
      <div class="rl-page ${p.kind}">
        <div class="rl-by">${avatar(p.by, api.name(p.by), 'sm')}<span>${esc(api.name(p.by))}${k === 0 ? '의 첫 문장' : p.kind === 'draw' ? '의 그림' : '의 추측'}</span></div>
        ${p.kind === 'text' ? `<div class="rl-bubble">${esc(p.text)}</div>` : p.empty ? '<div class="rl-bubble muted">(그림 없음)</div>' : `<canvas class="rl-view" data-key="${esc(p.key)}"></canvas>`}
      </div>`).join('');
    const tabs = v.over ? `<div class="rl-tabs">${books.map((b, i) => `<button type="button" class="btn sm ${i === bi ? 'primary' : ''}" data-book="${i}">${esc(api.name(b.owner))}</button>`).join('')}</div>` : '';
    root.innerHTML = `<div class="relay album">
      <div class="gbanner">${v.over ? '📖 앨범을 골라 다시 볼 수 있어요' : `📖 ${esc(api.name(book.owner))}님의 앨범 (${bi + 1}/${books.length})`}</div>
      ${tabs}
      <div class="rl-pages">${pages}</div>
      ${cur ? `<div class="rl-next"><button class="btn primary lg" type="button" data-next>다음 ▶</button></div>` : ''}
    </div>`;
    root.querySelectorAll('canvas[data-key]').forEach((cv) => {
      need(cv.dataset.key);
      drawInto(cv, cv.dataset.key);
    });
    const last = root.querySelector('.rl-page:last-child');
    if (cur && last) last.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  function render() {
    if (view.phase === 'play' && !view.over) renderPlay();
    else renderAlbum();
  }

  return {
    mount(el, a) {
      root = el;
      api = a;
      root.addEventListener('submit', (e) => {
        e.preventDefault();
        if (e.target.closest('[data-form]')) submitNow(false);
      });
      root.addEventListener('click', (e) => {
        if (e.target.closest('[data-submit]')) submitNow(false);
        if (e.target.closest('[data-idea]')) {
          const inp = root.querySelector('.rl-text');
          if (inp) inp.value = IDEAS[Math.floor(Math.random() * IDEAS.length)];
        }
        if (e.target.closest('[data-next]') && view?.album) api.send({ type: 'next', book: view.album.book, page: view.album.page });
        const b = e.target.closest('[data-book]');
        if (b) {
          root.dataset.book = b.dataset.book;
          renderAlbum();
        }
      });
      // 시간이 거의 끝나면 자동 제출
      tick = setInterval(() => {
        const v = view;
        if (!v || v.over || v.phase !== 'play' || !v.task || v.task.done || !v.timer) return;
        const key = stepKey(v);
        if (autoSent === key) return;
        if (v.timer.end - api.now() < 1200) {
          autoSent = key;
          submitNow(true);
        }
      }, 300);
    },
    update(v) {
      view = v;
      render();
    },
    onFetch(key, data) {
      waiting.delete(key);
      cache.set(key, data || []);
      for (const b of albumBoards) if (b.canvas.dataset.key === key) b.setStrokes(data || []);
    },
    myTurn: (v) => !!v && !v.over && v.phase === 'play' && !!v.task && !v.task.done,
    unmount() {
      clearInterval(tick);
      destroyBoard();
    },
  };
}
