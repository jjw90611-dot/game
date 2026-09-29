#!/usr/bin/env python3
# 사용법: python3 tools/genart.py public/art
"""보드게임 모음집 키아트(16:9 SVG) 생성기. public/art/<id>.svg 로 저장합니다."""
import math, random, os, sys

W, H = 640, 360
OUT = sys.argv[1] if len(sys.argv) > 1 else 'public/art'

COMMON_DEFS = '''
<filter id="b1" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="1.2"/></filter>
<filter id="b3" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3"/></filter>
<filter id="b8" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="8"/></filter>
<filter id="b16" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="16"/></filter>
<filter id="b30" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="30"/></filter>
<filter id="ds" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="8" stdDeviation="8" flood-color="#000" flood-opacity=".45"/></filter>
<filter id="ds2" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#000" flood-opacity=".45"/></filter>
<radialGradient id="vig" cx="50%" cy="48%" r="75%"><stop offset=".55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".75"/></radialGradient>
<linearGradient id="gloss" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/></linearGradient>
'''


def svg(defs, body, vignette=True):
    v = f'<rect width="{W}" height="{H}" fill="url(#vig)"/>' if vignette else ''
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" preserveAspectRatio="xMidYMid slice">'
            f'<defs>{COMMON_DEFS}{defs}</defs>{body}{v}</svg>')


def bokeh(seed, n, colors, rmin=4, rmax=18, y0=0, y1=H, op=(.15, .5)):
    rnd = random.Random(seed)
    out = []
    for _ in range(n):
        x, y = rnd.uniform(0, W), rnd.uniform(y0, y1)
        r = rnd.uniform(rmin, rmax)
        c = rnd.choice(colors)
        o = rnd.uniform(*op)
        out.append(f'<circle cx="{x:.0f}" cy="{y:.0f}" r="{r:.1f}" fill="{c}" opacity="{o:.2f}" filter="url(#b3)"/>')
    return ''.join(out)


def sparkles(seed, n, color='#fff', y0=0, y1=H, smin=3, smax=9):
    rnd = random.Random(seed)
    out = []
    for _ in range(n):
        x, y, s = rnd.uniform(0, W), rnd.uniform(y0, y1), rnd.uniform(smin, smax)
        o = rnd.uniform(.4, 1)
        out.append(f'<path d="M{x:.0f} {y-s:.0f} L{x+s*.22:.1f} {y-s*.22:.1f} L{x+s:.0f} {y:.0f} L{x+s*.22:.1f} {y+s*.22:.1f} L{x:.0f} {y+s:.0f} L{x-s*.22:.1f} {y+s*.22:.1f} L{x-s:.0f} {y:.0f} L{x-s*.22:.1f} {y-s*.22:.1f}Z" fill="{color}" opacity="{o:.2f}"/>')
    return ''.join(out)


def shadow(cx, cy, rx, ry, op=.5):
    return f'<ellipse cx="{cx}" cy="{cy}" rx="{rx}" ry="{ry}" fill="#000" opacity="{op}" filter="url(#b8)"/>'


# ─────────────────────────── 라이어 게임 ───────────────────────────
def liar():
    defs = '''
<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0e1b33"/><stop offset=".6" stop-color="#101a2c"/><stop offset="1" stop-color="#05080f"/></linearGradient>
<linearGradient id="beam" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff5d6" stop-opacity=".55"/><stop offset="1" stop-color="#fff5d6" stop-opacity="0"/></linearGradient>
<radialGradient id="mask" cx="38%" cy="30%" r="80%"><stop offset="0" stop-color="#ffffff"/><stop offset=".55" stop-color="#e9edf5"/><stop offset="1" stop-color="#9aa6bb"/></radialGradient>
<radialGradient id="mask2" cx="40%" cy="30%" r="80%"><stop offset="0" stop-color="#ff5d6c"/><stop offset=".6" stop-color="#c0142d"/><stop offset="1" stop-color="#5a0714"/></radialGradient>
<linearGradient id="gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff1b8"/><stop offset=".5" stop-color="#f5b83d"/><stop offset="1" stop-color="#a86310"/></linearGradient>
<radialGradient id="floor" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#ffe9a8" stop-opacity=".35"/><stop offset="1" stop-color="#ffe9a8" stop-opacity="0"/></radialGradient>'''
    face = 'M0 -78 C44 -78 70 -46 70 -4 C70 44 40 84 0 96 C-40 84 -70 44 -70 -4 C-70 -46 -44 -78 0 -78Z'
    eyes = '<path d="M-44 -14 C-36 -30 -14 -30 -8 -12 C-16 -4 -36 -2 -44 -14Z" fill="#0b1120"/><path d="M44 -14 C36 -30 14 -30 8 -12 C16 -4 36 -2 44 -14Z" fill="#0b1120"/>'
    body = f'''<rect width="{W}" height="{H}" fill="url(#bg)"/>
{bokeh(1, 26, ['#3d6bff', '#7aa2ff', '#ff4d6d'], 3, 14, op=(.1, .4))}
<polygon points="250,-20 390,-20 520,360 120,360" fill="url(#beam)" opacity=".7"/>
<ellipse cx="320" cy="330" rx="220" ry="40" fill="url(#floor)"/>
<g transform="translate(360 175) rotate(12)" opacity=".9"><path d="{face}" fill="url(#mask2)" filter="url(#ds)"/>{eyes}<path d="M-24 50 Q0 32 24 50" stroke="#3a0610" stroke-width="7" fill="none" stroke-linecap="round"/></g>
<g transform="translate(290 170) rotate(-8)"><path d="{face}" fill="url(#mask)" filter="url(#ds)"/>{eyes}
<path d="M-26 44 Q0 66 26 44" stroke="#1d2536" stroke-width="7" fill="none" stroke-linecap="round"/>
<path d="M-60 -40 C-40 -70 10 -80 40 -66" stroke="#fff" stroke-width="6" fill="none" opacity=".8" stroke-linecap="round"/>
<path d="M-8 -12 L-4 26 L10 28" stroke="#b9c3d6" stroke-width="4" fill="none" stroke-linecap="round"/></g>
<g filter="url(#ds2)">
<rect x="70" y="92" width="118" height="54" rx="26" fill="#fff" opacity=".92"/><path d="M150 144 L170 168 L128 146Z" fill="#fff" opacity=".92"/>
<circle cx="104" cy="119" r="7" fill="#2e3a55"/><circle cx="129" cy="119" r="7" fill="#2e3a55"/><circle cx="154" cy="119" r="7" fill="#2e3a55"/>
<rect x="468" y="210" width="104" height="48" rx="24" fill="#fff" opacity=".9"/><path d="M488 256 L474 280 L512 258Z" fill="#fff" opacity=".9"/>
<circle cx="498" cy="234" r="6" fill="#2e3a55"/><circle cx="520" cy="234" r="6" fill="#2e3a55"/><circle cx="542" cy="234" r="6" fill="#2e3a55"/></g>
<g transform="translate(520 118) rotate(10)"><text x="0" y="0" text-anchor="middle" font-family="Georgia, serif" font-weight="700" font-size="120" fill="url(#gold)" filter="url(#ds)">?</text></g>
<text x="520" y="110" text-anchor="middle" font-family="Georgia, serif" font-weight="700" font-size="120" fill="#ffd66b" opacity=".5" filter="url(#b16)" transform="rotate(10 520 110)">?</text>'''
    return svg(defs, body)


