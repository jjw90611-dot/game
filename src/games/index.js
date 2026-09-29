// 게임 모듈 등록 (사이트 표시 순서는 public/js/catalog.js 참고)
// 여기에 등록된 게임만 사이트에서 플레이할 수 있어요.
import liar from './liar.js';
import mafia from './mafia.js';
import drawguess from './drawguess.js';
import rummy from './rummy.js';
import yacht from './yacht.js';
import omok from './omok.js';
import wordspy from './wordspy.js';
import onecard from './onecard.js';
import numbercode from './numbercode.js';
import fruitbell from './fruitbell.js';
import relay from './relay.js';
import reversi from './reversi.js';
import gems from './gems.js';
import werewolf from './werewolf.js';
import coup from './coup.js';

export const MODULES = {
  // 1순위
  liar, mafia, drawguess, rummy, yacht, omok,
  // 2순위 (아발론은 /avalon 에서 별도 서버로 동작)
  wordspy, onecard, numbercode, fruitbell, relay, reversi,
  // 3순위
  gems, werewolf, coup,
};
