#!/usr/bin/env python3
# 사용법: python3 tools/genart2.py public/art
"""새로 추가된 게임 키아트 (16:9 SVG)."""
import math, random, os, sys
sys.path.insert(0, os.path.dirname(__file__))
from genart import W, H, svg, bokeh, sparkles, shadow, die, tile3d

OUT = sys.argv[1] if len(sys.argv) > 1 else 'public/art'
FONT = "font-family=\"'Gmarket Sans','Apple SD Gothic Neo','Malgun Gothic','Noto Sans KR',sans-serif\" font-weight=\"700\""


# ─────────────────────────── 노래 맞히기 ───────────────────────────
def song():
    defs = '''
<radialGradient id="bg" cx="50%" cy="45%" r="80%"><stop offset="0" stop-color="#5b2bd6"/><stop offset=".55" stop-color="#26105e"/><stop offset="1" stop-color="#0a0520"/></radialGradient>
<radialGradient id="vinyl" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#2b2b33"/><stop offset=".3" stop-color="#111116"/><stop offset="1" stop-color="#050507"/></radialGradient>
<linearGradient id="label" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff4d8d"/><stop offset="1" stop-color="#ffb347"/></linearGradient>
<linearGradient id="eq" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#1f6bff"/><stop offset=".6" stop-color="#b86bff"/><stop offset="1" stop-color="#ff7ad9"/></linearGradient>
<linearGradient id="sheen" x1="0" y1="0" x2="1" y2="1"><stop offset=".35" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".22"/><stop offset=".65" stop-color="#fff" stop-opacity="0"/></linearGradient>
<linearGradient id="watch" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#dfe3ee"/></linearGradient>'''
    grooves = ''.join(f'<circle cx="0" cy="0" r="{r}" fill="none" stroke="#2c2c36" stroke-width="1.2" opacity=".8"/>' for r in range(44, 128, 7))
    bars = []
    rnd = random.Random(3)
    for i in range(28):
        h = 18 + abs(math.sin(i * .55)) * 90 + rnd.uniform(0, 30)
        x = 12 + i * 22.5
        bars.append(f'<rect x="{x:.0f}" y="{360 - h:.0f}" width="13" height="{h:.0f}" rx="6" fill="url(#eq)" opacity=".85"/>')
    notes = ''.join(
        f'<g transform="translate({x} {y}) rotate({r}) scale({s})" opacity="{o}" filter="url(#ds2)"><ellipse cx="0" cy="18" rx="9" ry="7" fill="#fff" transform="rotate(-20 0 18)"/><rect x="7" y="-22" width="3.5" height="40" fill="#fff"/><path d="M10.5 -22 q14 6 10 22 q-2 -12 -10 -12z" fill="#fff"/></g>'
        for x, y, r, s, o in [(90, 90, -12, 1.2, .9), (170, 50, 10, .8, .7), (560, 70, 14, 1.1, .85), (600, 170, -8, .7, .6), (470, 40, -5, .6, .5)])
    body = f'''<rect width="{W}" height="{H}" fill="url(#bg)"/>
{bokeh(41, 30, ['#b86bff', '#ff7ad9', '#6fa8ff'], 4, 22, 0, 260, op=(.1, .4))}
<circle cx="320" cy="170" r="190" fill="#8b5cf6" opacity=".35" filter="url(#b30)"/>
{''.join(bars)}
<g transform="translate(300 170)" filter="url(#ds)">
<circle r="132" fill="url(#vinyl)"/>{grooves}<circle r="132" fill="url(#sheen)"/>
<circle r="42" fill="url(#label)"/><circle r="6" fill="#0a0520"/></g>
<g transform="translate(440 110) rotate(28)" filter="url(#ds)"><rect x="-6" y="-8" width="12" height="150" rx="6" fill="#d7dbe6"/><rect x="-14" y="132" width="28" height="36" rx="6" fill="#9aa2b5"/><circle cx="0" cy="-10" r="18" fill="#c0c6d4"/></g>
<g transform="translate(505 245)" filter="url(#ds)">
<rect x="-10" y="-78" width="20" height="16" rx="4" fill="#c0c6d4"/><circle r="64" fill="url(#watch)"/><circle r="64" fill="none" stroke="#ff4d8d" stroke-width="6"/>
<path d="M0 0 L0 -52 A52 52 0 0 1 8.1 -51.4 Z" fill="#ff4d8d" opacity=".9"/>
<text x="0" y="16" text-anchor="middle" font-size="44" fill="#26105e" {FONT}>1s</text></g>
{notes}
{sparkles(44, 16, '#fff', 0, 220)}'''
    return svg(defs, body)