# ─────────────────────────── 마피아 ───────────────────────────
def mafia():
    defs = '''
<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0a0f22"/><stop offset=".55" stop-color="#18183a"/><stop offset="1" stop-color="#050510"/></linearGradient>
<radialGradient id="moon" cx="45%" cy="40%" r="60%"><stop offset="0" stop-color="#fffbe8"/><stop offset=".7" stop-color="#f3dea0"/><stop offset="1" stop-color="#c7a55a"/></radialGradient>
<radialGradient id="moonglow" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#ffe7a6" stop-opacity=".5"/><stop offset="1" stop-color="#ffe7a6" stop-opacity="0"/></radialGradient>
<linearGradient id="coat" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#23283a"/><stop offset="1" stop-color="#07080d"/></linearGradient>
<linearGradient id="hat" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2b3147"/><stop offset="1" stop-color="#0b0d15"/></linearGradient>
<linearGradient id="lamp" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffcf6e" stop-opacity=".6"/><stop offset="1" stop-color="#ffcf6e" stop-opacity="0"/></linearGradient>'''
    rnd = random.Random(7)
    city = []
    x = -10
    while x < W:
        w = rnd.randint(28, 60)
        h = rnd.randint(70, 170)
        city.append(f'<rect x="{x}" y="{H-h}" width="{w}" height="{h}" fill="#0b0e1c"/>')
        for wy in range(H - h + 10, H - 10, 14):
            for wx in range(x + 5, x + w - 6, 10):
                if rnd.random() < .22:
                    city.append(f'<rect x="{wx}" y="{wy}" width="4" height="6" fill="#ffd27a" opacity="{rnd.uniform(.4,.95):.2f}"/>')
        x += w + rnd.randint(2, 8)
    rain = ''.join(f'<line x1="{rnd.uniform(0,W+80):.0f}" y1="{rnd.uniform(-20,H):.0f}" x2="{0:.0f}" y2="0" stroke="#9fb7ff" stroke-width="1" opacity=".18" transform="translate(-14 26)"/>' for _ in range(0))
    rain = ''.join((lambda x0, y0: f'<line x1="{x0:.0f}" y1="{y0:.0f}" x2="{x0-10:.0f}" y2="{y0+26:.0f}" stroke="#a9c1ff" stroke-width="1.2" opacity=".22"/>')(rnd.uniform(0, W + 20), rnd.uniform(-20, H)) for _ in range(90))
    body = f'''<rect width="{W}" height="{H}" fill="url(#bg)"/>
<circle cx="470" cy="104" r="120" fill="url(#moonglow)"/>
<circle cx="470" cy="104" r="58" fill="url(#moon)"/>
<circle cx="452" cy="92" r="9" fill="#d8bf7c" opacity=".5"/><circle cx="486" cy="120" r="12" fill="#d8bf7c" opacity=".45"/><circle cx="492" cy="84" r="5" fill="#d8bf7c" opacity=".5"/>
<ellipse cx="380" cy="150" rx="160" ry="16" fill="#0a0f22" opacity=".85" filter="url(#b8)"/>
{''.join(city)}
<polygon points="566,168 596,168 640,360 520,360" fill="url(#lamp)" opacity=".5"/>
<rect x="578" y="168" width="6" height="200" fill="#0b0e1c"/><circle cx="581" cy="164" r="9" fill="#ffd27a"/><circle cx="581" cy="164" r="26" fill="#ffd27a" opacity=".35" filter="url(#b8)"/>
{rain}
<g filter="url(#ds)">
<path d="M70 360 C80 280 120 246 200 236 C280 246 320 280 330 360Z" fill="url(#coat)"/>
<path d="M200 236 L178 300 L200 360 L222 300Z" fill="#11131d"/>
<path d="M188 262 L200 250 L212 262 L204 300 L196 300Z" fill="#b3122b"/>
<path d="M160 180 C160 140 240 140 240 180 L240 214 C240 240 160 240 160 214Z" fill="#161a28"/>
<path d="M90 164 C120 150 280 150 310 164 C300 176 100 176 90 164Z" fill="url(#hat)"/>
<path d="M140 162 C140 104 260 104 260 162Z" fill="url(#hat)"/>
<path d="M140 150 C180 140 220 140 260 150 L260 162 C220 154 180 154 140 162Z" fill="#b3122b"/>
<path d="M92 164 C140 156 260 156 308 164" stroke="#8fa8ff" stroke-width="2" fill="none" opacity=".55"/>
<path d="M142 120 C160 104 236 104 258 122" stroke="#8fa8ff" stroke-width="2" fill="none" opacity=".4"/>
<path d="M298 250 C312 270 318 300 324 360" stroke="#8fa8ff" stroke-width="2" fill="none" opacity=".35"/>
</g>
<path d="M232 206 C262 190 250 160 276 140 C300 120 290 90 312 72" stroke="#cfd6e6" stroke-width="5" fill="none" opacity=".35" filter="url(#b3)" stroke-linecap="round"/>
<rect x="228" y="203" width="22" height="5" rx="2" fill="#e8e1d3" transform="rotate(-12 239 205)"/><circle cx="251" cy="201" r="3" fill="#ff7a3d"/>'''
    return svg(defs, body)


# ─────────────────────────── 그림 맞히기 ───────────────────────────
def drawguess():
    defs = '''
<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffb347"/><stop offset=".5" stop-color="#ff7b54"/><stop offset="1" stop-color="#d63e6c"/></linearGradient>
<linearGradient id="paper" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#f1ede4"/></linearGradient>
<linearGradient id="wood" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#8a5226"/><stop offset=".5" stop-color="#c57b3d"/><stop offset="1" stop-color="#7a4520"/></linearGradient>
<linearGradient id="metal" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#8b95a8"/><stop offset=".5" stop-color="#eef2f8"/><stop offset="1" stop-color="#7d879b"/></linearGradient>'''
    splats = ''.join(f'<circle cx="{x}" cy="{y}" r="{r}" fill="{c}" opacity=".9"/>' for x, y, r, c in [
        (86, 290, 26, '#2f7bff'), (112, 312, 10, '#2f7bff'), (548, 70, 22, '#ffe45c'), (574, 96, 9, '#ffe45c'), (80, 70, 16, '#3ddc97'), (566, 300, 24, '#8e5cff'), (536, 318, 8, '#8e5cff')])
    body = f'''<rect width="{W}" height="{H}" fill="url(#bg)"/>
{bokeh(3, 18, ['#fff', '#ffe9a8'], 6, 22, op=(.1, .35))}
{splats}
<g transform="translate(320 186) rotate(-4)" filter="url(#ds)">
<rect x="-170" y="-120" width="340" height="236" rx="10" fill="url(#paper)"/>
<rect x="-170" y="-120" width="340" height="236" rx="10" fill="none" stroke="#e2dccf" stroke-width="2"/>
<g stroke-linecap="round" stroke-linejoin="round" fill="none">
<path d="M-70 40 C-90 -20 -60 -70 0 -70 C60 -70 90 -20 70 40 C50 80 -50 80 -70 40Z" stroke="#1d2433" stroke-width="7"/>
<path d="M-62 -36 L-80 -96 L-26 -66" stroke="#1d2433" stroke-width="7"/><path d="M62 -36 L80 -96 L26 -66" stroke="#1d2433" stroke-width="7"/>
<circle cx="-28" cy="-6" r="8" fill="#1d2433" stroke="none"/><circle cx="28" cy="-6" r="8" fill="#1d2433" stroke="none"/>
<path d="M-8 18 L0 26 L8 18" stroke="#ff5a7a" stroke-width="6"/><path d="M0 26 Q-12 40 -24 32 M0 26 Q12 40 24 32" stroke="#1d2433" stroke-width="5"/>
<path d="M-44 20 L-110 8 M-44 30 L-108 36 M44 20 L110 8 M44 30 L108 36" stroke="#1d2433" stroke-width="4"/>
<path d="M-130 80 C-80 60 -40 96 10 84 C60 72 100 96 140 80" stroke="#3ddc97" stroke-width="10" opacity=".85"/>
<path d="M110 -84 C120 -100 140 -100 146 -86 C150 -74 136 -64 128 -60" stroke="#ffb020" stroke-width="7"/>
</g></g>
<g transform="translate(510 206) rotate(38)" filter="url(#ds)">
<rect x="-9" y="-130" width="18" height="160" rx="6" fill="url(#wood)"/><rect x="-10" y="20" width="20" height="26" fill="url(#metal)"/>
<path d="M-10 46 C-12 70 0 96 0 96 C0 96 12 70 10 46Z" fill="#1d2433"/><path d="M-6 72 C-4 84 0 92 0 92 C0 92 4 84 6 72Z" fill="#ff4d6d"/></g>
<g transform="translate(118 190) rotate(-24)" filter="url(#ds)">
<rect x="-7" y="-120" width="14" height="190" rx="3" fill="#ffd34d"/><rect x="-7" y="-120" width="5" height="190" fill="#ffe89a"/>
<polygon points="-7,70 7,70 0,96" fill="#f3c98b"/><polygon points="-3,86 3,86 0,96" fill="#1d2433"/><rect x="-7" y="-136" width="14" height="18" rx="3" fill="#ff8fa3"/></g>
<g transform="translate(446 96) rotate(8)" filter="url(#ds2)"><circle r="34" fill="#fff"/><text y="16" text-anchor="middle" font-family="Georgia, serif" font-weight="700" font-size="46" fill="#ff5a36">?</text></g>'''
    return svg(defs, body)


