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
  wordspy(st, pid) {
    const r = Math.random();
    const ops = st.players.filter((p) => st.teams[p.id] === st.turn && p.id !== st.spy[st.turn]).map((p) => p.id);
    if (st.phase === 'clue') return { _as: Math.random() < 0.9 ? st.spy[st.turn] : pid, type: 'clue', word: pickOne(['과일', '바다', '동물', '사과']), num: rand(4) };
    if (r < 0.1) return { _as: pickOne(ops), type: 'mark', i: rand(25) };
    if (r < 0.9) return { _as: Math.random() < 0.9 ? pickOne(ops) : pid, type: 'guess', i: rand(25) };
    return { _as: pickOne(ops), type: 'end' };
  },
  werewolf(st, pid) {
    const ids = st.players.map((p) => p.id);
    const r = Math.random();
    if (st.phase === 'night') {
      if (r < 0.3) return { type: 'night', target: pickOne(ids) };
      if (r < 0.5) return { type: 'night', targets: [pickOne(ids), pickOne(ids)] };
      if (r < 0.7) return { type: 'night', center: rand(3), centers: [0, 2] };
      return { type: 'night' };
    }
    if (st.phase === 'day') return { type: 'skip' };
    return { type: 'vote', target: pickOne(ids) };
  },
  coup(st, pid) {
    const ids = st.players.map((p) => p.id);
    const r = Math.random();
    const acts = ['income', 'foreign', 'coup', 'tax', 'assassinate', 'steal', 'exchange'];
    if (st.phase === 'action') return { _as: st.players[st.turn].id, type: 'act', action: pickOne(acts), target: pickOne(ids) };
    if (st.phase === 'lose') return { _as: st.pending.loser, type: 'lose', i: rand(2) };
    if (st.phase === 'exchange') return { _as: st.pending.actor, type: 'keep', idx: [0, 1, 2, 3].slice(0, 1 + rand(2)) };
    if (r < 0.2) return { type: 'challenge' };
    if (r < 0.4) return { type: 'block', role: pickOne(['duke', 'contessa', 'captain', 'ambassador']) };
    return { type: 'pass' };
  },
  indian(st) {
    const r = Math.random();
    const pid = st.players[st.turn]?.id;
    if (r < 0.2) return { _as: pid, type: 'raise', amt: 1 + rand(4) };
    if (r < 0.6) return { _as: pid, type: 'call' };
    return { _as: pid, type: 'fold' };
  },
  dice(st) {
    const pid = st.players[st.turn]?.id;
    if (Math.random() < 0.3) return { _as: pid, type: 'call' };
    return { _as: pid, type: 'bid', q: 1 + rand(8), f: 1 + rand(6) };
  },
  rankwar(st, pid) {
    const hand = st.hands[st.turnId] || [];
    if (Math.random() < 0.3) return { _as: st.turnId, type: 'pass' };
    const c = hand[rand(hand.length)];
    return { _as: st.turnId, type: 'play', cards: hand.filter((x) => x === c || x === 13).slice(0, 1 + rand(3)) };
  },
  spotit(st, pid) {
    return { type: 'match', sym: rand(57), center: st.center };
  },
  yut(st) {
    const pid = st.players[st.turn].id;
    if (st.phase === 'throw') return { _as: pid, type: 'throw' };
    return { _as: pid, type: 'move', r: rand(st.pend.length + 1), piece: rand(5) };
  },
  oneword(st, pid) {
    if (st.phase === 'guess') return { _as: st.guesser, type: 'guess', text: Math.random() < 0.5 ? st.word : '몰라' };
    return { type: 'clue', text: pickOne(['사과', '동그란', st.word, '두 단어', '빨강']) };
  },
  connect4(st) {
    return { _as: st.players[st.turn].id, type: 'drop', col: rand(8) };
  },
  relay(st, pid) {
    if (st.phase === 'album') return { type: 'next', book: st.album.book, page: st.album.page };
    if (Math.random() < 0.5) return { type: 'submit', text: '고양이가 춤춘다' };
    return { type: 'submit', strokes: [{ c: 1, w: 1, p: [10, 10, 200, 300, 400, 100] }] };
  },
};