# ─────────────────────────── 인디언 포커 ───────────────────────────
def pcard(x, y, rot, n, back=False, s=1.0, glow=False):
    g = '<rect x="-52" y="-74" width="104" height="148" rx="14" fill="#ffd43b" opacity=".6" filter="url(#b8)"/>' if glow else ''
    if back:
        face = ('<rect x="-46" y="-68" width="92" height="136" rx="11" fill="url(#back)" stroke="#fff" stroke-width="5"/>'
                f'<text x="0" y="22" text-anchor="middle" font-size="64" fill="#fff" {FONT}>?</text>')
    else:
        col = '#d6336c' if n >= 7 else '#1c3f94'
        face = ('<rect x="-46" y="-68" width="92" height="136" rx="11" fill="#fffdf6" stroke="#e8dcc0" stroke-width="2"/>'
                f'<text x="-32" y="-44" font-size="20" fill="{col}" {FONT}>{n}</text>'
                f'<text x="0" y="24" text-anchor="middle" font-size="68" fill="{col}" {FONT}>{n}</text>')
    return f'<g transform="translate({x} {y}) rotate({rot}) scale({s})" filter="url(#ds)">{g}{face}</g>'


def chips(x, y, n, c1, c2):
    out = []
    for i in range(n):
        yy = y - i * 7
        out.append(f'<ellipse cx="{x}" cy="{yy + 5}" rx="30" ry="11" fill="{c2}"/><ellipse cx="{x}" cy="{yy}" rx="30" ry="11" fill="{c1}"/>'
                   f'<ellipse cx="{x}" cy="{yy}" rx="20" ry="7" fill="none" stroke="#fff" stroke-width="2.5" stroke-dasharray="6 5" opacity=".85"/>')
    return f'<g filter="url(#ds2)">{"".join(out)}</g>'


def indian():
    defs = '''
<radialGradient id="bg" cx="50%" cy="30%" r="85%"><stop offset="0" stop-color="#1d8a55"/><stop offset=".6" stop-color="#0c4a2d"/><stop offset="1" stop-color="#03170d"/></radialGradient>
<pattern id="backp" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="10" height="10" fill="#c92a2a"/><rect width="5" height="10" fill="#a61e1e"/></pattern>
<linearGradient id="back" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e03131"/><stop offset="1" stop-color="#8f1414"/></linearGradient>
<radialGradient id="spot" cx="50%" cy="0%" r="100%"><stop offset="0" stop-color="#fff6d0" stop-opacity=".55"/><stop offset="1" stop-color="#fff6d0" stop-opacity="0"/></radialGradient>'''
    body = f'''<rect width="{W}" height="{H}" fill="url(#bg)"/>
<path d="M200 0 L440 0 L560 360 L80 360Z" fill="url(#spot)"/>
{bokeh(51, 18, ['#ffe08a', '#ffffff'], 3, 14, 0, 200, op=(.1, .3))}
<ellipse cx="320" cy="330" rx="330" ry="60" fill="#062a18" opacity=".6" filter="url(#b8)"/>
{pcard(150, 190, -16, 3)}{pcard(250, 172, -6, 9)}{pcard(390, 172, 6, 7)}{pcard(490, 190, 16, 5)}
{pcard(320, 150, 0, 0, back=True, s=1.25, glow=True)}
{chips(110, 318, 5, '#e03131', '#8f1414')}{chips(175, 330, 3, '#1c7ed6', '#0b4b91')}{chips(470, 330, 4, '#f2c230', '#a5810c')}{chips(535, 318, 6, '#2b2b2b', '#000')}
{sparkles(52, 10, '#fff4c2', 20, 160)}'''
    return svg(defs, body)


