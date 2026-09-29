// 초성 퀴즈 화면
import { esc, avatar } from './common.js';

export function answerBox(placeholder) {
  return `<form class="qz-form" data-answer><input class="input" maxlength="30" placeholder="${esc(placeholder)}" autocomplete="off" enterkeyhint="send"><button class="btn primary" type="submit">정답!</button></form>`;
}

export function bindAnswer(root, api) {
  root.addEventListener('submit', (e) => {
    const f = e.target.closest('[data-answer]');
    if (!f) return;
    e.preventDefault();
    const inp = f.querySelector('input');
    const t = inp.value.trim();
    if (t) api.raw({ t: 'chat', text: t });
    inp.value = '';
  });
}

export function scoreboard(v, api) {
  const me = api.me();
  const rank = [...v.players].sort((a, b) => v.scores[b.id] - v.scores[a.id]);
  return `<div class="qz-score">${rank.map((p) => `<span class="${p.id === me ? 'me' : ''} ${v.solver === p.id ? 'solver' : ''} ${v.gone?.[p.id] ? 'gone' : ''}" data-pid="${esc(p.id)}">${avatar(p.id, p.name, 'sm')}<b>${esc(p.name)}</b><em>${v.scores[p.id]}${v.gains?.[p.id] ? ` <i>+${v.gains[p.id]}</i>` : ''}</em></span>`).join('')}</div>`;
}

export default function create() {
  let root, api, view, keep = '';

  function render() {
    const v = view;
    const me = api.me();
    const isPlayer = v.players.some((p) => p.id === me) && !v.gone[me];
    const inp = root.querySelector('.qz-form input');
    if (inp) keep = inp.value;
    const reveal = v.phase === 'reveal' || v.over;
    root.innerHTML = `<div class="quiz chosung">
      <div class="qz-head"><span>${v.qNo} / ${v.total} 문제</span></div>
      <div class="qz-card ${reveal ? 'reveal' : ''}">
        <span class="qz-cat">${esc(v.cat || '')}</span>
        <div class="qz-cho">${[...(v.cho || '')].map((ch, i) => `<span class="qz-tile ${v.hint[i] ? 'open' : ''}"><b>${esc(ch)}</b>${v.hint[i] ? `<i>${esc(v.hint[i])}</i>` : ''}</span>`).join('')}</div>
        ${reveal ? `<div class="qz-ans">${v.word ? `정답: <b>${esc(v.word)}</b>` : ''}${v.solver ? ` · ${esc(api.name(v.solver))}님이 맞혔어요!` : ''}</div>` : '<div class="qz-tip">시간이 지나면 글자가 하나씩 공개돼요 (점수 10 → 7 → 4)</div>'}
      </div>
      ${isPlayer && !reveal && !v.over ? answerBox('정답을 입력하세요 (채팅창에 써도 돼요)') : ''}
      ${scoreboard(v, api)}
    </div>`;
    const ni = root.querySelector('.qz-form input');
    if (ni) {
      ni.value = keep;
      if (!('ontouchstart' in window)) ni.focus();
    }
  }

  return {
    chatHint: '정답을 입력하세요',
    mount(el, a) {
      root = el;
      api = a;
      bindAnswer(root, api);
    },
    update(v) { view = v; render(); },
    myTurn: () => false,
    unmount() {},
  };
}