# ─────────────────────────── 러미 타일 ───────────────────────────
def tile3d(x, y, n, color, s=1.0, rot=0, joker=False, glow=False):
    w, h, d = 46 * s, 62 * s, 8 * s
    g = f'<rect x="{-w/2-8}" y="{-h/2-8}" width="{w+16}" height="{h+16}" rx="{12*s}" fill="#ffd34d" opacity=".55" filter="url(#b8)"/>' if glow else ''
    face = (f'<circle cx="0" cy="{-4*s}" r="{14*s}" fill="#ff5a8a"/><circle cx="{-5*s}" cy="{-8*s}" r="{2.4*s}" fill="#1d2433"/><circle cx="{5*s}" cy="{-8*s}" r="{2.4*s}" fill="#1d2433"/><path d="M{-6*s} {0} Q0 {7*s} {6*s} 0" stroke="#1d2433" stroke-width="{2.2*s}" fill="none"/>'
            if joker else f'<text x="0" y="{9*s}" text-anchor="middle" font-family="Arial Black, Arial, sans-serif" font-weight="900" font-size="{30*s}" fill="{color}">{n}</text>')
    return (f'<g transform="translate({x} {y}) rotate({rot})" filter="url(#ds2)">{g}'
            f'<rect x="{-w/2}" y="{-h/2+d}" width="{w}" height="{h}" rx="{8*s}" fill="#c9b690"/>'
            f'<rect x="{-w/2}" y="{-h/2}" width="{w}" height="{h}" rx="{8*s}" fill="url(#tile)"/>'
            f'<rect x="{-w/2+3*s}" y="{-h/2+3*s}" width="{w-6*s}" height="{h*0.45}" rx="{6*s}" fill="url(#gloss)" opacity=".7"/>'
            f'{face}<circle cx="0" cy="{h/2-9*s}" r="{3*s}" fill="{color if not joker else "#ff5a8a"}" opacity=".6"/></g>')


def rummy():
    defs = '''
<radialGradient id="bg" cx="50%" cy="35%" r="80%"><stop offset="0" stop-color="#1f8a55"/><stop offset=".6" stop-color="#0f5134"/><stop offset="1" stop-color="#062418"/></radialGradient>
<linearGradient id="tile" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fffdf5"/><stop offset="1" stop-color="#efe3c6"/></linearGradient>
<linearGradient id="rack" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#b5773a"/><stop offset="1" stop-color="#6d421b"/></linearGradient>
<radialGradient id="spot" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#fff7d6" stop-opacity=".35"/><stop offset="1" stop-color="#fff7d6" stop-opacity="0"/></radialGradient>'''
    R, B, O, K = '#e5383b', '#1c6ed6', '#f08c00', '#1d2433'
    body = f'''<rect width="{W}" height="{H}" fill="url(#bg)"/>
<ellipse cx="320" cy="170" rx="300" ry="150" fill="url(#spot)"/>
{bokeh(4, 20, ['#fff6c9', '#b8ffd9'], 4, 16, 0, 140, op=(.08, .3))}
<g opacity=".9">{tile3d(96, 96, 7, R, .78, -6)}{tile3d(140, 92, 8, R, .78, -4)}{tile3d(184, 90, 9, R, .78, -2)}</g>
<g opacity=".9">{tile3d(470, 86, 11, B, .78, 4)}{tile3d(514, 90, 11, O, .78, 6)}{tile3d(558, 96, 11, K, .78, 8)}</g>
<g>{tile3d(206, 200, 10, B, 1.18, -8)}{tile3d(268, 190, 11, B, 1.18, -3)}{tile3d(330, 186, 12, B, 1.18, 2)}{tile3d(392, 190, 13, B, 1.18, 7)}</g>
{tile3d(470, 214, 0, '#fff', 1.32, 14, joker=True, glow=True)}
{shadow(320, 334, 250, 16, .6)}
<path d="M70 300 L570 300 L600 346 L40 346Z" fill="url(#rack)"/><path d="M70 300 L570 300 L574 308 L66 308Z" fill="#d89a58"/>
<g opacity=".95">{''.join(tile3d(100 + i*44, 286, n, c, .72, 0) for i, (n, c) in enumerate([(3, R), (3, B), (3, O), (5, K), (6, K), (7, K), (1, O), (12, R), (2, B), (4, O), (9, B)]))}</g>
{sparkles(5, 8, '#fff6c9', 40, 150)}'''
    return svg(defs, body)


# ─────────────────────────── 요트 다이스 ───────────────────────────
PIPS = {1: [(0, 0)], 2: [(-1, -1), (1, 1)], 3: [(-1, -1), (0, 0), (1, 1)], 4: [(-1, -1), (1, -1), (-1, 1), (1, 1)],
        5: [(-1, -1), (1, -1), (0, 0), (-1, 1), (1, 1)], 6: [(-1, -1), (1, -1), (-1, 0), (1, 0), (-1, 1), (1, 1)]}


def die(x, y, s, rot, pips, blur=False):
    d = s * .27
    pip = ''.join(f'<circle cx="{a*d:.1f}" cy="{b*d:.1f}" r="{s*.085:.1f}" fill="{"#e03131" if pips == 1 else "#1d2433"}"/>' for a, b in PIPS[pips])
    f = ' filter="url(#b3)"' if blur else ' filter="url(#ds)"'
    return (f'<g transform="translate({x} {y}) rotate({rot})"{f}>'
            f'<rect x="{-s/2}" y="{-s/2+s*.08}" width="{s}" height="{s}" rx="{s*.2}" fill="#aeb6c6"/>'
            f'<rect x="{-s/2}" y="{-s/2}" width="{s}" height="{s}" rx="{s*.2}" fill="url(#dice)"/>'
            f'<rect x="{-s/2+s*.06}" y="{-s/2+s*.05}" width="{s*.88}" height="{s*.4}" rx="{s*.16}" fill="url(#gloss)" opacity=".8"/>{pip}</g>')


def yacht():
    defs = '''
<radialGradient id="bg" cx="50%" cy="40%" r="80%"><stop offset="0" stop-color="#2a6fdb"/><stop offset=".55" stop-color="#173b8a"/><stop offset="1" stop-color="#0a1433"/></radialGradient>
<linearGradient id="dice" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#dfe4ee"/></linearGradient>
<linearGradient id="cup" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#5a1d12"/><stop offset=".45" stop-color="#b54a2a"/><stop offset="1" stop-color="#4a160d"/></linearGradient>
<linearGradient id="trail" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#fff" stop-opacity=".45"/></linearGradient>
<radialGradient id="felt" cx="50%" cy="0%" r="100%"><stop offset="0" stop-color="#1c8f5a"/><stop offset="1" stop-color="#0a3f28"/></radialGradient>'''
    body = f'''<rect width="{W}" height="{H}" fill="url(#bg)"/>
{bokeh(6, 26, ['#9cc3ff', '#ffffff', '#ffd66b'], 4, 20, 0, 230, op=(.1, .4))}
<path d="M0 270 C160 250 480 250 640 270 L640 360 L0 360Z" fill="url(#felt)"/>
<path d="M0 270 C160 250 480 250 640 270" stroke="#43c486" stroke-width="3" fill="none" opacity=".6"/>
<g transform="translate(520 150) rotate(-32)" filter="url(#ds)">
<path d="M-60 -70 L60 -70 L46 80 L-46 80Z" fill="url(#cup)"/><ellipse cx="0" cy="-70" rx="60" ry="16" fill="#3a0f08"/><ellipse cx="0" cy="-70" rx="60" ry="16" fill="none" stroke="#e08a5c" stroke-width="3"/>
<path d="M-50 -30 L50 -30 M-48 0 L48 0 M-46 30 L46 30" stroke="#e08a5c" stroke-width="3" opacity=".6"/></g>
<rect x="250" y="112" width="190" height="26" rx="13" fill="url(#trail)" transform="rotate(-20 345 125)"/>
<rect x="240" y="180" width="170" height="20" rx="10" fill="url(#trail)" transform="rotate(-8 325 190)"/>
{die(420, 90, 54, 30, 3, True)}{die(372, 170, 60, -18, 5)}{die(262, 110, 66, 16, 2)}
{shadow(210, 300, 90, 14, .55)}{die(210, 238, 118, -10, 6)}
{shadow(360, 304, 60, 10, .5)}{die(362, 262, 80, 22, 1)}
{sparkles(8, 12, '#fff', 20, 200)}'''
    return svg(defs, body)