# ─────────────────────────── 윷놀이 ───────────────────────────
def stick(x, y, rot, flat, s=1.0):
    face = ('<rect x="-20" y="-95" width="40" height="190" rx="20" fill="url(#flat)" stroke="#caa15e" stroke-width="3"/>'
            '<g stroke="#9c6b2a" stroke-width="4" stroke-linecap="round"><path d="M-8 -50 l16 16 M8 -50 l-16 16"/><path d="M-8 -8 l16 16 M8 -8 l-16 16"/><path d="M-8 34 l16 16 M8 34 l-16 16"/></g>'
            if flat else
            '<rect x="-20" y="-95" width="40" height="190" rx="20" fill="url(#round)"/><rect x="-14" y="-88" width="10" height="176" rx="5" fill="#fff" opacity=".18"/>')
    return f'<g transform="translate({x} {y}) rotate({rot}) scale({s})" filter="url(#ds)">{face}</g>'


def yut():
    defs = '''
<radialGradient id="bg" cx="50%" cy="40%" r="85%"><stop offset="0" stop-color="#c0392b"/><stop offset=".6" stop-color="#7a1414"/><stop offset="1" stop-color="#2a0505"/></radialGradient>
<linearGradient id="flat" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#f1d7a2"/><stop offset=".5" stop-color="#fff1d0"/><stop offset="1" stop-color="#e6c485"/></linearGradient>
<linearGradient id="round" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#5a3313"/><stop offset=".45" stop-color="#a86a33"/><stop offset="1" stop-color="#4a280c"/></linearGradient>
<radialGradient id="mat" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#f7e7c4"/><stop offset="1" stop-color="#d8b77c"/></radialGradient>'''
    # 윷판 (원근감)
    nodes = []
    for k in range(6):
        for (x, y) in [(540 - 0, 540 - 96 * k), (540 - 96 * k, 60), (60, 60 + 96 * k), (60 + 96 * k, 540)]:
            nodes.append((x, y))
    for t in [.2, .4, .6, .8]:
        nodes += [(540 - 480 * t, 60 + 480 * t), (60 + 480 * t, 60 + 480 * t)]
    nodes.append((300, 300))
    board = ''.join(f'<circle cx="{x}" cy="{y}" r="{26 if (x, y) in [(540, 540), (540, 60), (60, 60), (60, 540), (300, 300)] else 17}" fill="#fffaf0" stroke="#8a5a22" stroke-width="5"/>' for x, y in set(nodes))
    lines = '<g stroke="#8a5a22" stroke-width="7" stroke-linecap="round"><path d="M60 60 L540 60 L540 540 L60 540Z M60 60 L540 540 M540 60 L60 540" fill="none"/></g>'
    body = f'''<rect width="{W}" height="{H}" fill="url(#bg)"/>
{bokeh(61, 22, ['#ffd08a', '#ff8a6b'], 4, 20, 0, 360, op=(.08, .3))}
<g transform="translate(320 250) scale(.58 .26) translate(-300 -300)" opacity=".95">
<rect x="0" y="0" width="600" height="600" rx="40" fill="url(#mat)"/>{lines}{board}
<circle cx="540" cy="540" r="24" fill="#1c7ed6"/><circle cx="300" cy="300" r="24" fill="#e03131"/><circle cx="60" cy="300" r="24" fill="#1c7ed6"/></g>
{shadow(320, 300, 200, 18, .45)}
{stick(210, 150, -28, True, .9)}{stick(290, 120, -8, False, .95)}{stick(370, 140, 14, True, .92)}{stick(450, 170, 32, True, .88)}
{sparkles(62, 14, '#ffe6a8', 10, 250)}'''
    return svg(defs, body)