// 채팅으로 진행되는 게임(그림 맞히기) 시뮬레이션
const CHAT = {
  drawguess(st, pid) {
    return Math.random() < 0.3 && st.word ? st.word : '사과';
  },
  song(st) {
    return Math.random() < 0.2 && st.song ? st.song.title : '몰라요';
  },
  chosung(st) {
    return Math.random() < 0.2 && st.word ? st.word : '몰라요';
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
      let pid = pickOne(players).id;
      const backup = structuredClone(st);
      try {
        const a = RANDOM[id](st, pid);
        if (a._as) pid = a._as;
        mod.action(st, pid, a, ctx());
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

test('같은 그림 찾기: 어떤 두 카드든 겹치는 그림이 딱 하나', async () => {
  const { makeCards } = await import('../src/games/spotit.js');
  const cards = makeCards();
  assert.equal(cards.length, 57);
  for (let a = 0; a < cards.length; a++) {
    assert.equal(new Set(cards[a]).size, 8);
    for (let b = a + 1; b < cards.length; b++) assert.equal(cards[a].filter((x) => cards[b].includes(x)).length, 1);
  }
});

test('윷놀이 지름길과 뒷도', async () => {
  const { path, back } = await import('../src/games/yut.js');
  assert.equal(path(null, null, 5).node, 'o5');
  assert.equal(path('o5', null, 3).node, 'c');
  assert.equal(path('c', 'A', 3).node, 'o0');
  assert.equal(path('o10', null, 6).node, 'o0');
  assert.equal(path('o10', null, 7).node, 'out');
  assert.equal(path('a2', 'A', 3).node, 'a4');
  assert.equal(path('o18', null, 3).node, 'out');
  assert.equal(back('o1', null).node, 'o0');
  assert.equal(back('c', 'A').node, 'a2');
});

test('노래 맞히기: 정답 인정 범위와 곡 목록', async () => {
  const { isAnswer } = await import('../src/games/song.js');
  const { SONGS } = await import('../src/games/songs.js');
  const apt = SONGS.latest.find((x) => x.y === 'ekr2nIex040');
  assert.ok(isAnswer(apt, 'apt'));
  assert.ok(isAnswer(apt, '아파트'));
  assert.ok(!isAnswer(apt, '아파'));
  const ids = new Set();
  for (const list of Object.values(SONGS)) for (const x of list) {
    assert.match(x.y, /^[A-Za-z0-9_-]{11}$/, x.title);
    assert.ok(!ids.has(x.y), `중복 곡 ${x.title}`);
    ids.add(x.y);
  }
});

test('초성 변환', async () => {
  const { chosung } = await import('../src/games/chosung.js');
  assert.equal(chosung('김치찌개'), 'ㄱㅊㅉㄱ');
});

test('인디언 포커: 내 카드는 안 보이고 남의 카드는 보여요', () => {
  const ctx = { now: 1, rng: Math.random, sys: () => {}, vol: {} };
  const ps = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }];
  const s = MODULES.indian.setup(ps, {}, ctx);
  const v = MODULES.indian.view(s, 'a');
  assert.equal(v.cards.a, null);
  assert.equal(v.cards.b, s.cards.b);
  const d = MODULES.dice.setup(ps, {}, ctx);
  const dv = MODULES.dice.view(d, 'a');
  assert.deepEqual(dv.dice.a, d.dice.a);
  assert.equal(dv.dice.b, null);
  const o = MODULES.oneword.setup(ps, {}, ctx);
  assert.equal(MODULES.oneword.view(o, o.guesser).word, null);
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

test('쿠데타: 의심과 막기 흐름', async () => {
  const coup = (await import('../src/games/coup.js')).default;
  const ctx = { now: 1, rng: Math.random, sys: () => {}, vol: {} };
  const players = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }];
  const fresh = () => {
    const s = coup.setup(players, {}, ctx);
    s.players = players.slice();
    s.turn = 0;
    s.coins = { a: 3, b: 2, c: 2 };
    return s;
  };
  const total = (s) => s.deck.length + Object.values(s.hands).flat().length;
  // 진짜 공작의 세금을 의심 → 의심한 사람이 카드를 잃음
  let s = fresh();
  s.hands.a = [{ role: 'duke', dead: false }, { role: 'captain', dead: false }];
  coup.action(s, 'a', { type: 'act', action: 'tax' }, ctx);
  coup.action(s, 'b', { type: 'challenge' }, ctx);
  assert.equal(s.phase, 'lose');
  assert.equal(s.pending.loser, 'b');
  coup.action(s, 'b', { type: 'lose', i: 0 }, ctx);
  assert.equal(s.coins.a, 6);
  assert.equal(total(s), 15);
  // 가짜 공작 → 거짓말한 사람이 카드를 잃고 동전 없음
  s = fresh();
  s.hands.a = [{ role: 'contessa', dead: false }, { role: 'captain', dead: false }];
  coup.action(s, 'a', { type: 'act', action: 'tax' }, ctx);
  coup.action(s, 'c', { type: 'challenge' }, ctx);
  assert.equal(s.pending.loser, 'a');
  coup.action(s, 'a', { type: 'lose', i: 1 }, ctx);
  assert.equal(s.coins.a, 3);
  assert.equal(s.hands.a[1].dead, true);
  // 암살 → 가짜 백작부인으로 막기 → 의심 → 두 장 모두 잃고 탈락
  s = fresh();
  s.hands.a = [{ role: 'assassin', dead: false }, { role: 'duke', dead: false }];
  s.hands.b = [{ role: 'duke', dead: false }, { role: 'captain', dead: false }];
  coup.action(s, 'a', { type: 'act', action: 'assassinate', target: 'b' }, ctx);
  assert.equal(s.coins.a, 0);
  coup.action(s, 'b', { type: 'block', role: 'contessa' }, ctx);
  assert.equal(s.phase, 'blockrespond');
  coup.action(s, 'a', { type: 'challenge' }, ctx);
  assert.equal(s.pending.loser, 'b');
  coup.action(s, 'b', { type: 'lose', i: 0 }, ctx);
  // 막기 실패 → 암살 진행 → 마지막 카드 자동 제거
  assert.ok(s.hands.b.every((c) => c.dead));
  assert.equal(s.turn, 2);
  assert.equal(total(s), 15);
  // 갈취를 진짜 사령관으로 막기 → 아무도 의심 안 함 → 막힘
  s = fresh();
  s.hands.b = [{ role: 'captain', dead: false }, { role: 'duke', dead: false }];
  coup.action(s, 'a', { type: 'act', action: 'steal', target: 'b' }, ctx);
  coup.action(s, 'b', { type: 'block', role: 'captain' }, ctx);
  coup.action(s, 'a', { type: 'pass' }, ctx);
  coup.action(s, 'c', { type: 'pass' }, ctx);
  assert.equal(s.coins.b, 2);
  assert.equal(s.turn, 1);
});

test('하룻밤 늑대인간: 밤 순서와 승패', async () => {
  const ww = (await import('../src/games/werewolf.js')).default;
  const ctx = { now: 1, rng: Math.random, sys: () => {}, vol: {} };
  const players = ['a', 'b', 'c', 'd'].map((id) => ({ id, name: id.toUpperCase() }));
  const s = ww.setup(players, {}, ctx);
  s.players = players.slice();
  Object.assign(s.initial, { a: 'werewolf', b: 'seer', c: 'robber', d: 'troublemaker' });
  Object.assign(s.cards, s.initial);
  s.center = ['werewolf', 'villager', 'insomniac'];
  ww.action(s, 'a', { type: 'night', center: 1 }, ctx);
  ww.action(s, 'b', { type: 'night', target: 'c' }, ctx);
  ww.action(s, 'c', { type: 'night', target: 'a' }, ctx); // 강도가 늑대인간 카드를 훔침
  ww.action(s, 'd', { type: 'night', targets: ['c', 'b'] }, ctx); // 말썽쟁이가 강도(이제 늑대)와 예언자를 바꿈
  ww.timeout(s, { ...ctx, now: s.deadline });
  assert.equal(s.cards.a, 'robber');
  assert.equal(s.cards.b, 'werewolf');
  assert.equal(s.cards.c, 'seer');
  assert.match(s.info.b[0], /강도/); // 예언자는 바뀌기 전 카드를 봄
  assert.match(s.info.c[0], /늑대인간/);
  // b(현재 늑대인간)에게 투표 → 마을 승리
  ww.timeout(s, { ...ctx, now: s.deadline });
  for (const id of ['a', 'c', 'd']) ww.action(s, id, { type: 'vote', target: 'b' }, ctx);
  ww.action(s, 'b', { type: 'vote', target: 'a' }, ctx);
  assert.deepEqual(s.dead, ['b']);
  assert.ok(s.over.winners.includes('a') && s.over.winners.includes('c') && !s.over.winners.includes('b'));
});
