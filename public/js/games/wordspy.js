// 단어 스파이 화면
import { esc, avatar } from './common.js';

const TEAM = { r: '빨강', b: '파랑' };

export default function create() {
  let root, api, view;
  let clueNum = 1;

  function teamBox(t) {
    const v = view;
    const members = v.players.filter((p) => v.teams[p.id] === t);
    return `<div class="ws-team ${t} ${v.turn === t && !v.over ? 'turn' : ''}">
      <div class="ws-thead"><b>${TEAM[t]} 팀</b><span class="ws-left">남은 요원 <b>${v.left[t]}</b></span></div>
      <div class="ws-members">${members.map((p) => `<span class="ws-m ${v.gone[p.id] ? 'gone' : ''}">${avatar(p.id, p.name, 'sm')}${esc(p.name)}${v.spy[t] === p.id ? ' <em>🕶️마스터</em>' : ''}</span>`).join('')}</div>
    </div>`;
  }

  function render() {
    const v = view;
    const me = api.me();
    const mySpyTurn = !v.over && v.phase === 'clue' && v.spy[v.turn] === me;
    let guide;
    if (v.over) guide = '게임 끝!';
    else if (v.phase === 'clue') guide = mySpyTurn ? '🕶️ 내가 스파이 마스터! 우리 팀 단어들을 연결하는 힌트를 주세요' : `${TEAM[v.turn]} 팀 스파이 마스터 ${esc(api.name(v.spy[v.turn]))}님이 힌트를 생각 중이에요…`;
    else guide = v.canGuess ? `힌트 <b>"${esc(v.clue.word)}" ${v.clue.num === 'inf' ? '∞' : v.clue.num}</b> — 단어를 눌러 표시하고, ✔로 선택하세요 (남은 기회 ${v.guesses >= 99 ? '∞' : v.guesses})` : `${TEAM[v.turn]} 팀이 힌트 "${esc(v.clue.word)}" ${v.clue.num === 'inf' ? '∞' : v.clue.num}로 단어를 고르고 있어요`;

    const cards = v.words.map((w, i) => {
      const k = v.key[i];
      const rev = v.revealed[i];
      const marks = (v.marks[i] || []);
      const mine = marks.includes(me);
      return `<button type="button" class="ws-card ${k ? `k-${k}` : ''} ${rev ? 'rev' : ''} ${v.amSpy && !rev ? 'hint' : ''} ${v.last?.i === i ? 'last' : ''} ${mine ? 'marked' : ''}" data-i="${i}" ${!rev && v.canGuess ? '' : 'disabled'}>
        <span class="w">${esc(w)}</span>
        ${marks.length ? `<span class="ws-marks">${marks.map((id) => esc(api.name(id)).slice(0, 3)).join(' · ')}</span>` : ''}
        ${mine && v.canGuess ? `<span class="ws-pick" data-guess="${i}">✔ 선택</span>` : ''}
        ${rev && k === 'a' ? '<span class="ws-skull">☠️</span>' : ''}
      </button>`;
    }).join('');

    let act = '';
    if (mySpyTurn) {
      act = `<form class="ws-clue" data-clue>
        <input class="input" maxlength="20" placeholder="힌트 단어 (판에 없는 단어)" autocomplete="off" enterkeyhint="send">
        <select class="input ws-num">${[1, 2, 3, 4, 5, 6, 7, 8, 9, 0].map((n) => `<option value="${n}" ${n === clueNum ? 'selected' : ''}>${n}</option>`).join('')}<option value="inf">∞</option></select>
        <button class="btn primary" type="submit">힌트 주기</button></form>`;
    } else if (v.canGuess) act = '<div class="ws-acts"><button class="btn" type="button" data-end>차례 마치기</button></div>';

    const log = v.log.slice().reverse().slice(0, 10).map((l) => `<div class="ws-log ${l.team}"><b>${TEAM[l.team]}</b> "${esc(l.word)}" ${l.num === 'inf' ? '∞' : l.num} → ${l.picks.map((p) => `<span class="k-${p.color}">${esc(v.words[p.i])}</span>`).join(' ') || '-'}</div>`).join('');

    root.innerHTML = `<div class="wordspy">
      <div class="ws-teams">${teamBox('r')}${teamBox('b')}</div>
      ${v.myTeam ? `<div class="ws-me">나는 <b class="${v.myTeam}">${TEAM[v.myTeam]} 팀 ${v.amSpy ? '스파이 마스터 🕶️' : '요원'}</b>${v.amSpy ? ' · 색이 보이는 건 나만 알아요!' : ''}</div>` : ''}
      <div class="gbanner ${mySpyTurn || v.canGuess ? 'mine' : ''}">${guide}</div>
      ${act}
      <div class="ws-grid">${cards}</div>
      ${log ? `<div class="ws-logs"><h4>힌트 기록</h4>${log}</div>` : ''}
    </div>`;
  }

  return {
    mount(el, a) {
      root = el;
      api = a;
      root.addEventListener('click', (e) => {
        if (!view) return;
        const g = e.target.closest('[data-guess]');
        if (g) {
          e.stopPropagation();
          api.send({ type: 'guess', i: Number(g.dataset.guess) });
          return;
        }
        const c = e.target.closest('.ws-card');
        if (c && !c.disabled) api.send({ type: 'mark', i: Number(c.dataset.i) });
        if (e.target.closest('[data-end]')) api.send({ type: 'end' });
      });
      root.addEventListener('change', (e) => {
        if (e.target.classList.contains('ws-num')) clueNum = e.target.value === 'inf' ? 'inf' : Number(e.target.value);
      });
      root.addEventListener('submit', (e) => {
        e.preventDefault();
        const f = e.target.closest('[data-clue]');
        if (!f) return;
        const word = f.querySelector('input').value.trim();
        const n = f.querySelector('select').value;
        if (!word) return api.toast('힌트 단어를 입력해 주세요.', 'err');
        api.send({ type: 'clue', word, num: n === 'inf' ? 'inf' : Number(n) });
      });
    },
    update(v) {
      const active = document.activeElement;
      const keep = active && root.contains(active) && active.tagName === 'INPUT' ? active.value : null;
      view = v;
      render();
      if (keep != null) {
        const inp = root.querySelector('[data-clue] input');
        if (inp) { inp.value = keep; inp.focus(); }
      }
    },
    myTurn(v) {
      if (!v || v.over) return false;
      return (v.phase === 'clue' && v.spy[v.turn] === api.me()) || v.canGuess;
    },
    unmount() {},
  };
}
