// 보드게임 모음집 - 메인 화면 제어
import { Net } from './net.js';
import { $, $$, esc, avatar, toast, openModal, colorOf, beep } from './ui.js';
import { CATEGORIES, GAMES, GENRES } from './catalog.js';
import { thumb, thumbSrc } from './art.js';
import { icon } from './icons.js';

// ─── 기본 정보 ─────────────────────────────────────────────
const playersText = (g) => (GAMES[g].min === GAMES[g].max ? `${GAMES[g].min}명` : `${GAMES[g].min}~${GAMES[g].max}명`);

function getSid() {
  let s = localStorage.getItem('bg_sid');
  if (!s || s.length < 16) {
    const bytes = crypto.getRandomValues(new Uint8Array(18));
    s = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    localStorage.setItem('bg_sid', s);
  }
  return s;
}
const ADJ = ['행복한', '용감한', '졸린', '배고픈', '신나는', '수줍은', '똑똑한', '느긋한', '엉뚱한', '씩씩한', '귀여운', '멋진'];
const ANIMAL = ['판다', '고양이', '펭귄', '토끼', '여우', '곰', '수달', '다람쥐', '햄스터', '부엉이', '강아지', '코알라'];
const randomName = () => `${ADJ[Math.floor(Math.random() * ADJ.length)]}${ANIMAL[Math.floor(Math.random() * ANIMAL.length)]}${Math.floor(Math.random() * 90 + 10)}`;
let firstVisit = false;
if (!localStorage.getItem('bg_name')) {
  localStorage.setItem('bg_name', randomName());
  firstVisit = true;
}

// ─── 상태 ─────────────────────────────────────────────────
const S = {
  me: null,
  games: new Set(),
  connected: false,
  lobby: { online: 0, rooms: [], playing: {}, users: [] },
  lobbyChat: [],
  room: null,
  view: null,
  chat: [],
  offset: 0,
  unreadLobby: 0,
  unreadRoom: 0,
  expectRoom: false,
  resultSeen: '',
  roomFilter: '',
};

const net = new Net({
  hello: () => ({ t: 'hello', sid: getSid(), name: localStorage.getItem('bg_name'), room: route().page === 'room' ? route().id : undefined }),
  onMessage,
  onStatus(st) {
    S.connected = st === 'open';
    const banner = $('#conn-banner');
    if (st === 'open') banner.hidden = true;
    else if (st === 'stopped') {
      banner.hidden = false;
      banner.innerHTML = '다른 창에서 접속해서 연결이 끊겼어요. <button class="btn sm" id="reconnect" style="margin-left:6px">여기서 다시 접속</button>';
      $('#reconnect').onclick = () => { banner.hidden = true; net.resume(); };
    } else {
      banner.hidden = false;
      banner.textContent = '서버에 다시 연결하는 중이에요…';
    }
  },
});
const send = (m) => {
  if (!net.send(m)) toast('서버에 연결하는 중이에요. 잠시만 기다려 주세요.', 'err');
};
const now = () => Date.now() + S.offset;

// ─── 서버 메시지 ──────────────────────────────────────────
function onMessage(m) {
  if (m.now) S.offset = m.now - Date.now();
  switch (m.t) {
    case 'welcome':
      S.me = { uid: m.uid, name: m.name };
      S.games = new Set(m.games || []);
      localStorage.setItem('bg_name', m.name);
      renderMe();
      if (route().page !== 'room') render();
      break;
    case 'name':
      S.me.name = m.name;
      localStorage.setItem('bg_name', m.name);
      renderMe();
      break;
    case 'lobby':
      S.lobby = { online: m.online, rooms: m.rooms, playing: m.playing, users: m.users };
      if (m.chat) S.lobbyChat = m.chat;
      refreshLive(!!m.chat);
      break;
    case 'lchat':
      S.lobbyChat.push(m.msg);
      if (S.lobbyChat.length > 80) S.lobbyChat.shift();
      appendLobbyChat(m.msg);
      break;
    case 'room':
      onRoom(m);
      break;
    case 'chat':
      if (!S.room) break;
      S.chat.push(m.msg);
      if (S.chat.length > 150) S.chat.shift();
      appendRoomChat(m.msg);
      break;
    case 'draw':
      game.inst?.onDraw?.(m.d);
      break;
    case 'fetch':
      game.inst?.onFetch?.(m.key, m.data);
      break;
    case 'left':
      onLeft(m.why);
      break;
    case 'err':
      toast(m.msg, 'err');
      S.expectRoom = false;
      if (route().page === 'room' && !S.room) location.hash = '#/';
      break;
    case 'dup':
      toast('다른 창에서 같은 계정으로 접속했어요.', 'err');
      break;
  }
}

function onRoom(m) {
  const prevId = S.room?.id;
  const prevStatus = S.room?.status;
  S.room = m.room;
  S.view = m.v;
  if (m.full) {
    S.chat = m.chat || [];
    if (prevId !== m.room.id) {
      S.unreadRoom = 0;
      S.resultSeen = m.room.status === 'waiting' ? `${m.room.id}:${m.room.round}` : '';
    }
  }
  const r = route();
  if (m.full && (S.expectRoom || (r.page === 'room' && r.id === m.room.id) || r.page === 'room')) {
    S.expectRoom = false;
    if (r.page !== 'room' || r.id !== m.room.id) {
      location.hash = `#/room/${m.room.id}`;
      return;
    }
  }
  if (route().page === 'room' && route().id === m.room.id) {
    if (!$('.room') || $('.room').dataset.id !== m.room.id) renderRoom();
    else updateRoom(m.full);
    if (m.vol) {
      if (game.inst?.onVol) game.inst.onVol(m.vol);
      else game.pendingVol = m.vol;
    }
    if (prevStatus === 'waiting' && m.room.status === 'playing') {
      beep(520, 120);
      setTimeout(() => beep(780, 160), 130);
    }
  } else updateRoomBanner();
}

function onLeft(why) {
  const game_ = S.room?.game;
  S.room = null;
  S.view = null;
  S.chat = [];
  unmountGame();
  if (why === 'kick') toast('방장에 의해 강퇴되었어요.', 'err');
  if (why === 'offline') toast('연결이 오래 끊겨서 방에서 나왔어요.', 'err');
  if (route().page === 'room') location.hash = game_ ? `#/game/${game_}` : '#/';
  else updateRoomBanner();
}

