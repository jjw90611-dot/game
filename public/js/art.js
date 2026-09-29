// 게임 키아트 (public/art/*.svg, 아발론은 원작 표지와 역할 초상화를 조합)
import { GAMES } from './catalog.js';

const AV = '/avalon/assets';

export function thumbSrc(id) {
  if (id === 'avalon') return `${AV}/avalon-cover.png`;
  return GAMES[id] ? `/art/${id}.svg` : '';
}

export function thumb(id, cls = '') {
  if (id === 'avalon') {
    return `<span class="thumb-img thumb-avalon ${cls}"><img class="ta-bg" src="${AV}/avalon-cover.png" alt="" loading="lazy" decoding="async" draggable="false">${['percival', 'merlin', 'assassin'].map((r, i) => `<img class="ta-r ta-${i}" src="${AV}/roles/${r}.jpg" alt="" loading="lazy" decoding="async" draggable="false">`).join('')}</span>`;
  }
  const src = thumbSrc(id);
  return src ? `<img class="thumb-img ${cls}" src="${src}" alt="" loading="lazy" decoding="async" draggable="false">` : '';
}