# ─────────────────────────── 라이어 다이스 ───────────────────────────
def cup(x, y, rot, s=1.0):
    return (f'<g transform="translate({x} {y}) rotate({rot}) scale({s})" filter="url(#ds)">'
            '<path d="M-58 50 L-44 -60 Q0 -74 44 -60 L58 50 Q0 66 -58 50Z" fill="url(#leather)"/>'
            '<path d="M-58 50 Q0 66 58 50" stroke="#d9a066" stroke-width="5" fill="none"/>'
            '<path d="M-50 -10 Q0 2 50 -10 M-48 20 Q0 32 48 20" stroke="#3a1c08" stroke-width="3" fill="none" opacity=".6"/>'
            '<ellipse cx="0" cy="-62" rx="44" ry="10" fill="#6b3a17"/></g>')


def dice():
    defs = '''
<radialGradient id="bg" cx="50%" cy="35%" r="85%"><stop offset="0" stop-color="#6b3a1f"/><stop offset=".6" stop-color="#2e150a"/><stop offset="1" stop-color="#0d0503"/></radialGradient>
<linearGradient id="leather" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#4a2410"/><stop offset=".5" stop-color="#9a5a2c"/><stop offset="1" stop-color="#3d1c0b"/></linearGradient>
<linearGradient id="dice" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fffdf5"/><stop offset="1" stop-color="#e3dccb"/></linearGradient>
<radialGradient id="candle" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#ffd27a" stop-opacity=".9"/><stop offset="1" stop-color="#ffb347" stop-opacity="0"/></radialGradient>
<linearGradient id="table" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5a2f14"/><stop offset="1" stop-color="#2a1206"/></linearGradient>'''
    planks = ''.join(f'<path d="M0 {y} L640 {y + 6}" stroke="#2a1206" stroke-width="2" opacity=".6"/>' for y in range(250, 360, 26))
    body = f'''<rect width="{W}" height="{H}" fill="url(#bg)"/>
<circle cx="560" cy="80" r="140" fill="url(#candle)"/>
<rect x="548" y="70" width="24" height="90" rx="6" fill="#f3e6c8"/><path d="M560 42 q10 14 0 28 q-10 -14 0 -28z" fill="#ffcf5a"/>
{bokeh(71, 16, ['#ffcf7a', '#ff9f43'], 3, 14, 0, 220, op=(.1, .35))}
<rect x="0" y="240" width="{W}" height="120" fill="url(#table)"/>{planks}
{cup(150, 190, -8, 1.05)}{cup(470, 200, 180, .95)}
{die(250, 262, 58, -14, 5)}{die(318, 290, 52, 18, 1)}{die(378, 258, 56, -6, 5)}{die(430, 298, 46, 30, 5)}{die(205, 316, 44, 8, 3)}
{die(530, 150, 40, 20, 5, True)}
<g transform="translate(320 110)" filter="url(#ds)"><rect x="-96" y="-34" width="192" height="68" rx="34" fill="#e03131"/>
<text x="0" y="12" text-anchor="middle" font-size="34" fill="#fff" {FONT}>LIAR!</text></g>
{sparkles(72, 8, '#ffe9b0', 20, 200)}'''
    return svg(defs, body)


