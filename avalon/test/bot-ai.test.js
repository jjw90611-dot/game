import test from 'node:test';
import assert from 'node:assert/strict';
import {
  knownEvilIds, chooseBotTeam, decideBotTeamVote, decideBotMissionVote,
  chooseBotAssassinationTarget, nextBotPersona, proposalSpeech, missionReactionSpeech
} from '../src/bot-ai.js';

function roomBase() {
  return {
    code: 'ABCDE', missionNo: 1, rejectionCount: 0, missionScores: { good: 0, evil: 0 }, history: [],
    roleOptions: {}, currentTeam: [], lady: { holders: [] },
    players: [
      { clientId: 'b1', name: '가웨인 · CPU', isParticipant: true, isBot: true, role: 'assassin', currentSide: 'evil' },
      { clientId: 'p2', name: 'P2', isParticipant: true, isBot: false, role: 'mordred', currentSide: 'evil' },
      { clientId: 'p3', name: 'P3', isParticipant: true, isBot: false, role: 'merlin', currentSide: 'good' },
      { clientId: 'p4', name: 'P4', isParticipant: true, isBot: false, role: 'percival', currentSide: 'good' },
      { clientId: 'p5', name: 'P5', isParticipant: true, isBot: false, role: 'servant', currentSide: 'good' }
    ]
  };
}

test('bot persona roster rotates without reusing an available persona', () => {
  const first = nextBotPersona([]);
  const second = nextBotPersona([{ isBot: true, botPersonaKey: first.key }]);
  assert.notEqual(first.key, second.key);
});

test('evil bot only gets evil-team knowledge allowed by its role', () => {
  const room = roomBase();
  const bot = room.players[0];
  const known = knownEvilIds(room, bot);
  assert.ok(known.has('b1'));
  assert.ok(known.has('p2'));
  assert.equal(known.has('p3'), false);
});

test('evil bot leader builds a team that includes an evil presence and can argue for it', () => {
  const room = roomBase();
  const bot = room.players[0];
  const team = chooseBotTeam(room, bot, 2);
  assert.equal(team.length, 2);
  assert.ok(team.includes('b1'));
  const speech = proposalSpeech(room, bot, team);
  assert.equal(typeof speech, 'string');
  assert.ok(speech.length > 10);
});

test('good bot rejects a team containing evil it is allowed to know', () => {
  const room = roomBase();
  room.players[0] = { clientId: 'b1', name: '멀린봇', isParticipant: true, isBot: true, role: 'merlin', currentSide: 'good' };
  room.currentTeam = ['b1', 'p2']; // Mordred is invisible to Merlin, so should not be auto-rejected just from secret info.
  const voteAgainstMordredOnly = decideBotTeamVote(room, room.players[0]);
  assert.equal(typeof voteAgainstMordredOnly, 'boolean');
  room.players[1].role = 'assassin';
  const voteAgainstVisibleEvil = decideBotTeamVote(room, room.players[0]);
  assert.equal(voteAgainstVisibleEvil, false);
});

test('evil bot can strategically fail a mission while good bot always succeeds', () => {
  const room = roomBase();
  room.currentTeam = ['b1', 'p5'];
  assert.equal(decideBotMissionVote(room, room.players[0]), false);
  const goodBot = { clientId: 'g1', name: '선봇', isParticipant: true, isBot: true, role: 'servant', currentSide: 'good' };
  room.players.push(goodBot);
  room.currentTeam = ['g1', 'p5'];
  assert.equal(decideBotMissionVote(room, goodBot), true);
});

test('bot assassin never deliberately chooses a known evil ally', () => {
  const room = roomBase();
  room.history = [
    { type: 'teamVote', missionNo: 1, leaderClientId: 'p3', team: ['p3','p5'], votes: [
      { clientId: 'p3', approve: true }, { clientId: 'p4', approve: true }, { clientId: 'p5', approve: true }
    ] },
    { type: 'mission', missionNo: 1, missionSucceeded: true, fails: 0, team: ['p3','p5'] }
  ];
  const target = chooseBotAssassinationTarget(room, room.players[0]);
  assert.ok(target);
  assert.notEqual(target.clientId, 'p2');
  assert.notEqual(target.clientId, 'b1');
});

test('bot mission reaction can bluff after a failed quest', () => {
  const room = roomBase();
  room.currentTeam = ['b1', 'p5'];
  room.lastMissionResult = { missionNo: 1, missionSucceeded: false, fails: 1, team: ['b1','p5'] };
  room.history.push({ type: 'mission', missionNo: 1, missionSucceeded: false, fails: 1, team: ['b1','p5'] });
  const line = missionReactionSpeech(room, room.players[0]);
  assert.match(line, /성공/);
});
