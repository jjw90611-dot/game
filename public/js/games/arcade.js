// 팀 아케이드 25 - 각 참가자가 짧은 미니게임을 플레이하고 0~1000점으로 겨뤄요.
import { esc, avatar } from './common.js';

const MODE = {
  tap: ['번개 탭', '10초 동안 최대한 빠르게 버튼을 연타하세요.'],
  rhythm: ['리듬 펄스', '박자가 중앙에 닿는 순간 탭하세요.'],
  shake: ['쉐이크 러시', '휴대폰을 흔들거나 화면 버튼을 빠르게 누르세요.'],
  swipe: ['스와이프 스프린트', '패드를 좌우 끝까지 빠르게 문지르세요.'],
  target: ['팝 타겟', '나타나는 표적을 놓치지 말고 터치하세요.'],
  rps: ['순간 가위바위보', '지시를 읽고 맞는 손을 재빨리 고르세요.'],
  runner: ['터보 러너', '왼발과 오른발을 번갈아 터치하세요.'],
  piano: ['멜로디 스텝', '빛나는 건반 순서를 정확히 따라가세요.'],
  timestop: ['타임 스톱', '시계를 보지 않고 정확히 10초에 멈추세요.'],
  gauge: ['밸런스 게이지', '누르고 떼며 게이지를 초록 구간에 유지하세요.'],
  reaction: ['라이트닝 터치', '신호가 켜지는 순간 최대한 빨리 누르세요.'],
  stack: ['스택 타워', '움직이는 블록을 맞춰 높은 탑을 만드세요.'],
  lines: ['라인 클리어', '불이 켜진 칸을 눌러 가로·세로 줄을 완성하세요.'],
  wires: ['컬러 와이어', '색과 번호 지시를 정확히 읽고 전선을 고르세요.'],
  dodge: ['코스믹 닷지', '우주선을 움직여 떨어지는 운석을 피하세요.'],
  parity: ['홀짝 브레인', '계산 결과가 홀수인지 짝수인지 고르세요.'],
  sorter: ['스위치 분류', '단어를 규칙에 맞는 방향으로 분류하세요.'],
  balloon: ['컬러 트랩', '목표 색 풍선만 터뜨리고 함정은 피하세요.'],
  multiply: ['곱셈 대시', '구구단 정답을 빠르게 고르세요.'],
  numbers: ['넘버 헌트', '1부터 25까지 순서대로 찾아 누르세요.'],
  memory: ['네온 메모리', '반짝인 패드의 순서를 기억해 그대로 누르세요.'],
  safe: ['시크릿 넘버', '업·다운 힌트로 비밀 번호를 찾아내세요.'],
  oddcolor: ['틴트 헌터', '여러 색 중 미묘하게 다른 한 칸을 찾으세요.'],
  initials: ['첫소리 챌린지', '초성을 보고 알맞은 단어를 고르세요.'],
  trivia: ['퀴즈 스프린트', '짧은 상식 문제를 제한 시간 안에 풀어요.'],
};

