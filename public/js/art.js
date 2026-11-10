// 게임 키아트 (public/art/*.svg, 아발론은 원작 표지와 역할 초상화를 조합)
import { ARCADE_GAMES, GAMES, isArcadeCatalogGame, arcadeModeId } from './catalog.js';

const AV = '/avalon/assets';
const ARCADE_ATLAS = '/art/team-arcade-atlas.png';

function arcadeSpriteStyle(id) {
  const index = ARCADE_GAMES.findIndex((game) => game.id === arcadeModeId(id));
  const col = Math.max(0, index) % 5;
  const row = Math.floor(Math.max(0, index) / 5);
  return `--arcade-x:${col * 25}%;--arcade-y:${row * 25}%`;
}

export function thumbSrc(id) {
  if (id === 'avalon') return `${AV}/avalon-cover.png`;
  if (isArcadeCatalogGame(id)) return ARCADE_ATLAS;
  return GAMES[id] ? `/art/${id}.svg` : '';
}

export function thumb(id, cls = '') {
  if (id === 'avalon') {
      return `<span class="thumb-img thumb-avalon ${cls}"><img class="ta-bg" src="${AV}/avalon-cover.png" alt="" loading="lazy" decoding="async" draggable="false">${['percival', 'merlin', 'assassin'].map((r, i) => `<img class="ta-r ta-${i}" src="${AV}/roles/${r}.jpg" alt="" loading="lazy" decoding="async" draggable="false">`).join('')}</span>`;
  }
  if (isArcadeCatalogGame(id)) return `<span class="thumb-img arcade-sprite ${cls}" style="${arcadeSpriteStyle(id)}" role="img" aria-label="${GAMES[id].name}"></span>`;
  const src = thumbSrc(id);
  return src ? `<img class="thumb-img ${cls}" src="${src}" alt="" loading="lazy" decoding="async" draggable="false">` : '';
}
