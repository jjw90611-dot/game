// 게임 화면 공용 조각
import { esc, avatar } from '../ui.js';
export { esc, avatar };

// 참가자 막대: items = [{id, name, sub, active, dim, badge}]
export function playerStrip(items, api, cls = '') {
  const me = api.me();
  return `<div class="pstrip ${cls}">${items.map((p) => `
    <div class="pchip ${p.active ? 'active' : ''} ${p.dim ? 'dim' : ''} ${p.id === me ? 'me' : ''}" data-pid="${esc(p.id)}">
      ${avatar(p.id, p.name, 'sm', api.isBot(p.id))}
      <div class="pc-main"><div class="pc-name">${esc(p.name)}${p.id === me ? ' <em>나</em>' : ''}${api.isOnline(p.id) ? '' : ' <span class="off">⚡</span>'}</div>${p.sub != null ? `<div class="pc-sub">${p.sub}</div>` : ''}</div>
      ${p.badge ? `<span class="pc-badge">${p.badge}</span>` : ''}
    </div>`).join('')}</div>`;
}

export function banner(text, kind = '') {
  return `<div class="gbanner ${kind}">${text}</div>`;
}

export const coarse = () => window.matchMedia('(pointer: coarse)').matches;
