// 모든 게임을 무작위로 끝까지 진행해 보는 테스트
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GAMES as META } from '../public/js/catalog.js';

// 등록 여부와 상관없이 만들어진 게임 규칙 파일을 모두 테스트
const MODULES = {};
for (const id of Object.keys(META)) {
  try {
    MODULES[id] = (await import(`../src/games/${id}.js`)).default;
  } catch (e) {
    if (e.code !== 'ERR_MODULE_NOT_FOUND') throw e;
  }
}

const rand = (n) => Math.floor(Math.random() * n);
const pickOne = (a) => a[rand(a.length)];
const shuffled = (a) => a.map((x) => [Math.random(), x]).sort((p, q) => p[0] - q[0]).map((p) => p[1]);

// 봇(auto)이 없는 게임을 위한 무작위 행동
const RANDOM = {
  liar(st, pid) {
    const others = st.players.filter((p) => p.id !== pid).map((p) => p.id);
    const r = Math.random();
    if (r < 0.3) return { type: 'hint', text: pickOne(['동그래요', '맛있어요', '커요', '작아요']) };
    if (r < 0.45) return { type: 'skip' };
    if (r < 0.8) return { type: 'vote', target: pickOne(others) };
    return { type: 'guess', text: Math.random() < 0.5 ? st.word : '몰라' };
  },
  mafia(st, pid) {
    const targets = st.players.map((p) => p.id);
    const r = Math.random();
    if (r < 0.4) return { type: 'night', target: pickOne(targets) };
    if (r < 0.5) return { type: 'skip' };
    if (r < 0.8) return { type: 'vote', target: Math.random() < 0.1 ? 'none' : pickOne(targets) };
    return { type: 'confirm', yes: Math.random() < 0.6 };
  },
  drawguess(st, pid) {
    return { type: 'choose', i: rand(3) };
  },
};

// 채팅으로 진행되는 게임(그림 맞히기) 시뮬레이션
const CHAT = {
  drawguess(st, pid) {
    return Math.random() < 0.3 && st.word ? st.word : '사과';
  },
};

function simulate(id, n, opts = {}, maxSteps = 6000) {
  const mod = MODULES[id];
  const players = Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `P${i}` }));
  const clock = { t: 1_000_000 };
  const vol = {};
  const ctx = () => ({ now: clock.t, rng: Math.random, sys: () => {}, vol });
  let st = mod.setup(players, opts, ctx());
  let steps = 0;
  let errors = 0;
  while (!st.over && steps < maxSteps) {
    steps++;
    for (const p of players) mod.view(st, p.id);
    mod.view(st, null);
    const actors = mod.actors(st);
    let acted = false;
    // 가끔 무작위 행동 (실패하면 원래 상태로 되돌림 → 서버와 같은 동작)
    if (RANDOM[id] && Math.random() < 0.7) {
      const pid = pickOne(players).id;
      const backup = structuredClone(st);
      try {
        mod.action(st, pid, RANDOM[id](st, pid), ctx());
        acted = true;
      } catch (e) {
        if (!e.user) throw e;
        st = backup;
        errors++;
      }
    }
    if (!acted && CHAT[id] && mod.chat && Math.random() < 0.5) {
      const pid = pickOne(players).id;
      try {
        const r = mod.chat(st, pid, CHAT[id](st, pid), ctx());
        if (r?.changed) acted = true;
      } catch (e) {
        if (!e.user) throw e;
      }
    }
    if (!acted) {
      for (const pid of shuffled(actors)) {
        const a = mod.auto?.(st, pid, ctx());
        if (!a) continue;
        mod.action(st, pid, a, ctx());
        acted = true;
        break;
      }
    }
    if (!acted) {
      assert.ok(st.deadline, `${id}: 진행할 수 없는 상태 (deadline 없음) phase=${st.phase}`);
      clock.t = Math.max(clock.t, st.deadline);
      mod.timeout(st, ctx());
    }
    clock.t += 50 + rand(400);
  }
  return { st, steps, errors };
}

for (const id of Object.keys(MODULES)) {
  const meta = META[id];
  test(`${meta.name}(${id}) 무작위 게임이 정상적으로 끝나요`, () => {
    const runs = 60;
    for (let k = 0; k < runs; k++) {
      const n = meta.min + rand(meta.max - meta.min + 1);
      const opts = {};
      for (const o of meta.options || []) opts[o.key] = pickOne(o.choices)[0];
      const { st, steps } = simulate(id, n, opts);
      assert.ok(st.over, `${id} (${n}명) 게임이 ${steps}단계 안에 끝나지 않았어요`);
      assert.ok(Array.isArray(st.over.winners), 'winners 배열');
      assert.equal(typeof st.over.text, 'string');
      JSON.stringify(st); // 저장 가능한 상태인지
    }
  });
}