# ─────────────────────────── 오목 ───────────────────────────
def omok():
    defs = '''
<radialGradient id="bg" cx="60%" cy="20%" r="90%"><stop offset="0" stop-color="#5a3a1c"/><stop offset=".6" stop-color="#2a1a0c"/><stop offset="1" stop-color="#0e0804"/></radialGradient>
<linearGradient id="board" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f0c67e"/><stop offset="1" stop-color="#c98f45"/></linearGradient>
<linearGradient id="side" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9c6428"/><stop offset="1" stop-color="#5e3a14"/></linearGradient>
<radialGradient id="bk" cx="35%" cy="30%" r="70%"><stop offset="0" stop-color="#6b6f7a"/><stop offset=".45" stop-color="#1b1d22"/><stop offset="1" stop-color="#000"/></radialGradient>
<radialGradient id="wh" cx="35%" cy="30%" r="75%"><stop offset="0" stop-color="#ffffff"/><stop offset=".7" stop-color="#eceff4"/><stop offset="1" stop-color="#b8bfcc"/></radialGradient>
<linearGradient id="win" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ffd76b" stop-opacity="0"/><stop offset=".5" stop-color="#ffd76b"/><stop offset="1" stop-color="#ffd76b" stop-opacity="0"/></linearGradient>'''
    # 원근 보드: 위(y=120) 폭 360, 아래(y=360) 폭 760
    top_y, bot_y = 118, 380
    def P(u, v):  # u,v in 0..1
        y = top_y + (bot_y - top_y) * (v ** 1.15)
        half = 180 + 200 * v
        return 320 - half + 2 * half * u, y
    lines = []
    N = 11
    for i in range(N):
        u = (i + .5) / N
        x1, y1 = P(u, 0); x2, y2 = P(u, 1)
        lines.append(f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}"/>')
        v = (i + .5) / N
        a, b = P(0, v); c, d = P(1, v)
        lines.append(f'<line x1="{a:.1f}" y1="{b:.1f}" x2="{c:.1f}" y2="{d:.1f}"/>')
    stones = []
    def stone(i, j, col):
        x, y = P((i + .5) / N, (j + .5) / N)
        v = (j + .5) / N
        r = 11 + 13 * v
        stones.append(f'<ellipse cx="{x:.1f}" cy="{y+r*.28:.1f}" rx="{r:.1f}" ry="{r*.55:.1f}" fill="#000" opacity=".35" filter="url(#b3)"/>'
                      f'<ellipse cx="{x:.1f}" cy="{y:.1f}" rx="{r:.1f}" ry="{r*.72:.1f}" fill="url(#{col})"/>'
                      f'<ellipse cx="{x-r*.3:.1f}" cy="{y-r*.28:.1f}" rx="{r*.3:.1f}" ry="{r*.16:.1f}" fill="#fff" opacity="{.35 if col == "bk" else .8}"/>')
    black = [(2, 8), (3, 7), (4, 6), (5, 5), (6, 4)]
    for i, j in black: stone(i, j, 'bk')
    for i, j in [(4, 7), (5, 6), (6, 5), (3, 5), (7, 6), (6, 7), (8, 4), (2, 6)]: stone(i, j, 'wh')
    stone(8, 8, 'bk'); stone(1, 9, 'wh')
    (x1, y1), (x2, y2) = P(2.5 / N, 8.5 / N), P(6.5 / N, 4.5 / N)
    body = f'''<rect width="{W}" height="{H}" fill="url(#bg)"/>
{bokeh(9, 16, ['#ffcf7a', '#fff1c9'], 6, 22, 0, 110, op=(.1, .35))}
<path d="M{P(0,0)[0]:.1f} {top_y} L{P(1,0)[0]:.1f} {top_y} L{P(1,1)[0]:.1f} {bot_y} L{P(0,1)[0]:.1f} {bot_y}Z" fill="url(#board)" filter="url(#ds)"/>
<path d="M{P(0,0)[0]:.1f} {top_y} L{P(1,0)[0]:.1f} {top_y} L{P(1,0)[0]:.1f} {top_y-8} L{P(0,0)[0]:.1f} {top_y-8}Z" fill="url(#side)"/>
<g stroke="#6b4318" stroke-width="1.4" opacity=".75">{''.join(lines)}</g>
<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" stroke="#ffd76b" stroke-width="30" opacity=".35" filter="url(#b8)" stroke-linecap="round"/>
{''.join(stones)}
<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" stroke="#ffe39a" stroke-width="3" opacity=".9" stroke-linecap="round"/>
{sparkles(10, 10, '#ffe39a', 120, 330, 3, 8)}'''
    return svg(defs, body)


# ─────────────────────────── 단어 스파이 ───────────────────────────
def wordspy():
    defs = '''
<linearGradient id="bg" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#3a0d18"/><stop offset=".5" stop-color="#101626"/><stop offset="1" stop-color="#0b2552"/></linearGradient>
<linearGradient id="card" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fbf5e6"/><stop offset="1" stop-color="#e6dcc3"/></linearGradient>
<linearGradient id="red" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff5364"/><stop offset="1" stop-color="#b3122b"/></linearGradient>
<linearGradient id="blue" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4c8dff"/><stop offset="1" stop-color="#1446b8"/></linearGradient>
<radialGradient id="lens" cx="40%" cy="35%" r="70%"><stop offset="0" stop-color="#fff" stop-opacity=".45"/><stop offset=".6" stop-color="#bfe0ff" stop-opacity=".12"/><stop offset="1" stop-color="#7fb2ff" stop-opacity=".3"/></radialGradient>
<linearGradient id="handle" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#1a1d26"/><stop offset=".5" stop-color="#4a5064"/><stop offset="1" stop-color="#15171f"/></linearGradient>'''
    rnd = random.Random(12)
    cards = []
    for r in range(4):
        v = r / 3
        cw, ch = 70 + 18 * v, 42 + 10 * v
        gap = 10 + 6 * v
        y = 70 + r * (ch + 18) + r * r * 3
        total = 5 * cw + 4 * gap
        for c in range(5):
            x = 320 - total / 2 + c * (cw + gap)
            kind = rnd.choice(['c', 'c', 'c', 'r', 'b'])
            fill = {'c': 'url(#card)', 'r': 'url(#red)', 'b': 'url(#blue)'}[kind]
            cards.append(f'<g filter="url(#ds2)"><rect x="{x:.1f}" y="{y:.1f}" width="{cw:.1f}" height="{ch:.1f}" rx="6" fill="{fill}"/>'
                         + (f'<rect x="{x+12:.1f}" y="{y+ch/2-3:.1f}" width="{cw-24:.1f}" height="6" rx="3" fill="#b9ad90"/>' if kind == 'c' else
                            f'<circle cx="{x+cw/2:.1f}" cy="{y+ch/2:.1f}" r="{ch*.22:.1f}" fill="#fff" opacity=".85"/>') + '</g>')
    body = f'''<rect width="{W}" height="{H}" fill="url(#bg)"/>
<circle cx="0" cy="180" r="220" fill="#ff2e4d" opacity=".25" filter="url(#b30)"/><circle cx="640" cy="180" r="220" fill="#2e7bff" opacity=".3" filter="url(#b30)"/>
{''.join(cards)}
<g transform="translate(430 210)">
<circle r="74" fill="#000" opacity=".3" filter="url(#b8)" transform="translate(10 14)"/>
<rect x="44" y="48" width="26" height="110" rx="12" fill="url(#handle)" transform="rotate(-42)"/>
<circle r="70" fill="url(#lens)"/><circle r="70" fill="none" stroke="#2a2f3d" stroke-width="12"/><circle r="70" fill="none" stroke="#8d95ab" stroke-width="3" opacity=".7"/>
<path d="M-44 -30 A52 52 0 0 1 -10 -54" stroke="#fff" stroke-width="7" fill="none" opacity=".8" stroke-linecap="round"/></g>
<g transform="translate(130 300) rotate(-10)" opacity=".85"><rect x="-70" y="-22" width="140" height="44" rx="6" fill="none" stroke="#ff4d5e" stroke-width="4"/><text y="9" text-anchor="middle" font-family="Arial Black, Arial, sans-serif" font-weight="900" font-size="24" fill="#ff4d5e" letter-spacing="2">TOP SECRET</text></g>'''
    return svg(defs, body)


