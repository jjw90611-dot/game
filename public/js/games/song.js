// 노래 맞히기 화면: 유튜브 공식 뮤직비디오를 모두 같은 순간에 재생해요
import { esc } from './common.js';
import { answerBox, bindAnswer, scoreboard } from './chosung.js';

let ytReady = null;
function loadYT() {
  if (window.YT?.Player) return Promise.resolve();
  if (!ytReady) {
    ytReady = new Promise((res) => {
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => { prev?.(); res(); };
      const s = document.createElement('script');
      s.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(s);
    });
  }
  return ytReady;
}

const SEC = (ms) => `${ms / 1000}초`;

export default function create() {
  let root, api, view, player = null, ready = false, curY = null, preloading = false, key = '', timers = [], playing = false;
  let unlocked = false, keep = '', dead = false;

  const clearTimers = () => { timers.forEach(clearTimeout); timers = []; };
  const later = (ms, fn) => timers.push(setTimeout(fn, Math.max(0, ms)));

  function setPlaying(on) {
    playing = on;
    root?.querySelector('.sg-stage')?.classList.toggle('playing', on);
  }

  function ensurePlayer() {
    if (player || dead) return;
    loadYT().then(() => {
      if (dead || player) return;
      player = new window.YT.Player(root.querySelector('.sg-yt'), {
        width: '100%', height: '100%',
        playerVars: { controls: 0, disablekb: 1, modestbranding: 1, rel: 0, playsinline: 1, fs: 0, iv_load_policy: 3, origin: location.origin },
        events: {
          onReady: () => { ready = true; sync(); },
          onStateChange: (e) => {
            if (e.data === window.YT.PlayerState.PLAYING && preloading) {
              preloading = false;
              player.pauseVideo();
              player.unMute();
            }
          },
          onError: (e) => {
            if (view && curY && [2, 5, 100, 101, 150].includes(e.data)) api.send({ type: 'bad', y: curY });
          },
        },
      });
    });
  }

  function playClip(ms) {
    if (!player || !ready) return;
    player.seekTo(view.t, true);
    player.unMute();
    player.setVolume(100);
    player.playVideo();
    setPlaying(true);
    if (ms) later(ms, () => { player.pauseVideo(); setPlaying(false); });
  }

  // 서버 상태에 맞춰 재생
  function sync() {
    const v = view;
    if (!v || !player || !ready) return;
    if (v.over) { clearTimers(); player.pauseVideo(); setPlaying(false); return; }
    if (v.y && v.y !== curY) {
      curY = v.y;
      key = '';
      clearTimers();
      preloading = true;
      player.mute();
      player.loadVideoById({ videoId: v.y, startSeconds: v.t });
    }
    const k = `${v.y}:${v.phase}:${v.stage}`;
    if (k === key) return;
    key = k;
    clearTimers();
    if (v.phase === 'play') {
      const clip = v.clips[v.stage];
      later(v.playAt - api.now(), () => playClip(clip));
    } else if (v.phase === 'reveal') {
      preloading = false;
      playClip(0);
    }
  }

  function render() {
    const v = view;
    const me = api.me();
    const isPlayer = v.players.some((p) => p.id === me) && !v.gone[me];
    const reveal = v.phase === 'reveal' || !!v.over;
    const inp = root.querySelector('.qz-form input');
    if (inp) keep = inp.value;
    root.querySelector('.sg-stage').classList.toggle('reveal', reveal);
    root.querySelector('.sg-cover').innerHTML = reveal ? '' : `
      <div class="sg-eq">${Array.from({ length: 9 }, (_, i) => `<i style="--d:${(i * 0.11).toFixed(2)}s"></i>`).join('')}</div>
      <div class="sg-now">${SEC(v.clips[v.stage])} 듣기</div>
      <div class="sg-hint">${v.hintArtist ? `가수: <b>${esc(v.hintArtist)}</b>` : '&nbsp;'}</div>`;
    root.querySelector('.sg-dyn').innerHTML = `
      <div class="sg-head"><span>${esc(v.eraName)}</span><span>${v.qNo} / ${v.total} 곡</span></div>
      <div class="sg-steps">${v.clips.map((c, i) => `<span class="${i < v.stage ? 'past' : i === v.stage && !reveal ? 'on' : ''}"><b>${SEC(c)}</b><em>${v.points[i]}점</em></span>`).join('')}</div>
      <div class="sg-title ${reveal ? 'reveal' : ''}">${reveal ? `<b>${esc(v.title || '')}</b><small>${esc(v.artist || '')}${v.solver ? ` · ${esc(api.name(v.solver))}님 정답!` : ''}</small>` : `<div class="sg-shape">${v.hintLen.map((ch) => (ch === ' ' ? '<i class="sp"></i>' : `<i>${ch === '○' ? '' : esc(ch)}</i>`)).join('')}</div>`}</div>
      ${isPlayer && !reveal ? answerBox('노래 제목을 입력하세요') : ''}
      ${scoreboard(v, api)}`;
    const ni = root.querySelector('.qz-form input');
    if (ni) {
      ni.value = keep;
      if (!('ontouchstart' in window)) ni.focus();
    }
    root.querySelector('.sg-unlock').hidden = unlocked;
  }

  return {
    chatHint: '노래 제목을 입력하세요',
    mount(el, a) {
      root = el;
      api = a;
      root.innerHTML = `<div class="quiz songquiz">
        <div class="sg-stage"><div class="sg-video"><div class="sg-yt"></div></div><div class="sg-cover"></div>
          <button class="sg-unlock" type="button"><b>🎧 소리 켜고 시작하기</b><small>화면을 한 번 눌러야 노래가 나와요</small></button>
        </div>
        <div class="sg-dyn"></div>
      </div>`;
      bindAnswer(root, api);
      root.querySelector('.sg-unlock').addEventListener('click', () => {
        unlocked = true;
        root.querySelector('.sg-unlock').hidden = true;
        if (player && ready) {
          player.mute();
          player.playVideo();
          setTimeout(() => { if (!playing) player.pauseVideo(); player.unMute(); }, 250);
        }
      });
      ensurePlayer();
    },
    update(v) {
      view = v;
      render();
      sync();
    },
    myTurn: () => false,
    unmount() {
      dead = true;
      clearTimers();
      try { player?.destroy(); } catch {}
      player = null;
    },
  };
}