const clamp = (n, a = 0, b = 1000) => Math.max(a, Math.min(b, Math.round(Number(n) || 0)));
const shuffle = (arr, rng) => arr.map((x) => [rng(), x]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
const seeded = (seed) => {
  let x = seed || 1;
  return () => {
    x |= 0; x = (x + 0x6D2B79F5) | 0;
    let t = Math.imul(x ^ (x >>> 15), 1 | x);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

export default function create() {
  let root, api, view, roundKey = '', disposed = false, sent = false;
  let cleanups = [];

  const later = (fn, ms) => { const id = setTimeout(fn, ms); cleanups.push(() => clearTimeout(id)); return id; };
  const every = (fn, ms) => { const id = setInterval(fn, ms); cleanups.push(() => clearInterval(id)); return id; };
  const listen = (el, type, fn, opts) => { el.addEventListener(type, fn, opts); cleanups.push(() => el.removeEventListener(type, fn, opts)); };
  const frame = (fn) => {
    let id = 0, on = true;
    const loop = (t) => { if (!on) return; fn(t); id = requestAnimationFrame(loop); };
    id = requestAnimationFrame(loop); cleanups.push(() => { on = false; cancelAnimationFrame(id); });
  };
  const clear = () => { for (const fn of cleanups.splice(0)) { try { fn(); } catch {} } };
  const board = () => root.querySelector('.ar-board');

  function finish(score, detail) {
    if (sent || disposed || view?.over || view?.done?.[api.me()]) return;
    sent = true;
    score = clamp(score);
    api.beep(score >= 700 ? 880 : 520, 120);
    const b = board();
    if (b) b.innerHTML = `<div class="ar-local-result"><span>내 기록</span><b>${score}</b><em>점</em><p>${esc(detail || '도전 완료')}</p><small>다른 팀의 결과를 기다리는 중…</small></div>`;
    api.send({ type: 'finish', score, detail });
  }

  function rankHTML() {
    const me = api.me();
    const rows = [...(view?.players || [])].sort((a, b) => (view.scores[b.id] - view.scores[a.id]) || a.name.localeCompare(b.name));
    return rows.map((p, i) => `<div class="ar-rank-row ${p.id === me ? 'me' : ''} ${view.done[p.id] ? 'done' : ''}">
      <i>${i + 1}</i>${avatar(p.id, p.name, 'sm', api.isBot(p.id))}<span><b>${esc(p.name)}</b><small>${view.done[p.id] ? esc(view.details[p.id] || '완료') : '플레이 중'}</small></span><strong>${view.done[p.id] ? view.scores[p.id] : '…'}</strong>
    </div>`).join('');
  }

  function refreshHud() {
    const rank = root?.querySelector('.ar-ranking');
    if (rank && view) rank.innerHTML = rankHTML();
    const left = root?.querySelector('.ar-left');
    if (left && view?.deadline) left.textContent = `${Math.max(0, Math.ceil((view.deadline - api.now()) / 1000))}초`;
    if (view?.over) {
      clear();
      const b = board();
      if (b) b.innerHTML = `<div class="ar-local-result winner"><span>최종 결과</span><b>🏆</b><p>${esc(view.over.text)}</p><small>방장이 설정을 바꿔 다음 종목을 시작할 수 있어요.</small></div>`;
    }
  }

  function shell() {
    const me = api.me();
    const isPlayer = view.players.some((p) => p.id === me);
    const info = MODE[view.mode] || [view.modeName, '준비하세요.'];
    root.innerHTML = `<div class="arcade">
      <section class="ar-main">
        <header class="ar-head"><div><span>TEAM ARCADE 25</span><h2>${esc(info[0])}</h2><p>${esc(info[1])}</p></div><b class="ar-left">${view.duration}초</b></header>
        <div class="ar-board">${isPlayer ? '<div class="ar-countdown"><b>3</b><span>준비하세요!</span></div>' : '<div class="ar-watch">관전 중이에요<br><small>팀들의 기록이 실시간으로 표시됩니다.</small></div>'}</div>
      </section>
      <aside class="ar-side"><h3>실시간 순위</h3><div class="ar-ranking">${rankHTML()}</div></aside>
    </div>`;
    if (!isPlayer || view.done[me] || view.over) return refreshHud();
    const begin = () => {
      if (disposed || sent || view?.done?.[me] || view?.over) return;
      const rng = seeded((view.seed ^ [...String(me)].reduce((n, c) => n * 31 + c.charCodeAt(0), 7)) >>> 0);
      (GAMES[view.mode] || GAMES.tap)(board(), rng);
    };
    const tick = () => {
      const n = Math.ceil((view.readyAt - api.now()) / 1000);
      const el = root.querySelector('.ar-countdown b');
      if (n > 0) { if (el) el.textContent = n; return; }
      clearInterval(id); begin();
    };
    const id = setInterval(tick, 100);
    cleanups.push(() => clearInterval(id));
    tick();
  }

  function progress(box, label, value, max) {
    const p = box.querySelector('.ar-progress');
    if (p) p.innerHTML = `<span>${esc(label)}</span><i><b style="width:${clamp(value / max * 100, 0, 100)}%"></b></i><strong>${value}/${max}</strong>`;
  }

  function timed(box, seconds, onEnd) {
    const end = performance.now() + seconds * 1000;
    const el = box.querySelector('.ar-mini-time');
    const id = setInterval(() => {
      const left = Math.max(0, end - performance.now());
      if (el) el.textContent = `${(left / 1000).toFixed(1)}초`;
      if (left <= 0) { clearInterval(id); onEnd(); }
    }, 50);
    cleanups.push(() => clearInterval(id));
    return () => Math.max(0, end - performance.now());
  }

  function quizGame(box, rng, config) {
    let correct = 0, wrong = 0, round = 0, locked = false;
    const total = config.rounds || 12;
    box.innerHTML = `<div class="ar-quiz"><div class="ar-mini-top"><span class="ar-progress"></span><b class="ar-mini-time"></b></div><div class="ar-prompt"></div><div class="ar-choices"></div><p class="ar-feedback"></p></div>`;
    const prompt = box.querySelector('.ar-prompt'), choices = box.querySelector('.ar-choices'), feedback = box.querySelector('.ar-feedback');
    const done = () => finish(clamp((correct * 1000 - wrong * 120) / total), `${correct}개 정답`);
    const draw = () => {
      if (round >= total) return done();
      locked = false; round++;
      const q = config.make(rng, round);
      prompt.innerHTML = q.html;
      choices.innerHTML = q.choices.map((c, i) => `<button type="button" data-i="${i}" style="${c.style || ''}">${c.label}</button>`).join('');
      feedback.textContent = '';
      progress(box, '정답', correct, total);
      choices.onclick = (e) => {
        const btn = e.target.closest('[data-i]');
        if (!btn || locked) return;
        locked = true;
        const ok = q.choices[Number(btn.dataset.i)].ok;
        btn.classList.add(ok ? 'ok' : 'no');
        if (ok) { correct++; api.beep(760, 55); feedback.textContent = '정답!'; }
        else { wrong++; api.beep(210, 80); feedback.textContent = '아쉬워요!'; }
        later(draw, 260);
      };
    };
    timed(box, config.seconds || 22, done);
    draw();
  }

  const GAMES = {
    tap(box) {
      let taps = 0, ended = false;
      box.innerHTML = `<div class="ar-action"><div class="ar-mini-top"><span class="ar-progress"></span><b class="ar-mini-time"></b></div><button class="ar-big tap" type="button"><span>⚡</span><b>두드리기!</b><em>0</em></button></div>`;
      const btn = box.querySelector('.ar-big');
      btn.onclick = () => { if (ended) return; taps++; btn.querySelector('em').textContent = taps; btn.classList.remove('hit'); void btn.offsetWidth; btn.classList.add('hit'); progress(box, '연타', taps, 100); };
      timed(box, 10, () => { ended = true; finish(taps * 10, `${taps}회 연타`); });
    },

    rhythm(box) {
      let hits = 0, sum = 0, beat = 0, start = performance.now() + 800;
      const gap = 560, total = 18;
      box.innerHTML = `<div class="ar-rhythm"><div class="ar-mini-top"><span class="ar-progress"></span><b class="ar-mini-time"></b></div><div class="ar-beat-lane"><i></i><b></b></div><button type="button">박자에 맞춰 탭</button><p>원이 가운데 선에 닿을 때!</p></div>`;
      const dot = box.querySelector('.ar-beat-lane i');
      frame((t) => { const phase = ((t - start) % gap + gap) % gap; dot.style.left = `${phase / gap * 100}%`; });
      box.querySelector('button').onclick = () => {
        const now = performance.now();
        const nearest = Math.round((now - start) / gap);
        if (nearest < 0 || nearest >= total) return;
        const delta = Math.abs(now - (start + nearest * gap));
        const pts = Math.max(0, 100 - delta / 2.5);
        sum += pts; hits++; api.beep(delta < 90 ? 820 : 480, 45); progress(box, '탭', hits, total);
      };
      timed(box, 11.5, () => finish(sum / total * 10, `평균 정확도 ${Math.round(sum / Math.max(1, hits))}%`));
    },

    shake(box) {
      let count = 0, last = 0, ended = false;
      box.innerHTML = `<div class="ar-action"><div class="ar-mini-top"><span class="ar-progress"></span><b class="ar-mini-time"></b></div><button class="ar-big shake" type="button"><span>📱</span><b>흔들기!</b><em>0</em></button><p>센서가 작동하지 않으면 화면을 연타해도 돼요.</p></div>`;
      const bump = () => { if (ended) return; count++; box.querySelector('em').textContent = count; progress(box, '흔들기', count, 80); };
      box.querySelector('button').onclick = bump;
      const motion = (e) => { const a = e.accelerationIncludingGravity; if (!a) return; const power = Math.abs(a.x || 0) + Math.abs(a.y || 0) + Math.abs(a.z || 0); const now = performance.now(); if (power > 28 && now - last > 100) { last = now; bump(); } };
      listen(window, 'devicemotion', motion);
      timed(box, 12, () => { ended = true; finish(count * 13, `${count}회 흔들기`); });
    },

    swipe(box) {
      let turns = 0, side = 0, down = false, ended = false;
      box.innerHTML = `<div class="ar-swipe"><div class="ar-mini-top"><span class="ar-progress"></span><b class="ar-mini-time"></b></div><div class="ar-swipe-pad"><span>⇆</span><i></i></div><b class="ar-swipe-count">0회</b></div>`;
      const pad = box.querySelector('.ar-swipe-pad');
      const move = (x) => { if (!down || ended) return; const r = pad.getBoundingClientRect(); const p = (x - r.left) / r.width; pad.querySelector('i').style.left = `${clamp(p * 100, 0, 100)}%`; const next = p < .18 ? -1 : p > .82 ? 1 : 0; if (next && next !== side) { if (side) turns++; side = next; box.querySelector('.ar-swipe-count').textContent = `${turns}회`; progress(box, '왕복', turns, 45); } };
      listen(pad, 'pointerdown', (e) => { down = true; pad.setPointerCapture(e.pointerId); move(e.clientX); });
      listen(pad, 'pointermove', (e) => move(e.clientX));
      listen(pad, 'pointerup', () => { down = false; });
      timed(box, 12, () => { ended = true; finish(turns * 23, `${turns}회 왕복`); });
    },

    target(box, rng) {
      let n = 0, miss = 0, ended = false, timer;
      box.innerHTML = `<div class="ar-target"><div class="ar-mini-top"><span class="ar-progress"></span><b class="ar-mini-time"></b></div><div class="ar-target-field"><button type="button">★</button></div></div>`;
      const field = box.querySelector('.ar-target-field'), btn = field.querySelector('button');
      const place = () => { btn.style.left = `${5 + rng() * 82}%`; btn.style.top = `${5 + rng() * 72}%`; clearTimeout(timer); timer = setTimeout(() => { miss++; place(); }, 1100); };
      cleanups.push(() => clearTimeout(timer));
      btn.onclick = () => { if (ended) return; n++; api.beep(700 + n * 10, 40); progress(box, '적중', n, 20); if (n >= 20) { ended = true; clearTimeout(timer); finish(1000 - miss * 35, `${n}개 적중 · ${miss}개 놓침`); } else place(); };
      place(); timed(box, 22, () => { ended = true; finish(n * 50 - miss * 15, `${n}개 적중`); });
    },

    rps(box, rng) {
      const hands = [['✊', '바위'], ['✌️', '가위'], ['🖐️', '보']];
      quizGame(box, rng, { rounds: 15, seconds: 22, make: () => {
        const target = Math.floor(rng() * 3), win = rng() > .45;
        const answer = win ? [2, 0, 1][target] : target;
        return { html: `<small>${win ? '이길 수 있는 손' : '똑같은 손'}</small><b>${hands[target][0]}</b><span>${hands[target][1]}</span>`, choices: hands.map((h, i) => ({ label: `<b>${h[0]}</b><small>${h[1]}</small>`, ok: i === answer })) };
      }});
    },

    runner(box) {
      let steps = 0, expected = 0, ended = false;
      box.innerHTML = `<div class="ar-runner"><div class="ar-mini-top"><span class="ar-progress"></span><b class="ar-mini-time"></b></div><div class="ar-track"><span>🏃</span><i></i></div><div class="ar-feet"><button type="button" data-foot="0">왼발</button><button type="button" data-foot="1">오른발</button></div></div>`;
      box.querySelector('.ar-feet').onclick = (e) => { const b = e.target.closest('[data-foot]'); if (!b || ended) return; const foot = Number(b.dataset.foot); if (foot !== expected) return; expected = 1 - expected; steps++; box.querySelector('.ar-track span').style.left = `${Math.min(94, steps / 80 * 94)}%`; progress(box, '걸음', steps, 80); };
      timed(box, 15, () => { ended = true; finish(steps * 13, `${steps}걸음`); });
    },

    piano(box, rng) {
      const keys = ['도', '레', '미', '솔'];
      const seq = Array.from({ length: 30 }, () => Math.floor(rng() * 4));
      let at = 0, wrong = 0;
      box.innerHTML = `<div class="ar-piano"><div class="ar-mini-top"><span class="ar-progress"></span><b class="ar-mini-time"></b></div><div class="ar-note">${keys[seq[0]]}</div><div class="ar-keys">${keys.map((k, i) => `<button type="button" data-key="${i}">${k}</button>`).join('')}</div></div>`;
      box.querySelector('.ar-keys').onclick = (e) => { const b = e.target.closest('[data-key]'); if (!b) return; if (Number(b.dataset.key) === seq[at]) { at++; api.beep(420 + Number(b.dataset.key) * 90, 70); progress(box, '음표', at, seq.length); if (at >= seq.length) return finish(1000 - wrong * 25, `${at}개 연주`); box.querySelector('.ar-note').textContent = keys[seq[at]]; } else { wrong++; b.classList.add('no'); later(() => b.classList.remove('no'), 180); } };
      timed(box, 24, () => finish(at / seq.length * 1000 - wrong * 20, `${at}개 연주`));
    },

    timestop(box) {
      let start = 0, running = false;
      box.innerHTML = `<div class="ar-stopwatch"><b>10.00</b><span>초를 맞혀 보세요</span><button type="button">시작</button><p>3초 뒤 숫자가 사라져요.</p></div>`;
      const display = box.querySelector('b'), btn = box.querySelector('button');
      btn.onclick = () => {
        if (!running) {
          running = true; start = performance.now(); btn.textContent = '멈추기'; display.textContent = '0.00';
          every(() => { const t = (performance.now() - start) / 1000; display.textContent = t > 3 ? '??.??' : t.toFixed(2); }, 30);
        } else {
          const t = (performance.now() - start) / 1000, diff = Math.abs(10 - t);
          display.textContent = t.toFixed(2); btn.disabled = true;
          finish(1000 - diff * 260, `${t.toFixed(2)}초 · 오차 ${diff.toFixed(2)}초`);
        }
      };
    },

    gauge(box) {
      let val = 0, hold = false, good = 0, ticks = 0, ended = false;
      box.innerHTML = `<div class="ar-gauge"><div class="ar-mini-top"><span class="ar-progress"></span><b class="ar-mini-time"></b></div><div class="ar-gauge-track"><i></i><span></span></div><button type="button">누르고 유지</button><p>초록 구간에 오래 머물수록 높은 점수!</p></div>`;
      const btn = box.querySelector('button'), needle = box.querySelector('.ar-gauge-track i');
      listen(btn, 'pointerdown', (e) => { hold = true; btn.setPointerCapture(e.pointerId); });
      listen(btn, 'pointerup', () => { hold = false; }); listen(btn, 'pointercancel', () => { hold = false; });
      every(() => { if (ended) return; val += hold ? 3.8 : -2.7; val = Math.max(0, Math.min(100, val)); needle.style.left = `${val}%`; ticks++; if (val >= 42 && val <= 58) good++; progress(box, '안정', good, Math.max(1, ticks)); }, 50);
      timed(box, 12, () => { ended = true; finish(good / Math.max(1, ticks) * 1000, `${Math.round(good / Math.max(1, ticks) * 100)}% 안정`); });
    },

    reaction(box, rng) {
      let round = 0, total = 0, early = 0, armed = false, shown = 0, wait;
      box.innerHTML = `<div class="ar-reaction"><div class="ar-mini-top"><span class="ar-progress"></span><b>5번 측정</b></div><button type="button"><span>기다리세요…</span></button><p></p></div>`;
      const btn = box.querySelector('button'), txt = btn.querySelector('span'), p = box.querySelector('p');
      const next = () => { if (round >= 5) return finish(1000 - total / 5 * 1.6 - early * 90, `평균 ${Math.round(total / 5)}ms`); armed = false; btn.classList.remove('go'); txt.textContent = '기다리세요…'; wait = later(() => { armed = true; shown = performance.now(); btn.classList.add('go'); txt.textContent = '지금!'; api.beep(900, 45); }, 900 + rng() * 1800); };
      btn.onclick = () => { if (!armed) { early++; p.textContent = '너무 빨랐어요!'; clearTimeout(wait); return later(next, 500); } const ms = performance.now() - shown; total += ms; round++; p.textContent = `${Math.round(ms)}ms`; progress(box, '측정', round, 5); next(); };
      next();
    },

    stack(box) {
      let level = 0, width = 78, x = 0, dir = 1, lastLeft = 11, ended = false;
      box.innerHTML = `<div class="ar-stack"><div class="ar-mini-top"><span class="ar-progress"></span><b>탭해서 놓기</b></div><div class="ar-stack-field"><div class="ar-moving"></div><div class="ar-tower"></div></div><button type="button">블록 놓기</button></div>`;
      const moving = box.querySelector('.ar-moving'), tower = box.querySelector('.ar-tower');
      frame(() => { if (ended) return; x += dir * 0.7; if (x <= 0 || x + width >= 100) dir *= -1; x = Math.max(0, Math.min(100 - width, x)); moving.style.left = `${x}%`; moving.style.width = `${width}%`; moving.style.bottom = `${level * 20 + 8}px`; });
      box.querySelector('button').onclick = () => {
        if (ended) return; const left = Math.max(x, lastLeft), right = Math.min(x + width, lastLeft + width), overlap = right - left;
        if (overlap < 6) { ended = true; return finish(level * 100, `${level}층`); }
        width = overlap; lastLeft = left; tower.insertAdjacentHTML('beforeend', `<i style="left:${left}%;width:${width}%;bottom:${level * 20 + 8}px"></i>`); level++; progress(box, '높이', level, 10);
        if (level >= 10) { ended = true; finish(1000, '10층 완성'); }
      };
      timed(box, 28, () => { ended = true; finish(level * 100, `${level}층`); });
    },

    lines(box, rng) {
      let cells = Array.from({ length: 36 }, () => rng() > .58), lines = 0, taps = 0;
      const render = () => {
        box.innerHTML = `<div class="ar-lines"><div class="ar-mini-top"><span class="ar-progress"></span><b class="ar-mini-time"></b></div><div class="ar-grid6">${cells.map((on, i) => `<button type="button" data-cell="${i}" class="${on ? 'on' : ''}"></button>`).join('')}</div><p>빈 칸을 채워 줄을 완성하세요.</p></div>`;
        box.querySelector('.ar-grid6').onclick = (e) => { const b = e.target.closest('[data-cell]'); if (!b) return; const i = Number(b.dataset.cell); if (cells[i]) return; cells[i] = true; taps++;
          const done = new Set(); for (let y = 0; y < 6; y++) if (cells.slice(y * 6, y * 6 + 6).every(Boolean)) for (let x = 0; x < 6; x++) done.add(y * 6 + x);
          for (let x = 0; x < 6; x++) if (Array.from({ length: 6 }, (_, y) => cells[y * 6 + x]).every(Boolean)) for (let y = 0; y < 6; y++) done.add(y * 6 + x);
          if (done.size) { lines += done.size / 6; for (const j of done) cells[j] = false; for (let k = 0; k < 8; k++) cells[Math.floor(rng() * 36)] = true; api.beep(820, 80); }
          render(); progress(box, '줄', Math.floor(lines), 8);
        };
      };
      render(); timed(box, 25, () => finish(lines * 125 - taps * 2, `${Math.floor(lines)}줄 완성`));
    },

    wires(box, rng) {
      const colors = [['빨강', '#ef4444'], ['파랑', '#3b82f6'], ['노랑', '#facc15'], ['초록', '#22c55e']];
      quizGame(box, rng, { rounds: 12, seconds: 24, make: () => {
        const answerColor = Math.floor(rng() * 4), answerNo = 1 + Math.floor(rng() * 3);
        const wires = shuffle(colors.flatMap((c, ci) => [1, 2, 3].map((n) => ({ ci, n, c }))), rng).slice(0, 8);
        if (!wires.some((w) => w.ci === answerColor && w.n === answerNo)) wires[0] = { ci: answerColor, n: answerNo, c: colors[answerColor] };
        return { html: `<small>다음 전선을 끊으세요</small><b>${colors[answerColor][0]} ${answerNo}번</b>`, choices: wires.map((w) => ({ label: `<i class="ar-wire" style="background:${w.c[1]}"></i><b>${w.n}</b>`, ok: w.ci === answerColor && w.n === answerNo })) };
      }});
    },

    dodge(box, rng) {
      box.innerHTML = `<div class="ar-dodge"><div class="ar-mini-top"><span class="ar-progress"></span><b class="ar-mini-time"></b></div><canvas width="640" height="420"></canvas><p>화면을 누른 채 좌우로 움직이세요.</p></div>`;
      const canvas = box.querySelector('canvas'), ctx = canvas.getContext('2d'); let ship = 320, rocks = [], last = performance.now(), elapsed = 0, dead = false, dodged = 0;
      const move = (e) => { const r = canvas.getBoundingClientRect(); ship = (e.clientX - r.left) / r.width * canvas.width; };
      listen(canvas, 'pointerdown', (e) => { canvas.setPointerCapture(e.pointerId); move(e); }); listen(canvas, 'pointermove', (e) => { if (e.buttons) move(e); });
      frame((now) => { if (dead) return; const dt = Math.min(40, now - last); last = now; elapsed += dt; if (rng() < dt / 520) rocks.push({ x: 25 + rng() * 590, y: -20, r: 12 + rng() * 17, v: .16 + rng() * .12 });
        ctx.fillStyle = '#070b1d'; ctx.fillRect(0, 0, 640, 420); ctx.fillStyle = '#fff'; for (let i = 0; i < 45; i++) ctx.fillRect((i * 83) % 640, (i * 47 + elapsed * .03) % 420, 2, 2);
        ctx.font = '34px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('🚀', ship, 385);
        for (const r of rocks) { r.y += r.v * dt; ctx.font = `${r.r * 2}px sans-serif`; ctx.fillText('☄️', r.x, r.y); if (Math.hypot(r.x - ship, r.y - 372) < r.r + 18) { dead = true; finish(elapsed / 15, `${(elapsed / 1000).toFixed(1)}초 생존`); } }
        rocks = rocks.filter((r) => { if (r.y > 450) { dodged++; return false; } return true; }); progress(box, '회피', dodged, 25);
      });
      timed(box, 15, () => { if (!dead) { dead = true; finish(1000, `${dodged}개 회피 · 완주`); } });
    },

    parity(box, rng) {
      quizGame(box, rng, { rounds: 18, seconds: 24, make: () => { const a = 2 + Math.floor(rng() * 18), b = 2 + Math.floor(rng() * 18), plus = rng() > .35, n = plus ? a + b : a * b; return { html: `<small>계산 결과는?</small><b>${a} ${plus ? '+' : '×'} ${b}</b>`, choices: [{ label: '홀수', ok: n % 2 === 1 }, { label: '짝수', ok: n % 2 === 0 }] }; } });
    },

    sorter(box, rng) {
      const items = [['고양이', 0], ['연필', 1], ['나무', 0], ['자동차', 1], ['돌고래', 0], ['시계', 1], ['버섯', 0], ['컴퓨터', 1], ['장미', 0], ['우산', 1]];
      quizGame(box, rng, { rounds: 16, seconds: 22, make: () => { const q = items[Math.floor(rng() * items.length)]; return { html: `<small>생물은 왼쪽 · 물건은 오른쪽</small><b>${q[0]}</b>`, choices: [{ label: '← 생물', ok: q[1] === 0 }, { label: '물건 →', ok: q[1] === 1 }] }; } });
    },

    balloon(box, rng) {
      const colors = [['빨강', '#f43f5e'], ['파랑', '#3b82f6'], ['노랑', '#facc15'], ['초록', '#22c55e']]; let target = Math.floor(rng() * 4), good = 0, bad = 0, ended = false;
      box.innerHTML = `<div class="ar-balloon"><div class="ar-mini-top"><span class="ar-progress"></span><b class="ar-mini-time"></b></div><h3><i style="background:${colors[target][1]}"></i>${colors[target][0]} 풍선만!</h3><div class="ar-balloon-field"></div></div>`;
      const field = box.querySelector('.ar-balloon-field');
      const spawn = () => { if (ended) return; const ci = Math.floor(rng() * 4), trap = rng() < .12; const b = document.createElement('button'); b.type = 'button'; b.dataset.ok = String(!trap && ci === target); b.textContent = trap ? '💣' : ''; b.style.cssText = `left:${rng() * 88}%;top:${rng() * 78}%;background:${colors[ci][1]}`; b.onclick = () => { if (b.dataset.ok === 'true') { good++; api.beep(760, 35); } else bad++; b.remove(); progress(box, '적중', good, 30); }; field.appendChild(b); later(() => b.remove(), 1500); };
      every(spawn, 350); timed(box, 16, () => { ended = true; finish(good * 38 - bad * 55, `${good}개 적중 · 실수 ${bad}`); });
    },

    multiply(box, rng) {
      quizGame(box, rng, { rounds: 16, seconds: 24, make: () => { const a = 2 + Math.floor(rng() * 8), b = 2 + Math.floor(rng() * 8), ans = a * b; const vals = shuffle([ans, ans + a, ans - b, ans + (rng() > .5 ? 1 : -1)], rng); return { html: `<small>정답을 고르세요</small><b>${a} × ${b}</b>`, choices: vals.map((n) => ({ label: String(n), ok: n === ans })) }; } });
    },

    numbers(box, rng) {
      let next = 1, wrong = 0, start = performance.now(); const nums = shuffle(Array.from({ length: 25 }, (_, i) => i + 1), rng);
      box.innerHTML = `<div class="ar-numbers"><div class="ar-mini-top"><span class="ar-progress"></span><b class="ar-mini-time"></b></div><div class="ar-grid5">${nums.map((n) => `<button type="button" data-n="${n}">${n}</button>`).join('')}</div></div>`;
      box.querySelector('.ar-grid5').onclick = (e) => { const b = e.target.closest('[data-n]'); if (!b) return; if (Number(b.dataset.n) === next) { b.classList.add('done'); next++; progress(box, '숫자', next - 1, 25); if (next > 25) { const sec = (performance.now() - start) / 1000; finish(1000 - sec * 22 - wrong * 25, `${sec.toFixed(1)}초`); } } else { wrong++; b.classList.add('no'); later(() => b.classList.remove('no'), 160); } };
      timed(box, 35, () => finish((next - 1) * 40 - wrong * 15, `${next - 1}까지 찾음`));
    },

    memory(box, rng) {
      let seq = [], level = 0, input = [], showing = false;
      box.innerHTML = `<div class="ar-memory"><div class="ar-mini-top"><span class="ar-progress"></span><b>순서를 기억하세요</b></div><div class="ar-memory-pads">${[0,1,2,3].map((i) => `<button type="button" data-pad="${i}"></button>`).join('')}</div><p></p></div>`;
      const pads = [...box.querySelectorAll('[data-pad]')], p = box.querySelector('p');
      const flash = (i, ms = 300) => { pads[i].classList.add('on'); api.beep(420 + i * 100, 90); later(() => pads[i].classList.remove('on'), ms); };
      const show = () => { showing = true; input = []; seq.push(Math.floor(rng() * 4)); p.textContent = `${seq.length}개 순서를 보세요`; seq.forEach((n, i) => later(() => flash(n), 450 + i * 520)); later(() => { showing = false; p.textContent = '이제 따라 누르세요'; }, 600 + seq.length * 520); };
      box.querySelector('.ar-memory-pads').onclick = (e) => { const b = e.target.closest('[data-pad]'); if (!b || showing) return; const n = Number(b.dataset.pad); flash(n, 160); if (n !== seq[input.length]) return finish(level * 125, `${level}단계 기억`); input.push(n); if (input.length === seq.length) { level++; progress(box, '단계', level, 8); if (level >= 8) finish(1000, '8단계 완주'); else later(show, 650); } };
      show(); timed(box, 45, () => finish(level * 125, `${level}단계 기억`));
    },

    safe(box, rng) {
      const secret = 1 + Math.floor(rng() * 100); let tries = 0, lo = 1, hi = 100;
      box.innerHTML = `<div class="ar-safe"><div class="ar-mini-top"><span class="ar-progress"></span><b class="ar-mini-time"></b></div><div class="ar-safe-door">🔐<b>1 ~ 100</b></div><form><input type="number" min="1" max="100" inputmode="numeric" placeholder="번호 입력"><button type="submit">열기</button></form><p>업·다운 힌트로 비밀번호를 찾으세요.</p></div>`;
      const form = box.querySelector('form'), input = form.querySelector('input'), range = box.querySelector('.ar-safe-door b'), p = box.querySelector('p');
      form.onsubmit = (e) => { e.preventDefault(); const n = Number(input.value); if (!Number.isInteger(n) || n < lo || n > hi) return; tries++; if (n === secret) return finish(1000 - (tries - 1) * 105, `${tries}번 만에 성공`); if (n < secret) { lo = n + 1; p.textContent = `${n}보다 높아요 ↑`; } else { hi = n - 1; p.textContent = `${n}보다 낮아요 ↓`; } range.textContent = `${lo} ~ ${hi}`; input.value = ''; input.focus(); progress(box, '시도', tries, 8); if (tries >= 8) finish(120, `정답은 ${secret}`); };
      timed(box, 30, () => finish(0, `시간 종료 · 정답 ${secret}`)); later(() => input.focus(), 80);
    },

    oddcolor(box, rng) {
      let level = 0, wrong = 0; box.innerHTML = `<div class="ar-odd"><div class="ar-mini-top"><span class="ar-progress"></span><b class="ar-mini-time"></b></div><div class="ar-odd-grid"></div></div>`; const grid = box.querySelector('.ar-odd-grid');
      const draw = () => { const size = Math.min(7, 3 + Math.floor(level / 2)), answer = Math.floor(rng() * size * size), hue = Math.floor(rng() * 360), light = 48 + rng() * 12, diff = Math.max(3, 12 - level); grid.style.gridTemplateColumns = `repeat(${size},1fr)`; grid.innerHTML = Array.from({ length: size * size }, (_, i) => `<button type="button" data-i="${i}" style="background:hsl(${hue} 72% ${light + (i === answer ? diff : 0)}%)"></button>`).join(''); grid.onclick = (e) => { const b = e.target.closest('[data-i]'); if (!b) return; if (Number(b.dataset.i) === answer) { level++; api.beep(800, 50); progress(box, '단계', level, 10); if (level >= 10) finish(1000 - wrong * 40, '10단계 완주'); else draw(); } else { wrong++; b.classList.add('no'); } }; };
      draw(); timed(box, 28, () => finish(level * 100 - wrong * 30, `${level}단계`));
    },

    initials(box, rng) {
      const bank = [['ㄱㅊㅉㄱ','김치찌개',['김치찌개','갈비찜','고추장']],['ㅂㄷㅂㅇ','비디오방',['비디오방','보드게임','바닷바람']],['ㅎㄷㅍ','휴대폰',['휴대폰','호두파이','핫도그']],['ㅇㅈㅅ','우주선',['우주선','오징어','운전사']],['ㅁㄹㅋ','마라카스',['마라카스','미로찾기','머리카락']],['ㅅㅂㄹ','신발끈',['신발끈','샐러리','수박롤']]];
      quizGame(box, rng, { rounds: 12, seconds: 25, make: () => { const q = bank[Math.floor(rng() * bank.length)]; return { html: `<small>초성에 맞는 단어는?</small><b>${q[0]}</b>`, choices: shuffle(q[2], rng).map((x) => ({ label: x, ok: x === q[1] })) }; } });
    },

    trivia(box, rng) {
      const bank = [
        ['대한민국의 수도는?', '서울', ['서울','부산','인천','대전']], ['태양계에서 가장 큰 행성은?', '목성', ['지구','목성','화성','금성']],
        ['물의 화학식은?', 'H₂O', ['CO₂','O₂','H₂O','NaCl']], ['1년은 윤년이 아닐 때 며칠?', '365일', ['360일','364일','365일','366일']],
        ['무지개는 보통 몇 색으로 말할까?', '7색', ['5색','6색','7색','8색']], ['한글을 창제한 왕은?', '세종대왕', ['태조','세종대왕','영조','정조']],
        ['삼각형의 내각 합은?', '180도', ['90도','180도','270도','360도']], ['지구의 위성은?', '달', ['태양','달','금성','화성']],
      ];
      quizGame(box, rng, { rounds: 14, seconds: 28, make: () => { const q = bank[Math.floor(rng() * bank.length)]; return { html: `<small>상식 퀴즈</small><b>${q[0]}</b>`, choices: shuffle(q[2], rng).map((x) => ({ label: x, ok: x === q[1] })) }; } });
    },
  };

  return {
    mount(el, a) { root = el; api = a; disposed = false; },
    update(v) {
      view = v;
      const key = `${v.mode}:${v.seed}`;
      if (key !== roundKey) { clear(); roundKey = key; sent = !!v.done?.[api.me()]; shell(); }
      refreshHud();
    },
    myTurn: () => false,
    unmount() { disposed = true; clear(); },
  };
}