# ─────────────────────────── 컬러 원카드 ───────────────────────────
def onecard():
    defs = '''
<radialGradient id="bg" cx="50%" cy="60%" r="80%"><stop offset="0" stop-color="#ff4f9a"/><stop offset=".45" stop-color="#7b2ff7"/><stop offset="1" stop-color="#1a0b4a"/></radialGradient>
<linearGradient id="c0" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff5d5d"/><stop offset="1" stop-color="#c81d25"/></linearGradient>
<linearGradient id="c1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffd84d"/><stop offset="1" stop-color="#f08c00"/></linearGradient>
<linearGradient id="c2" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4ee08a"/><stop offset="1" stop-color="#138a47"/></linearGradient>
<linearGradient id="c3" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4ca6ff"/><stop offset="1" stop-color="#1552c2"/></linearGradient>'''
    rays = ''.join(f'<polygon points="320,260 {320+700*math.cos(a):.0f},{260+700*math.sin(a):.0f} {320+700*math.cos(a+.12):.0f},{260+700*math.sin(a+.12):.0f}" fill="#fff" opacity=".06"/>' for a in [i * .42 for i in range(15)])

    def card(x, y, rot, grad, label, wild=False):
        inner = ('<circle r="30" fill="#fff"/><path d="M0 -30 A30 30 0 0 1 30 0 L0 0Z" fill="#e03131"/><path d="M30 0 A30 30 0 0 1 0 30 L0 0Z" fill="#1c7ed6"/><path d="M0 30 A30 30 0 0 1 -30 0 L0 0Z" fill="#2f9e44"/><path d="M-30 0 A30 30 0 0 1 0 -30 L0 0Z" fill="#f59f00"/>'
                 if wild else f'<ellipse rx="40" ry="62" fill="#fff" transform="rotate(28)"/><text y="16" text-anchor="middle" font-family="Arial Black, Arial, sans-serif" font-weight="900" font-size="46" fill="#1d2433">{label}</text>')
        return (f'<g transform="translate({x} {y}) rotate({rot})" filter="url(#ds)"><rect x="-58" y="-86" width="116" height="172" rx="14" fill="#fff"/>'
                f'<rect x="-50" y="-78" width="100" height="156" rx="10" fill="{"#1d2433" if wild else f"url(#{grad})"}"/>{inner}'
                f'<text x="-40" y="-56" font-family="Arial Black, Arial, sans-serif" font-weight="900" font-size="16" fill="#fff">{"W" if wild else label}</text>'
                f'<rect x="-50" y="-78" width="100" height="60" rx="10" fill="url(#gloss)" opacity=".5"/></g>')
    body = f'''<rect width="{W}" height="{H}" fill="url(#bg)"/>
{rays}
{bokeh(14, 24, ['#fff', '#ffd6f0', '#b9a0ff'], 3, 14, op=(.15, .5))}
{card(190, 214, -34, 'c0', '7')}{card(258, 190, -16, 'c1', '+2')}{card(330, 182, 0, 'c2', '9')}{card(402, 190, 16, 'c3', '⇄')}{card(470, 214, 34, '', '', True)}
{sparkles(15, 14, '#fff', 10, 350, 4, 11)}'''
    return svg(defs, body)


# ─────────────────────────── 숫자 암호 ───────────────────────────
def numbercode():
    defs = '''
<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#06121f"/><stop offset=".6" stop-color="#0b1f33"/><stop offset="1" stop-color="#03070d"/></linearGradient>
<linearGradient id="blk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a4150"/><stop offset="1" stop-color="#0c0f16"/></linearGradient>
<linearGradient id="wht" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#cfd5df"/></linearGradient>
<linearGradient id="lockb" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffd76b"/><stop offset=".5" stop-color="#e09a1a"/><stop offset="1" stop-color="#8a5200"/></linearGradient>
<linearGradient id="shk" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#7d8698"/><stop offset=".5" stop-color="#f2f5fa"/><stop offset="1" stop-color="#6b7486"/></linearGradient>'''
    rnd = random.Random(21)
    grid = ''.join(f'<line x1="{x}" y1="0" x2="{x}" y2="{H}" stroke="#1ee3ff" stroke-width=".6" opacity=".08"/>' for x in range(0, W, 32)) + \
           ''.join(f'<line x1="0" y1="{y}" x2="{W}" y2="{y}" stroke="#1ee3ff" stroke-width=".6" opacity=".08"/>' for y in range(0, H, 32))
    code = ''.join(f'<text x="{rnd.randint(0,W)}" y="{rnd.randint(10,H)}" font-family="Courier New, monospace" font-size="{rnd.randint(10,18)}" fill="#1ee3ff" opacity="{rnd.uniform(.08,.3):.2f}">{rnd.choice(["0101","1100","0110","1001","11","01","7","3","9"])}</text>' for _ in range(40))
    tiles = []
    vals = [('b', '1'), ('w', '3'), ('b', '?'), ('w', '6'), ('b', '8'), ('w', '?'), ('b', '11')]
    for i, (c, n) in enumerate(vals):
        x = 92 + i * 66
        y = 212 + abs(i - 3) * 6
        rot = (i - 3) * 3
        glow = n == '?'
        fill = 'url(#blk)' if c == 'b' else 'url(#wht)'
        tc = '#fff' if c == 'b' else '#1d2433'
        if glow:
            tc = '#1ee3ff'
        tiles.append(f'<g transform="translate({x} {y}) rotate({rot})" filter="url(#ds)">'
                     + (f'<rect x="-30" y="-46" width="60" height="92" rx="10" fill="#1ee3ff" opacity=".45" filter="url(#b8)"/>' if glow else '')
                     + f'<rect x="-26" y="-40" width="52" height="84" rx="8" fill="{"#05080d" if c=="b" else "#aab2c0"}"/>'
                     f'<rect x="-26" y="-44" width="52" height="84" rx="8" fill="{fill}"/>'
                     f'<rect x="-22" y="-40" width="44" height="30" rx="6" fill="url(#gloss)" opacity=".35"/>'
                     f'<text y="{12 if len(n)==1 else 10}" text-anchor="middle" font-family="Arial Black, Arial, sans-serif" font-weight="900" font-size="{34 if len(n)==1 else 28}" fill="{tc}">{n}</text></g>')
    body = f'''<rect width="{W}" height="{H}" fill="url(#bg)"/>{grid}{code}
<circle cx="320" cy="200" r="220" fill="#1ee3ff" opacity=".08" filter="url(#b30)"/>
{''.join(tiles)}
<g transform="translate(540 92)" filter="url(#ds)"><path d="M-22 -4 V-26 A22 22 0 0 1 22 -26 V-4" stroke="url(#shk)" stroke-width="11" fill="none"/>
<rect x="-36" y="-8" width="72" height="62" rx="12" fill="url(#lockb)"/><rect x="-36" y="-8" width="72" height="24" rx="12" fill="url(#gloss)" opacity=".4"/>
<circle cy="18" r="8" fill="#3a2300"/><rect x="-3" y="20" width="6" height="16" rx="3" fill="#3a2300"/></g>
<circle cx="540" cy="110" r="60" fill="#ffd76b" opacity=".15" filter="url(#b16)"/>'''
    return svg(defs, body)


