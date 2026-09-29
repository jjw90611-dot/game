// 요트 다이스 화면
import { esc, avatar } from './common.js';
import { openModal } from '../ui.js';
import { CATS, CAT_NAMES, UPPER, scoreFor, totals } from '../shared/yacht.js';

const PIPS = { 1: [[50, 50]], 2: [[28, 28], [72, 72]], 3: [[28, 28], [50, 50], [72, 72]], 4: [[28, 28], [72, 28], [28, 72], [72, 72]], 5: [[28, 28], [72, 28], [50, 50], [28, 72], [72, 72]], 6: [[28, 26], [72, 26], [28, 50], [72, 50], [28, 74], [72, 74]] };

function dieSVG(n) {
  return `<svg viewBox="0 0 100 100"><rect x="4" y="4" width="92" height="92" rx="20" class="face"/>${PIPS[n].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="9.5" class="${n === 1 ? 'red' : ''}"/>`).join('')}</svg>`;
}

export default function create() {
  let root, api, view;
  let lastRoll = -1;
  let anim = null;

  function isMine() {
    return view && !view.over && view.players[view.turn]?.id === api.me();
  }

  function renderDice(rolling = false) {
    const v = view;
    const box = root.querySelector('.y-dice');
    const mine = isMine();
    const canHold = mine && v.rolls > 0 && v.rolls < 3;
    box.innerHTML = v.dice.map((d, i) => {
      const face = rolling && !v.held[i] ? 1 + Math.floor(Math.random() * 6) : d;
      return `<button type="button" class="ydie ${v.held[i] && v.rolls > 0 ? 'held' : ''} ${rolling && !v.held[i] ? 'rolling' : ''} ${v.rolls === 0 ? 'idle' : ''}" data-hold="${i}" ${canHold ? '' : 'disabled'}>
        ${dieSVG(face)}${v.held[i] && v.rolls > 0 && v.rolls < 3 ? '<span class="hold-tag">고정</span>' : ''}</button>`;
    }).join('');
  }

  function render() {
    const v = view;
    const mine = isMine();
    const cur = v.players[v.turn];
    const st = root.querySelector('.y-status');
    if (v.over) st.innerHTML = '게임이 끝났어요!';
    else if (mine) st.innerHTML = v.rolls === 0 ? '내 차례! 주사위를 굴려 주세요 🎲' : v.rolls < 3 ? `고정할 주사위를 누르고 다시 굴리거나, 점수 칸을 골라 주세요 (남은 굴리기 ${3 - v.rolls}번)` : '점수를 기록할 칸을 골라 주세요!';
    else st.innerHTML = `${esc(cur.name)}님의 차례예요 · ${v.round}/12 라운드`;
    st.classList.toggle('mine', mine);

    if (!anim) renderDice(false);
    const rb = root.querySelector('.y-rollbtn');
    rb.hidden = !mine;
    rb.disabled = !mine || v.rolls >= 3 || (v.rolls > 0 && v.held.every(Boolean));
    rb.innerHTML = v.rolls === 0 ? '🎲 굴리기' : `🎲 다시 굴리기 <small>(${3 - v.rolls})</small>`;
    root.querySelector('.y-round').textContent = `${Math.min(v.round, 12)} / 12 라운드`;

    const players = v.players;
    const sc = (p) => v.scores[p.id];
    const head = `<tr><th class="cat">족보</th>${players.map((p, i) => `<th class="${i === v.turn && !v.over ? 'turn' : ''}">${avatar(p.id, p.name, 'sm', api.isBot(p.id))}<div class="yname">${esc(p.name)}</div></th>`).join('')}</tr>`;
    const row = (c) => `<tr class="${c === 'choice' ? 'sep' : ''}"><td class="cat">${CAT_NAMES[c]}</td>${players.map((p, i) => {
      const val = sc(p)[c];
      if (val != null) return `<td class="done ${v.lastScore && v.lastScore.pid === p.id && v.lastScore.cat === c ? 'flash' : ''}">${val}</td>`;
      if (i === v.turn && !v.over && v.rolls > 0) {
        const pot = scoreFor(c, v.dice);
        return `<td class="pot ${mine ? 'pick' : ''} ${pot ? '' : 'zero'}" ${mine ? `data-cat="${c}"` : ''}>${pot}</td>`;
      }
      return '<td></td>';
    }).join('')}</tr>`;
    const tot = (p) => totals(sc(p));
    root.querySelector('.y-table').innerHTML = `
      <thead>${head}</thead><tbody>
      ${UPPER.map(row).join('')}
      <tr class="sub"><td class="cat">소계 <small>(63↑ 보너스 +35)</small></td>${players.map((p) => `<td>${tot(p).upper}<small>/63</small>${tot(p).bonus ? ' <b class="bonus">+35</b>' : ''}</td>`).join('')}</tr>
      ${CATS.slice(6).map(row).join('')}
      <tr class="total"><td class="cat">총점</td>${players.map((p) => `<td>${tot(p).total}</td>`).join('')}</tr>
      </tbody>`;
  }

  function startRollAnim() {
    clearInterval(anim);
    let k = 0;
    anim = setInterval(() => {
      renderDice(true);
      if (++k >= 7) {
        clearInterval(anim);
        anim = null;
        renderDice(false);
        render();
      }
    }, 70);
  }

  return {
    mount(el, a) {
      root = el;
      api = a;
      root.innerHTML = `<div class="yacht">
        <div class="y-status gbanner"></div>
        <div class="y-board">
          <div class="y-play">
            <div class="y-round"></div>
            <div class="y-dice"></div>
            <button class="btn primary lg y-rollbtn" type="button">🎲 굴리기</button>
          </div>
          <div class="y-table-wrap"><table class="y-table"></table></div>
        </div>
      </div>`;
      root.addEventListener('click', (e) => {
        if (!view) return;
        const h = e.target.closest('[data-hold]');
        if (h && !h.disabled) {
          view.held[Number(h.dataset.hold)] = !view.held[Number(h.dataset.hold)];
          renderDice(false);
          api.send({ type: 'hold', i: Number(h.dataset.hold) });
        }
        if (e.target.closest('.y-rollbtn')) api.send({ type: 'roll' });
        const c = e.target.closest('[data-cat]');
        if (c) {
          const cat = c.dataset.cat;
          const pot = scoreFor(cat, view.dice);
          if (pot === 0) {
            openModal({ title: '0점으로 기록할까요?', body: `<p><b>${CAT_NAMES[cat]}</b> 칸에 0점을 기록해요.</p>`, actions: [{ label: '취소' }, { label: '기록하기', cls: 'primary', onClick: () => api.send({ type: 'score', cat }) }] });
          } else api.send({ type: 'score', cat });
        }
      });
    },
    update(v) {
      const rolled = view && v.rollId !== lastRoll && lastRoll >= 0 && v.rolls > 0;
      lastRoll = v.rollId;
      view = v;
      render();
      if (rolled) startRollAnim();
    },
    myTurn: (v) => !!v && !v.over && v.players[v.turn]?.id === api.me(),
    unmount() {
      clearInterval(anim);
    },
  };
}