# ─────────────────────────── 계급 전쟁 ───────────────────────────
def rcard(x, y, n, rot=0, s=1.0, jester=False):
    col = {1: '#c92a2a', 2: '#c92a2a', 3: '#d9480f', 4: '#d9480f', 5: '#2b8a3e', 6: '#2b8a3e'}.get(n, '#1971c2')
    if jester:
        face = ('<rect x="-34" y="-48" width="68" height="96" rx="9" fill="url(#jest)" stroke="#fff" stroke-width="3"/>'
                f'<text x="0" y="14" text-anchor="middle" font-size="34" fill="#fff" {FONT}>★</text>')
    else:
        face = ('<rect x="-34" y="-48" width="68" height="96" rx="9" fill="#fffdf6" stroke="#e5dcc4" stroke-width="2"/>'
                f'<text x="0" y="16" text-anchor="middle" font-size="44" fill="{col}" {FONT}>{n}</text>')
    return f'<g transform="translate({x} {y}) rotate({rot}) scale({s})" filter="url(#ds2)">{face}</g>'


def rankwar():
    defs = '''
<radialGradient id="bg" cx="50%" cy="25%" r="85%"><stop offset="0" stop-color="#7048e8"/><stop offset=".55" stop-color="#34197e"/><stop offset="1" stop-color="#0e0626"/></radialGradient>
<linearGradient id="gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe066"/><stop offset=".5" stop-color="#fcc419"/><stop offset="1" stop-color="#d9a400"/></linearGradient>
<linearGradient id="jest" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f76707"/><stop offset="1" stop-color="#d6336c"/></linearGradient>
<radialGradient id="halo" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#ffe9a8" stop-opacity=".8"/><stop offset="1" stop-color="#ffe9a8" stop-opacity="0"/></radialGradient>'''
    rows = [[1], [2, 2], [3, 3, 3], [4, 5, 6, 7]]
    cards = []
    for ri, row in enumerate(rows):
        y = 118 + ri * 64
        for ci, n in enumerate(row):
            x = 320 + (ci - (len(row) - 1) / 2) * 74
            cards.append(rcard(x, y, n, 0, .82))
    body = f'''<rect width="{W}" height="{H}" fill="url(#bg)"/>
<circle cx="320" cy="80" r="130" fill="url(#halo)"/>
{bokeh(81, 24, ['#b197fc', '#ffe066', '#ffffff'], 3, 16, 0, 360, op=(.1, .35))}
{''.join(cards)}
<g transform="translate(320 48)" filter="url(#ds)"><path d="M-46 22 L-54 -24 L-24 0 L0 -34 L24 0 L54 -24 L46 22Z" fill="url(#gold)"/><rect x="-48" y="18" width="96" height="14" rx="4" fill="#d9a400"/>
<circle cx="0" cy="-34" r="6" fill="#e03131"/><circle cx="-54" cy="-24" r="5" fill="#1c7ed6"/><circle cx="54" cy="-24" r="5" fill="#2f9e44"/></g>
{rcard(110, 270, 0, -18, 1.1, True)}{rcard(530, 270, 0, 18, 1.1, True)}
{sparkles(82, 14, '#ffe9a8', 0, 200)}'''
    return svg(defs, body)