# ─────────────────────────── 과일 종치기 ───────────────────────────
def strawberry(x, y, s=1.0):
    seeds = ''.join(f'<ellipse cx="{a*s:.1f}" cy="{b*s:.1f}" rx="{1.3*s:.1f}" ry="{2*s:.1f}" fill="#ffe28a"/>' for a, b in [(-6, -2), (4, -4), (-2, 6), (7, 5), (-8, 8), (2, 14), (0, -8)])
    return (f'<g transform="translate({x} {y})"><path d="M0 {-12*s} C{14*s} {-14*s} {18*s} {2*s} {0} {22*s} C{-18*s} {2*s} {-14*s} {-14*s} 0 {-12*s}Z" fill="url(#berry)"/>{seeds}'
            f'<path d="M{-9*s} {-12*s} L0 {-18*s} L{9*s} {-12*s} L{3*s} {-9*s} L0 {-14*s} L{-3*s} {-9*s}Z" fill="#2fbf55"/></g>')


def banana(x, y, s=1.0, rot=0):
    return (f'<g transform="translate({x} {y}) rotate({rot})"><path d="M{-22*s} {-6*s} C{-10*s} {18*s} {16*s} {18*s} {24*s} {-8*s} C{12*s} {6*s} {-8*s} {6*s} {-22*s} {-6*s}Z" fill="url(#ban)"/>'
            f'<path d="M{22*s} {-8*s} L{26*s} {-14*s}" stroke="#6b4a10" stroke-width="{3*s}" stroke-linecap="round"/></g>')


def lime(x, y, s=1.0):
    return (f'<g transform="translate({x} {y})"><circle r="{13*s}" fill="url(#lime)"/><circle r="{10*s}" fill="#e6ffb0" opacity=".6"/>'
            + ''.join(f'<line x1="0" y1="0" x2="{10*s*math.cos(a):.1f}" y2="{10*s*math.sin(a):.1f}" stroke="#7fc72f" stroke-width="{1.4*s}"/>' for a in [i * math.pi / 4 for i in range(8)]) + '</g>')


def fruitbell():
    defs = '''
<radialGradient id="bg" cx="50%" cy="45%" r="75%"><stop offset="0" stop-color="#ffe36b"/><stop offset=".5" stop-color="#ff9f1c"/><stop offset="1" stop-color="#d4442a"/></radialGradient>
<radialGradient id="bell" cx="35%" cy="30%" r="80%"><stop offset="0" stop-color="#ffffff"/><stop offset=".35" stop-color="#dfe5ee"/><stop offset=".75" stop-color="#8a95a8"/><stop offset="1" stop-color="#4b5466"/></radialGradient>
<linearGradient id="base" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5a6272"/><stop offset="1" stop-color="#1d2230"/></linearGradient>
<radialGradient id="berry" cx="35%" cy="30%" r="80%"><stop offset="0" stop-color="#ff6b7d"/><stop offset="1" stop-color="#b3122b"/></radialGradient>
<linearGradient id="ban" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff27a"/><stop offset="1" stop-color="#f0b400"/></linearGradient>
<radialGradient id="lime" cx="40%" cy="35%" r="70%"><stop offset="0" stop-color="#b6f35a"/><stop offset="1" stop-color="#3f9a1a"/></radialGradient>'''
    rays = ''.join(f'<polygon points="320,180 {320+700*math.cos(a):.0f},{180+700*math.sin(a):.0f} {320+700*math.cos(a+.14):.0f},{180+700*math.sin(a+.14):.0f}" fill="#fff" opacity=".1"/>' for a in [i * .45 for i in range(14)])

    def fcard(x, y, rot, content):
        return (f'<g transform="translate({x} {y}) rotate({rot})" filter="url(#ds)"><rect x="-54" y="-70" width="108" height="140" rx="12" fill="#fff"/>'
                f'<rect x="-48" y="-64" width="96" height="128" rx="8" fill="#fff7e8" stroke="#ffd59a" stroke-width="2"/>{content}</g>')
    berries = ''.join(strawberry(a, b, .95) for a, b in [(-24, -34), (22, -34), (0, 0), (-24, 34), (22, 34)])
    bananas = banana(-4, -26, 1.2, -10) + banana(4, 24, 1.2, -10)
    limes = ''.join(lime(a, b, 1.1) for a, b in [(-20, -22), (20, 22), (20, -22), (-20, 22)])
    body = f'''<rect width="{W}" height="{H}" fill="url(#bg)"/>{rays}
{fcard(128, 200, -18, berries)}{fcard(512, 200, 16, bananas)}{fcard(214, 112, -6, limes)}
{shadow(330, 318, 150, 18, .5)}
<g filter="url(#ds)"><ellipse cx="330" cy="300" rx="130" ry="26" fill="url(#base)"/><ellipse cx="330" cy="292" rx="130" ry="24" fill="#6b7384"/>
<path d="M226 290 C226 190 270 138 330 138 C390 138 434 190 434 290Z" fill="url(#bell)"/>
<path d="M254 270 C254 200 280 162 322 154" stroke="#fff" stroke-width="10" fill="none" opacity=".75" stroke-linecap="round"/>
<rect x="318" y="118" width="24" height="24" rx="6" fill="#7d8698"/><ellipse cx="330" cy="114" rx="20" ry="9" fill="#b9c1ce"/></g>
<g stroke="#fff" stroke-width="7" stroke-linecap="round" opacity=".9"><path d="M252 110 L228 80"/><path d="M330 92 L330 58"/><path d="M408 110 L432 80"/></g>
{sparkles(16, 10, '#fff', 20, 340, 5, 12)}'''
    return svg(defs, body, vignette=False)


# ─────────────────────────── 그림 릴레이 ───────────────────────────
def relay():
    defs = '''
<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7ad7ff"/><stop offset=".5" stop-color="#a78bfa"/><stop offset="1" stop-color="#f472b6"/></linearGradient>
<linearGradient id="paper" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#eef0f6"/></linearGradient>'''
    def sheet(x, y, rot, content, s=1):
        return (f'<g transform="translate({x} {y}) rotate({rot}) scale({s})" filter="url(#ds)"><rect x="-64" y="-84" width="128" height="168" rx="8" fill="url(#paper)"/>'
                f'<rect x="-64" y="-84" width="128" height="18" rx="8" fill="#e7e9f2"/>{content}</g>')
    lines = '<rect x="-44" y="-40" width="88" height="7" rx="3.5" fill="#9aa3b8"/><rect x="-44" y="-22" width="70" height="7" rx="3.5" fill="#9aa3b8"/><rect x="-44" y="-4" width="80" height="7" rx="3.5" fill="#9aa3b8"/>'
    cat = '<g stroke="#ff6b3d" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round"><circle cy="6" r="30"/><path d="M-24 -12 L-28 -40 L-8 -22 M24 -12 L28 -40 L8 -22"/><path d="M-8 16 Q0 24 8 16"/></g><circle cx="-11" cy="2" r="4" fill="#ff6b3d"/><circle cx="11" cy="2" r="4" fill="#ff6b3d"/>'
    rocket = '<g stroke="#4263eb" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M0 -44 C18 -24 18 10 10 30 L-10 30 C-18 10 -18 -24 0 -44Z"/><circle cy="-10" r="8"/><path d="M-10 30 L-22 44 M10 30 L22 44 M0 32 L0 50"/></g>'
    q = '<text y="18" text-anchor="middle" font-family="Georgia, serif" font-size="64" font-weight="700" fill="#a855f7">?</text>'
    arrow = lambda x1, y1, x2, y2: f'<path d="M{x1} {y1} Q{(x1+x2)/2} {min(y1,y2)-50} {x2} {y2}" stroke="#fff" stroke-width="5" fill="none" stroke-dasharray="2 12" stroke-linecap="round" opacity=".95"/><circle cx="{x2}" cy="{y2}" r="7" fill="#fff"/>'
    body = f'''<rect width="{W}" height="{H}" fill="url(#bg)"/>
{bokeh(17, 22, ['#fff'], 4, 20, op=(.12, .4))}
{arrow(150, 150, 250, 130)}{arrow(360, 140, 440, 150)}
{sheet(110, 200, -12, lines)}{sheet(300, 180, 5, cat, 1.08)}{sheet(500, 206, 12, q)}
<g transform="translate(560 70) rotate(40)" filter="url(#ds2)"><rect x="-6" y="-60" width="12" height="96" rx="3" fill="#ffd34d"/><polygon points="-6,36 6,36 0,54" fill="#f3c98b"/><polygon points="-2,48 2,48 0,54" fill="#1d2433"/><rect x="-6" y="-72" width="12" height="14" rx="3" fill="#ff8fa3"/></g>
{sparkles(18, 12, '#fff', 10, 350, 4, 10)}'''
    return svg(defs, body, vignette=False)


