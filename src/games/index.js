// 게임 모듈 등록 (사이트 표시 순서는 public/js/catalog.js 참고)
// 여기에 등록된 게임만 사이트에서 플레이할 수 있어요.
import liar from './liar.js';
import mafia from './mafia.js';
import drawguess from './drawguess.js';
import rummy from './rummy.js';
import yacht from './yacht.js';
import omok from './omok.js';

export const MODULES = {
  // 1순위
  liar, mafia, drawguess, rummy, yacht, omok,
};