# ─────────────────────────── 같은 그림 찾기 ───────────────────────────
SHAPES = {
    'star': '<path d="M0 -20 L6 -6 L21 -6 L9 3 L13 18 L0 9 L-13 18 L-9 3 L-21 -6 L-6 -6Z" fill="#fcc419"/>',
    'heart': '<path d="M0 16 C-24 0 -18 -20 -6 -18 C-2 -18 0 -14 0 -12 C0 -14 2 -18 6 -18 C18 -20 24 0 0 16Z" fill="#fa5252"/>',
    'drop': '<path d="M0 -20 C10 -6 14 2 14 8 A14 14 0 0 1 -14 8 C-14 2 -10 -6 0 -20Z" fill="#339af0"/>',
    'leaf': '<path d="M-16 14 C-16 -12 6 -20 18 -18 C18 -4 12 18 -16 14Z" fill="#40c057"/><path d="M-12 10 L10 -10" stroke="#2b8a3e" stroke-width="2.5"/>',
    'sun': '<circle r="10" fill="#ff922b"/>' + ''.join(f'<rect x="-2" y="-19" width="4" height="7" rx="2" fill="#ff922b" transform="rotate({a})"/>' for a in range(0, 360, 45)),
    'moon': '<path d="M6 -16 A16 16 0 1 0 6 16 A12 12 0 1 1 6 -16Z" fill="#845ef7"/>',
    'bolt': '<path d="M4 -20 L-10 4 L0 4 L-4 20 L12 -4 L2 -4Z" fill="#fab005"/>',
    'note': '<ellipse cx="-4" cy="10" rx="8" ry="6" fill="#e64980"/><rect x="2" y="-18" width="3.5" height="28" fill="#e64980"/><path d="M5.5 -18 q10 4 7 16 q-2 -9 -7 -8z" fill="#e64980"/>',
    'apple': '<circle cx="-5" cy="3" r="11" fill="#e03131"/><circle cx="5" cy="3" r="11" fill="#e03131"/><rect x="-1" y="-16" width="3" height="8" fill="#7a4d00"/><path d="M2 -12 q8 -6 12 0 q-8 4 -12 0z" fill="#40c057"/>',
    'key': '<circle cx="-8" cy="0" r="8" fill="none" stroke="#f59f00" stroke-width="5"/><path d="M0 0 H18 M12 0 V7 M17 0 V6" stroke="#f59f00" stroke-width="5" stroke-linecap="round"/>',
}


def scard(cx, cy, r, items, match, rot=0):
    out = [f'<g transform="translate({cx} {cy}) rotate({rot})" filter="url(#ds)"><circle r="{r}" fill="#fff"/><circle r="{r}" fill="none" stroke="#e7ecf5" stroke-width="5"/>']
    for (dx, dy, s, a, name) in items:
        hl = f'<circle r="28" fill="#ffd43b" opacity=".55" filter="url(#b3)"/>' if name == match else ''
        out.append(f'<g transform="translate({dx} {dy}) rotate({a}) scale({s})">{hl}{SHAPES[name]}</g>')
    out.append('</g>')
    return ''.join(out)


def spotit():
    defs = '''
<radialGradient id="bg" cx="50%" cy="40%" r="85%"><stop offset="0" stop-color="#22b8cf"/><stop offset=".6" stop-color="#0b7285"/><stop offset="1" stop-color="#062d36"/></radialGradient>'''
    a = [(0, 0, 1.9, 0, 'heart'), (-62, -46, 1.2, 20, 'sun'), (60, -54, 1.3, -10, 'leaf'), (78, 20, 1.1, 30, 'note'), (-72, 30, 1.4, -20, 'star'), (-10, 76, 1.2, 10, 'key'), (40, 70, 1.0, 0, 'drop')]
    b = [(0, 0, 1.6, 0, 'moon'), (-60, -50, 1.3, 0, 'bolt'), (58, -48, 1.8, 15, 'star'), (70, 34, 1.1, -12, 'apple'), (-66, 38, 1.2, 25, 'drop'), (-6, 80, 1.3, 0, 'leaf'), (-80, -4, .9, 0, 'note')]
    body = f'''<rect width="{W}" height="{H}" fill="url(#bg)"/>
{bokeh(91, 26, ['#99e9f2', '#ffffff', '#ffec99'], 4, 18, 0, 360, op=(.1, .35))}
{scard(190, 185, 128, a, 'star', -8)}{scard(455, 180, 128, b, 'star', 10)}
<path d="M140 213 C 260 110, 360 110, 518 131" stroke="#ffd43b" stroke-width="6" fill="none" stroke-dasharray="4 12" stroke-linecap="round" opacity=".95"/>
{sparkles(92, 16, '#fff', 0, 360)}'''
    return svg(defs, body)


