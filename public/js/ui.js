// 화면 공용 도우미
import { icon } from './icons.js';
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

const COLORS = ['#4263eb', '#f76707', '#0ca678', '#e64980', '#7048e8', '#1098ad', '#e03131', '#5c940d', '#ae3ec9', '#f59f00', '#846358', '#1c7ed6'];
export function colorOf(id) {
  let h = 0;
  for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return COLORS[h % COLORS.length];
}

export function avatar(id, name, cls = '', bot = false) {
  const ch = [...String(name || '?').trim()][0] || '?';
  return `<span class="avatar ${cls} ${bot ? 'bot' : ''}" style="--c:${colorOf(id)}">${bot ? icon('bot') : esc(ch)}</span>`;
}

export function toast(msg, kind = '') {
  const box = document.getElementById('toasts');
  if (!box) return;
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.textContent = msg;
  box.appendChild(el);
  while (box.children.length > 3) box.firstChild.remove();
  setTimeout(() => {
    el.style.transition = 'opacity .3s';
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 320);
  }, 2600);
}

// 모달 창. actions: [{label, cls, onClick(close) → false면 닫지 않음}]
export function openModal({ title, body = '', actions = [], wide = false, onOpen, onClose, closable = true }) {
  const root = document.getElementById('modal-root');
  const back = document.createElement('div');
  back.className = 'modal-back';
  back.innerHTML = `
    <div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true">
      <div class="modal-head"><h3>${esc(title)}</h3>${closable ? `<button class="modal-x" type="button" aria-label="닫기">${icon('x')}</button>` : ''}</div>
      <div class="modal-body">${body}</div>
      ${actions.length ? `<div class="modal-foot">${actions.map((a, i) => `<button type="button" class="btn ${a.cls || ''}" data-i="${i}">${esc(a.label)}</button>`).join('')}</div>` : ''}
    </div>`;
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    back.remove();
    onClose?.();
  };
  back.addEventListener('click', (e) => {
    if (e.target === back && closable) close();
    if (e.target.closest('.modal-x')) close();
    const b = e.target.closest('.modal-foot .btn');
    if (b) {
      const a = actions[Number(b.dataset.i)];
      if (a?.onClick?.(close, back) !== false) close();
    }
  });
  root.appendChild(back);
  onOpen?.(back, close);
  return close;
}

export function fmtSec(ms) {
  return Math.max(0, Math.ceil(ms / 1000));
}

export function timeAgo(ts) {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// 짧은 효과음 (WebAudio)
let audioCtx = null;
export function beep(freq = 660, ms = 120, type = 'sine', vol = 0.06) {
  try {
    if (localStorage.getItem('bg_mute') === '1') return;
    audioCtx ||= new (window.AudioContext || window.webkitAudioContext)();
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.value = vol;
    o.connect(g);
    g.connect(audioCtx.destination);
    o.start();
    g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + ms / 1000);
    o.stop(audioCtx.currentTime + ms / 1000 + 0.02);
  } catch {}
}
