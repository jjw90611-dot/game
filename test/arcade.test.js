import test from 'node:test';
import assert from 'node:assert/strict';
import arcade, { ARCADE_MODES } from '../src/games/arcade.js';

const players = [
  { id: 'a', name: '파랑 팀' },
  { id: 'b', name: '분홍 팀' },
  { id: 'c', name: '노랑 팀' },
];
const ctx = { now: 1_000, rng: () => 0.42 };

test('팀 아케이드에 서로 다른 미니게임 25종이 등록되어 있다', () => {
  assert.equal(ARCADE_MODES.length, 25);
  assert.equal(new Set(ARCADE_MODES.map(([id]) => id)).size, 25);
  assert.equal(new Set(ARCADE_MODES.map(([, name]) => name)).size, 25);
});

test('각 팀의 점수를 모아 가장 높은 팀을 승자로 정한다', () => {
  const state = arcade.setup(players, { mode: 'tap', duration: 60 }, ctx);
  arcade.action(state, 'a', { type: 'finish', score: 720, detail: '72회 연타' }, ctx);
  arcade.action(state, 'b', { type: 'finish', score: 910, detail: '91회 연타' }, ctx);
  arcade.action(state, 'c', { type: 'finish', score: 640, detail: '64회 연타' }, ctx);
  assert.deepEqual(state.over.winners, ['b']);
  assert.match(state.over.text, /분홍 팀/);
  assert.equal(state.deadline, null);
});

test('점수는 안전한 범위로 제한하고 중복 제출을 거부한다', () => {
  const state = arcade.setup(players.slice(0, 2), { mode: 'rhythm', duration: 45 }, ctx);
  arcade.action(state, 'a', { type: 'finish', score: 50000, detail: '<b>기록</b>' }, ctx);
  assert.equal(state.scores.a, 1000);
  assert.equal(state.details.a, 'b기록/b');
  assert.throws(() => arcade.action(state, 'a', { type: 'finish', score: 2 }, ctx), /이미 결과/);
});

test('제한 시간이 끝나면 미제출 팀은 0점으로 마감한다', () => {
  const state = arcade.setup(players, { mode: 'safe', duration: 90 }, ctx);
  arcade.action(state, 'a', { type: 'finish', score: 450, detail: '성공' }, ctx);
  arcade.timeout(state, { ...ctx, now: state.deadline });
  assert.deepEqual(state.over.winners, ['a']);
  assert.equal(state.scores.b, 0);
  assert.equal(state.done.c, true);
});
