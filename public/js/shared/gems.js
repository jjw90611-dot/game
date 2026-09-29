// 보석 상인 카드/귀족 정의 (서버와 화면에서 함께 사용)
// 색: 0 다이아(흰색), 1 사파이어(파랑), 2 에메랄드(초록), 3 루비(빨강), 4 오닉스(검정), 5 황금
export const GEM_NAMES = ['다이아', '사파이어', '에메랄드', '루비', '오닉스', '황금'];

const T1 = [
  [{ 1: 1, 2: 1, 3: 1, 4: 1 }, 0], [{ 1: 1, 2: 2, 3: 1, 4: 1 }, 0], [{ 1: 2, 2: 2, 4: 1 }, 0], [{ 1: 3 }, 0],
  [{ 2: 2, 3: 1 }, 0], [{ 1: 2, 3: 2 }, 0], [{ 0: 1, 1: 3, 3: 1 }, 0], [{ 2: 4 }, 1],
];
const T2 = [
  [{ 1: 2, 2: 2, 3: 3 }, 1], [{ 0: 2, 2: 3, 4: 3 }, 1], [{ 1: 1, 2: 4, 4: 2 }, 2],
  [{ 3: 5 }, 2], [{ 1: 3, 4: 5 }, 2], [{ 0: 6 }, 3],
];
const T3 = [
  [{ 1: 3, 2: 3, 3: 5, 4: 3 }, 3], [{ 2: 7 }, 4], [{ 0: 3, 2: 6, 4: 3 }, 4], [{ 0: 3, 2: 7 }, 5],
];

export const CARDS = (() => {
  const out = [];
  [T1, T2, T3].forEach((patterns, tier) => {
    for (const [pat, pts] of patterns) {
      for (let c = 0; c < 5; c++) {
        const cost = [0, 0, 0, 0, 0];
        for (const [off, n] of Object.entries(pat)) cost[(c + Number(off)) % 5] += n;
        out.push({ id: out.length, tier, color: c, pts, cost });
      }
    }
  });
  return out;
})();

export const NOBLES = (() => {
  const out = [];
  for (let c = 0; c < 5; c++) {
    const req = [0, 0, 0, 0, 0];
    req[c] = 4; req[(c + 1) % 5] = 4;
    out.push({ id: out.length, req, pts: 3 });
  }
  for (let c = 0; c < 5; c++) {
    const req = [0, 0, 0, 0, 0];
    req[c] = 3; req[(c + 1) % 5] = 3; req[(c + 2) % 5] = 3;
    out.push({ id: out.length, req, pts: 3 });
  }
  return out;
})();

// 카드를 사는 데 필요한 보석(색별 지불, 황금 사용량). 살 수 없으면 null
export function payment(player, cardId) {
  const card = CARDS[cardId];
  const pay = [0, 0, 0, 0, 0, 0];
  let gold = 0;
  for (let k = 0; k < 5; k++) {
    const need = Math.max(0, card.cost[k] - player.bonus[k]);
    const use = Math.min(need, player.tok[k]);
    pay[k] = use;
    gold += need - use;
  }
  if (gold > player.tok[5]) return null;
  pay[5] = gold;
  return pay;
}