# ─────────────────────────── 리버시 ───────────────────────────
def reversi():
    defs = '''
<radialGradient id="bg" cx="50%" cy="30%" r="80%"><stop offset="0" stop-color="#1b4d3a"/><stop offset=".6" stop-color="#0b2a20"/><stop offset="1" stop-color="#030d09"/></radialGradient>
<linearGradient id="board" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2fb36a"/><stop offset="1" stop-color="#16804a"/></linearGradient>
<radialGradient id="bk" cx="35%" cy="30%" r="70%"><stop offset="0" stop-color="#6b6f7a"/><stop offset=".45" stop-color="#1b1d22"/><stop offset="1" stop-color="#000"/></radialGradient>
<radialGradient id="wh" cx="35%" cy="30%" r="75%"><stop offset="0" stop-color="#ffffff"/><stop offset=".7" stop-color="#eceff4"/><stop offset="1" stop-color="#b8bfcc"/></radialGradient>'''
    top_y, bot_y = 130, 380
    def P(u, v):
        y = top_y + (bot_y - top_y) * v
        half = 190 + 190 * v
        return 320 - half + 2 * half * u, y
    N = 8
    lines = []
    for i in range(N + 1):
        a, b = P(i / N, 0); c, d = P(i / N, 1)
        lines.append(f'<line x1="{a:.1f}" y1="{b:.1f}" x2="{c:.1f}" y2="{d:.1f}"/>')
        a, b = P(0, i / N); c, d = P(1, i / N)
        lines.append(f'<line x1="{a:.1f}" y1="{b:.1f}" x2="{c:.1f}" y2="{d:.1f}"/>')
    discs = []
    for i, j, col in [(3, 3, 'wh'), (4, 3, 'bk'), (3, 4, 'bk'), (4, 4, 'wh'), (2, 4, 'bk'), (5, 4, 'bk'), (4, 2, 'wh'), (5, 5, 'wh'), (2, 5, 'wh'), (3, 5, 'bk'), (6, 3, 'bk'), (1, 6, 'wh')]:
        x, y = P((i + .5) / N, (j + .5) / N)
        r = 16 + 14 * ((j + .5) / N)
        discs.append(f'<ellipse cx="{x:.1f}" cy="{y+r*.3:.1f}" rx="{r:.1f}" ry="{r*.5:.1f}" fill="#000" opacity=".35" filter="url(#b3)"/>'
                     f'<ellipse cx="{x:.1f}" cy="{y+r*.12:.1f}" rx="{r:.1f}" ry="{r*.55:.1f}" fill="{"#000" if col=="bk" else "#9aa3b2"}"/>'
                     f'<ellipse cx="{x:.1f}" cy="{y:.1f}" rx="{r:.1f}" ry="{r*.55:.1f}" fill="url(#{col})"/>')
    body = f'''<rect width="{W}" height="{H}" fill="url(#bg)"/>
{bokeh(19, 18, ['#8dffc0', '#ffffff'], 4, 18, 0, 120, op=(.08, .3))}
<path d="M{P(0,0)[0]:.1f} {top_y} L{P(1,0)[0]:.1f} {top_y} L{P(1,1)[0]:.1f} {bot_y} L{P(0,1)[0]:.1f} {bot_y}Z" fill="url(#board)" filter="url(#ds)"/>
<g stroke="#0d5c34" stroke-width="2">{''.join(lines)}</g>
{''.join(discs)}
<g transform="translate(470 92) rotate(-28)" filter="url(#ds)"><ellipse cx="0" cy="6" rx="36" ry="12" fill="#000"/><ellipse cx="0" cy="0" rx="36" ry="12" fill="url(#wh)"/></g>
<circle cx="470" cy="92" r="60" fill="#8dffc0" opacity=".2" filter="url(#b16)"/>
<path d="M412 150 C420 130 440 116 452 110" stroke="#fff" stroke-width="4" fill="none" opacity=".6" stroke-linecap="round" stroke-dasharray="2 9"/>
{sparkles(20, 8, '#d7ffe8', 30, 140, 3, 8)}'''
    return svg(defs, body)


# ─────────────────────────── 보석 상인 ───────────────────────────
def gem(x, y, s, c1, c2, rot=0):
    return (f'<g transform="translate({x} {y}) rotate({rot}) scale({s})" filter="url(#ds2)">'
            f'<path d="M-30 -12 L-16 -30 L16 -30 L30 -12 L0 30Z" fill="{c2}"/>'
            f'<path d="M-30 -12 L30 -12 L0 30Z" fill="{c1}" opacity=".85"/>'
            f'<path d="M-16 -30 L-8 -12 L8 -12 L16 -30Z" fill="#fff" opacity=".45"/>'
            f'<path d="M-30 -12 L-16 -30 L-8 -12Z" fill="#fff" opacity=".25"/><path d="M-8 -12 L0 30 L-30 -12Z" fill="#000" opacity=".15"/>'
            f'<path d="M-12 -24 L-4 -24" stroke="#fff" stroke-width="3" stroke-linecap="round"/></g>')


def gems():
    defs = '''
<radialGradient id="bg" cx="50%" cy="40%" r="80%"><stop offset="0" stop-color="#6d2a9e"/><stop offset=".55" stop-color="#3a1260"/><stop offset="1" stop-color="#12051f"/></radialGradient>
<radialGradient id="coin" cx="35%" cy="30%" r="80%"><stop offset="0" stop-color="#fff2b0"/><stop offset=".5" stop-color="#f5b83d"/><stop offset="1" stop-color="#9a5a0a"/></radialGradient>
<linearGradient id="velvet" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8a1c3c"/><stop offset="1" stop-color="#3d0a1b"/></linearGradient>'''
    coins = ''.join(f'<g filter="url(#ds2)"><ellipse cx="{x}" cy="{y+5}" rx="30" ry="11" fill="#7a4300"/><ellipse cx="{x}" cy="{y}" rx="30" ry="11" fill="url(#coin)"/><ellipse cx="{x}" cy="{y}" rx="20" ry="7" fill="none" stroke="#b77716" stroke-width="2"/></g>'
                    for x, y in [(470, 300), (470, 288), (470, 276), (470, 264), (510, 306), (510, 294), (140, 306)])
    body = f'''<rect width="{W}" height="{H}" fill="url(#bg)"/>
<circle cx="320" cy="190" r="170" fill="#ff7ad9" opacity=".18" filter="url(#b30)"/>
<path d="M0 290 C180 262 460 262 640 290 L640 360 L0 360Z" fill="url(#velvet)"/>
{shadow(320, 300, 210, 20, .55)}
{gem(250, 250, 1.5, '#57a8ff', '#1552c2', -8)}{gem(380, 246, 1.6, '#ff6b7d', '#b3122b', 10)}{gem(318, 196, 1.9, '#f1f3f5', '#aeb8c8', 0)}
{gem(200, 196, 1.1, '#4ee08a', '#138a47', -18)}{gem(438, 190, 1.05, '#495057', '#161a20', 16)}{gem(318, 280, 1.2, '#4ee08a', '#138a47', 4)}
{coins}
{sparkles(22, 22, '#fff', 60, 300, 4, 13)}'''
    return svg(defs, body)


