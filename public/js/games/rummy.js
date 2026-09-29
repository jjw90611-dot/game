// 러미 타일 화면
import { esc, avatar } from './common.js';
import { tile, analyzeSet, checkProposal, meldValue } from '../shared/rummy.js';

function tileHTML(id, { sel = false, fresh = false, dim = false } = {}) {
  const t = tile(id);
  return `<button type="button" class="rt ${t.j ? 'joker' : `c${t.c}`} ${sel ? 'sel' : ''} ${fresh ? 'fresh' : ''} ${dim ? 'dim' : ''}" data-tile="${id}">${t.j ? '<span class="jk">☺</span>' : t.n}</button>`;
}

export default function create() {
  let root, api, view;
  let draft = null; // { table: [[id]], rack: [id] }
  let sel = new Set();
  let fromRack = new Set();
  let sortMode = localStorage.getItem('bg_rummy_sort') || 'color';
  let wasMine = false;

  const isMine = () => view && !view.over && view.players[view.turn]?.id === api.me();

  function resetDraft() {
    draft = { table: view.table.map((s) => s.slice()), rack: (view.rack || []).slice() };
    fromRack = new Set(view.rack || []);
    sel = new Set();
  }

  function sortedRack() {
    const r = draft.rack.slice();
    const key = (id) => {
      const t = tile(id);
      if (t.j) return 1000;
      return sortMode === 'color' ? t.c * 100 + t.n : t.n * 10 + t.c;
    };
    return r.sort((a, b) => key(a) - key(b) || a - b);
  }

  function removeSelected() {
    const ids = [...sel];
    draft.rack = draft.rack.filter((id) => !sel.has(id));
    draft.table = draft.table.map((s) => s.filter((id) => !sel.has(id)));
    return ids;
  }

  function cleanTable() {
    draft.table = draft.table.filter((s) => s.length);
  }

  function render() {
    const v = view;
    const me = api.me();
    const mine = isMine();
    const melded = v.melded[me];
    // 참가자
    root.querySelector('.rm-top').innerHTML = `<div class="pstrip">${v.players.map((p, i) => `
      <div class="pchip ${i === v.turn && !v.over ? 'active' : ''} ${p.id === me ? 'me' : ''}">
        ${avatar(p.id, p.name, 'sm', api.isBot(p.id))}<div class="pc-main"><div class="pc-name">${esc(p.name)}</div>
        <div class="pc-sub">🀫 ${v.counts[p.id]}개 ${v.melded[p.id] ? '· 등록' : ''}</div></div></div>`).join('')}
      <div class="rm-pool">남은 타일<b>${v.pool}</b></div></div>`;
    // 상태
    const st = root.querySelector('.rm-status');
    const cur = v.players[v.turn];
    let msg;
    if (v.over) msg = '게임이 끝났어요!';
    else if (mine) {
      const val = meldValue(v.table, draft.table.filter((s) => s.length));
      msg = melded ? '내 차례! 타일을 내려놓거나 바닥을 재배치하세요' : `내 차례! 첫 등록은 30점 이상 · <b>현재 ${val}점</b>`;
    } else {
      const last = v.last && v.last.pid !== cur.id ? v.last : null;
      msg = `${esc(cur.name)}님 차례예요${last ? ` · ${esc(api.name(last.pid))}님이 ${last.drew ? '타일을 가져갔어요' : `${last.added.length}개를 내려놓았어요`}` : ''}`;
    }
    st.innerHTML = msg;
    st.classList.toggle('mine', mine);

    // 바닥
    const fresh = new Set(v.last?.added || []);
    const table = mine ? draft.table : v.table;
    const hasSel = sel.size > 0;
    const sets = table.map((s, k) => {
      if (!s.length) return '';
      const a = analyzeSet(s);
      const order = a.ok ? a.order : s;
      return `<div class="rm-set ${a.ok ? '' : 'bad'}" data-set="${k}">
        ${order.map((id) => tileHTML(id, { sel: sel.has(id), fresh: !mine && fresh.has(id), dim: mine && !melded && !fromRack.has(id) })).join('')}
        ${mine && hasSel ? `<button type="button" class="rm-add" data-addto="${k}">＋</button>` : ''}
      </div>`;
    }).join('');
    root.querySelector('.rm-table').innerHTML = sets || '<div class="rm-empty">아직 바닥에 타일이 없어요. 첫 등록은 30점 이상!</div>';

    // 버튼
    const changed = mine && JSON.stringify(draft.table) !== JSON.stringify(v.table);
    const err = mine && changed ? checkProposal(v.table, v.rack, draft.table.filter((s) => s.length), melded) : null;
    root.querySelector('.rm-controls').innerHTML = mine ? `
      <button class="btn sm" type="button" data-new ${hasSel ? '' : 'disabled'}>새 조합으로</button>
      <button class="btn sm" type="button" data-back ${hasSel ? '' : 'disabled'}>내 타일로</button>
      <button class="btn sm" type="button" data-reset ${changed ? '' : 'disabled'}>↺ 되돌리기</button>
      <span class="grow"></span>
      ${changed ? `<button class="btn primary" type="button" data-done ${err ? 'disabled' : ''}>✔ 완료</button>` : '<button class="btn accent" type="button" data-draw>타일 가져오기</button>'}
      ${changed && err ? `<div class="rm-err">${esc(err)}</div>` : ''}` : '';

    // 내 타일
    const rackBox = root.querySelector('.rm-rack');
    if (v.rack) {
      const rack = mine ? sortedRack() : draft ? sortedRack() : v.rack;
      rackBox.innerHTML = `<div class="rm-rack-head"><span>내 타일 ${rack.length}개</span>
        <button class="btn sm ghost" type="button" data-sort>${sortMode === 'color' ? '🔢 숫자순' : '🎨 색깔순'}</button></div>
        <div class="rm-tiles">${rack.map((id) => tileHTML(id, { sel: sel.has(id) })).join('')}</div>`;
    } else rackBox.innerHTML = '<div class="muted small" style="padding:8px">관전 중이에요</div>';

    if (v.over && v.racks) {
      rackBox.innerHTML += `<div class="rm-final">${v.players.map((p) => `<div><b>${esc(p.name)}</b> 남은 타일: ${v.racks[p.id].map((id) => tileHTML(id)).join('') || '없음 🎉'}</div>`).join('')}</div>`;
    }
  }

  return {
    mount(el, a) {
      root = el;
      api = a;
      root.innerHTML = `<div class="rummy">
        <div class="rm-top"></div>
        <div class="rm-status gbanner"></div>
        <div class="rm-table"></div>
        <div class="rm-controls"></div>
        <div class="rm-rack"></div>
      </div>`;
      root.addEventListener('click', (e) => {
        if (!view) return;
        const me = api.me();
        const mine = isMine();
        const add = e.target.closest('[data-addto]');
        if (add && mine) {
          const k = Number(add.dataset.addto);
          const target = draft.table[k];
          const ids = removeSelected();
          target.push(...ids);
          const r = analyzeSet(target);
          if (r.ok) draft.table[draft.table.indexOf(target)] = r.order;
          sel.clear();
          cleanTable();
          render();
          return;
        }
        const t = e.target.closest('[data-tile]');
        if (t) {
          const id = Number(t.dataset.tile);
          const onTable = !!t.closest('.rm-set');
          if (!mine) return;
          if (onTable && !view.melded[me] && !fromRack.has(id)) {
            api.toast('첫 등록 전에는 바닥의 타일을 옮길 수 없어요.', 'err');
            return;
          }
          if (sel.has(id)) sel.delete(id);
          else sel.add(id);
          render();
          return;
        }
        if (e.target.closest('[data-new]') && mine && sel.size) {
          const ids = removeSelected();
          draft.table.push(ids);
          const r = analyzeSet(ids);
          if (r.ok) draft.table[draft.table.length - 1] = r.order;
          sel.clear();
          cleanTable();
          render();
        }
        if (e.target.closest('[data-back]') && mine) {
          const bad = [...sel].filter((id) => !fromRack.has(id));
          if (bad.length) api.toast('원래 바닥에 있던 타일은 가져올 수 없어요.', 'err');
          const ok = [...sel].filter((id) => fromRack.has(id));
          draft.table = draft.table.map((s) => s.filter((id) => !ok.includes(id)));
          draft.rack.push(...ok.filter((id) => !draft.rack.includes(id)));
          sel = new Set(bad);
          cleanTable();
          render();
        }
        if (e.target.closest('[data-reset]')) {
          resetDraft();
          render();
        }
        if (e.target.closest('[data-done]')) api.send({ type: 'play', table: draft.table.filter((s) => s.length) });
        if (e.target.closest('[data-draw]')) api.send({ type: 'draw' });
        if (e.target.closest('[data-sort]')) {
          sortMode = sortMode === 'color' ? 'num' : 'color';
          localStorage.setItem('bg_rummy_sort', sortMode);
          render();
        }
      });
    },
    update(v) {
      const prev = view;
      view = v;
      const mine = isMine();
      if (!mine || !wasMine || !draft || (prev && prev.turn !== v.turn)) resetDraft();
      wasMine = mine;
      render();
    },
    myTurn: (v) => !!v && !v.over && v.players[v.turn]?.id === api.me(),
    unmount() {},
  };
}