# ─────────────────────────── 초성 퀴즈 ───────────────────────────
def jtile(x, y, ch, rot=0, s=1.0, open_=False):
    fill = 'url(#tileO)' if open_ else 'url(#tile)'
    return (f'<g transform="translate({x} {y}) rotate({rot}) scale({s})" filter="url(#ds)">'
            f'<rect x="-50" y="-50" width="100" height="112" rx="18" fill="#b8bfd6"/><rect x="-50" y="-56" width="100" height="108" rx="18" fill="{fill}"/>'
            f'<rect x="-44" y="-50" width="88" height="40" rx="14" fill="url(#gloss)" opacity=".7"/>'
            f'<text x="0" y="22" text-anchor="middle" font-size="64" fill="#1b2440" {FONT}>{ch}</text></g>')


def chosung():
    defs = '''
<radialGradient id="bg" cx="50%" cy="40%" r="85%"><stop offset="0" stop-color="#3b5bdb"/><stop offset=".6" stop-color="#1b2a6e"/><stop offset="1" stop-color="#070b24"/></radialGradient>
<linearGradient id="tile" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#e3e8f5"/></linearGradient>
<linearGradient id="tileO" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe066"/><stop offset="1" stop-color="#fcc419"/></linearGradient>'''
    body = f'''<rect width="{W}" height="{H}" fill="url(#bg)"/>
{bokeh(101, 26, ['#91a7ff', '#ffffff', '#ffe066'], 4, 18, 0, 360, op=(.1, .35))}
<rect x="70" y="40" width="500" height="280" rx="30" fill="none" stroke="#748ffc" stroke-width="3" opacity=".5"/>
<rect x="220" y="62" width="200" height="40" rx="20" fill="#fff" opacity=".14"/>
<text x="320" y="90" text-anchor="middle" font-size="22" fill="#fff" {FONT}>음식</text>
{jtile(170, 195, 'ㄱ', -8)}{jtile(275, 185, 'ㅊ', 4, 1.05)}{jtile(380, 190, 'ㅉ', -3, 1.0, True)}{jtile(478, 200, 'ㄱ', 9)}
<text x="560" y="120" font-size="80" fill="#ffe066" opacity=".9" transform="rotate(14 560 120)" {FONT}>?</text>
<text x="60" y="300" font-size="56" fill="#91a7ff" opacity=".6" transform="rotate(-12 60 300)" {FONT}>?</text>
{sparkles(102, 14, '#fff', 0, 360)}'''
    return svg(defs, body)


# ─────────────────────────── 한 단어 ───────────────────────────
def board(x, y, rot, word, crossed=False, s=1.0):
    x_ = '<path d="M-60 -18 L60 18 M-60 18 L60 -18" stroke="#e03131" stroke-width="7" stroke-linecap="round" opacity=".9"/>' if crossed else ''
    return (f'<g transform="translate({x} {y}) rotate({rot}) scale({s})" filter="url(#ds)">'
            '<rect x="-78" y="-50" width="156" height="100" rx="14" fill="#fff"/><rect x="-78" y="-50" width="156" height="100" rx="14" fill="none" stroke="#dee2e6" stroke-width="4"/>'
            f'<text x="0" y="14" text-anchor="middle" font-size="38" fill="#1b2440" {FONT}>{word}</text>{x_}'
            '<rect x="-8" y="50" width="16" height="30" rx="4" fill="#adb5bd"/></g>')


def oneword():
    defs = '''
<radialGradient id="bg" cx="50%" cy="40%" r="85%"><stop offset="0" stop-color="#20c997"/><stop offset=".6" stop-color="#087f5b"/><stop offset="1" stop-color="#022b1f"/></radialGradient>
<linearGradient id="q" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffe066"/><stop offset="1" stop-color="#fab005"/></linearGradient>'''
    body = f'''<rect width="{W}" height="{H}" fill="url(#bg)"/>
{bokeh(111, 26, ['#96f2d7', '#ffffff', '#ffec99'], 4, 18, 0, 360, op=(.1, .35))}
<g transform="translate(320 110)" filter="url(#ds)"><rect x="-70" y="-72" width="140" height="144" rx="24" fill="url(#q)"/>
<text x="0" y="36" text-anchor="middle" font-size="110" fill="#fff" {FONT}>?</text></g>
{board(100, 252, -10, '빨간', s=.86)}{board(245, 278, -3, '동그란', s=.86)}{board(398, 276, 4, '과일', True, .86)}{board(545, 250, 11, '과일', True, .86)}
{sparkles(112, 14, '#fff', 0, 200)}'''
    return svg(defs, body)