# ─────────────────────────── 하룻밤 늑대인간 ───────────────────────────
def werewolf():
    defs = '''
<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0a0a2a"/><stop offset=".55" stop-color="#2a1a55"/><stop offset="1" stop-color="#140a2a"/></linearGradient>
<radialGradient id="moon" cx="45%" cy="40%" r="60%"><stop offset="0" stop-color="#fffdf2"/><stop offset=".75" stop-color="#e9e2ff"/><stop offset="1" stop-color="#b8a9e8"/></radialGradient>
<radialGradient id="glow" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#d9ccff" stop-opacity=".55"/><stop offset="1" stop-color="#d9ccff" stop-opacity="0"/></radialGradient>
<linearGradient id="mist" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#b9a8ff" stop-opacity="0"/><stop offset="1" stop-color="#b9a8ff" stop-opacity=".35"/></linearGradient>'''
    rnd = random.Random(31)
    stars = ''.join(f'<circle cx="{rnd.uniform(0,W):.0f}" cy="{rnd.uniform(0,170):.0f}" r="{rnd.uniform(.6,1.8):.1f}" fill="#fff" opacity="{rnd.uniform(.3,.9):.2f}"/>' for _ in range(70))
    def pines(seed, y, h0, h1, color, n):
        r = random.Random(seed)
        out = []
        x = -20
        while x < W + 20:
            h = r.uniform(h0, h1); w = h * .42
            out.append(f'<path d="M{x:.0f} {y:.0f} L{x+w/2:.0f} {y-h:.0f} L{x+w:.0f} {y:.0f}Z" fill="{color}"/>')
            x += r.uniform(w * .5, w * .9)
        return ''.join(out)
    houses = ''.join(f'<g><rect x="{x}" y="{y}" width="34" height="26" fill="#140c26"/><path d="M{x-4} {y} L{x+17} {y-16} L{x+38} {y}Z" fill="#140c26"/><rect x="{x+12}" y="{y+8}" width="9" height="9" fill="#ffc861"/><rect x="{x+12}" y="{y+8}" width="9" height="9" fill="#ffc861" filter="url(#b3)"/></g>' for x, y in [(96, 292), (150, 300), (206, 294)])
    wolf = ('M470 300 L472 262 L462 240 L468 214 L486 196 L494 170 L500 150 L506 176 L516 184 L530 178 L540 190 L528 200 L524 214 L534 230 L548 262 L556 300Z')
    body = f'''<rect width="{W}" height="{H}" fill="url(#bg)"/>{stars}
<circle cx="470" cy="118" r="130" fill="url(#glow)"/>
<circle cx="470" cy="118" r="74" fill="url(#moon)"/>
<circle cx="448" cy="100" r="12" fill="#c9bdf0" opacity=".45"/><circle cx="494" cy="138" r="16" fill="#c9bdf0" opacity=".4"/><circle cx="500" cy="96" r="7" fill="#c9bdf0" opacity=".4"/>
<ellipse cx="380" cy="150" rx="140" ry="14" fill="#3a2a70" opacity=".8" filter="url(#b8)"/>
{pines(32, 330, 70, 130, '#1a1238', 30)}
<path d="M420 360 L440 300 L500 286 L580 300 L610 360Z" fill="#0c0718"/>
<path d="{wolf}" fill="#0c0718"/>
<path d="M500 150 L494 170 M506 176 L530 178" stroke="#b9a8ff" stroke-width="2" opacity=".6" fill="none"/>
<circle cx="514" cy="186" r="2.6" fill="#ffd34d"/>
{pines(33, 370, 50, 90, '#0c0718', 30)}
{houses}
<rect x="0" y="240" width="{W}" height="120" fill="url(#mist)"/>
<ellipse cx="200" cy="320" rx="260" ry="20" fill="#cbbcff" opacity=".18" filter="url(#b16)"/>'''
    return svg(defs, body)


# ─────────────────────────── 쿠데타 ───────────────────────────
def coup():
    defs = '''
<radialGradient id="bg" cx="50%" cy="40%" r="80%"><stop offset="0" stop-color="#7a1426"/><stop offset=".55" stop-color="#3a0812"/><stop offset="1" stop-color="#120206"/></radialGradient>
<linearGradient id="gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff1b8"/><stop offset=".45" stop-color="#f5b83d"/><stop offset="1" stop-color="#8a4f06"/></linearGradient>
<linearGradient id="cushion" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d11f45"/><stop offset="1" stop-color="#6d0a1f"/></linearGradient>
<radialGradient id="coin" cx="35%" cy="30%" r="80%"><stop offset="0" stop-color="#fff2b0"/><stop offset=".5" stop-color="#f5b83d"/><stop offset="1" stop-color="#9a5a0a"/></radialGradient>
<linearGradient id="blade" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#8b95a8"/><stop offset=".5" stop-color="#f4f7fb"/><stop offset="1" stop-color="#7d879b"/></linearGradient>
<linearGradient id="pillar" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#2a0710"/><stop offset=".5" stop-color="#4d0f1f"/><stop offset="1" stop-color="#1c040a"/></linearGradient>'''
    coins = ''.join(f'<g filter="url(#ds2)"><ellipse cx="{x}" cy="{y+4}" rx="{r}" ry="{r*.36:.1f}" fill="#7a4300"/><ellipse cx="{x}" cy="{y}" rx="{r}" ry="{r*.36:.1f}" fill="url(#coin)"/></g>' for x, y, r in [(150, 300, 30), (180, 312, 26), (120, 318, 24), (490, 306, 28), (520, 318, 22), (160, 288, 30)])
    body = f'''<rect width="{W}" height="{H}" fill="url(#bg)"/>
<rect x="40" y="0" width="60" height="{H}" fill="url(#pillar)"/><rect x="540" y="0" width="60" height="{H}" fill="url(#pillar)"/>
<path d="M130 0 L200 0 L200 150 L165 128 L130 150Z" fill="#8a0f24"/><path d="M440 0 L510 0 L510 150 L475 128 L440 150Z" fill="#8a0f24"/>
<path d="M150 20 L180 20 M150 40 L180 40" stroke="#f5b83d" stroke-width="3"/><path d="M460 20 L490 20 M460 40 L490 40" stroke="#f5b83d" stroke-width="3"/>
<circle cx="320" cy="160" r="150" fill="#ffcf5a" opacity=".22" filter="url(#b30)"/>
{shadow(320, 312, 170, 18, .6)}
<path d="M168 300 C168 250 472 250 472 300 C472 330 168 330 168 300Z" fill="url(#cushion)" filter="url(#ds)"/>
<path d="M190 286 C250 262 390 262 450 286" stroke="#ff7a93" stroke-width="4" fill="none" opacity=".6"/>
<g filter="url(#ds)"><path d="M232 268 L220 150 L276 204 L320 118 L364 204 L420 150 L408 268Z" fill="url(#gold)"/>
<rect x="228" y="254" width="184" height="26" rx="6" fill="url(#gold)"/>
<circle cx="320" cy="118" r="10" fill="#ff3b5c"/><circle cx="220" cy="150" r="8" fill="#3d8bff"/><circle cx="420" cy="150" r="8" fill="#3ddc97"/>
<circle cx="280" cy="267" r="6" fill="#ff3b5c"/><circle cx="320" cy="267" r="7" fill="#fff"/><circle cx="360" cy="267" r="6" fill="#3d8bff"/>
<path d="M244 240 L236 170" stroke="#fff" stroke-width="5" opacity=".6" stroke-linecap="round"/></g>
<g transform="translate(520 150) rotate(38)" filter="url(#ds)"><path d="M-7 -100 L7 -100 L7 40 L0 56 L-7 40Z" fill="url(#blade)"/><rect x="-30" y="-110" width="60" height="12" rx="4" fill="url(#gold)"/><rect x="-7" y="-150" width="14" height="42" rx="4" fill="#2a1a10"/><circle cy="-154" r="9" fill="url(#gold)"/></g>
{coins}
{sparkles(24, 16, '#fff3c4', 40, 260, 4, 11)}'''
    return svg(defs, body)


ART = {
    'liar': liar, 'mafia': mafia, 'drawguess': drawguess, 'rummy': rummy, 'yacht': yacht, 'omok': omok,
    'wordspy': wordspy, 'onecard': onecard, 'numbercode': numbercode, 'fruitbell': fruitbell, 'relay': relay,
    'reversi': reversi, 'gems': gems, 'werewolf': werewolf, 'coup': coup,
}

if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    for k, fn in ART.items():
        with open(os.path.join(OUT, f'{k}.svg'), 'w', encoding='utf-8') as f:
            f.write(fn())
    print('wrote', len(ART), 'files to', OUT)
