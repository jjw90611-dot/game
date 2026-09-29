// 요트 다이스 점수 규칙 (서버와 화면에서 함께 사용)
export const CATS = ['ones', 'twos', 'threes', 'fours', 'fives', 'sixes', 'choice', 'fourkind', 'fullhouse', 'sstraight', 'lstraight', 'yacht'];
export const CAT_NAMES = {
  ones: '1 (에이스)', twos: '2 (듀스)', threes: '3 (트레이)', fours: '4 (포)', fives: '5 (파이브)', sixes: '6 (식스)',
  choice: '초이스', fourkind: '포카드', fullhouse: '풀하우스', sstraight: 'S.스트레이트', lstraight: 'L.스트레이트', yacht: '요트',
};
export const UPPER = CATS.slice(0, 6);

export function scoreFor(cat, dice) {
  const cnt = [0, 0, 0, 0, 0, 0, 0];
  let sum = 0;
  for (const d of dice) { cnt[d]++; sum += d; }
  const idx = UPPER.indexOf(cat);
  if (idx >= 0) return cnt[idx + 1] * (idx + 1);
  const has = (seq) => seq.every((v) => cnt[v] > 0);
  switch (cat) {
    case 'choice': return sum;
    case 'fourkind': return cnt.some((c) => c >= 4) ? sum : 0;
    case 'fullhouse': {
      const c = cnt.filter((x) => x > 0).sort();
      return (c.length === 2 && c[0] === 2 && c[1] === 3) || c[0] === 5 ? sum : 0;
    }
    case 'sstraight': return has([1, 2, 3, 4]) || has([2, 3, 4, 5]) || has([3, 4, 5, 6]) ? 15 : 0;
    case 'lstraight': return has([1, 2, 3, 4, 5]) || has([2, 3, 4, 5, 6]) ? 30 : 0;
    case 'yacht': return cnt.some((c) => c === 5) ? 50 : 0;
  }
  return 0;
}

export function totals(sc) {
  let upper = 0, lower = 0;
  for (const c of UPPER) upper += sc[c] ?? 0;
  for (const c of CATS.slice(6)) lower += sc[c] ?? 0;
  const bonus = upper >= 63 ? 35 : 0;
  return { upper, bonus, total: upper + bonus + lower };
}
