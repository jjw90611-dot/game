// 러미 타일 규칙 (서버 검증과 화면 미리보기에서 함께 사용)
// 타일 번호: 0~103 = 색(4) × 숫자(13) × 2세트, 104·105 = 조커
export const COLORS = ['빨강', '파랑', '주황', '검정'];

export function tile(id) {
  if (id >= 104) return { id, j: true };
  const k = id % 52;
  return { id, c: Math.floor(k / 13), n: (k % 13) + 1 };
}

export function tileValue(id) {
  const t = tile(id);
  return t.j ? 30 : t.n;
}

// 조합을 분석해 올바른지, 점수, 표시 순서를 알려줍니다.
export function analyzeSet(ids) {
  const L = ids.length;
  if (L < 3) return { ok: false, why: '3개 이상 필요해요' };
  const ts = ids.map(tile);
  const js = ts.filter((t) => t.j);
  const ns = ts.filter((t) => !t.j);
  if (!ns.length) return { ok: false };
  let best = null;
  // 그룹: 같은 숫자, 서로 다른 색 3~4개
  if (L <= 4) {
    const n = ns[0].n;
    const colors = new Set(ns.map((t) => t.c));
    if (ns.every((t) => t.n === n) && colors.size === ns.length) {
      best = {
        ok: true, kind: 'group', value: n * L,
        order: [...ns.slice().sort((a, b) => a.c - b.c).map((t) => t.id), ...js.map((t) => t.id)],
      };
    }
  }
  // 런: 같은 색 연속 숫자 3개 이상
  if (L <= 13) {
    const c = ns[0].c;
    const nums = ns.map((t) => t.n).sort((a, b) => a - b);
    if (ns.every((t) => t.c === c) && new Set(nums).size === nums.length) {
      const min = nums[0], max = nums[nums.length - 1];
      const span = max - min + 1;
      if (span <= L) {
        const extra = L - span;
        const up = Math.min(extra, 13 - max);
        const start = min - (extra - up);
        if (start >= 1) {
          const byN = new Map(ns.map((t) => [t.n, t.id]));
          const jq = js.map((t) => t.id);
          const order = [];
          for (let v = start; v < start + L; v++) order.push(byN.has(v) ? byN.get(v) : jq.shift());
          const value = (L * (2 * start + L - 1)) / 2;
          if (!best || value > best.value) best = { ok: true, kind: 'run', value, order, start };
        }
      }
    }
  }
  return best || { ok: false, why: '올바른 조합이 아니에요' };
}

export function setKey(ids) {
  return ids.slice().sort((a, b) => a - b).join(',');
}

// 테이블 제안을 검증합니다. 문제가 없으면 null, 있으면 오류 메시지를 돌려줘요.
export function checkProposal(oldTable, rack, proposal, melded) {
  if (!Array.isArray(proposal) || proposal.length > 80) return '잘못된 요청이에요.';
  const flat = [];
  for (const set of proposal) {
    if (!Array.isArray(set) || !set.length) return '잘못된 요청이에요.';
    for (const id of set) {
      if (!Number.isInteger(id) || id < 0 || id > 105) return '잘못된 타일이에요.';
      flat.push(id);
    }
  }
  if (new Set(flat).size !== flat.length) return '같은 타일이 두 번 있어요.';
  const newSet = new Set(flat);
  for (const id of oldTable.flat()) if (!newSet.has(id)) return '바닥의 타일은 가져갈 수 없어요.';
  const oldSet = new Set(oldTable.flat());
  const rackSet = new Set(rack);
  const added = flat.filter((id) => !oldSet.has(id));
  for (const id of added) if (!rackSet.has(id)) return '가지고 있지 않은 타일이에요.';
  if (!added.length) return '타일을 한 개 이상 내려놓아야 해요.';
  const res = proposal.map(analyzeSet);
  if (res.some((r) => !r.ok)) return '올바르지 않은 조합이 있어요.';
  if (!melded) {
    const keys = proposal.map(setKey);
    const used = new Array(keys.length).fill(false);
    for (const old of oldTable) {
      const k = setKey(old);
      const idx = keys.findIndex((x, i) => !used[i] && x === k);
      if (idx < 0) return '등록 전에는 바닥의 조합을 바꿀 수 없어요.';
      used[idx] = true;
    }
    let value = 0;
    res.forEach((r, i) => { if (!used[i]) value += r.value; });
    if (value < 30) return `첫 등록은 30점 이상이어야 해요. (지금 ${value}점)`;
  }
  return null;
}

export function meldValue(oldTable, proposal) {
  const keys = proposal.map(setKey);
  const used = new Array(keys.length).fill(false);
  for (const old of oldTable) {
    const idx = keys.findIndex((x, i) => !used[i] && x === setKey(old));
    if (idx >= 0) used[idx] = true;
  }
  let value = 0;
  proposal.forEach((set, i) => {
    if (used[i]) return;
    const r = analyzeSet(set);
    if (r.ok) value += r.value;
  });
  return value;
}
