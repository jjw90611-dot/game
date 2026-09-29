import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildRoleList, privateRolePayload, missionSucceeded, ROLE_META,
  PLAYER_RULES, createRoomState, roleSide
} from '../src/game-core.js';

test('Korean edition player counts and mission team sizes match 5-10 player rules', () => {
  assert.deepEqual(PLAYER_RULES, {
    5: { good: 3, evil: 2, teams: [2, 3, 2, 3, 3] },
    6: { good: 4, evil: 2, teams: [2, 3, 4, 3, 4] },
    7: { good: 4, evil: 3, teams: [2, 3, 3, 4, 4] },
    8: { good: 5, evil: 3, teams: [3, 4, 4, 5, 5] },
    9: { good: 6, evil: 3, teams: [3, 4, 4, 5, 5] },
    10: { good: 6, evil: 4, teams: [3, 4, 4, 5, 5] }
  });
});

test('new room defaults to Korean beginner recommendation: Percival + Mordred on', () => {
  const room = createRoomState({ code: 'ABCDE', clientId: 'p1', name: 'P1' });
  assert.equal(room.roleOptions.percival, true);
  assert.equal(room.roleOptions.mordred, true);
  assert.equal(room.roleOptions.morgana, false);
  assert.equal(room.roleOptions.oberon, false);
  assert.equal(room.roleOptions.ladyOfLake, false);
  assert.equal(room.roleOptions.lancelot, false);
  assert.equal(room.roleOptions.excalibur, false);
});

test('5-player role list has 3 good and 2 evil', () => {
  const roles = buildRoleList(5, { percival: true, morgana: true, mordred: false, oberon: false });
  assert.equal(roles.length, 5);
  assert.equal(roles.filter(r => ROLE_META[r].side === 'good').length, 3);
  assert.equal(roles.filter(r => ROLE_META[r].side === 'evil').length, 2);
  assert.ok(roles.includes('merlin'));
  assert.ok(roles.includes('assassin'));
});

test('Lancelot option adds one good and one evil Lancelot while preserving faction counts', () => {
  const roles = buildRoleList(7, { percival: true, mordred: true, lancelot: true });
  assert.equal(roles.length, 7);
  assert.equal(roles.filter(r => ROLE_META[r].side === 'good').length, 4);
  assert.equal(roles.filter(r => ROLE_META[r].side === 'evil').length, 3);
  assert.equal(roles.filter(r => r === 'lancelot_good').length, 1);
  assert.equal(roles.filter(r => r === 'lancelot_evil').length, 1);
});

test('Merlin cannot see Mordred and Percival sees Merlin/Morgana candidates', () => {
  const players = [
    { clientId: 'm', name: 'Merlin', role: 'merlin' },
    { clientId: 'p', name: 'Percival', role: 'percival' },
    { clientId: 'a', name: 'Assassin', role: 'assassin' },
    { clientId: 'g', name: 'Morgana', role: 'morgana' },
    { clientId: 'd', name: 'Mordred', role: 'mordred' },
    { clientId: 's', name: 'Servant', role: 'servant' },
    { clientId: 'x', name: 'Servant2', role: 'servant' }
  ];
  const merlin = privateRolePayload(players, players[0]);
  assert.deepEqual(new Set(merlin.knownPlayers.map(x => x.clientId)), new Set(['a', 'g']));
  const percival = privateRolePayload(players, players[1]);
  assert.deepEqual(new Set(percival.knownPlayers.map(x => x.clientId)), new Set(['m', 'g']));
});

test('evil Lancelot is visible to ordinary evil but does not see the evil team', () => {
  const players = [
    { clientId: 'a', name: 'Assassin', role: 'assassin', currentSide: 'evil' },
    { clientId: 'l', name: 'Evil Lancelot', role: 'lancelot_evil', currentSide: 'evil' },
    { clientId: 'm', name: 'Merlin', role: 'merlin', currentSide: 'good' },
    { clientId: 's', name: 'Servant', role: 'servant', currentSide: 'good' },
    { clientId: 'p', name: 'Percival', role: 'percival', currentSide: 'good' }
  ];
  const assassin = privateRolePayload(players, players[0], { lancelot: true });
  assert.ok(assassin.knownPlayers.some(x => x.clientId === 'l'));
  const evilLancelot = privateRolePayload(players, players[1], { lancelot: true });
  assert.equal(evilLancelot.knownPlayers.length, 0);
  players[1].currentSide = 'good';
  assert.equal(roleSide(players[1]), 'good');
});

test('7+ player fourth mission needs two fails', () => {
  assert.equal(missionSucceeded({ playerCount: 7, missionNo: 4, failCount: 1 }).success, true);
  assert.equal(missionSucceeded({ playerCount: 7, missionNo: 4, failCount: 2 }).success, false);
  assert.equal(missionSucceeded({ playerCount: 6, missionNo: 4, failCount: 1 }).success, false);
});


test('Percival knows Merlin exactly without Morgana, but sees two indistinguishable candidates with Morgana', () => {
  const base = [
    { clientId:'p1', name:'Percival', role:'percival', currentSide:'good' },
    { clientId:'p2', name:'Merlin', role:'merlin', currentSide:'good' },
    { clientId:'p3', name:'Assassin', role:'assassin', currentSide:'evil' }
  ];
  const noMorgana = privateRolePayload(base, base[0], { morgana:false });
  assert.deepEqual(noMorgana.knownPlayers.map(p => [p.name,p.hint]), [['Merlin','멀린']]);

  const withMorganaPlayers = [...base, { clientId:'p4', name:'Morgana', role:'morgana', currentSide:'evil' }];
  const withMorgana = privateRolePayload(withMorganaPlayers, withMorganaPlayers[0], { morgana:true });
  assert.deepEqual(new Set(withMorgana.knownPlayers.map(p => p.name)), new Set(['Merlin','Morgana']));
  assert.ok(withMorgana.knownPlayers.every(p => p.hint === '멀린 또는 모르가나'));
});