# ─────────────────────────── 사목 ───────────────────────────
def connect4():
    defs = '''
<radialGradient id="bg" cx="50%" cy="30%" r="85%"><stop offset="0" stop-color="#4dabf7"/><stop offset=".55" stop-color="#1864ab"/><stop offset="1" stop-color="#061a33"/></radialGradient>
<linearGradient id="frame" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3b82f6"/><stop offset="1" stop-color="#1d4ed8"/></linearGradient>
<radialGradient id="red" cx="40%" cy="35%" r="70%"><stop offset="0" stop-color="#ff8787"/><stop offset=".6" stop-color="#e03131"/><stop offset="1" stop-color="#a51111"/></radialGradient>
<radialGradient id="yel" cx="40%" cy="35%" r="70%"><stop offset="0" stop-color="#fff3bf"/><stop offset=".6" stop-color="#fcc419"/><stop offset="1" stop-color="#d69e00"/></radialGradient>'''
    grid = [
        '.......',
        '.......',
        '...Y...',
        '..RRY..',
        '.YRYR..',
        'RYRRYY.',
    ]
    cells = []
    cs = 44
    ox, oy = 320 - 3.5 * cs * 1.18, 92
    for r, row in enumerate(grid):
        for c, v in enumerate(row):
            x, y = ox + c * cs * 1.18 + cs * .59, oy + r * cs * 1.05
            if v == '.':
                cells.append(f'<circle cx="{x:.0f}" cy="{y:.0f}" r="19" fill="#0b2a5b"/>')
            else:
                cells.append(f'<circle cx="{x:.0f}" cy="{y:.0f}" r="19" fill="url(#{"red" if v == "R" else "yel"})"/>')
    body = f'''<rect width="{W}" height="{H}" fill="url(#bg)"/>
{bokeh(121, 24, ['#a5d8ff', '#ffffff'], 4, 18, 0, 360, op=(.1, .35))}
{shadow(320, 352, 230, 14, .55)}
<g filter="url(#ds)"><rect x="{ox - 16:.0f}" y="{oy - 30:.0f}" width="{7 * cs * 1.18 + 32:.0f}" height="{6 * cs * 1.05 + 36:.0f}" rx="22" fill="url(#frame)"/>{''.join(cells)}</g>
<g filter="url(#ds)"><circle cx="{ox + 5 * cs * 1.18 + cs * .59:.0f}" cy="42" r="22" fill="url(#red)"/></g>
<path d="M{ox + 5 * cs * 1.18 + cs * .59:.0f} 70 v16 m-8 -8 l8 8 l8 -8" stroke="#fff" stroke-width="4" fill="none" stroke-linecap="round" opacity=".8"/>
<path d="M{ox + 2 * cs * 1.18 + cs * .59 - 26:.0f} {oy + 3 * cs * 1.05 + 26:.0f} L{ox + 5 * cs * 1.18 + cs * .59 + 26:.0f} {oy + 0 * cs * 1.05 - 20:.0f}" stroke="#fff" stroke-width="0" />
{sparkles(122, 12, '#fff', 0, 200)}'''
    return svg(defs, body)


ART = {'song': song, 'indian': indian, 'yut': yut, 'dice': dice, 'rankwar': rankwar, 'spotit': spotit, 'chosung': chosung, 'oneword': oneword, 'connect4': connect4}

if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    for k, fn in ART.items():
        with open(os.path.join(OUT, f'{k}.svg'), 'w', encoding='utf-8') as f:
            f.write(fn())
    print('wrote', len(ART), 'files to', OUT)