test('숨겨진 정보가 다른 사람에게 보이지 않아요', () => {
  const ctx = { now: 1, rng: Math.random, sys: () => {}, vol: {} };
  const players = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }, { id: 'd', name: 'D' }, { id: 'e', name: 'E' }];
  // 러미: 남의 타일
  const r = MODULES.rummy.setup(players.slice(0, 3), {}, ctx);
  const va = MODULES.rummy.view(r, 'a');
  assert.equal(va.rack.length, 14);
  assert.equal(va.racks, undefined);
  assert.equal(MODULES.rummy.view(r, null).rack, null);
  // 라이어: 라이어는 제시어를 모름
  const l = MODULES.liar.setup(players, { fool: 0 }, ctx);
  const liarView = MODULES.liar.view(l, l.liar);
  assert.equal(liarView.myWord, null);
  assert.equal(liarView.amLiar, true);
  const citizen = players.find((p) => p.id !== l.liar).id;
  assert.equal(MODULES.liar.view(l, citizen).myWord, l.word);
  assert.equal(JSON.stringify(MODULES.liar.view(l, null)).includes(l.word), false);
  assert.equal(JSON.stringify(liarView).includes(`"${l.word}"`), false);
  // 마피아: 시민은 남의 역할을 모름
  const m = MODULES.mafia.setup(players, {}, ctx);
  const cit = players.find((p) => m.roles[p.id] !== 'mafia').id;
  const cv = MODULES.mafia.view(m, cit);
  assert.deepEqual(Object.keys(cv.roles), [cit]);
  // 원카드: 남의 손패
  const o = MODULES.onecard.setup(players.slice(0, 3), {}, ctx);
  const ov = MODULES.onecard.view(o, 'a');
  assert.equal(ov.hand.length, 7);
  assert.equal(JSON.stringify(ov).includes('"hands"'), false);
  // 숫자 암호: 상대 숫자는 null
  const nc = MODULES.numbercode.setup(players.slice(0, 2), {}, ctx);
  const nv = MODULES.numbercode.view(nc, 'a');
  const other = nc.players.find((p) => p.id !== 'a').id;
  assert.ok(nv.hands[other].every((t) => t.n === null));
  assert.ok(nv.hands.a.every((t) => t.n !== null));
});

test('오목 쌍삼 금지', async () => {
  const { isDoubleThree, N } = await import('../src/games/omok.js');
  const b = Array(N * N).fill(0);
  const at = (x, y) => y * N + x;
  // 가로 열린 3과 세로 열린 3이 (7,7)에서 만나는 모양
  b[at(5, 7)] = 1; b[at(6, 7)] = 1;
  b[at(7, 5)] = 1; b[at(7, 6)] = 1;
  b[at(7, 7)] = 1;
  assert.equal(isDoubleThree(b, at(7, 7)), true);
  const b2 = Array(N * N).fill(0);
  b2[at(5, 7)] = 1; b2[at(6, 7)] = 1; b2[at(7, 7)] = 1;
  assert.equal(isDoubleThree(b2, at(7, 7)), false);
});

test('러미 조합 판정', async () => {
  const { analyzeSet, checkProposal } = await import('../public/js/shared/rummy.js');
  const id = (c, n, copy = 0) => copy * 52 + c * 13 + (n - 1);
  assert.equal(analyzeSet([id(0, 3), id(0, 4), id(0, 5)]).ok, true);
  assert.equal(analyzeSet([id(0, 3), id(1, 3), id(2, 3)]).ok, true);
  assert.equal(analyzeSet([id(0, 3), id(0, 3, 1), id(2, 3)]).ok, false);
  assert.equal(analyzeSet([id(0, 3), 104, id(0, 5)]).value, 12);
  assert.equal(analyzeSet([104, 105, id(3, 13)]).value, 39); // 13 그룹(39) > 11-12-13 런(36)
  assert.equal(analyzeSet([id(0, 12), id(0, 13), id(0, 1)]).ok, false);
  const rack = [id(0, 10), id(0, 11), id(0, 12), id(1, 1)];
  assert.equal(checkProposal([], rack, [[id(0, 10), id(0, 11), id(0, 12)]], false), null);
  assert.match(checkProposal([], rack, [[id(0, 10), id(0, 11), id(1, 1)]], false), /올바르지/);
  assert.match(checkProposal([], [id(0, 1), id(0, 2), id(0, 3)], [[id(0, 1), id(0, 2), id(0, 3)]], false), /30점/);
});

test('요트 점수 계산', async () => {
  const { scoreFor } = await import('../src/games/yacht.js');
  assert.equal(scoreFor('fullhouse', [2, 2, 3, 3, 3]), 13);
  assert.equal(scoreFor('fullhouse', [2, 2, 3, 3, 4]), 0);
  assert.equal(scoreFor('sstraight', [1, 2, 3, 4, 6]), 15);
  assert.equal(scoreFor('lstraight', [2, 3, 4, 5, 6]), 30);
  assert.equal(scoreFor('yacht', [6, 6, 6, 6, 6]), 50);
  assert.equal(scoreFor('fourkind', [5, 5, 5, 5, 1]), 21);
  assert.equal(scoreFor('threes', [3, 3, 1, 2, 3]), 9);
});