// ─── 라우팅 ───────────────────────────────────────────────
function route() {
  const h = location.hash.replace(/^#\/?/, '');
  const [page, id] = h.split('/');
  if (page === 'game' && GAMES[id]) return { page: 'game', id };
  if (page === 'room' && id) return { page: 'room', id: decodeURIComponent(id) };
  if (page === 'games') return { page: 'games', id: GENRES[id] ? id : '' };
  if (page === 'rooms' || page === 'community') return { page };
  return { page: 'home' };
}

window.addEventListener('hashchange', render);

function render() {
  const r = route();
  document.body.dataset.page = r.page;
  if (r.page !== 'room') unmountGame();
  clearTimeout(hero.timer);
  const nav = r.page === 'game' ? 'games' : r.page;
  $$('[data-nav]').forEach((a) => a.classList.toggle('on', a.dataset.nav === nav));
  if (r.page === 'home') renderHome();
  else if (r.page === 'games') renderGames(r.id);
  else if (r.page === 'rooms') renderRooms();
  else if (r.page === 'community') renderCommunity();
  else if (r.page === 'game') renderGamePage(r.id);
  else if (r.page === 'room') {
    if (S.room && S.room.id === r.id) renderRoom();
    else {
      $('#view').innerHTML = '<div class="empty" style="padding:120px 16px">방에 들어가는 중이에요…</div>';
      if (S.connected && S.me) {
        S.expectRoom = true;
        send({ t: 'join', id: r.id });
      }
    }
  }
  window.scrollTo(0, 0);
}

function renderMe() {
  if (!S.me) return;
  $('#me-name').textContent = S.me.name;
  $('#me-avatar').outerHTML = avatar(S.me.uid, S.me.name, 'sm').replace('class="avatar', 'id="me-avatar" class="avatar');
}

$('#me-chip').addEventListener('click', () => nameModal());

function nameModal(first = false) {
  openModal({
    title: first ? '반가워요! 닉네임을 정해 주세요' : '닉네임 바꾸기',
    body: `<div class="field"><label>닉네임 (최대 12자)</label><input class="input" id="nm" maxlength="12" value="${esc(S.me?.name || localStorage.getItem('bg_name') || '')}" autocomplete="off"></div>
           <p class="small muted">다른 사람들에게 보이는 이름이에요.</p>`,
    actions: [{ label: first ? '시작하기' : '저장', cls: 'primary', onClick: (close, el) => {
      const v = $('#nm', el).value.trim();
      if (!v) { toast('닉네임을 입력해 주세요.', 'err'); return false; }
      localStorage.setItem('bg_name', v);
      send({ t: 'name', name: v });
    } }],
    onOpen: (el, close) => {
      const inp = $('#nm', el);
      inp.focus();
      inp.select();
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') $('.modal-foot .btn', el).click(); });
    },
  });
}

// ─── 공용 조각 ────────────────────────────────────────────
const isExternal = (g) => !!GAMES[g]?.external;
const isReady = (g) => isExternal(g) || !S.me || S.games.has(g);
const genreOf = (g) => GENRES[GAMES[g].cat] || '';

function badges(g) {
  const m = GAMES[g];
  return `${m.hot ? '<span class="bdg hot">HOT</span>' : ''}${m.badge ? `<span class="bdg vid">${icon('video')}${esc(m.badge)}</span>` : ''}${m.bots ? `<span class="bdg bot">${icon('bot')}봇</span>` : ''}`;
}

function gameCard(g, rank = 0) {
  const meta = GAMES[g];
  const ready = isReady(g);
  const n = S.lobby.playing[g] || 0;
  return `<a class="gcard ${ready ? '' : 'soon'}" href="#/game/${g}" data-game="${g}">
    <div class="g-thumb">${thumb(g)}
      <div class="g-badges">${badges(g)}</div>
      ${rank ? `<span class="g-rank">${rank}</span>` : ''}
      <span class="g-play">${icon('play')}</span>
      ${ready ? `<span class="g-live" data-live="${g}" ${n ? '' : 'hidden'}><i></i><span>${n}명 플레이 중</span></span>` : '<span class="g-live soon-tag">준비 중</span>'}
    </div>
    <div class="g-info">
      <div class="g-name">${esc(meta.name)}</div>
      <div class="g-meta"><span>${esc(genreOf(g))}</span><span>${playersText(g)}</span><span>${meta.time}</span></div>
    </div>
  </a>`;
}

function secHead(title, sub, more) {
  return `<div class="sec-head"><div><h2>${esc(title)}</h2>${sub ? `<p>${esc(sub)}</p>` : ''}</div>${more ? `<a class="more" href="${more}">전체보기${icon('next')}</a>` : ''}</div>`;
}

function roomCard(r) {
  const meta = GAMES[r.game];
  const playing = r.status === 'playing';
  return `<button type="button" class="rcard" data-room="${esc(r.id)}" data-status="${r.status}">
    <span class="rc-thumb">${thumb(r.game)}<span class="rc-state ${playing ? 'play' : 'wait'}">${playing ? '게임 중' : '대기 중'}</span></span>
    <span class="rc-body">
      <span class="rc-game">${esc(meta?.name || '')}<em>#${r.no}</em></span>
      <span class="rc-title">${esc(r.title)}</span>
      <span class="rc-foot"><span>${icon('crown')}${esc(r.host || '')}</span><b>${playing ? `${icon('eye')}${r.members}` : `${icon('users')}${r.seats}/${r.max}`}</b></span>
    </span>
  </button>`;
}

function bindRoomJoin(box) {
  box.onclick = (e) => {
    const b = e.target.closest('[data-room]');
    if (!b) return;
    S.expectRoom = true;
    send({ t: 'join', id: b.dataset.room, watch: b.dataset.status === 'playing' });
  };
}

function pageHead(title, en, desc) {
  return `<section class="page-head"><div class="wrap"><span class="ph-en">${esc(en)}</span><h1>${esc(title)}</h1>${desc ? `<p>${esc(desc)}</p>` : ''}</div></section>`;
}

// ─── 홈 ───────────────────────────────────────────────────
const SLIDES = [
  { id: 'avalon', eyebrow: 'NEW · 화상 추리 게임', title: '레지스탕스 아발론', desc: '카메라로 서로의 얼굴을 보며 속이고 추리하는 원탁의 밤.\n사회자 음성 진행과 CPU 기사까지, 5~10명이 함께해요.' },
  { id: 'liar', eyebrow: 'HOT · 파티 게임', title: '라이어 게임', desc: '제시어를 모르는 단 한 사람.\n한 마디 설명으로 정체를 숨기고, 거짓말쟁이를 찾아내세요.' },
  { id: 'mafia', eyebrow: 'HOT · 심리전', title: '마피아', desc: '밤에는 숨고, 낮에는 속여라.\n최대 12명이 함께하는 실시간 추리 심리전.' },
  { id: 'rummy', eyebrow: '봇과 연습 가능', title: '러미 타일', desc: '같은 색 연속 숫자, 다른 색 같은 숫자.\n타일을 가장 먼저 모두 내려놓는 사람이 승리해요.' },
  { id: 'drawguess', eyebrow: '그림 · 단어', title: '그림 맞히기', desc: '그리는 사람도, 맞히는 사람도 웃음이 터지는\n실시간 그림 퀴즈. 휴대폰으로도 쓱쓱.' },
];
const hero = { i: 0, timer: null, paused: false };

function slideVisual(s) {
  if (s.id === 'avalon') {
    const roles = ['percival', 'merlin', 'assassin', 'morgana'];
    return `<div class="s-bg s-bg-avalon"><img src="/avalon/assets/avalon-cover.png" alt="" decoding="async"></div>
      <div class="s-roles">${roles.map((r, i) => `<img class="role r${i}" src="/avalon/assets/roles/${r}.jpg" alt="" decoding="async">`).join('')}</div>`;
  }
  const src = thumbSrc(s.id);
  return `<div class="s-bg"><img class="s-blur" src="${src}" alt="" decoding="async"><img class="s-main" src="${src}" alt="" decoding="async"></div>`;
}

function heroHTML() {
  return `<section class="hero" id="hero" style="--dur:6.5s">
    <div class="slides">${SLIDES.map((s, i) => `
      <div class="slide ${i === hero.i ? 'on' : ''}" data-i="${i}">
        ${slideVisual(s)}
        <div class="s-shade"></div>
        <div class="wrap s-copy">
          <span class="s-eyebrow">${esc(s.eyebrow)}</span>
          <h2 class="s-title">${esc(s.title)}</h2>
          <span class="s-en">${esc(GAMES[s.id].en)}</span>
          <p class="s-desc">${esc(s.desc).replace(/\n/g, '<br>')}</p>
          <div class="s-cta">
            <a class="btn cta" href="${isExternal(s.id) ? GAMES[s.id].external : `#/game/${s.id}`}" data-play="${s.id}">${icon('play')}지금 플레이</a>
            <a class="btn cta-ghost" href="#/game/${s.id}">게임 정보</a>
          </div>
        </div>
      </div>`).join('')}
    </div>
    <div class="wrap hero-nav">
      <div class="hn-tabs">${SLIDES.map((s, i) => `<button type="button" class="hn-tab ${i === hero.i ? 'on' : ''}" data-i="${i}"><span>${esc(s.title)}</span><i></i></button>`).join('')}</div>
      <div class="hn-arrows"><button type="button" class="hn-prev" aria-label="이전">${icon('back')}</button><span class="hn-count"><b>${hero.i + 1}</b> / ${SLIDES.length}</span><button type="button" class="hn-next" aria-label="다음">${icon('next')}</button></div>
    </div>
  </section>`;
}

function heroGo(i) {
  const el = $('#hero');
  if (!el) return;
  hero.i = (i + SLIDES.length) % SLIDES.length;
  $$('.slide', el).forEach((s) => s.classList.toggle('on', Number(s.dataset.i) === hero.i));
  $$('.hn-tab', el).forEach((t) => {
    t.classList.remove('on');
    if (Number(t.dataset.i) === hero.i) {
      void t.offsetWidth; // 진행 막대 애니메이션 다시 시작
      t.classList.add('on');
    }
  });
  $('.hn-count b', el).textContent = hero.i + 1;
  heroSchedule();
}

function heroSchedule() {
  clearTimeout(hero.timer);
  if (!$('#hero') || hero.paused) return;
  hero.timer = setTimeout(() => heroGo(hero.i + 1), 6500);
}

function bindHero() {
  const el = $('#hero');
  $$('.hn-tab', el).forEach((t) => { t.onclick = () => heroGo(Number(t.dataset.i)); });
  $('.hn-prev', el).onclick = () => heroGo(hero.i - 1);
  $('.hn-next', el).onclick = () => heroGo(hero.i + 1);
  el.onmouseenter = () => { hero.paused = true; el.classList.add('paused'); clearTimeout(hero.timer); };
  el.onmouseleave = () => { hero.paused = false; el.classList.remove('paused'); heroGo(hero.i); };
  let sx = null;
  el.addEventListener('touchstart', (e) => { sx = e.touches[0].clientX; }, { passive: true });
  el.addEventListener('touchend', (e) => {
    if (sx == null) return;
    const dx = e.changedTouches[0].clientX - sx;
    if (Math.abs(dx) > 50) heroGo(hero.i + (dx < 0 ? 1 : -1));
    sx = null;
  });
  heroSchedule();
}

function renderHome() {
  const popular = ['liar', 'mafia', 'avalon', 'drawguess', 'rummy', 'yacht', 'omok', 'onecard'];
  $('#view').innerHTML = `
  <div class="home">
    ${heroHTML()}
    <div class="wrap">
      <div id="room-banner"></div>
      <section class="sec">
        ${secHead('인기 게임', '지금 가장 많이 플레이하는 게임', '#/games')}
        <div class="cards cards-rank">${popular.map((g, i) => gameCard(g, i + 1)).join('')}</div>
      </section>
      <section class="sec">
        <div class="sec-head"><div><h2>지금 열린 방 <span class="count" id="room-count"></span></h2><p>바로 들어가서 함께 플레이하세요</p></div>
          <div class="sec-tools"><form class="join-no" id="join-no">${icon('hash')}<input class="input" inputmode="numeric" placeholder="방 번호" maxlength="4" aria-label="방 번호"><button class="btn sm dark" type="submit">입장</button></form>
          <a class="more" href="#/rooms">전체보기${icon('next')}</a></div></div>
        <div class="room-strip" id="home-rooms"></div>
      </section>
      <section class="sec">
        ${secHead('더 많은 게임', '추리 · 전략 · 순발력, 취향대로 골라 보세요', '#/games')}
        <div class="cards">${CATEGORIES.flatMap((c) => c.games).filter((g) => !popular.includes(g)).map((g) => gameCard(g)).join('')}</div>
      </section>
      <section class="sec">
        ${secHead('커뮤니티', '접속한 사람들과 자유롭게 이야기해요', '#/community')}
        <div class="community-grid">
          <div class="panel chat-panel">${lobbyChatHTML('short')}</div>
          <div class="panel users-panel"><div class="panel-head"><h3>접속자</h3><span class="small muted" id="lobby-users"></span></div><div class="user-list" id="user-list"></div></div>
        </div>
      </section>
    </div>
  </div>`;
  bindHero();
  bindJoinNo();
  bindLobbyChat();
  renderLobbyChat();
  refreshLive();
  updateRoomBanner();
}

function bindJoinNo() {
  const f = $('#join-no');
  if (!f) return;
  f.onsubmit = (e) => {
    e.preventDefault();
    const v = $('input', f).value.trim();
    if (!v) return;
    S.expectRoom = true;
    send({ t: 'join', id: v });
  };
}

// ─── 전체 게임 ────────────────────────────────────────────
function renderGames(genre) {
  const list = CATEGORIES.flatMap((c) => c.games).filter((g) => !genre || GAMES[g].cat === genre);
  $('#view').innerHTML = `
  ${pageHead('전체 게임', 'ALL GAMES', `${Object.keys(GAMES).length}개의 게임을 설치 없이 바로 플레이하세요.`)}
  <div class="wrap page-body">
    <div id="room-banner"></div>
    <div class="chips" role="tablist">
      <a class="chip ${genre ? '' : 'on'}" href="#/games">전체</a>
      ${Object.entries(GENRES).map(([k, v]) => `<a class="chip ${genre === k ? 'on' : ''}" href="#/games/${k}">${esc(v)}</a>`).join('')}
    </div>
    <div class="cards">${list.map((g) => gameCard(g)).join('')}</div>
  </div>`;
  refreshLive();
  updateRoomBanner();
}

// ─── 열린 방 ──────────────────────────────────────────────
function renderRooms() {
  const games = Object.keys(GAMES).filter((g) => !isExternal(g));
  $('#view').innerHTML = `
  ${pageHead('열린 방', 'OPEN ROOMS', '대기 중인 방에 참가하거나, 진행 중인 게임을 관전할 수 있어요.')}
  <div class="wrap page-body">
    <div id="room-banner"></div>
    <div class="rooms-tools">
      <div class="chips">
        <button type="button" class="chip ${S.roomFilter ? '' : 'on'}" data-filter="">전체</button>
        ${games.map((g) => `<button type="button" class="chip ${S.roomFilter === g ? 'on' : ''}" data-filter="${g}">${esc(GAMES[g].name)}</button>`).join('')}
      </div>
      <form class="join-no" id="join-no">${icon('hash')}<input class="input" inputmode="numeric" placeholder="방 번호로 입장" maxlength="4" aria-label="방 번호"><button class="btn sm dark" type="submit">입장</button></form>
    </div>
    <div class="room-grid" id="room-list"></div>
  </div>`;
  $('.rooms-tools .chips').onclick = (e) => {
    const c = e.target.closest('[data-filter]');
    if (!c) return;
    S.roomFilter = c.dataset.filter;
    $$('.rooms-tools .chip').forEach((x) => x.classList.toggle('on', x === c));
    renderRoomList();
  };
  bindJoinNo();
  refreshLive();
  updateRoomBanner();
}

function renderRoomList() {
  const box = $('#room-list');
  if (box) {
    const rooms = S.lobby.rooms.filter((r) => !S.roomFilter || r.game === S.roomFilter);
    box.innerHTML = rooms.length ? rooms.map(roomCard).join('')
      : `<div class="empty-box">${icon('door')}<b>아직 열린 방이 없어요</b><span>게임을 골라 첫 방을 만들어 보세요!</span>${S.roomFilter ? `<a class="btn dark sm" href="#/game/${S.roomFilter}">${esc(GAMES[S.roomFilter].name)} 방 만들기</a>` : '<a class="btn dark sm" href="#/games">게임 고르기</a>'}</div>`;
    bindRoomJoin(box);
  }
  const strip = $('#home-rooms');
  if (strip) {
    const rooms = S.lobby.rooms.slice(0, 8);
    strip.innerHTML = rooms.length ? rooms.map(roomCard).join('')
      : `<div class="empty-box">${icon('door')}<b>아직 열린 방이 없어요</b><span>게임을 골라 첫 방을 만들어 보세요. 링크로 친구를 초대할 수 있어요.</span></div>`;
    bindRoomJoin(strip);
  }
  const cnt = $('#room-count');
  if (cnt) cnt.textContent = S.lobby.rooms.length || '';
}

// ─── 커뮤니티 ─────────────────────────────────────────────
function lobbyChatHTML(size = '') {
  return `<div class="chat lobby-chat ${size}">
    <div class="panel-head"><h3>로비 채팅</h3><span class="live-dot"><i></i>LIVE</span></div>
    <div class="chat-log" id="lobby-log"></div>
    <form class="chat-form" id="lobby-form"><input class="input" maxlength="200" placeholder="모두에게 인사해 보세요!" enterkeyhint="send" autocomplete="off"><button class="btn primary" type="submit" aria-label="전송">${icon('send')}</button></form>
  </div>`;
}

function bindLobbyChat() {
  const f = $('#lobby-form');
  if (!f) return;
  f.onsubmit = (e) => {
    e.preventDefault();
    const inp = $('input', f);
    const v = inp.value.trim();
    if (!v) return;
    send({ t: 'lchat', text: v });
    inp.value = '';
  };
}

function renderCommunity() {
  S.unreadLobby = 0;
  updateLobbyBadge();
  $('#view').innerHTML = `
  ${pageHead('커뮤니티', 'COMMUNITY', '같이 할 사람을 구하거나 자유롭게 이야기해요. 욕설과 도배는 삼가 주세요.')}
  <div class="wrap page-body">
    <div id="room-banner"></div>
    <div class="community-grid tall">
      <div class="panel chat-panel">${lobbyChatHTML()}</div>
      <div class="panel users-panel"><div class="panel-head"><h3>접속자</h3><span class="small muted" id="lobby-users"></span></div><div class="user-list" id="user-list"></div></div>
    </div>
  </div>`;
  bindLobbyChat();
  renderLobbyChat();
  refreshLive();
  updateRoomBanner();
}

function renderUsers() {
  const box = $('#user-list');
  if (!box) return;
  const users = [...S.lobby.users].sort((a, b) => (a.uid === S.me?.uid ? -1 : b.uid === S.me?.uid ? 1 : 0));
  box.innerHTML = users.length ? users.map((u) => `<div class="user-row">${avatar(u.uid, u.name, 'sm')}<span class="un">${esc(u.name)}</span>${u.uid === S.me?.uid ? '<span class="tag me">나</span>' : ''}<span class="ug">${u.game && GAMES[u.game] ? `${esc(GAMES[u.game].name)}` : '로비'}</span></div>`).join('')
    : '<div class="empty">접속자가 없어요.</div>';
}

// 실시간 수치 갱신 (접속자 수, 플레이 인원, 방 목록 등)
function refreshLive(chatReset = false) {
  $('#online b').textContent = S.lobby.online;
  for (const el of $$('[data-live]')) {
    const n = S.lobby.playing[el.dataset.live] || 0;
    el.hidden = !n;
    $('span', el).textContent = `${n}명 플레이 중`;
  }
  $$('.gcard').forEach((c) => {
    const ready = isReady(c.dataset.game);
    if (ready === c.classList.contains('soon')) {
      const rank = $('.g-rank', c)?.textContent;
      c.outerHTML = gameCard(c.dataset.game, Number(rank) || 0);
    }
  });
  renderRoomList();
  renderUsers();
  const lu = $('#lobby-users');
  if (lu) lu.textContent = `${S.lobby.online}명`;
  if (chatReset) renderLobbyChat();
  const gr = $('#gp-rooms');
  if (gr) renderGameRooms(gr.dataset.game);
}

function chatLine(msg, mine) {
  if (msg.sys) return `<div class="chat-line sys ${msg.big ? 'big' : ''}">${esc(msg.text)}</div>`;
  const ch = msg.ch ? `<span class="ch ${esc(msg.ch)}">${{ mafia: '마피아', dead: '관전/망자', guessed: '정답자', team: '팀' }[msg.ch] || esc(msg.ch)}</span>` : '';
  return `<div class="chat-line">${ch}<span class="who ${mine ? 'me' : ''}" style="${mine ? '' : `color:${colorOf(msg.uid)}`}">${esc(msg.name)}</span><span class="txt">${esc(msg.text)}</span></div>`;
}

function renderLobbyChat() {
  const log = $('#lobby-log');
  if (!log) return;
  log.innerHTML = S.lobbyChat.length ? S.lobbyChat.map((m) => chatLine(m, m.uid === S.me?.uid)).join('') : '<div class="chat-line sys">로비에 오신 걸 환영해요!</div>';
  log.scrollTop = log.scrollHeight;
}

function appendLobbyChat(msg) {
  if (route().page !== 'community' && msg.uid !== S.me?.uid) {
    S.unreadLobby++;
    updateLobbyBadge();
  }
  const log = $('#lobby-log');
  if (!log) return;
  const stick = log.scrollHeight - log.scrollTop - log.clientHeight < 60;
  log.insertAdjacentHTML('beforeend', chatLine(msg, msg.uid === S.me?.uid));
  while (log.children.length > 100) log.firstChild.remove();
  if (stick || msg.uid === S.me?.uid) log.scrollTop = log.scrollHeight;
}

function updateLobbyBadge() {
  for (const b of $$('[data-unread]')) {
    b.hidden = !S.unreadLobby;
    b.textContent = S.unreadLobby > 99 ? '99+' : S.unreadLobby;
  }
}

function updateRoomBanner() {
  const box = $('#room-banner');
  if (!box) return;
  if (!S.room) {
    box.innerHTML = '';
    return;
  }
  box.innerHTML = `<div class="room-banner">
    <span class="rb-thumb">${thumb(S.room.game)}</span>
    <div class="rb-main"><b>${esc(GAMES[S.room.game].name)}</b> <span class="muted small">#${S.room.no} ${esc(S.room.title)}</span><div class="small rb-sub">${S.room.status === 'playing' ? '게임이 진행 중이에요!' : '참여 중인 방이 있어요.'}</div></div>
    <a class="btn primary sm" href="#/room/${S.room.id}">돌아가기</a><button class="btn sm" type="button" id="banner-leave">나가기</button></div>`;
  $('#banner-leave').onclick = () => send({ t: 'leave' });
}

// ─── 게임 소개 페이지 ─────────────────────────────────────
function renderGamePage(g) {
  const meta = GAMES[g];
  const ready = isReady(g);
  const ext = isExternal(g);
  const related = CATEGORIES.flatMap((c) => c.games).filter((x) => x !== g && GAMES[x].cat === meta.cat).slice(0, 4);
  $('#view').innerHTML = `
  <div class="gpage">
    <section class="gp-hero">
      ${slideVisual({ id: g })}
      <div class="s-shade"></div>
      <div class="wrap gp-copy">
        <nav class="crumb"><a href="#/">홈</a>${icon('next')}<a href="#/games/${meta.cat}">${esc(genreOf(g))}</a></nav>
        <div class="g-badges static">${badges(g)}</div>
        <h1>${esc(meta.name)}</h1>
        <span class="s-en">${esc(meta.en)}</span>
        <p class="gp-short">${esc(meta.short)}</p>
        <div class="gp-meta"><span>${icon('users')}${playersText(g)}</span><span>${icon('clock')}약 ${meta.time}</span>${meta.bots ? `<span>${icon('bot')}봇과 연습</span>` : ''}${ext ? `<span>${icon('video')}화상 · 음성</span>` : ''}</div>
        <div class="gp-actions">
          ${ext ? `<a class="btn cta lg" href="${meta.external}">${icon('play')}입장하기</a><span class="gate-note" id="gate-note"></span>`
    : ready ? `<button class="btn cta lg" type="button" id="quick">${icon('bolt')}빠른 시작</button>
        <button class="btn cta-ghost lg" type="button" id="create">${icon('plus')}방 만들기</button>`
      : '<button class="btn cta lg" type="button" disabled>곧 열려요!</button>'}
        </div>
      </div>
    </section>
    <div class="wrap gp-body">
      <div class="gp-main">
        <div class="panel"><div class="panel-head"><h3>게임 방법</h3></div><ol class="rules">${meta.rules.map((r) => `<li>${esc(r)}</li>`).join('')}</ol></div>
      </div>
      <aside class="gp-side">
        <div class="panel info-table">
          <div class="panel-head"><h3>게임 정보</h3></div>
          <dl><dt>장르</dt><dd>${esc(genreOf(g))}</dd><dt>인원</dt><dd>${playersText(g)}</dd><dt>플레이 시간</dt><dd>약 ${meta.time}</dd><dt>봇 연습</dt><dd>${meta.bots ? '가능' : '불가'}</dd>${ext ? '<dt>필요</dt><dd>카메라 · 마이크 (선택)</dd>' : ''}</dl>
        </div>
        ${ext ? '' : `<div class="panel"><div class="panel-head"><h3>방 목록</h3><span class="small muted">${esc(meta.name)}</span></div><div class="room-list" id="gp-rooms" data-game="${g}"></div></div>`}
      </aside>
    </div>
    ${related.length ? `<div class="wrap"><section class="sec">${secHead('비슷한 게임', genreOf(g), `#/games/${meta.cat}`)}<div class="cards">${related.map((x) => gameCard(x)).join('')}</div></section></div>` : ''}
  </div>`;
  if (ext) {
    fetch('/avalon/api/site-status', { cache: 'no-store' }).then((r) => r.json()).then((d) => {
      const n = $('#gate-note');
      if (n && d.locked) n.innerHTML = `${icon('lock')}지금은 관리자가 열어 둔 시간에만 입장할 수 있어요`;
    }).catch(() => {});
  } else if (ready) {
    $('#quick').onclick = () => { S.expectRoom = true; send({ t: 'quick', game: g }); };
    $('#create').onclick = () => createRoomModal(g);
  }
  renderGameRooms(g);
  refreshLive();
  updateRoomBanner();
}

function renderGameRooms(g) {
  const box = $('#gp-rooms');
  if (!box) return;
  const rooms = S.lobby.rooms.filter((r) => r.game === g);
  box.innerHTML = rooms.length ? rooms.map(roomCard).join('') : '<div class="empty">아직 방이 없어요.<br>빠른 시작을 누르면 바로 방이 만들어져요!</div>';
  bindRoomJoin(box);
}

function createRoomModal(g) {
  openModal({
    title: `${GAMES[g].name} 방 만들기`,
    body: `<div class="field"><label>방 제목</label><input class="input" id="rt" maxlength="24" placeholder="예) 초보 환영해요" autocomplete="off"></div>
      <label class="check"><input type="checkbox" id="rp"> 비공개 방 (초대 링크로만 들어올 수 있어요)</label>`,
    actions: [{ label: '만들기', cls: 'primary', onClick: (close, el) => {
      S.expectRoom = true;
      send({ t: 'create', game: g, title: $('#rt', el).value, private: $('#rp', el).checked });
    } }],
    onOpen: (el) => {
      const inp = $('#rt', el);
      inp.focus();
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') $('.modal-foot .btn', el).click(); });
    },
  });
}

function rulesModal(g) {
  openModal({ title: `${GAMES[g].name} 게임 방법`, wide: true, body: `<ol class="rules" style="padding:0">${GAMES[g].rules.map((r) => `<li>${esc(r)}</li>`).join('')}</ol>` });
}

// ─── 게임방 ───────────────────────────────────────────────
const game = { id: null, inst: null, key: '', loading: null, pendingVol: null };
const modCache = {};

function isChatHeavy(g) {
  return !!GAMES[g]?.chat;
}

function renderRoom() {
  const r = S.room;
  if (!r) return;
  const meta = GAMES[r.game];
  unmountGame();
  const chatMin = window.innerWidth <= 980 && !isChatHeavy(r.game);
  $('#view').innerHTML = `
  <div class="room ${chatMin ? 'chat-min' : ''}" data-id="${esc(r.id)}" data-game="${r.game}">
    <div class="room-top">
      <button class="back" type="button" id="room-back" title="게임 목록">${icon('back')}</button>
      <div class="room-title"><span class="ricon">${thumb(r.game)}</span>
        <div class="rt-main"><div class="rt-game">${esc(meta.name)}</div><div class="rt-sub" id="rt-sub"></div></div></div>
      <div class="timer-chip" id="timer-chip" hidden>${icon('clock')}<span></span></div>
      <div class="room-actions">
        <button class="btn sm ib" type="button" id="btn-members" title="참가자">${icon('users')}<span class="lbl">참가자</span></button>
        <button class="btn sm ib" type="button" id="btn-invite" title="초대하기">${icon('link')}<span class="lbl">초대</span></button>
        <button class="btn sm ib" type="button" id="btn-sound" title="소리 켜기/끄기">${icon(localStorage.getItem('bg_mute') === '1' ? 'mute' : 'volume')}</button>
        <button class="btn sm ib" type="button" id="btn-rules" title="게임 방법">${icon('help')}<span class="lbl">방법</span></button>
        <button class="btn sm ib" type="button" id="btn-leave" title="나가기">${icon('exit')}<span class="lbl">나가기</span></button>
      </div>
    </div>
    <div class="room-main">
      <div class="stage" id="stage">
        <div class="timerbar" id="timerbar" hidden><i></i><b class="tb-text"></b></div>
        <div class="game-root" id="game-root"></div>
        <div id="overlay"></div>
      </div>
      <aside class="room-side">
        <div class="members" id="members"></div>
        <div class="chat">
          <div class="chat-log" id="room-log"></div>
          <form class="chat-form" id="room-form">
            <button type="button" class="chat-toggle" id="chat-toggle" title="채팅 펼치기">${icon('chat')}<span class="nbadge" id="room-badge" hidden></span></button>
            <input class="input" id="room-input" maxlength="200" placeholder="메시지 입력" enterkeyhint="send" autocomplete="off">
            <button class="btn primary" type="submit" aria-label="전송">${icon('send')}</button>
          </form>
        </div>
      </aside>
    </div>
  </div>`;
  $('#room-back').onclick = () => { location.hash = `#/game/${r.game}`; };
  $('#btn-leave').onclick = () => {
    if (S.room?.status === 'playing' && S.room.seats.includes(S.me.uid) && S.view?.players?.some((p) => p.id === S.me.uid)) {
      openModal({ title: '게임을 나갈까요?', body: '<p>게임 중에 나가면 다시 들어올 수 없어요.</p>', actions: [{ label: '계속하기' }, { label: '나가기', cls: 'bad', onClick: () => send({ t: 'leave' }) }] });
    } else send({ t: 'leave' });
  };
  $('#btn-rules').onclick = () => rulesModal(r.game);
  $('#btn-sound').onclick = (e) => {
    const mute = localStorage.getItem('bg_mute') !== '1';
    localStorage.setItem('bg_mute', mute ? '1' : '0');
    e.currentTarget.innerHTML = icon(mute ? 'mute' : 'volume');
    toast(mute ? '소리를 껐어요.' : '소리를 켰어요.');
  };
  $('#btn-invite').onclick = invite;
  $('#btn-members').onclick = () => {
    const room = $('.room');
    if (window.innerWidth <= 980) room.classList.toggle('show-members');
  };
  $('#chat-toggle').onclick = () => {
    const room = $('.room');
    room.classList.toggle('chat-min');
    if (!room.classList.contains('chat-min')) {
      S.unreadRoom = 0;
      updateRoomBadge();
      const log = $('#room-log');
      log.scrollTop = log.scrollHeight;
    }
  };
  $('#room-form').onsubmit = (e) => {
    e.preventDefault();
    const inp = $('#room-input');
    const v = inp.value.trim();
    if (!v) return;
    send({ t: 'chat', text: v });
    inp.value = '';
  };
  renderRoomChat();
  updateRoom(true);
}

function invite() {
  const url = `${location.origin}/#/room/${S.room.id}`;
  const text = `[보드게임 모음집] ${GAMES[S.room.game].name} 같이 해요! (방 번호 ${S.room.no})`;
  if (navigator.share && window.innerWidth <= 980) {
    navigator.share({ title: '보드게임 모음집', text, url }).catch(() => {});
    return;
  }
  navigator.clipboard?.writeText(`${text}\n${url}`).then(
    () => toast('초대 링크를 복사했어요! 친구에게 보내 보세요.', 'good'),
    () => openModal({ title: '초대 링크', body: `<input class="input" value="${esc(url)}" readonly onclick="this.select()">` }),
  );
}

function updateRoom() {
  const r = S.room;
  if (!r || !$('.room')) return;
  $('#rt-sub').textContent = `#${r.no} · ${r.title}${r.private ? ' · 비공개' : ''}`;
  renderMembers();
  renderStage();
}

function renderMembers() {
  const r = S.room;
  const box = $('#members');
  if (!box) return;
  const isHost = r.host === S.me?.uid;
  const seated = r.seats.map((id) => r.members.find((m) => m.uid === id)).filter(Boolean);
  const inGame = new Set(S.view?.players?.map((p) => p.id) || []);
  const watchers = r.members.filter((m) => !r.seats.includes(m.uid) && !(r.status === 'playing' && inGame.has(m.uid)));
  const row = (m) => `<div class="member ${m.online === false && !m.bot ? 'offline' : ''}">
      ${avatar(m.uid, m.name, 'sm', m.bot)}<span class="mname">${esc(m.name)}</span>
      ${m.uid === r.host ? `<span class="tag host">${icon('crown')}방장</span>` : ''}${m.uid === S.me?.uid ? '<span class="tag me">나</span>' : ''}
      ${m.online === false && !m.bot ? '<span class="tag off">연결 끊김</span>' : ''}
      ${isHost && m.uid !== S.me?.uid ? `<button class="kick" type="button" data-kick="${esc(m.uid)}" title="강퇴">✕</button>` : ''}
    </div>`;
  box.innerHTML = `<h4>참가자 ${seated.length}/${GAMES[r.game].max}</h4>${seated.map(row).join('')}
    ${watchers.length ? `<h4 style="margin-top:8px">관전 ${watchers.length}</h4>${watchers.map(row).join('')}` : ''}`;
  box.onclick = (e) => {
    const k = e.target.closest('[data-kick]');
    if (!k) return;
    const m = r.members.find((x) => x.uid === k.dataset.kick);
    openModal({ title: '강퇴할까요?', body: `<p>${esc(m?.name)}님을 방에서 내보낼까요?</p>`, actions: [{ label: '취소' }, { label: '강퇴', cls: 'bad', onClick: () => send({ t: 'kick', uid: k.dataset.kick }) }] });
  };
}

function renderRoomChat() {
  const log = $('#room-log');
  if (!log) return;
  log.innerHTML = S.chat.map((m) => chatLine(m, m.uid === S.me?.uid)).join('');
  log.scrollTop = log.scrollHeight;
}

function appendRoomChat(msg) {
  const log = $('#room-log');
  if (!log) {
    updateRoomBanner();
    return;
  }
  const stick = log.scrollHeight - log.scrollTop - log.clientHeight < 80;
  log.insertAdjacentHTML('beforeend', chatLine(msg, msg.uid === S.me?.uid));
  while (log.children.length > 150) log.firstChild.remove();
  if (stick || msg.uid === S.me?.uid) log.scrollTop = log.scrollHeight;
  if ($('.room')?.classList.contains('chat-min') && !msg.sys && msg.uid !== S.me?.uid) {
    S.unreadRoom++;
    updateRoomBadge();
  }
  game.inst?.onChat?.(msg);
}

function updateRoomBadge() {
  const b = $('#room-badge');
  if (!b) return;
  b.hidden = !S.unreadRoom;
  b.textContent = S.unreadRoom > 99 ? '99+' : S.unreadRoom;
}

// ─── 무대(대기실/게임) ────────────────────────────────────
function resultKey() {
  return `${S.room.id}:${S.room.round}`;
}

function renderStage() {
  const r = S.room;
  const overlay = $('#overlay');
  let mode = 'waiting';
  if (r.status === 'playing' && S.view) mode = 'game';
  else if (r.status === 'waiting' && S.view && S.resultSeen !== resultKey()) mode = 'result';
  if (mode === 'waiting') {
    unmountGame();
    overlay.innerHTML = '';
    renderWaiting();
    return;
  }
  mountGame().then(() => {
    if (!S.room || !$('#game-root')) return;
    try {
      game.inst?.update(S.view, gameApi);
    } catch (e) {
      console.error(e);
    }
    const mode2 = S.room.status === 'playing' ? 'game' : S.resultSeen !== resultKey() ? 'result' : 'waiting';
    if (mode2 === 'result') showResult();
    else if (mode2 === 'waiting') renderStage();
    else overlay.innerHTML = '';
  });
}

function showResult() {
  const r = S.room;
  const overlay = $('#overlay');
  if (!r.result || overlay.dataset.key === resultKey() && overlay.innerHTML) return;
  const won = r.result.winners?.includes(S.me.uid);
  const played = S.view?.players?.some((p) => p.id === S.me.uid);
  overlay.dataset.key = resultKey();
  overlay.innerHTML = `<div class="result-overlay"><div class="result-box">
    <div class="trophy ${won ? 'win' : played && r.result.winners?.length ? 'lose' : ''}">${icon(won ? 'trophy' : played && r.result.winners?.length ? 'flame' : 'trophy')}</div>
    <h2>${won ? '승리했어요!' : played && r.result.winners?.length ? '아쉽게 졌어요' : '게임 종료'}</h2>
    <p>${esc(r.result.text)}</p>
    <div class="actions">
      <button class="btn ghost" type="button" id="see-board">결과 화면 보기</button>
      <button class="btn primary lg" type="button" id="to-wait">대기실로 가기</button>
    </div></div></div>`;
  if (won) beep(880, 180);
  $('#to-wait').onclick = () => { S.resultSeen = resultKey(); overlay.innerHTML = ''; renderStage(); };
  $('#see-board').onclick = () => {
    overlay.innerHTML = `<div style="position:absolute;left:50%;bottom:16px;transform:translateX(-50%);z-index:20"><button class="btn primary" type="button" id="to-wait2">대기실로 가기 →</button></div>`;
    $('#to-wait2').onclick = () => { S.resultSeen = resultKey(); overlay.innerHTML = ''; renderStage(); };
  };
}

async function mountGame() {
  const r = S.room;
  const key = `${r.id}:${r.game}:${r.round}`;
  if (game.key === key && game.inst) return;
  if (game.loading && game.loadingKey === key) return game.loading;
  unmountGame();
  game.loadingKey = key;
  game.loading = (async () => {
    let mod = modCache[r.game];
    if (!mod) {
      mod = (await import(`./games/${r.game}.js`)).default;
      modCache[r.game] = mod;
    }
    if (!S.room || `${S.room.id}:${S.room.game}:${S.room.round}` !== key) return;
    const root = $('#game-root');
    if (!root) return;
    root.innerHTML = '';
    root.className = `game-root g-${r.game}`;
    game.inst = mod();
    game.key = key;
    game.id = r.game;
    game.inst.mount(root, gameApi);
    if (game.pendingVol && game.inst.onVol) game.inst.onVol(game.pendingVol);
    game.pendingVol = null;
    const inp = $('#room-input');
    if (inp) inp.placeholder = game.inst.chatHint || '메시지 입력';
  })();
  try {
    await game.loading;
  } finally {
    game.loading = null;
  }
}

function unmountGame() {
  if (game.inst) {
    try { game.inst.unmount?.(); } catch (e) { console.error(e); }
  }
  game.inst = null;
  game.key = '';
  game.id = null;
  const root = $('#game-root');
  if (root) root.className = 'game-root';
  const inp = $('#room-input');
  if (inp) inp.placeholder = '메시지 입력';
}

function renderWaiting() {
  const r = S.room;
  const meta = GAMES[r.game];
  const root = $('#game-root');
  if (!root) return;
  root.className = 'game-root';
  const isHost = r.host === S.me.uid;
  const members = Object.fromEntries(r.members.map((m) => [m.uid, m]));
  const seats = r.seats.map((id) => members[id]).filter(Boolean);
  const mySeat = r.seats.includes(S.me.uid);
  const slots = [];
  for (let i = 0; i < meta.max; i++) {
    const m = seats[i];
    if (m) {
      slots.push(`<div class="seat ${m.uid === S.me.uid ? 'me' : ''}">
        ${isHost && m.uid !== S.me.uid ? `<button class="kick" type="button" data-kick="${esc(m.uid)}" title="내보내기">✕</button>` : ''}
        ${avatar(m.uid, m.name, 'lg', m.bot)}<div class="sname">${esc(m.name)}</div>
        <div class="stags">${m.uid === r.host ? `<span class="tag host">${icon('crown')}방장</span>` : ''}${m.bot ? '<span class="tag bot">봇</span>' : ''}${m.uid === S.me.uid ? '<span class="tag me">나</span>' : ''}${m.online === false && !m.bot ? '<span class="tag off">연결 끊김</span>' : ''}</div>
      </div>`);
    } else if (i < Math.max(meta.min, seats.length + 1) || i < 4) {
      slots.push(`<div class="seat empty">${isHost && meta.bots ? `<button class="btn sm" type="button" data-bot="1">${icon('bot')}봇 추가</button>` : '빈 자리'}</div>`);
    }
  }
  const need = Math.max(0, meta.min - seats.length);
  const opts = meta.options || [];
  root.innerHTML = `<div class="waiting">
    ${r.result ? `<div class="result-card"><div class="res-t">${icon('trophy')}<span>${esc(r.result.text)}</span></div><div class="res-w">한 판 더 하려면 방장이 게임을 시작하면 돼요!</div></div>` : ''}
    <div class="wait-head"><h2>${esc(meta.name)} 대기실</h2><p>${playersText(r.game)} · ${need ? `<b style="color:var(--accent)">${need}명 더</b> 모이면 시작할 수 있어요` : '모두 모였어요! 준비되면 시작하세요'}</p></div>
    <div class="seats">${slots.join('')}</div>
    ${opts.length ? `<div class="panel"><div class="panel-head"><h3>게임 설정</h3>${isHost ? '' : '<span class="small muted">방장만 바꿀 수 있어요</span>'}</div><div class="opts">
      ${opts.map((o) => `<div class="opt"><label>${esc(o.label)}</label>${isHost
    ? `<select class="input" data-opt="${o.key}">${o.choices.map(([v, l]) => `<option value="${esc(JSON.stringify(v))}" ${r.opts[o.key] === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`
    : `<div class="val">${esc(o.choices.find(([v]) => v === r.opts[o.key])?.[1] ?? '-')}</div>`}</div>`).join('')}
    </div></div>` : ''}
    <div class="wait-actions">
      ${isHost ? `<button class="btn primary lg" type="button" id="start" ${need ? 'disabled' : ''}>${icon('play')}게임 시작</button>` : ''}
      ${isHost && meta.bots && seats.length < meta.max ? `<button class="btn lg" type="button" data-bot="1">${icon('bot')}봇 추가</button>` : ''}
      ${isHost && meta.bots && seats.some((m) => m.bot) ? '<button class="btn lg" type="button" data-bot="0">봇 빼기</button>' : ''}
      <button class="btn lg" type="button" id="invite2">${icon('link')}친구 초대</button>
      ${mySeat ? '<button class="btn lg ghost" type="button" id="stand">관전하기</button>' : seats.length < meta.max ? '<button class="btn lg good" type="button" id="sit">참가하기</button>' : ''}
    </div>
    ${isHost ? '' : `<p class="wait-note">${mySeat ? '방장이 게임을 시작하기를 기다리고 있어요…' : '관전 중이에요. 자리가 있으면 참가할 수 있어요.'}</p>`}
    ${meta.bots && seats.length < meta.min + 1 ? '<p class="wait-note">혼자라면 봇을 추가해서 바로 연습할 수 있어요!</p>' : ''}
  </div>`;
  root.onclick = (e) => {
    const b = e.target.closest('[data-bot]');
    if (b) send({ t: 'bot', add: b.dataset.bot === '1' });
    const k = e.target.closest('[data-kick]');
    if (k) send({ t: 'kick', uid: k.dataset.kick });
    if (e.target.closest('#start')) send({ t: 'start' });
    if (e.target.closest('#invite2')) invite();
    if (e.target.closest('#sit')) send({ t: 'seat', sit: true });
    if (e.target.closest('#stand')) send({ t: 'seat', sit: false });
  };
  root.onchange = (e) => {
    const sel = e.target.closest('[data-opt]');
    if (sel) send({ t: 'opts', opts: { [sel.dataset.opt]: JSON.parse(sel.value) } });
  };
}

// ─── 게임 모듈에 주는 도구 ────────────────────────────────
const gameApi = {
  me: () => S.me?.uid,
  send: (a) => send({ t: 'act', a }),
  raw: (m) => send(m),
  room: () => S.room,
  view: () => S.view,
  now,
  isHost: () => S.room?.host === S.me?.uid,
  name(id) {
    return S.view?.players?.find((p) => p.id === id)?.name || S.room?.members.find((m) => m.uid === id)?.name || '???';
  },
  isBot: (id) => !!S.room?.members.find((m) => m.uid === id)?.bot,
  isOnline: (id) => S.room?.members.find((m) => m.uid === id)?.online !== false,
  toast,
  beep,
  focusChat() {
    const room = $('.room');
    room?.classList.remove('chat-min');
    $('#room-input')?.focus();
  },
  setChatHint(t) {
    const inp = $('#room-input');
    if (inp) inp.placeholder = t || '메시지 입력';
  },
};

// ─── 타이머 표시 ──────────────────────────────────────────
let lastTurnBeep = '';
setInterval(() => {
  const bar = $('#timerbar');
  const chip = $('#timer-chip');
  if (!bar || !chip) return;
  const t = S.room?.status === 'playing' ? S.view?.timer : null;
  if (!t || !t.end) {
    bar.hidden = true;
    chip.hidden = true;
    return;
  }
  const left = t.end - now();
  const frac = Math.max(0, Math.min(1, left / (t.total || 1)));
  bar.hidden = false;
  chip.hidden = false;
  bar.querySelector('i').style.transform = `scaleX(${frac})`;
  bar.classList.toggle('warn', left < t.total * 0.5 && left >= 5000);
  bar.classList.toggle('danger', left < 5000);
  const sec = Math.max(0, Math.ceil(left / 1000));
  const txt = sec >= 60 ? `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}` : `${sec}초`;
  chip.querySelector('span').textContent = txt;
  bar.querySelector('.tb-text').textContent = txt;
  chip.classList.toggle('danger', left < 5000 && left > 0);
}, 200);

// 내 차례 알림 (탭 제목 깜빡임 + 소리)
setInterval(() => {
  const myTurn = !!(S.room?.status === 'playing' && game.inst?.myTurn?.(S.view));
  const key = `${S.room?.id}:${S.room?.round}:${JSON.stringify(S.view?.timer || '')}`;
  if (myTurn && key !== lastTurnBeep) {
    lastTurnBeep = key;
    beep(700, 90);
  }
  document.title = myTurn && document.hidden ? (Math.floor(Date.now() / 1000) % 2 ? '🔔 내 차례예요!' : '보드게임 모음집') : '보드게임 모음집';
}, 1000);

// ─── 시작 ─────────────────────────────────────────────────
$$('[data-icon]').forEach((el) => { el.innerHTML = icon(el.dataset.icon); });
render();
net.connect();
if (firstVisit) setTimeout(() => nameModal(true), 400);
