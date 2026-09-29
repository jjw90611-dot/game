// 게임 카드 일러스트 (직접 그린 SVG)
export const ICONS = {
  liar: '🤥', mafia: '🕵️', drawguess: '🎨', rummy: '🔢', yacht: '🎲', omok: '⚫',
  roundtable: '⚔️', wordspy: '🕶️', onecard: '🃏', numbercode: '🔐', fruitbell: '🔔', relay: '✏️', reversi: '⚪',
  gems: '💎', werewolf: '🐺', coup: '👑',
};

const shadow = (cx, cy, rx, ry = 6) => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="#000" opacity=".16"/>`;

const tile = (x, y, n, color, rot = 0, joker = false) => `
  <g transform="translate(${x} ${y}) rotate(${rot})">
    <rect x="-13" y="-18" width="26" height="36" rx="4" fill="#fffaf0" stroke="#e3d6bd" stroke-width="1.2"/>
    <rect x="-13" y="12" width="26" height="6" rx="3" fill="#efe3c8"/>
    ${joker
      ? '<circle cx="0" cy="-2" r="7" fill="#ffcf33"/><circle cx="-2.5" cy="-3.5" r="1.2" fill="#222"/><circle cx="2.5" cy="-3.5" r="1.2" fill="#222"/><path d="M-3 0.5 q3 3 6 0" stroke="#222" stroke-width="1.2" fill="none"/>'
      : `<text x="0" y="5" text-anchor="middle" font-size="16" font-weight="700" fill="${color}" font-family="Gmarket Sans, sans-serif">${n}</text>`}
  </g>`;

const die = (x, y, s, rot, pips) => {
  const p = { 1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]], 4: [[-1, -1], [1, -1], [-1, 1], [1, 1]], 5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]], 6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]] }[pips];
  const d = s * 0.27;
  return `<g transform="translate(${x} ${y}) rotate(${rot})">
    <rect x="${-s / 2}" y="${-s / 2 + 3}" width="${s}" height="${s}" rx="${s * 0.2}" fill="#c9cfdb"/>
    <rect x="${-s / 2}" y="${-s / 2}" width="${s}" height="${s}" rx="${s * 0.2}" fill="#fff"/>
    ${p.map(([a, b]) => `<circle cx="${a * d}" cy="${b * d}" r="${s * 0.085}" fill="${pips === 1 ? '#e03131' : '#1d2433'}"/>`).join('')}
  </g>`;
};

const card = (x, y, rot, color, label) => `
  <g transform="translate(${x} ${y}) rotate(${rot})">
    <rect x="-17" y="-25" width="34" height="50" rx="5" fill="#fff"/>
    <rect x="-14" y="-22" width="28" height="44" rx="3.5" fill="${color}"/>
    <ellipse cx="0" cy="0" rx="10" ry="15" fill="#fff" transform="rotate(25)"/>
    <text x="0" y="6" text-anchor="middle" font-size="16" font-weight="700" fill="${color}" font-family="Gmarket Sans, sans-serif">${label}</text>
  </g>`;

const gem = (x, y, s, fill, light) => `
  <g transform="translate(${x} ${y}) scale(${s})">
    <path d="M-12 -6 L-6 -13 L6 -13 L12 -6 L0 12 Z" fill="${fill}"/>
    <path d="M-12 -6 L12 -6 L0 12 Z" fill="${light}" opacity=".45"/>
    <path d="M-6 -13 L-3 -6 L3 -6 L6 -13 Z" fill="#fff" opacity=".45"/>
  </g>`;

export const ART = {
  liar: `<svg viewBox="0 0 160 120">
    ${shadow(98, 113, 38)}
    <path d="M14 14h56a10 10 0 0 1 10 10v24a10 10 0 0 1-10 10H40l-11 11v-11H14a10 10 0 0 1-10-10V24a10 10 0 0 1 10-10z" fill="#fff"/>
    <text x="42" y="47" text-anchor="middle" font-size="30" font-weight="700" fill="#ff5a5f" font-family="Gmarket Sans, sans-serif">?</text>
    <circle cx="98" cy="74" r="36" fill="#ffd166"/>
    <circle cx="98" cy="74" r="36" fill="none" stroke="#f4b43a" stroke-width="2"/>
    <path d="M78 60 q7-6 14-1" stroke="#6b3e00" stroke-width="3.5" fill="none" stroke-linecap="round"/>
    <path d="M104 58 q7-4 13 2" stroke="#6b3e00" stroke-width="3.5" fill="none" stroke-linecap="round"/>
    <ellipse cx="86" cy="70" rx="7" ry="6" fill="#fff"/><circle cx="90" cy="71" r="3.4" fill="#1d2433"/>
    <ellipse cx="111" cy="70" rx="7" ry="6" fill="#fff"/><circle cx="115" cy="71" r="3.4" fill="#1d2433"/>
    <path d="M100 78 L152 70 Q156 74 152 78 L100 86 Z" fill="#f59f5b"/>
    <path d="M86 94 q12 7 24 -2" stroke="#6b3e00" stroke-width="3.5" fill="none" stroke-linecap="round"/>
    <circle cx="76" cy="84" r="5" fill="#ff8fa3" opacity=".6"/>
  </svg>`,

  mafia: `<svg viewBox="0 0 160 120">
    <circle cx="128" cy="24" r="15" fill="#fff4c2"/><circle cx="121" cy="19" r="15" fill="#3a5ce6" opacity=".0"/>
    <circle cx="135" cy="19" r="13" fill="rgba(0,0,0,.12)"/>
    ${shadow(84, 114, 44)}
    <path d="M40 112 q44 -40 88 0 z" fill="#20242e"/>
    <path d="M70 92 l14 14 l14 -14 l-14 6 z" fill="#e03131"/>
    <ellipse cx="84" cy="68" rx="26" ry="28" fill="#f2c9a5"/>
    <rect x="58" y="62" width="52" height="11" rx="5" fill="#1d2433"/>
    <ellipse cx="72" cy="68" rx="10" ry="7" fill="#1d2433"/><ellipse cx="96" cy="68" rx="10" ry="7" fill="#1d2433"/>
    <path d="M66 65 l6 -2" stroke="#6b7a99" stroke-width="2" stroke-linecap="round"/>
    <path d="M78 86 q6 3 12 0" stroke="#8a4b2b" stroke-width="2.6" fill="none" stroke-linecap="round"/>
    <path d="M44 50 q40 -14 80 0 q-6 6 -40 6 q-34 0 -40 -6 z" fill="#2b2f3a"/>
    <path d="M56 50 q2 -30 28 -32 q26 2 28 32 z" fill="#343a48"/>
    <path d="M57 44 q27 6 54 0 l0 6 q-27 6 -54 0 z" fill="#c92a2a"/>
  </svg>`,

  drawguess: `<svg viewBox="0 0 160 120">
    ${shadow(92, 113, 46)}
    <path d="M40 92 C 16 88 18 52 50 44 C 76 36 118 32 136 56 C 150 76 132 100 108 96 C 98 94 100 84 90 84 C 80 84 76 98 40 92 Z" fill="#fff4dd" stroke="#e8cfa0" stroke-width="2"/>
    <circle cx="52" cy="62" r="8" fill="#ff6b6b"/><circle cx="74" cy="52" r="8" fill="#ffd43b"/>
    <circle cx="100" cy="50" r="8" fill="#51cf66"/><circle cx="122" cy="62" r="8" fill="#339af0"/>
    <circle cx="116" cy="82" r="7" fill="#845ef7"/><ellipse cx="56" cy="80" rx="9" ry="7" fill="#e8d5b0"/>
    <g transform="rotate(-38 120 40)"><rect x="104" y="6" width="9" height="54" rx="4" fill="#b5651d"/><rect x="104" y="48" width="9" height="10" fill="#adb5bd"/><path d="M104 58 h9 l-4.5 16 z" fill="#1d2433"/></g>
    <text x="28" y="34" font-size="26" font-weight="700" fill="#fff" font-family="Gmarket Sans, sans-serif" transform="rotate(-12 28 34)">?</text>
  </svg>`,

  rummy: `<svg viewBox="0 0 160 120">
    ${shadow(92, 112, 52)}
    <rect x="34" y="84" width="118" height="20" rx="5" fill="#8a5a2b"/>
    <rect x="34" y="84" width="118" height="6" rx="3" fill="#a8743f"/>
    ${tile(52, 66, 7, '#e03131', -8)}${tile(80, 62, 8, '#1c7ed6', -2)}${tile(108, 62, 9, '#f08c00', 4)}${tile(136, 66, 0, '', 10, true)}
  </svg>`,

  yacht: `<svg viewBox="0 0 160 120">
    ${shadow(88, 113, 52)}
    <path d="M110 30 l30 6 l-8 62 l-30 -2 z" fill="#c92a2a"/><path d="M110 30 l30 6 l-2 8 l-30 -4 z" fill="#e03131"/>
    <ellipse cx="124" cy="34" rx="16" ry="4" fill="#7a1717" transform="rotate(10 124 34)"/>
    ${die(50, 84, 34, -12, 5)}${die(90, 90, 30, 14, 6)}${die(70, 50, 28, 28, 1)}
  </svg>`,

  omok: `<svg viewBox="0 0 160 120">
    ${shadow(90, 112, 58)}
    <path d="M22 96 L50 38 L150 38 L158 96 Z" fill="#e8b86b"/>
    <path d="M22 96 L158 96 L158 104 L22 104 Z" fill="#b8843c"/>
    ${[0, 1, 2, 3, 4, 5].map((i) => `<line x1="${29 + i * 3 + i * 18}" y1="${92}" x2="${53 + i * 16.7}" y2="${42}" stroke="#9a6a2c" stroke-width="1"/>`).join('')}
    ${[0, 1, 2, 3, 4].map((i) => { const y = 42 + i * 12.5; const t = (y - 38) / 58; return `<line x1="${50 - t * 28}" y1="${y}" x2="${150 + t * 8}" y2="${y}" stroke="#9a6a2c" stroke-width="1"/>`; }).join('')}
    <ellipse cx="62" cy="80" rx="8" ry="5.5" fill="#1d2433"/><ellipse cx="80" cy="67" rx="7.5" ry="5" fill="#1d2433"/>
    <ellipse cx="97" cy="55" rx="7" ry="4.6" fill="#1d2433"/><ellipse cx="113" cy="44" rx="6.5" ry="4.2" fill="#1d2433"/>
    <ellipse cx="100" cy="80" rx="8" ry="5.5" fill="#fff"/><ellipse cx="118" cy="67" rx="7.5" ry="5" fill="#fff"/>
    <ellipse cx="84" cy="92" rx="8.5" ry="5.6" fill="#fff"/><ellipse cx="136" cy="80" rx="8" ry="5.5" fill="#fff"/>
    <ellipse cx="44" cy="92" rx="8.5" ry="5.6" fill="#1d2433"/>
  </svg>`,

  roundtable: `<svg viewBox="0 0 160 120">
    ${shadow(90, 112, 50)}
    <g transform="rotate(-35 90 64)"><rect x="86" y="10" width="8" height="92" rx="3" fill="#dee2e6"/><rect x="72" y="80" width="36" height="7" rx="3" fill="#f59f00"/><rect x="86" y="86" width="8" height="18" fill="#8a5a2b"/></g>
    <g transform="rotate(35 90 64)"><rect x="86" y="10" width="8" height="92" rx="3" fill="#f1f3f5"/><rect x="72" y="80" width="36" height="7" rx="3" fill="#f59f00"/><rect x="86" y="86" width="8" height="18" fill="#8a5a2b"/></g>
    <path d="M62 40 h56 v30 q0 26 -28 38 q-28 -12 -28 -38 z" fill="#1864ab"/>
    <path d="M68 46 h44 v24 q0 20 -22 30 q-22 -10 -22 -30 z" fill="#1c7ed6"/>
    <path d="M78 58 l6 8 l6 -12 l6 12 l6 -8 v14 h-24 z" fill="#ffd43b"/>
  </svg>`,

  wordspy: `<svg viewBox="0 0 160 120">
    ${shadow(90, 113, 54)}
    ${[0, 1, 2].map((r) => [0, 1, 2].map((c) => {
      const colors = [['#fff', '#e03131', '#fff'], ['#1c7ed6', '#fff', '#fff'], ['#fff', '#fff', '#e03131']][r][c];
      return `<rect x="${38 + c * 34}" y="${34 + r * 24}" width="30" height="20" rx="3" fill="${colors}" stroke="#dee2e6"/>${colors === '#fff' ? `<rect x="${43 + c * 34}" y="${42 + r * 24}" width="20" height="3" rx="1.5" fill="#adb5bd"/>` : ''}`;
    }).join('')).join('')}
    <circle cx="126" cy="46" r="18" fill="rgba(255,255,255,.35)" stroke="#343a40" stroke-width="6"/>
    <rect x="136" y="58" width="9" height="30" rx="4" fill="#343a40" transform="rotate(-40 140 62)"/>
    <path d="M22 22 h30 l-4 8 h-22 z" fill="#1d2433"/><rect x="20" y="28" width="12" height="6" rx="3" fill="#1d2433"/><rect x="38" y="28" width="12" height="6" rx="3" fill="#1d2433"/>
  </svg>`,

  onecard: `<svg viewBox="0 0 160 120">
    ${shadow(94, 113, 48)}
    ${card(60, 70, -24, '#e03131', '7')}${card(82, 62, -8, '#f59f00', '2')}${card(104, 62, 8, '#2f9e44', '+2')}${card(126, 70, 24, '#1c7ed6', '⟲')}
  </svg>`,

  numbercode: `<svg viewBox="0 0 160 120">
    ${shadow(90, 113, 56)}
    ${[['#1d2433', '#fff', '2'], ['#f8f9fa', '#1d2433', '5'], ['#1d2433', '#fff', '?'], ['#f8f9fa', '#1d2433', '9'], ['#1d2433', '#fff', '11']].map(([bg, fg, n], i) => `
      <g transform="translate(${34 + i * 25} ${58 + (i === 2 ? -10 : 0)})">
        <rect x="-11" y="-20" width="22" height="40" rx="4" fill="${bg}" stroke="#adb5bd" stroke-width="1"/>
        <text x="0" y="6" text-anchor="middle" font-size="${n.length > 1 ? 12 : 16}" font-weight="700" fill="${i === 2 ? '#ffd43b' : fg}" font-family="Gmarket Sans, sans-serif">${n}</text>
      </g>`).join('')}
    <g transform="translate(128 86)"><path d="M-9 -4 v-7 a9 9 0 0 1 18 0 v7" stroke="#ced4da" stroke-width="5" fill="none"/><rect x="-14" y="-5" width="28" height="22" rx="4" fill="#f59f00"/><circle cx="0" cy="5" r="3" fill="#7a4d00"/></g>
  </svg>`,

  fruitbell: `<svg viewBox="0 0 160 120">
    ${shadow(96, 113, 50)}
    <g transform="translate(46 70) rotate(-12)"><rect x="-20" y="-30" width="40" height="58" rx="6" fill="#fff"/>
      <circle cx="-7" cy="-14" r="6" fill="#e03131"/><circle cx="7" cy="-14" r="6" fill="#e03131"/><circle cx="0" cy="0" r="6" fill="#e03131"/><circle cx="-7" cy="14" r="6" fill="#e03131"/><circle cx="7" cy="14" r="6" fill="#e03131"/></g>
    <g transform="translate(118 74) rotate(10)"><rect x="-18" y="-28" width="36" height="54" rx="6" fill="#fff"/>
      <path d="M-10 6 q10 14 22 -12 q-6 20 -22 12 z" fill="#fcc419" stroke="#e8a900"/><path d="M-10 -10 q10 14 22 -12 q-6 20 -22 12 z" fill="#fcc419" stroke="#e8a900"/></g>
    <ellipse cx="84" cy="98" rx="30" ry="7" fill="#495057"/>
    <path d="M58 96 q0 -34 26 -36 q26 2 26 36 z" fill="#ced4da"/>
    <path d="M64 90 q2 -24 20 -26" stroke="#fff" stroke-width="4" fill="none" stroke-linecap="round" opacity=".8"/>
    <rect x="80" y="52" width="8" height="10" rx="3" fill="#868e96"/><circle cx="84" cy="50" r="5" fill="#adb5bd"/>
    <path d="M62 44 l-8 -8 M84 38 v-10 M106 44 l8 -8" stroke="#fff" stroke-width="3.5" stroke-linecap="round"/>
  </svg>`,

  relay: `<svg viewBox="0 0 160 120">
    ${shadow(92, 113, 54)}
    <g transform="rotate(-8 56 64)"><rect x="30" y="32" width="54" height="68" rx="6" fill="#fff"/>
      <rect x="38" y="44" width="36" height="4" rx="2" fill="#adb5bd"/><rect x="38" y="54" width="30" height="4" rx="2" fill="#adb5bd"/><rect x="38" y="64" width="34" height="4" rx="2" fill="#adb5bd"/></g>
    <path d="M84 44 q14 -12 26 0" stroke="#fff" stroke-width="4" fill="none" stroke-linecap="round"/><path d="M106 38 l5 7 l-8 2" stroke="#fff" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    <g transform="rotate(8 118 72)"><rect x="92" y="40" width="54" height="68" rx="6" fill="#fff"/>
      <circle cx="119" cy="72" r="15" fill="none" stroke="#f76707" stroke-width="3"/><path d="M107 62 l3 -10 l6 6 M131 62 l-3 -10 l-6 6" stroke="#f76707" stroke-width="3" fill="none" stroke-linejoin="round"/>
      <circle cx="114" cy="70" r="2" fill="#f76707"/><circle cx="124" cy="70" r="2" fill="#f76707"/><path d="M116 77 q3 3 6 0" stroke="#f76707" stroke-width="2.4" fill="none"/></g>
  </svg>`,

  reversi: `<svg viewBox="0 0 160 120">
    ${shadow(90, 113, 56)}
    <path d="M26 98 L52 36 L148 36 L156 98 Z" fill="#2b8a3e"/>
    <path d="M26 98 L156 98 L156 105 L26 105 Z" fill="#1e6b2d"/>
    ${[0, 1, 2, 3, 4].map((i) => `<line x1="${34 + i * 30.5}" y1="96" x2="${55 + i * 22.5}" y2="38" stroke="#40a954" stroke-width="1.2"/>`).join('')}
    ${[0, 1, 2, 3].map((i) => { const y = 44 + i * 16; const t = (y - 36) / 62; return `<line x1="${52 - t * 26}" y1="${y}" x2="${148 + t * 8}" y2="${y}" stroke="#40a954" stroke-width="1.2"/>`; }).join('')}
    <ellipse cx="74" cy="72" rx="12" ry="7" fill="#1d2433"/><ellipse cx="104" cy="72" rx="12" ry="7" fill="#fff"/>
    <ellipse cx="90" cy="54" rx="10" ry="6" fill="#fff"/><ellipse cx="62" cy="88" rx="13" ry="7.5" fill="#1d2433"/>
    <ellipse cx="118" cy="88" rx="13" ry="7.5" fill="#1d2433"/>
    <g transform="translate(120 30) rotate(-25)"><ellipse cx="0" cy="0" rx="13" ry="4" fill="#1d2433"/><ellipse cx="0" cy="-3" rx="13" ry="4" fill="#fff"/></g>
  </svg>`,

  gems: `<svg viewBox="0 0 160 120">
    ${shadow(92, 113, 52)}
    <circle cx="126" cy="88" r="16" fill="#f59f00"/><circle cx="126" cy="88" r="12" fill="#fcc419"/><text x="126" y="94" text-anchor="middle" font-size="14" font-weight="700" fill="#b35c00">★</text>
    ${gem(58, 76, 2.1, '#1c7ed6', '#74c0fc')}${gem(96, 64, 2.4, '#e03131', '#ffa8a8')}${gem(74, 42, 1.5, '#2f9e44', '#8ce99a')}${gem(118, 42, 1.3, '#e9ecef', '#fff')}${gem(40, 46, 1.1, '#343a40', '#868e96')}
  </svg>`,

  werewolf: `<svg viewBox="0 0 160 120">
    <circle cx="112" cy="40" r="26" fill="#fff9db"/><circle cx="104" cy="34" r="5" fill="#f3e9b5"/><circle cx="120" cy="50" r="4" fill="#f3e9b5"/>
    ${shadow(84, 114, 46)}
    <path d="M20 112 l14 -40 l14 40 z M126 112 l12 -34 l12 34 z" fill="#2b3a2f" opacity=".7"/>
    <path d="M52 112 L58 70 L50 44 L66 58 L78 50 L90 58 L106 44 L98 70 L104 112 Z" fill="#495057"/>
    <path d="M66 74 L78 96 L90 74 Z" fill="#343a40"/>
    <path d="M72 92 l6 8 l6 -8" fill="#fff"/>
    <path d="M62 66 l8 3 M94 66 l-8 3" stroke="#ffd43b" stroke-width="4" stroke-linecap="round"/>
    <path d="M58 58 L52 38 L64 52 Z M98 58 L104 38 L92 52 Z" fill="#343a40"/>
  </svg>`,

  coup: `<svg viewBox="0 0 160 120">
    ${shadow(90, 113, 52)}
    ${[0, 1, 2, 3].map((i) => `<ellipse cx="118" cy="${100 - i * 7}" rx="18" ry="6" fill="#e8a900"/><ellipse cx="118" cy="${97 - i * 7}" rx="18" ry="6" fill="#fcc419"/>`).join('')}
    <ellipse cx="44" cy="100" rx="16" ry="5.5" fill="#e8a900"/><ellipse cx="44" cy="97" rx="16" ry="5.5" fill="#fcc419"/>
    <path d="M52 78 L60 40 L76 60 L90 30 L104 60 L120 40 L128 78 Z" fill="#fab005"/>
    <rect x="52" y="76" width="76" height="12" rx="3" fill="#f08c00"/>
    <circle cx="90" cy="30" r="5" fill="#e03131"/><circle cx="60" cy="40" r="4" fill="#1c7ed6"/><circle cx="120" cy="40" r="4" fill="#2f9e44"/>
    <circle cx="76" cy="82" r="3" fill="#e03131"/><circle cx="90" cy="82" r="3" fill="#fff"/><circle cx="104" cy="82" r="3" fill="#1c7ed6"/>
    <g transform="rotate(-50 30 60)"><rect x="27" y="20" width="6" height="48" rx="2" fill="#dee2e6"/><rect x="20" y="64" width="20" height="5" rx="2" fill="#495057"/><rect x="27" y="68" width="6" height="12" fill="#212529"/></g>
  </svg>`,
};

export function art(id) {
  return ART[id] || '';
}
