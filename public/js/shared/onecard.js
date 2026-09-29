// 컬러 원카드 카드 정의 (서버와 화면에서 함께 사용)
// c: 0 빨강, 1 노랑, 2 초록, 3 파랑, 4 와일드
// v: '0'~'9', 'skip', 'rev', 'draw2', 'wild', 'wild4'
export const COLOR_NAMES = ['빨강', '노랑', '초록', '파랑'];

export const DECK = (() => {
  const d = [];
  for (let c = 0; c < 4; c++) {
    d.push({ c, v: '0' });
    for (let n = 1; n <= 9; n++) { d.push({ c, v: String(n) }); d.push({ c, v: String(n) }); }
    for (const v of ['skip', 'rev', 'draw2']) { d.push({ c, v }); d.push({ c, v }); }
  }
  for (let k = 0; k < 4; k++) d.push({ c: 4, v: 'wild' });
  for (let k = 0; k < 4; k++) d.push({ c: 4, v: 'wild4' });
  return d.map((card, id) => ({ ...card, id }));
})();

export function canPlay(id, topId, color) {
  const card = DECK[id], top = DECK[topId];
  if (!card || !top) return false;
  return card.c === 4 || card.c === color || card.v === top.v;
}
