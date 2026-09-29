'use strict';
// 보드게임 모음집의 /avalon 경로에서 동작 (단독 실행 시 루트)
const AVALON_BASE = location.pathname.startsWith('/avalon') ? '/avalon' : '';

const $ = id => document.getElementById(id);
const els = {
  entryScreen: $('entryScreen'), gameScreen: $('gameScreen'), nameInput: $('nameInput'), roomInput: $('roomInput'),
  createBtn: $('createBtn'), joinBtn: $('joinBtn'), entryError: $('entryError'), roomCodeText: $('roomCodeText'),
  copyCodeBtn: $('copyCodeBtn'), phaseLabel: $('phaseLabel'), scoreLabel: $('scoreLabel'), videoGrid: $('videoGrid'),
  gameControls: $('gameControls'), missionTrack: $('missionTrack'), historyPanel: $('historyPanel'),
  voiceBtn: $('voiceBtn'), cameraBtn: $('cameraBtn'), micBtn: $('micBtn'), connectionBanner: $('connectionBanner'),
  guideBtn: $('guideBtn'), entryGuideBtn: $('entryGuideBtn'), leaveBtn: $('leaveBtn'), abortBtn: $('abortBtn'), voiceSettingsBtn: $('voiceSettingsBtn'),
  guideModal: $('guideModal'), voiceModal: $('voiceModal'), voiceSelect: $('voiceSelect'), voiceTestBtn: $('voiceTestBtn'),
  narratorOverlay: $('narratorOverlay'), narratorText: $('narratorText'), narratorClose: $('narratorClose'), toast: $('toast')
};
const siteLockButtons = [...document.querySelectorAll('[data-site-lock]')];

const RULES = {
  5: { good: 3, evil: 2, teams: [2, 3, 2, 3, 3] },
  6: { good: 4, evil: 2, teams: [2, 3, 4, 3, 4] },
  7: { good: 4, evil: 3, teams: [2, 3, 3, 4, 4] },
  8: { good: 5, evil: 3, teams: [3, 4, 4, 5, 5] },
  9: { good: 6, evil: 3, teams: [3, 4, 4, 5, 5] },
  10: { good: 6, evil: 4, teams: [3, 4, 4, 5, 5] }
};

const PHASE_LABELS = {
  lobby: '대기실', role_reveal: '역할 확인', team_building: '원정대 구성', team_vote: '찬반 투표',
  team_vote_result: '투표 결과', excalibur_assign: '엑스칼리버 배정', mission_vote: '비밀 원정',
  excalibur_action: '엑스칼리버', mission_result: '원정 결과', lancelot_reveal: '란슬롯 카드',
  lady_of_lake: '호수의 여인', assassination: '멀린 암살', game_over: '게임 종료'
};

const ROLE_IMAGES = {
  merlin: AVALON_BASE + '/assets/roles/merlin.jpg', percival: AVALON_BASE + '/assets/roles/percival.jpg', servant: AVALON_BASE + '/assets/roles/servant.jpg',
  assassin: AVALON_BASE + '/assets/roles/assassin.jpg', mordred: AVALON_BASE + '/assets/roles/mordred.jpg', morgana: AVALON_BASE + '/assets/roles/morgana.jpg',
  oberon: AVALON_BASE + '/assets/roles/oberon.jpg', minion: AVALON_BASE + '/assets/roles/minion.jpg', lancelot_good: AVALON_BASE + '/assets/roles/lancelot_good.jpg',
  lancelot_evil: AVALON_BASE + '/assets/roles/lancelot_evil.jpg'
};
const ROLE_LABELS = {
  merlin: ['멀린','선'], percival: ['퍼시벌','선'], servant: ['충신','선'], assassin: ['암살자','악'],
  mordred: ['모드레드','악'], morgana: ['모르가나','악'], oberon: ['오베론','악'], minion: ['모드레드의 하수인','악'],
  lancelot_good: ['선의 란슬롯','선'], lancelot_evil: ['악의 란슬롯','악']
};
function roleImage(key) { return ROLE_IMAGES[key] || AVALON_BASE + '/assets/roles/servant.jpg'; }

const clientId = localStorage.getItem('avalonLiveClientId') || (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);
localStorage.setItem('avalonLiveClientId', clientId);
function readResumeTokens() {
  try { return JSON.parse(localStorage.getItem('avalonLiveResumeTokens') || '{}') || {}; } catch (_) { return {}; }
}
function getResumeToken(code) { return readResumeTokens()[String(code || '').toUpperCase()] || ''; }
function saveResumeToken(code, token) {
  if (!code || !token) return;
  const tokens = readResumeTokens();
  tokens[String(code).toUpperCase()] = token;
  localStorage.setItem('avalonLiveResumeTokens', JSON.stringify(tokens));
}
function deleteResumeToken(code) {
  const tokens = readResumeTokens();
  delete tokens[String(code || '').toUpperCase()];
  localStorage.setItem('avalonLiveResumeTokens', JSON.stringify(tokens));
}

let socket = null;
let localStream = null;
let currentState = null;
let privateRole = null;
let currentRoomCode = '';
let currentName = localStorage.getItem('avalonLiveName') || localStorage.getItem('bg_name') || '';
let pendingEntry = null;
let iceServers = [{ urls: ['stun:stun.cloudflare.com:3478'] }];
let turnUsage = null;
let serviceBlocked = false;
let usagePollTimer = null;
let sitePollTimer = null;
let rtcRosterSignature = '';
let yunaWarningShown = false;
let ladyResult = null;
let excaliburResult = null;
const voiceEnabled = true; // 사회자 음성은 항상 켜짐
let selectedVoiceURI = ''; // Yuna 고정
let cameraEnabled = true;
let micEnabled = true;
let selectedTeam = new Set();
let lastPhase = null;
let toastTimer = null;
let narratorTimer = null;
let speechGeneration = 0;
let narratorBusyUntil = 0;
let botSpeechTimer = null;
const peers = new Map(); // socketId -> { pc, clientId }
const remoteStreams = new Map(); // clientId -> MediaStream
const peerSocketByClient = new Map();
const pendingIce = new Map();

els.nameInput.value = currentName;
const urlRoom = new URLSearchParams(location.search).get('room');
if (urlRoom) els.roomInput.value = urlRoom.toUpperCase().slice(0, 5);
updateMediaButtons();

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[ch]));
}
function myPlayer() { return currentState?.players?.find(p => p.clientId === clientId) || null; }
function playerById(id) { return currentState?.players?.find(p => p.clientId === id) || null; }
function isHost() { return currentState?.hostClientId === clientId; }
function isParticipant() { return !!myPlayer()?.isParticipant; }
function activePlayers() { return currentState?.players?.filter(p => p.isParticipant) || []; }
function isLeader() { return !!myPlayer()?.isLeader; }
function isAssassin() { return privateRole?.role === 'assassin'; }
function teamSizeForMission() {
  return RULES[currentState?.playerCount || activePlayers().length]?.teams?.[(currentState?.missionNo || 1) - 1] || currentState?.teamSize || 0;
}
function showToast(message, ms = 2600) {
  clearTimeout(toastTimer);
  els.toast.textContent = message;
  els.toast.classList.remove('hidden');
  toastTimer = setTimeout(() => els.toast.classList.add('hidden'), ms);
}
function setEntryError(message = '') { els.entryError.textContent = message; }
function setEntryBusy(busy) {
  els.createBtn.disabled = busy || serviceBlocked;
  els.joinBtn.disabled = busy || serviceBlocked;
  els.createBtn.innerHTML = busy ? '<span>왕국과 연결 중…</span><small>잠시만 기다려주세요</small>' : '<span>새 원탁 열기</span><small>내가 방장이 됩니다</small>';
  els.joinBtn.textContent = busy ? '입장 준비 중…' : '초대받은 원탁 입장';
}
function showConnection(message = '') {
  if (!message) els.connectionBanner.classList.add('hidden');
  else { els.connectionBanner.textContent = message; els.connectionBanner.classList.remove('hidden'); }
}
function formatUsage(usage) {
  if (!usage) return '';
  return `${Number(usage.usageGB || 0).toLocaleString('ko-KR', { maximumFractionDigits: 1 })}GB / ${Number(usage.capGB || 800).toLocaleString('ko-KR')}GB`;
}
function stopLiveSessionForCap() {
  serviceBlocked = true;
  pendingEntry = null;
  setEntryBusy(false);
  setEntryError(`TURN 월간 안전 한도(${turnUsage?.capGB || 800}GB)에 도달해 이번 달 게임 서비스를 자동 일시정지했습니다.`);
  showConnection(`안전 정지 · TURN 사용량 ${formatUsage(turnUsage)}`);
  if (socket) socket.disconnect();
  for (const { pc } of peers.values()) { try { pc.close(); } catch (_) {} }
  peers.clear(); remoteStreams.clear(); peerSocketByClient.clear(); pendingIce.clear();
  if (localStream) for (const track of localStream.getTracks()) track.enabled = false;
  renderVideoGrid();
  if (els.gameControls && !els.gameScreen.classList.contains('hidden')) {
    els.gameControls.innerHTML = section('월간 사용량 안전 정지', `TURN 사용량이 설정된 ${turnUsage?.capGB || 800}GB 안전 한도에 도달했습니다. 추가 과금을 피하기 위해 새 연결과 게임 진행을 중지했습니다.`, `<div class="result-box bad"><strong>${formatUsage(turnUsage)}</strong><span>다음 월 사용량이 초기화된 뒤 다시 접속해주세요.</span></div>`);
  }
}
function applyUsageStatus(usage) {
  turnUsage = usage || turnUsage;
  if (turnUsage?.blocked) {
    stopLiveSessionForCap();
    return;
  }
  serviceBlocked = false;
  setEntryBusy(false);
  if (turnUsage?.turnConfigured && !turnUsage?.turnAllowed) {
    const msg = turnUsage.reason === 'usage-guard-not-configured'
      ? 'TURN 사용량 안전장치가 아직 설정되지 않아 안전을 위해 TURN은 꺼져 있고 STUN만 사용합니다.'
      : turnUsage.reason === 'usage-check-failed'
        ? 'TURN 사용량 확인에 실패해 안전을 위해 TURN은 꺼져 있고 STUN만 사용합니다.'
        : '';
    if (msg && !els.gameScreen.classList.contains('hidden')) showConnection(msg);
  }
}

async function loadConfig() {
  try {
    const res = await fetch(AVALON_BASE + '/config', { cache: 'no-store' });
    const cfg = await res.json();
    if (Array.isArray(cfg.iceServers) && cfg.iceServers.length) iceServers = cfg.iceServers;
    applyUsageStatus(cfg.turnUsage);
    return cfg;
  } catch (_) {
    return null;
  }
}
async function checkUsageGuard(force = false) {
  try {
    const res = await fetch(AVALON_BASE + `/api/usage${force ? '?refresh=1' : ''}`, { cache: 'no-store' });
    const data = await res.json();
    if (data?.turnUsage) applyUsageStatus(data.turnUsage);
    return data?.turnUsage || null;
  } catch (_) {
    return null;
  }
}
function startUsagePolling() {
  if (usagePollTimer) clearInterval(usagePollTimer);
  usagePollTimer = setInterval(() => checkUsageGuard(false), 30000);
}

function syncAdminSiteLockButtons(data) {
  const visible = !!data?.admin && !data?.locked;
  for (const btn of siteLockButtons) btn.classList.toggle('hidden', !visible);
}

async function checkSiteGate() {
  try {
    const res = await fetch(AVALON_BASE + '/api/site-status', { cache: 'no-store' });
    const data = await res.json();
    syncAdminSiteLockButtons(data);
    if (data?.locked && !data?.admin) {
      if (socket) { try { socket.disconnect(); } catch (_) {} }
      if (localStream) for (const track of localStream.getTracks()) track.stop();
      location.reload();
      return false;
    }
    return true;
  } catch (_) { return true; }
}

async function lockSiteFromMain() {
  if (!confirm('사이트를 잠그면 새 접속이 즉시 차단되고, 현재 접속자도 잠금 상태를 확인하는 즉시 게임에서 나가게 됩니다. 정말 사이트를 잠글까요?')) return;
  for (const btn of siteLockButtons) btn.disabled = true;
  try {
    const res = await fetch(AVALON_BASE + '/api/admin/lock', { method: 'POST' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.ok) throw new Error(data?.error || '사이트를 잠글 수 없습니다.');
    await fetch(AVALON_BASE + '/api/admin/logout', { method: 'POST' }).catch(() => {});
    if (socket) { try { socket.disconnect(); } catch (_) {} }
    if (localStream) for (const track of localStream.getTracks()) track.stop();
    location.href = AVALON_BASE + '/';
  } catch (err) {
    for (const btn of siteLockButtons) btn.disabled = false;
    showToast(err?.message || '사이트 잠금에 실패했습니다.', 4200);
  }
}
function startSitePolling() {
  if (sitePollTimer) clearInterval(sitePollTimer);
  sitePollTimer = setInterval(checkSiteGate, 15000);
}

async function ensureMedia() {
  if (localStream) return localStream;
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('이 브라우저는 카메라/마이크 연결을 지원하지 않습니다. 최신 Chrome 또는 Safari를 사용해주세요.');
  if (location.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(location.hostname)) {
    throw new Error('휴대폰 카메라 사용을 위해 HTTPS 주소로 접속해야 합니다. Cloudflare 배포 주소처럼 https:// 로 시작하는 주소를 사용해주세요.');
  }
  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 320, max: 480 }, height: { ideal: 240, max: 360 }, frameRate: { ideal: 12, max: 15 } },
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
    });
    applyLocalTrackState();
    return localStream;
  } catch (err) {
    throw new Error('카메라·마이크 권한을 허용한 뒤 다시 시도해주세요. 브라우저 설정에서 이 사이트의 권한을 확인할 수 있습니다.');
  }
}

function applyLocalTrackState() {
  if (!localStream) { updateMediaButtons(); return; }
  const participant = isParticipant();
  const autoSilence = !!currentState?.autoSilence;
  for (const track of localStream.getVideoTracks()) track.enabled = participant && !serviceBlocked && cameraEnabled && !currentState?.coverFaces;
  for (const track of localStream.getAudioTracks()) track.enabled = participant && !serviceBlocked && micEnabled && !autoSilence;
  updateMediaButtons();
}
function updateMediaButtons() {
  const participant = !currentState || isParticipant();
  els.voiceBtn.classList.add('active');
  els.voiceBtn.textContent = '🔊';
  els.voiceBtn.disabled = true;
  els.voiceBtn.title = '사회자 음성 · Yuna 고정 · 항상 켜짐';
  els.cameraBtn.disabled = !participant;
  els.micBtn.disabled = !participant;
  els.cameraBtn.classList.toggle('active', participant && !serviceBlocked && cameraEnabled && !currentState?.coverFaces);
  els.cameraBtn.textContent = !participant ? '👁' : currentState?.coverFaces ? '🎭' : (cameraEnabled ? '📹' : '🚫');
  els.cameraBtn.title = !participant ? '관전자 모드에서는 영상이 사용되지 않습니다.' : currentState?.coverFaces ? '비밀 단계에서는 영상 송출이 자동 중지됩니다.' : '카메라 켜기/끄기';
  els.micBtn.classList.toggle('active', participant && !serviceBlocked && micEnabled && !currentState?.autoSilence);
  els.micBtn.textContent = participant && !serviceBlocked && micEnabled && !currentState?.autoSilence ? '🎙️' : '🔇';
  els.micBtn.title = !participant ? '관전자 모드에서는 마이크가 사용되지 않습니다.' : currentState?.autoSilence ? '비밀 단계에서는 마이크가 자동 음소거됩니다.' : '마이크 켜기/끄기';
}

function bindSocket(roomCode) {
  if (serviceBlocked) return;
  if (socket?.roomCode === String(roomCode || '').toUpperCase()) return;
  if (socket) socket.disconnect();
  socket = new CloudSocket(roomCode);

  socket.on('connect', () => {
    showConnection('');
    if (pendingEntry) {
      const entry = pendingEntry;
      pendingEntry = null;
      sendEntry(entry);
    } else if (currentRoomCode && currentName) {
      socket.emit('join-room', { code: currentRoomCode, name: currentName, clientId, resumeToken: getResumeToken(currentRoomCode) }, ack => {
        if (!ack?.ok) return showConnection(`재접속 실패: ${ack?.error || '알 수 없는 오류'}`);
        saveResumeToken(currentRoomCode, ack.resumeToken);
        afterJoined();
      });
    }
  });
  socket.on('disconnect', () => {
    for (const { pc } of peers.values()) { try { pc.close(); } catch (_) {} }
    peers.clear(); remoteStreams.clear(); peerSocketByClient.clear(); pendingIce.clear();
    renderVideoGrid();
    if (!serviceBlocked) showConnection('연결이 끊겼습니다. 자동으로 재접속 중…');
  });
  socket.on('connect_error', async () => {
    await checkUsageGuard(true);
    if (!serviceBlocked) showConnection('서버에 연결할 수 없습니다. 네트워크를 확인해주세요.');
  });
  socket.on('room-state', state => {
    const phaseChanged = lastPhase && lastPhase !== state.phase;
    currentState = state;
    if (phaseChanged) {
      selectedTeam = new Set();
      if (state.phase !== 'lady_of_lake') ladyResult = null;
      if (state.phase !== 'excalibur_action') excaliburResult = null;
    }
    lastPhase = state.phase;
    applyLocalTrackState();
    renderAll();
    syncParticipationRtc().catch(err => console.warn('participation media sync', err));
  });
  socket.on('private-role', role => {
    privateRole = role;
    renderControls();
  });
  socket.on('lady-result', payload => {
    ladyResult = payload;
    const sideText = payload?.side === 'good' ? '선의 세력' : '악의 세력';
    showToast(`호수의 여인: ${payload?.targetName || '대상'}님은 ${sideText}입니다.`, 7000);
    renderControls();
  });
  socket.on('excalibur-result', payload => {
    excaliburResult = payload;
    const before = payload?.originalSuccess ? '성공' : '실패';
    const after = payload?.changedSuccess ? '성공' : '실패';
    showToast(`엑스칼리버: ${payload?.targetName || '대상'}님의 원래 카드는 ${before}, 변경 후 ${after}입니다.`, 7000);
  });
  socket.on('narrator', payload => showNarrator(payload));
  socket.on('bot-speech', payload => showBotSpeech(payload));
  socket.on('kicked', () => {
    socket.disconnect();
    showToast('방장이 대기실에서 내보냈습니다.', 3500);
    setTimeout(() => location.href = location.pathname, 900);
  });
  socket.on('replaced', () => {
    socket.disconnect();
    showToast('같은 기기 정보로 다른 화면에서 접속해 이 연결을 종료합니다.', 3500);
  });

  socket.on('peer-joined', peer => {
    if (!isParticipant() || !playerById(peer.clientId)?.isParticipant) return;
    peerSocketByClient.set(peer.clientId, peer.socketId);
    if (!peers.has(peer.socketId) && socket.id < peer.socketId) createOfferTo(peer).catch(() => {});
  });
  socket.on('peer-left', peer => removePeer(peer.socketId, peer.clientId));
  socket.on('rtc-offer', async data => {
    try {
      const record = ensurePeer(data.sourceSocketId, data.sourceClientId);
      await record.pc.setRemoteDescription(data.sdp);
      await flushPendingIce(data.sourceSocketId, record.pc);
      const answer = await record.pc.createAnswer();
      await record.pc.setLocalDescription(answer);
      tuneSenders(record.pc);
      socket.emit('rtc-answer', { targetSocketId: data.sourceSocketId, sdp: record.pc.localDescription });
    } catch (err) { console.warn('RTC offer error', err); }
  });
  socket.on('rtc-answer', async data => {
    try {
      const record = peers.get(data.sourceSocketId);
      if (!record) return;
      await record.pc.setRemoteDescription(data.sdp);
      await flushPendingIce(data.sourceSocketId, record.pc);
    } catch (err) { console.warn('RTC answer error', err); }
  });
  socket.on('rtc-ice', async data => {
    const record = peers.get(data.sourceSocketId);
    if (!record || !record.pc.remoteDescription) {
      if (!pendingIce.has(data.sourceSocketId)) pendingIce.set(data.sourceSocketId, []);
      pendingIce.get(data.sourceSocketId).push(data.candidate);
      return;
    }
    try { await record.pc.addIceCandidate(data.candidate); } catch (err) { console.warn('ICE add error', err); }
  });
}

async function enterRoom(mode) {
  setEntryError('');
  await checkUsageGuard(true);
  if (serviceBlocked) return;
  const name = els.nameInput.value.trim().replace(/\s+/g, ' ').slice(0, 18);
  let code = els.roomInput.value.trim().toUpperCase();
  if (!name) return setEntryError('플레이어 이름을 입력해주세요.');
  if (mode === 'join' && code.length !== 5) return setEntryError('5자리 방 코드를 입력해주세요.');
  currentName = name;
  localStorage.setItem('avalonLiveName', name);
  setEntryBusy(true);
  try {
    await loadConfig();
    if (serviceBlocked) throw new Error(`TURN 월간 안전 한도(${turnUsage?.capGB || 800}GB)에 도달해 이번 달 서비스가 일시정지되었습니다.`);
    if (mode === 'create') {
      const res = await fetch(AVALON_BASE + '/api/rooms', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, clientId })
      });
      const created = await res.json().catch(() => ({}));
      if (!res.ok || !created.ok) {
        if (created.blocked) { applyUsageStatus(created.turnUsage); return; }
        throw new Error(created.error || '방을 만들 수 없습니다.');
      }
      code = created.code;
      saveResumeToken(code, created.resumeToken);
    }
    currentRoomCode = code;
    pendingEntry = { mode: 'join', name, code };
    bindSocket(code);
    if (socket?.connected) {
      const entry = pendingEntry; pendingEntry = null; sendEntry(entry);
    } else socket?.connect();
  } catch (err) {
    setEntryBusy(false);
    setEntryError(err.message || '입장 준비 중 오류가 발생했습니다.');
  }
}
function sendEntry(entry) {
  const payload = { code: entry.code, name: entry.name, clientId, resumeToken: getResumeToken(entry.code) };
  socket.emit('join-room', payload, ack => {
    setEntryBusy(false);
    if (!ack?.ok) {
      setEntryError(ack?.error || '방 입장에 실패했습니다.');
      return;
    }
    currentRoomCode = ack.code;
    saveResumeToken(currentRoomCode, ack.resumeToken);
    history.replaceState(null, '', `${location.pathname}?room=${encodeURIComponent(currentRoomCode)}`);
    els.entryScreen.classList.add('hidden');
    els.gameScreen.classList.remove('hidden');
    startUsagePolling();
    startSitePolling();
    afterJoined();
  });
}
function afterJoined() {
  socket.emit('get-room', ack => {
    if (ack?.state) {
      currentState = ack.state;
      lastPhase = currentState.phase;
      renderAll();
      syncParticipationRtc().catch(err => console.warn('initial media sync', err));
    }
  });
}

async function syncParticipationRtc() {
  if (!currentState || !socket?.connected) return;
  const participant = isParticipant();
  if (!participant) {
    clearRtcPeers();
    rtcRosterSignature = '';
    if (localStream) { for (const track of localStream.getTracks()) track.stop(); localStream = null; }
    applyLocalTrackState();
    renderVideoGrid();
    return;
  }
  try { await ensureMedia(); } catch (err) { showConnection(err.message || '카메라·마이크를 사용할 수 없습니다.'); return; }
  applyLocalTrackState();
  const roster = activePlayers().filter(p => !p.isBot && p.connected).map(p => p.clientId).sort();
  const signature = roster.join('|');
  for (const [socketId, record] of [...peers.entries()]) {
    if (!roster.includes(record.clientId)) removePeer(socketId, record.clientId);
  }
  if (signature === rtcRosterSignature) { renderVideoGrid(); return; }
  rtcRosterSignature = signature;
  socket.emit('webrtc-ready', ack => {
    if (!ack?.ok || !isParticipant()) return;
    for (const peer of ack.peers || []) {
      peerSocketByClient.set(peer.clientId, peer.socketId);
      if (!peers.has(peer.socketId) && socket.id < peer.socketId) createOfferTo(peer).catch(() => {});
    }
  });
  renderVideoGrid();
}

function ensurePeer(targetSocketId, targetClientId) {
  if (peers.has(targetSocketId)) return peers.get(targetSocketId);
  const pc = new RTCPeerConnection({ iceServers });
  if (localStream) {
    for (const track of localStream.getTracks()) pc.addTrack(track, localStream);
  }
  pc.onicecandidate = ev => {
    if (ev.candidate && socket?.connected) socket.emit('rtc-ice', { targetSocketId, candidate: ev.candidate });
  };
  pc.ontrack = ev => {
    const stream = ev.streams?.[0] || new MediaStream([ev.track]);
    remoteStreams.set(targetClientId, stream);
    attachStreamsToTiles();
  };
  pc.onconnectionstatechange = () => {
    if (['failed', 'closed'].includes(pc.connectionState)) removePeer(targetSocketId, targetClientId);
  };
  const record = { pc, clientId: targetClientId };
  peers.set(targetSocketId, record);
  peerSocketByClient.set(targetClientId, targetSocketId);
  return record;
}
async function createOfferTo(peer) {
  const record = ensurePeer(peer.socketId, peer.clientId);
  const offer = await record.pc.createOffer();
  await record.pc.setLocalDescription(offer);
  tuneSenders(record.pc);
  socket.emit('rtc-offer', { targetSocketId: peer.socketId, sdp: record.pc.localDescription });
}
function tuneSenders(pc) {
  for (const sender of pc.getSenders()) {
    if (sender.track?.kind !== 'video') continue;
    try {
      const params = sender.getParameters();
      params.encodings = params.encodings?.length ? params.encodings : [{}];
      params.encodings[0].maxBitrate = 180000;
      params.encodings[0].maxFramerate = 12;
      sender.setParameters(params).catch(() => {});
    } catch (_) { /* not all browsers support sender tuning */ }
  }
}
async function flushPendingIce(socketId, pc) {
  const list = pendingIce.get(socketId) || [];
  pendingIce.delete(socketId);
  for (const candidate of list) {
    try { await pc.addIceCandidate(candidate); } catch (_) {}
  }
}
function removePeer(socketId, client) {
  const record = peers.get(socketId);
  if (record) {
    try { record.pc.close(); } catch (_) {}
    peers.delete(socketId);
  }
  if (client && peerSocketByClient.get(client) === socketId) {
    peerSocketByClient.delete(client);
    remoteStreams.delete(client);
  }
  renderVideoGrid();
}

function renderAll() {
  if (!currentState) return;
  els.roomCodeText.textContent = currentState.code;
  els.phaseLabel.textContent = PHASE_LABELS[currentState.phase] || currentState.phase;
  els.scoreLabel.textContent = `선 ${currentState.missionScores.good} : ${currentState.missionScores.evil} 악`;
  if (els.abortBtn) els.abortBtn.classList.toggle('hidden', !(isHost() && !['lobby','game_over'].includes(currentState.phase)));
  renderMissionTrack();
  renderVideoGrid();
  renderControls();
  renderHistory();
}

function renderMissionTrack() {
  if (!currentState) return;
  const rule = RULES[currentState.playerCount || activePlayers().length];
  const missionResults = new Map((currentState.history || []).filter(h => h.type === 'mission').map(h => [h.missionNo, h]));
  els.missionTrack.innerHTML = [1,2,3,4,5].map(n => {
    const result = missionResults.get(n);
    const cls = result ? (result.missionSucceeded ? 'success' : 'fail') : (currentState.missionNo === n ? 'current' : '');
    const icon = result ? (result.missionSucceeded ? '✓' : '✕') : n;
    const special = (currentState.playerCount || activePlayers().length) >= 7 && n === 4 ? ' · 2실패' : '';
    return `<div class="mission-dot ${cls}"><div><span>${icon}</span><small>${rule?.teams?.[n-1] || '-'}명${special}</small></div></div>`;
  }).join('');
}

function renderVideoGrid() {
  if (!currentState) return;
  const sorted = [...currentState.players].sort((a,b) => Number(b.isParticipant) - Number(a.isParticipant) || a.name.localeCompare(b.name, 'ko'));
  els.videoGrid.innerHTML = sorted.map(p => {
    const isMe = p.clientId === clientId;
    const spectator = !p.isParticipant;
    const bot = !!p.isBot;
    const covered = !spectator && !bot && currentState.coverFaces ? 'covered' : '';
    const offline = p.connected ? '' : 'disconnected';
    const badges = [
      spectator ? '<span class="badge spectator-badge">관전자</span>' : '',
      bot ? '<span class="badge bot-badge">CPU 기사</span>' : '',
      p.isLeader ? '<span class="badge leader">대표자</span>' : '',
      currentState.currentTeam.includes(p.clientId) ? '<span class="badge team">원정대</span>' : '',
      currentState.excalibur?.holderClientId === p.clientId ? '<span class="badge team">엑스칼리버</span>' : '',
      currentState.lady?.holderClientId === p.clientId && currentState.lady?.enabled ? '<span class="badge leader">호수의 여인</span>' : '',
      p.isHost ? '<span class="badge host">방장</span>' : ''
    ].join('');
    return `<article class="video-tile ${isMe ? 'local' : 'remote'} ${spectator ? 'spectator' : ''} ${bot ? 'bot-tile' : ''} ${covered} ${offline}" data-client-id="${escapeHtml(p.clientId)}">
      <div class="tile-fallback">${spectator ? '👁' : bot ? '♞' : '♟'}</div>
      ${spectator || bot ? '' : `<video autoplay playsinline ${isMe ? 'muted' : ''}></video>`}
      ${spectator ? '<div class="spectator-cover"><div>👁</div><b>관전자</b><small>영상·마이크 연결 안 함</small></div>' : bot ? '<div class="bot-cover"><div>♞</div><b>컴퓨터 기사</b><small>추리 · 투표 · 발언 자동 진행</small></div>' : '<div class="face-cover"><div class="mask">🎭</div><b>비밀 단계</b><small>얼굴이 자동으로 가려졌습니다</small></div>'}
      <div class="tile-badges">${badges}</div>
      <div class="tile-name">${p.connected ? '●' : '○'} ${escapeHtml(p.name)}${isMe ? ' · 나' : ''}</div>
    </article>`;
  }).join('');
  attachStreamsToTiles();
}
function attachStreamsToTiles() {
  if (!currentState) return;
  for (const tile of els.videoGrid.querySelectorAll('.video-tile')) {
    const id = tile.dataset.clientId;
    const video = tile.querySelector('video');
    const stream = id === clientId ? localStream : remoteStreams.get(id);
    if (video && stream && video.srcObject !== stream) {
      video.srcObject = stream;
      video.play().catch(() => {});
    }
  }
}

function section(title, text, body = '') {
  return `<section class="control-section"><h2>${title}</h2>${text ? `<p>${text}</p>` : ''}${body}</section>`;
}
function renderControls() {
  if (!currentState) return;
  if (serviceBlocked) return;
  const phase = currentState.phase;
  if (phase !== 'lobby' && phase !== 'game_over' && !isParticipant()) return renderSpectatorView();
  if (phase === 'lobby') return renderLobby();
  if (phase === 'role_reveal') return renderRoleReveal();
  if (phase === 'team_building') return renderTeamBuilding();
  if (phase === 'team_vote') return renderTeamVote();
  if (phase === 'team_vote_result') return renderTeamVoteResult();
  if (phase === 'excalibur_assign') return renderExcaliburAssign();
  if (phase === 'mission_vote') return renderMissionVote();
  if (phase === 'excalibur_action') return renderExcaliburAction();
  if (phase === 'mission_result') return renderMissionResult();
  if (phase === 'lancelot_reveal') return renderLancelotReveal();
  if (phase === 'lady_of_lake') return renderLadyOfLake();
  if (phase === 'assassination') return renderAssassination();
  if (phase === 'game_over') return renderGameOver();
}

function toggleRow(key, name, desc, checked, extra = '', imageKey = key) {
  const img = imageKey === 'ladyOfLake' ? AVALON_BASE + '/assets/roles/lady.jpg' : imageKey === 'excalibur' ? AVALON_BASE + '/assets/roles/excalibur.jpg' : imageKey === 'lancelot' || imageKey === 'lancelotKnowEachOther' ? AVALON_BASE + '/assets/roles/lancelot.jpg' : roleImage(imageKey);
  return `<label class="toggle-row"><img src="${img}" alt="${escapeHtml(name)}"><span><b>${name}</b><br><small>${desc}</small></span><span class="switch"><input type="checkbox" data-roleopt="${key}" ${checked ? 'checked' : ''} ${extra}><i></i></span></label>`;
}

function activeRoleDeck() {
  const n = currentState?.playerLimit || currentState?.playerCount || 0;
  const rule = RULES[n];
  if (!rule) return [];
  const opt = currentState.roleOptions || {};
  const good = ['merlin'];
  if (opt.percival) good.push('percival');
  if (opt.lancelot) good.push('lancelot_good');
  while (good.length < rule.good) good.push('servant');
  const evil = ['assassin'];
  for (const key of ['morgana','mordred','oberon']) if (opt[key]) evil.push(key);
  if (opt.lancelot) evil.push('lancelot_evil');
  while (evil.length < rule.evil) evil.push('minion');
  return [...good, ...evil];
}
function roleDeckHtml() {
  return `<div class="role-mini-grid">${activeRoleDeck().map(key => {
    const [name, side] = ROLE_LABELS[key] || [key, ''];
    const sideClass = side === '선' ? 'good' : 'evil';
    return `<div class="role-mini ${sideClass}"><div class="role-mini-portrait"><img src="${roleImage(key)}" alt="${escapeHtml(name)}"><span>${side}</span></div><b>${escapeHtml(name)}</b><small>${side}의 세력</small></div>`;
  }).join('')}</div>`;
}
function renderSpectatorView() {
  const phase = PHASE_LABELS[currentState.phase] || currentState.phase;
  const team = teamNames();
  const extra = currentState.currentTeam?.length ? `<div class="result-box"><strong>현재 원정대</strong><span>${escapeHtml(team)}</span></div>` : '';
  els.gameControls.innerHTML = section('관전자 모드', '당신은 이번 판의 관전자입니다. 역할·투표·임무에는 참여하지 않으며 카메라와 마이크 연결도 사용하지 않습니다. 공개된 게임 진행만 편하게 지켜보세요.', `<div class="spectator-status"><span>현재 단계</span><b>${escapeHtml(phase)}</b></div>${extra}<div class="result-box"><span>다음 판 대기실에서 방장이 참가 체크를 켜면 게임에 참여할 수 있습니다.</span></div>`);
}

function renderLobby() {
  const n = currentState.playerCount || activePlayers().length;
  const limit = currentState.playerLimit || 5;
  const memberCount = currentState.players.length;
  const rule = RULES[limit];
  const selectedConnected = activePlayers().filter(p => !p.isBot).every(p => p.connected);
  const playerRows = currentState.players.map(p => `<div class="player-row ${p.connected ? '' : 'offline'} ${p.isParticipant ? 'participant' : 'spectator-row'} ${p.isBot ? 'bot-row' : ''}">
    <div class="who"><b>${p.isBot ? '♞ ' : ''}${escapeHtml(p.name)} ${p.clientId === clientId ? '(나)' : ''}</b><small>${p.isHost ? '방장 · ' : ''}${p.isBot ? '컴퓨터 기사 · 자동 추리/발언' : `${p.connected ? '접속 중' : '연결 끊김'} · ${p.isParticipant ? '게임 참가자' : '관전자'}`}</small></div>
    <div class="player-row-actions">
      ${p.isBot ? '<span class="mode-chip bot-mode">CPU</span>' : (isHost() ? `<label class="participant-toggle" title="체크하면 게임 참가자, 해제하면 관전자"><input type="checkbox" data-participant-id="${escapeHtml(p.clientId)}" ${p.isParticipant ? 'checked' : ''}><span>${p.isParticipant ? '참가' : '관전'}</span></label>` : `<span class="mode-chip ${p.isParticipant ? 'play' : 'watch'}">${p.isParticipant ? '참가' : '관전'}</span>`)}
      ${isHost() && p.isBot ? `<button class="btn danger compact remove-bot-btn" data-id="${escapeHtml(p.clientId)}">CPU 제거</button>` : (isHost() && p.clientId !== clientId ? `<button class="btn danger compact kick-btn" data-id="${escapeHtml(p.clientId)}">내보내기</button>` : '')}
    </div>
  </div>`).join('');

  let hostControls = '';
  if (isHost()) {
    const opt = currentState.roleOptions;
    const roles = [
      toggleRow('percival', '퍼시벌', '선 · 모르가나가 없으면 멀린을 정확히 확인', opt.percival),
      toggleRow('morgana', '모르가나', '악 · 퍼시벌에게 멀린 후보로 보임', opt.morgana),
      toggleRow('mordred', '모드레드', '악 · 멀린에게 보이지 않음', opt.mordred),
      toggleRow('oberon', '오베론', '악 · 다른 악과 서로 정체를 모름', opt.oberon)
    ].join('');
    const expansions = [
      toggleRow('ladyOfLake', '호수의 여인', '2·3·4번째 원정 뒤 다른 플레이어의 현재 진영을 비밀 확인', opt.ladyOfLake),
      toggleRow('lancelot', '란슬롯', '선/악 란슬롯 한 명씩 추가 · 2·3·4번째 원정 뒤 진영 변경 카드', opt.lancelot),
      toggleRow('lancelotKnowEachOther', '란슬롯 서로 확인', '옵션 · 시작할 때 두 란슬롯이 서로를 확인', opt.lancelotKnowEachOther, opt.lancelot ? '' : 'disabled'),
      toggleRow('excalibur', '엑스칼리버', '대표자가 다른 원정대원에게 주고, 제출된 임무 카드 1장을 반대로 변경 가능', opt.excalibur)
    ].join('');
    const startReady = n === limit && selectedConnected;
    const startNote = n !== limit
      ? `게임 인원은 ${limit}명으로 설정되어 있습니다. 참가 체크 ${n}/${limit}명입니다.`
      : !selectedConnected ? '선택된 참가자 중 연결이 끊긴 사람이 있습니다.'
        : `${rule.good} 선 / ${rule.evil} 악 · 원정 인원 ${rule.teams.join('→')}명`;
    const countOptions = [5,6,7,8,9,10].map(v => `<option value="${v}" ${v === limit ? 'selected' : ''}>${v}명</option>`).join('');
    hostControls = `${section('게임 참가 인원', '방장이 실제 게임에 참여할 인원수를 정한 뒤, 위 명단에서 체크한 사람만 역할을 받습니다. 체크 해제된 사람은 관전자가 되며 카메라·마이크를 사용하지 않습니다.', `<div class="player-limit-row"><label>이번 판 인원</label><select id="playerLimitSelect" class="text-input">${countOptions}</select><strong>${n}/${limit} 선택</strong></div>`)}
      ${section('한국어판 역할 구성', '멀린과 암살자는 항상 포함됩니다. 영상 설명의 초보 추천값인 퍼시벌 + 모드레드를 기본으로 켜두었습니다.', `<div class="role-options">${roles}</div>`)}
      ${section('한국어판 확장 옵션', '호수의 여인·란슬롯·엑스칼리버는 선택 규칙입니다. 처음에는 끄고 익숙해진 뒤 켜는 것을 권장합니다.', `<div class="role-options">${expansions}</div>`)}
      ${section('컴퓨터 기사', '사람이 부족하면 컴퓨터 기사를 추가하세요. 컴퓨터도 역할을 받고 추리·찬반 투표·원정 카드·암살까지 스스로 진행하며, 상황에 따라 거짓말도 합니다.', `<div class="bot-control"><div><strong>CPU ${currentState.players.filter(p => p.isBot).length}명</strong><span>사회자 Yuna와 다른 음성으로 발언합니다.</span></div><button id="addBotBtn" class="btn secondary" ${n >= limit ? 'disabled' : ''}>♞ 컴퓨터 1명 추가</button></div>`)}
      ${section('게임 시작', startNote, `<button id="startGameBtn" class="btn primary" ${startReady ? '' : 'disabled'}>선택된 ${limit}명에게 역할 배정</button>`)}`;
  } else {
    const meMode = isParticipant() ? '게임 참가자로 선택되었습니다.' : '현재 관전자입니다. 관전자에게는 카메라·마이크 연결이 생기지 않습니다.';
    hostControls = section('방장 선택 대기', `${meMode} 방장이 ${limit}명의 참가자를 모두 선택하면 게임을 시작할 수 있습니다.`, `<div class="result-box"><strong>게임 참가 ${n}/${limit}</strong><span>전체 접속 ${memberCount}명 · 관전자 ${currentState.spectatorCount || 0}명</span></div>`);
  }
  const usageNote = turnUsage?.turnConfigured ? section('TURN 안전 한도', `이번 달 ${formatUsage(turnUsage)} · ${turnUsage.turnAllowed ? 'TURN 사용 가능' : 'TURN 안전 비활성화(STUN 전용)'}`, '') : '';
  const deckPreview = rule ? section(`${limit}명 게임의 카드`, '실제 게임 참가자로 체크된 사람에게만 아래 카드 중 한 장이 무작위로 배정됩니다.', roleDeckHtml()) : '';
  els.gameControls.innerHTML = `${section(`원탁 명단 ${memberCount}명`, `게임 참가 ${n}/${limit} · 관전자 ${currentState.spectatorCount || 0}명`, `<div class="player-list">${playerRows}</div>`)}${deckPreview}${hostControls}${usageNote}`;

  els.gameControls.querySelectorAll('[data-participant-id]').forEach(input => input.addEventListener('change', () => {
    const desired = !!input.checked;
    socket.emit('set-participant', { clientId: input.dataset.participantId, participant: desired }, ack => {
      if (!ack?.ok) { showToast(ack?.error || '참가 상태를 바꿀 수 없습니다.', 4200); input.checked = !desired; }
    });
  }));
  $('playerLimitSelect')?.addEventListener('change', ev => {
    socket.emit('update-player-limit', { playerLimit: Number(ev.target.value) }, ack => { if (!ack?.ok) showToast(ack?.error || '게임 인원을 바꿀 수 없습니다.', 4200); });
  });
  els.gameControls.querySelectorAll('[data-roleopt]').forEach(input => input.addEventListener('change', () => {
    const next = {};
    els.gameControls.querySelectorAll('[data-roleopt]').forEach(el => { next[el.dataset.roleopt] = !!el.checked; });
    if (!next.lancelot) next.lancelotKnowEachOther = false;
    socket.emit('update-role-options', next, ack => { if (!ack?.ok) showToast(ack?.error || '역할 설정을 저장하지 못했습니다.'); });
  }));
  els.gameControls.querySelectorAll('.kick-btn').forEach(btn => btn.addEventListener('click', () => {
    socket.emit('kick-player', { clientId: btn.dataset.id }, ack => { if (!ack?.ok) showToast(ack?.error || '내보내기에 실패했습니다.'); });
  }));
  els.gameControls.querySelectorAll('.remove-bot-btn').forEach(btn => btn.addEventListener('click', () => {
    socket.emit('remove-bot', { clientId: btn.dataset.id }, ack => { if (!ack?.ok) showToast(ack?.error || '컴퓨터를 제거할 수 없습니다.'); });
  }));
  $('addBotBtn')?.addEventListener('click', () => socket.emit('add-bot', {}, ack => { if (!ack?.ok) showToast(ack?.error || '컴퓨터를 추가할 수 없습니다.', 4200); }));
  $('startGameBtn')?.addEventListener('click', () => socket.emit('start-game', ack => { if (!ack?.ok) showToast(ack?.error || '게임을 시작할 수 없습니다.', 4200); }));
}

function roleCardHtml() {
  if (!privateRole) return `<div class="result-box"><strong>역할 정보를 불러오는 중…</strong><span>잠시 후 자동으로 표시됩니다.</span></div>`;
  const known = privateRole.knownPlayers?.length
    ? `<div class="known-list">${privateRole.knownPlayers.map(p => `<div class="known-item"><i>${escapeHtml((p.name || '?').slice(0,1))}</i><div><b>${escapeHtml(p.name)}</b><span>${escapeHtml(p.hint)}</span></div></div>`).join('')}</div>`
    : `<div class="known-list"><div class="known-item empty"><i>?</i><div><span>추가로 공개되는 인물 정보가 없습니다.</span></div></div></div>`;
  const lancelotState = privateRole.isLancelot && privateRole.initialSide !== privateRole.side
    ? `<div class="result-box bad"><strong>진영이 바뀌었습니다</strong><span>현재는 ${privateRole.side === 'good' ? '선' : '악'}의 세력으로 플레이합니다.</span></div>` : '';
  const knowledgeTitle = privateRole.role === 'percival'
    ? (currentState?.roleOptions?.morgana ? '당신이 본 멀린 후보' : '당신이 아는 멀린')
    : privateRole.role === 'merlin' ? '당신이 알아본 악의 세력'
      : privateRole.side === 'evil' && privateRole.role !== 'oberon' && privateRole.role !== 'lancelot_evil' ? '당신이 아는 같은 악의 세력' : '시작 정보';
  return `<div class="role-card ${privateRole.side === 'good' ? 'side-good-card' : 'side-evil-card'}">
    <div class="role-portrait-wrap">
      <img class="role-portrait" src="${roleImage(privateRole.role)}" alt="${escapeHtml(privateRole.name)} 역할 카드">
      <span class="role-side-ribbon ${privateRole.side === 'good' ? 'good' : 'evil'}">${privateRole.side === 'good' ? '선 · 아발론' : '악 · 모드레드'}</span>
      <div class="role-card-seal">${privateRole.side === 'good' ? '♜' : '♞'}</div>
    </div>
    <div class="role-card-body">
      <div class="role-card-kicker"><span>SECRET ROLE</span><i>PRIVATE</i></div>
      <h3>${escapeHtml(privateRole.name)}</h3>
      <div class="role-subtitle ${privateRole.side === 'good' ? 'side-good' : 'side-evil'}">${privateRole.side === 'good' ? '아발론의 운명을 지키십시오' : '원정을 무너뜨리고 멀린을 찾으십시오'}</div>
      <div class="role-rule-block"><b>당신의 능력</b><p class="role-description">${escapeHtml(privateRole.description)}</p></div>
      ${lancelotState}
      <div class="known-title">${knowledgeTitle}</div>${known}
    </div>
  </div>`;
}
function renderRoleReveal() {
  const me = myPlayer();
  const readyCount = currentState.players.filter(p => p.isParticipant && p.ready).length;
  els.gameControls.innerHTML = section('봉인된 역할 카드', '지금은 서로의 영상과 마이크가 잠시 가려집니다. 카드의 인물, 능력, 그리고 ‘당신이 아는 정보’를 천천히 확인하세요.', `${roleCardHtml()}
    <div class="status-line"><span>준비 완료</span><b>${readyCount}/${currentState.playerCount}</b></div>
    <div class="progress-bar"><i style="width:${currentState.playerCount ? (readyCount/currentState.playerCount)*100 : 0}%"></i></div>
    <button id="roleReadyBtn" class="btn primary" ${me?.ready ? 'disabled' : ''}>${me?.ready ? '다른 플레이어를 기다리는 중…' : '역할 확인 완료'}</button>`);
  $('roleReadyBtn')?.addEventListener('click', () => socket.emit('role-ready', ack => { if (!ack?.ok) showToast(ack?.error || '처리할 수 없습니다.'); }));
}

function renderTeamBuilding() {
  const leader = currentState.players.find(p => p.isLeader);
  const size = teamSizeForMission();
  if (!isLeader()) {
    els.gameControls.innerHTML = section(`${currentState.missionNo}번째 원정`, `${leader?.name || '대표자'}님이 ${size}명의 원정대원을 선택하고 있습니다.`, currentState.rejectionCount ? `<div class="result-box"><span>연속 부결 ${currentState.rejectionCount}/5</span></div>` : '');
    return;
  }
  selectedTeam = new Set([...selectedTeam].filter(id => currentState.players.some(p => p.clientId === id && p.isParticipant)));
  const rows = activePlayers().map(p => `<div class="select-row ${selectedTeam.has(p.clientId) ? 'selected' : ''}" data-select-player="${escapeHtml(p.clientId)}">
    <div class="who"><b>${escapeHtml(p.name)} ${p.clientId === clientId ? '(나)' : ''}</b><small>${p.connected ? '선택 가능' : '연결 끊김'}</small></div><span class="checkmark">${selectedTeam.has(p.clientId) ? '✓' : ''}</span>
  </div>`).join('');
  els.gameControls.innerHTML = section('원정대를 선택하세요', `대표자는 자신을 포함해도 되고 빼도 됩니다. ${size}명을 선택해야 합니다. 현재 ${selectedTeam.size}/${size}명`, `<div class="player-list">${rows}</div><div style="height:9px"></div><button id="submitTeamBtn" class="btn primary" ${selectedTeam.size === size ? '' : 'disabled'}>원정대 제안</button>${currentState.rejectionCount ? `<div class="result-box"><span>연속 부결 ${currentState.rejectionCount}/5 · 5번째도 부결되면 악 승리</span></div>` : ''}`);
  els.gameControls.querySelectorAll('[data-select-player]').forEach(row => row.addEventListener('click', () => {
    const id = row.dataset.selectPlayer;
    if (selectedTeam.has(id)) selectedTeam.delete(id);
    else if (selectedTeam.size < size) selectedTeam.add(id);
    else showToast(`${size}명까지만 선택할 수 있습니다.`);
    renderTeamBuilding();
  }));
  $('submitTeamBtn')?.addEventListener('click', () => socket.emit('propose-team', { team: [...selectedTeam] }, ack => { if (!ack?.ok) showToast(ack?.error || '원정대를 제안할 수 없습니다.'); }));
}

function teamNames() {
  return currentState.currentTeam.map(id => playerById(id)?.name || '?').join(', ');
}
function renderTeamVote() {
  const cast = currentState.teamVotesCast;
  const total = currentState.teamVotesNeeded;
  els.gameControls.innerHTML = section('원정대 찬반 투표', `제안된 원정대: ${escapeHtml(teamNames())}. 찬성이 반보다 많아야 승인되며 동수는 부결입니다.`, `<div class="status-line"><span>투표 제출</span><b>${cast}/${total}</b></div>
    <div class="progress-bar"><i style="width:${total ? cast/total*100 : 0}%"></i></div>
    <div class="vote-card"><button id="approveBtn" class="vote-btn good">✓ 찬성</button><button id="rejectBtn" class="vote-btn bad">✕ 반대</button></div>`);
  const vote = approve => {
    $('approveBtn').disabled = true; $('rejectBtn').disabled = true;
    socket.emit('team-vote', { approve }, ack => {
      if (!ack?.ok) { showToast(ack?.error || '투표할 수 없습니다.'); renderTeamVote(); }
      else showToast('투표가 비밀리에 제출되었습니다.');
    });
  };
  $('approveBtn')?.addEventListener('click', () => vote(true));
  $('rejectBtn')?.addEventListener('click', () => vote(false));
}
function renderTeamVoteResult() {
  const r = currentState.lastTeamVote;
  if (!r) return;
  const votes = r.votes.map(v => `<div class="vote-chip"><span>${escapeHtml(v.name)}</span><b>${v.approve ? '찬성' : '반대'}</b></div>`).join('');
  els.gameControls.innerHTML = section('찬반 투표 결과', `원정대: ${escapeHtml(teamNames())}`, `<div class="result-box ${r.approved ? 'good' : 'bad'}"><strong>${r.approved ? '원정대 승인' : '원정대 부결'}</strong><span>찬성 ${r.approvals} · 반대 ${r.rejections}</span><div class="vote-breakdown">${votes}</div></div><p>${r.approved ? '사회자가 원정 단계로 진행합니다.' : `부결 횟수 ${currentState.rejectionCount}/5 · 대표자가 다음 사람으로 넘어갑니다.`}</p>`);
}

function renderExcaliburAssign() {
  const leader = currentState.players.find(p => p.isLeader);
  if (!isLeader()) {
    els.gameControls.innerHTML = section('엑스칼리버 배정', `대표자 ${leader?.name || ''}님이 자신을 제외한 원정대원에게 엑스칼리버를 주고 있습니다.`, `<div class="result-box"><span>원정대: ${escapeHtml(teamNames())}</span></div>`);
    return;
  }
  const candidates = currentState.currentTeam.filter(id => id !== clientId).map(id => {
    const p = playerById(id);
    return `<button class="select-row excalibur-assign-target" data-target="${escapeHtml(id)}"><div class="who"><b>${escapeHtml(p?.name || '?')}</b><small>엑스칼리버 전달</small></div><span>⚔️</span></button>`;
  }).join('');
  els.gameControls.innerHTML = section('엑스칼리버를 주세요', '대표자는 자신이 아닌 원정대원 1명을 선택합니다.', `<div class="player-list">${candidates}</div>`);
  els.gameControls.querySelectorAll('.excalibur-assign-target').forEach(btn => btn.addEventListener('click', () => {
    socket.emit('assign-excalibur', { targetClientId: btn.dataset.target }, ack => { if (!ack?.ok) showToast(ack?.error || '엑스칼리버를 전달할 수 없습니다.'); });
  }));
}

function renderMissionVote() {
  const onTeam = currentState.currentTeam.includes(clientId);
  const cast = currentState.missionVotesCast;
  const total = currentState.missionVotesNeeded;
  const excaliburHolder = currentState.excalibur?.holderClientId ? playerById(currentState.excalibur.holderClientId)?.name : null;
  const extra = excaliburHolder ? ` 엑스칼리버 보유자: ${escapeHtml(excaliburHolder)}.` : '';
  const progress = `<div class="status-line"><span>원정 카드 제출</span><b>${cast}/${total}</b></div><div class="progress-bar"><i style="width:${total ? cast/total*100 : 0}%"></i></div>`;
  if (!onTeam) {
    els.gameControls.innerHTML = section('비밀 원정 투표', `원정대원들이 카드를 선택하고 있습니다. 얼굴과 마이크는 잠시 가려집니다.${extra}`, `${progress}<div class="result-box"><span>원정대: ${escapeHtml(teamNames())}</span></div>`);
    return;
  }
  const canFail = privateRole?.side === 'evil';
  els.gameControls.innerHTML = section('원정 카드를 선택하세요', `${canFail ? '현재 악의 세력은 성공 또는 실패를 선택할 수 있습니다.' : '현재 선의 세력은 규칙상 성공만 선택할 수 있습니다.'}${extra}`, `${progress}<div class="vote-card"><button id="missionSuccessBtn" class="vote-btn good">✓ 성공</button>${canFail ? '<button id="missionFailBtn" class="vote-btn bad">✕ 실패</button>' : '<button class="vote-btn bad" disabled>✕ 실패 불가</button>'}</div>`);
  const submit = success => {
    $('missionSuccessBtn').disabled = true;
    if ($('missionFailBtn')) $('missionFailBtn').disabled = true;
    socket.emit('mission-vote', { success }, ack => {
      if (!ack?.ok) { showToast(ack?.error || '카드를 제출할 수 없습니다.'); renderMissionVote(); }
      else showToast('원정 카드가 비밀리에 제출되었습니다.');
    });
  };
  $('missionSuccessBtn')?.addEventListener('click', () => submit(true));
  $('missionFailBtn')?.addEventListener('click', () => submit(false));
}

function renderExcaliburAction() {
  const holderId = currentState.excalibur?.holderClientId;
  const holder = playerById(holderId);
  if (holderId !== clientId) {
    els.gameControls.innerHTML = section('엑스칼리버', `${holder?.name || '보유자'}님이 다른 원정대원의 임무 카드를 바꿀지 결정하고 있습니다.`, `<div class="result-box"><span>결과가 공개될 때까지 기다려주세요.</span></div>`);
    return;
  }
  const candidates = currentState.currentTeam.filter(id => id !== clientId).map(id => {
    const p = playerById(id);
    return `<button class="select-row excalibur-target" data-target="${escapeHtml(id)}"><div class="who"><b>${escapeHtml(p?.name || '?')}</b><small>이 사람의 임무 카드를 반대로 변경</small></div><span>⚔️</span></button>`;
  }).join('');
  const privateResult = excaliburResult ? `<div class="result-box"><strong>${escapeHtml(excaliburResult.targetName)}</strong><span>원래 ${excaliburResult.originalSuccess ? '성공' : '실패'} → 변경 후 ${excaliburResult.changedSuccess ? '성공' : '실패'}</span></div>` : '';
  els.gameControls.innerHTML = section('엑스칼리버 사용', '다른 원정대원 한 명의 제출 카드를 반대로 바꿀 수 있습니다. 사용하지 않아도 됩니다. 원래 카드는 보유자에게만 알려집니다.', `${privateResult}<div class="player-list">${candidates}</div><div style="height:9px"></div><button id="skipExcaliburBtn" class="btn secondary">사용하지 않기</button>`);
  const use = targetClientId => socket.emit('use-excalibur', { targetClientId }, ack => { if (!ack?.ok) showToast(ack?.error || '엑스칼리버를 사용할 수 없습니다.'); });
  els.gameControls.querySelectorAll('.excalibur-target').forEach(btn => btn.addEventListener('click', () => use(btn.dataset.target)));
  $('skipExcaliburBtn')?.addEventListener('click', () => use(null));
}

function renderMissionResult() {
  const r = currentState.lastMissionResult;
  if (!r) return;
  const note = r.needsTwoFails ? '7명 이상 게임의 4번째 원정은 실패 카드 2장 이상일 때만 실패합니다.' : '실패 카드가 1장 이상이면 원정이 실패합니다.';
  els.gameControls.innerHTML = section(`${r.missionNo}번째 원정 결과`, note, `<div class="result-box ${r.missionSucceeded ? 'good' : 'bad'}"><strong>${r.missionSucceeded ? '원정 성공' : '원정 실패'}</strong><span>실패 카드 ${r.fails}장</span></div><p>누가 어떤 카드를 냈는지는 공개되지 않습니다. 다음 단계로 자동 진행합니다.</p>`);
}

function renderLancelotReveal() {
  const card = currentState.lancelot?.lastCard;
  if (!card) return;
  const mySide = privateRole?.isLancelot ? `<div class="result-box ${privateRole.side === 'good' ? 'good' : 'bad'}"><strong>당신의 현재 진영: ${privateRole.side === 'good' ? '선' : '악'}</strong><span>이 정보는 란슬롯 본인의 화면에서만 확인하세요.</span></div>` : '';
  els.gameControls.innerHTML = section(`란슬롯 진영 카드 ${card.drawNo}/3`, `${card.missionNo}번째 원정 종료 후 카드를 공개합니다.`, `<div class="result-box ${card.changed ? 'bad' : ''}"><strong>${card.changed ? '진영 변경' : '빈 카드'}</strong><span>${card.changed ? '선의 란슬롯과 악의 란슬롯은 각자 현재 진영을 반대로 바꿉니다.' : '두 란슬롯의 진영은 그대로입니다.'}</span></div>${mySide}<p>란슬롯 플레이어의 개인 역할 정보는 현재 진영으로 자동 갱신됩니다.</p>`);
}

function renderLadyOfLake() {
  const holderId = currentState.lady?.holderClientId;
  const holder = playerById(holderId);
  if (holderId !== clientId) {
    els.gameControls.innerHTML = section('호수의 여인', `${holder?.name || '토큰 보유자'}님이 한 명의 진영을 비밀리에 확인하고 있습니다.`, `<div class="result-box"><span>확인이 끝나면 토큰이 선택된 플레이어에게 넘어갑니다.</span></div>`);
    return;
  }
  const resultHtml = ladyResult ? `<div class="result-box ${ladyResult.side === 'good' ? 'good' : 'bad'}"><strong>${escapeHtml(ladyResult.targetName)} · ${ladyResult.side === 'good' ? '선' : '악'}</strong><span>이 정보는 현재 토큰 보유자에게만 표시됩니다.</span></div>` : '';
  const candidates = (currentState.lady?.eligibleClientIds || []).filter(id => id !== clientId).map(id => {
    const p = playerById(id);
    return `<button class="select-row lady-target" data-target="${escapeHtml(id)}"><div class="who"><b>${escapeHtml(p?.name || '?')}</b><small>현재 진영 확인</small></div><span>🌊</span></button>`;
  }).join('');
  els.gameControls.innerHTML = section(`호수의 여인 ${currentState.lady?.uses + 1}/3`, '아직 호수의 여인 토큰을 가져본 적 없는 플레이어 한 명을 선택합니다. 확인한 뒤 토큰은 그 플레이어에게 넘어갑니다.', `${resultHtml}<div class="player-list">${candidates || '<div class="result-box"><span>선택 가능한 플레이어가 없습니다.</span></div>'}</div>`);
  els.gameControls.querySelectorAll('.lady-target').forEach(btn => btn.addEventListener('click', () => {
    socket.emit('lady-inspect', { targetClientId: btn.dataset.target }, ack => { if (!ack?.ok) showToast(ack?.error || '진영을 확인할 수 없습니다.'); });
  }));
}

function renderAssassination() {
  if (!isAssassin()) {
    els.gameControls.innerHTML = section('최후의 암살', '선이 원정 3회를 성공했습니다. 암살자가 멀린으로 의심되는 플레이어를 선택하고 있습니다.', `<div class="result-box"><strong>아직 끝나지 않았습니다</strong><span>암살자가 멀린을 맞히면 악이 역전 승리합니다.</span></div>`);
    return;
  }
  const candidates = activePlayers().filter(p => p.clientId !== clientId).map(p => `<button class="select-row assassin-target" data-target="${escapeHtml(p.clientId)}"><div class="who"><b>${escapeHtml(p.name)}</b><small>멀린으로 지목</small></div><span>🗡️</span></button>`).join('');
  els.gameControls.innerHTML = section('암살 대상을 선택하세요', '멀린이라고 생각하는 한 명을 선택합니다. 선택 즉시 최종 결과가 공개됩니다.', `<div class="player-list">${candidates}</div>`);
  els.gameControls.querySelectorAll('.assassin-target').forEach(btn => btn.addEventListener('click', () => {
    const name = playerById(btn.dataset.target)?.name || '이 플레이어';
    if (!confirm(`${name}님을 멀린으로 지목할까요?`)) return;
    socket.emit('assassinate', { targetClientId: btn.dataset.target }, ack => { if (!ack?.ok) showToast(ack?.error || '암살할 수 없습니다.'); });
  }));
}

function renderGameOver() {
  const goodWon = currentState.winner === 'good';
  const roles = currentState.players.filter(p => p.isParticipant && p.role).map(p => {
    const role = p.role || {};
    const side = role.currentSide === 'good' ? '선' : '악';
    const switched = role.initialSide && role.currentSide && role.initialSide !== role.currentSide;
    return `<div class="role-reveal-line"><img src="${roleImage(role.key)}" alt="${escapeHtml(role.name || '')}"><b>${escapeHtml(p.name)}<br>${escapeHtml(role.name || '')}</b><span>현재 ${side}${switched ? `<br>시작 ${role.initialSide === 'good' ? '선' : '악'}` : ''}</span></div>`;
  }).join('');
  els.gameControls.innerHTML = section('게임 종료', '', `<div class="winner"><div class="winner-icon">${goodWon ? '🏰' : '🐉'}</div><h2>${goodWon ? '선의 세력 승리' : '악의 세력 승리'}</h2><p>${escapeHtml(currentState.winnerReason || '')}</p></div><div class="role-reveal-grid">${roles}</div>${isHost() ? '<button id="restartBtn" class="btn primary">같은 멤버로 새 게임</button>' : '<div class="result-box"><span>방장이 새 게임을 시작할 수 있습니다.</span></div>'}`);
  $('restartBtn')?.addEventListener('click', () => socket.emit('restart-game', ack => { if (!ack?.ok) showToast(ack?.error || '새 게임을 시작할 수 없습니다.'); }));
}

function renderHistory() {
  const items = [...(currentState?.history || [])].slice(-12).reverse();
  if (!items.length) {
    els.historyPanel.innerHTML = '<div class="history-title">GAME LOG</div><div class="history-item">아직 기록이 없습니다.</div>';
    return;
  }
  const html = items.map(h => {
    if (h.type === 'teamVote') return `<div class="history-item">원정 ${h.missionNo} · ${escapeHtml(h.leader)} 제안 · ${h.approved ? '승인' : '부결'} (${h.approvals}:${h.rejections})</div>`;
    if (h.type === 'mission') return `<div class="history-item">원정 ${h.missionNo} · ${h.missionSucceeded ? '성공' : '실패'} · 실패 카드 ${h.fails}</div>`;
    if (h.type === 'lancelot') return `<div class="history-item">원정 ${h.missionNo} 후 란슬롯 · ${h.changed ? '진영 변경' : '빈 카드'}</div>`;
    if (h.type === 'lady') return `<div class="history-item">호수의 여인 · ${escapeHtml(h.holderName)} → ${escapeHtml(h.targetName)} 진영 확인</div>`;
    if (h.type === 'excalibur') return `<div class="history-item">원정 ${h.missionNo} · 엑스칼리버 ${h.used ? `사용 (${escapeHtml(h.targetName)})` : '미사용'}</div>`;
    return '';
  }).join('');
  els.historyPanel.innerHTML = `<div class="history-title">GAME LOG</div>${html}`;
}

function showNarrator(payload) {
  if (!payload?.text) return;
  clearTimeout(narratorTimer);
  els.narratorText.textContent = payload.text;
  els.narratorOverlay.classList.remove('hidden');
  const displayMs = Math.min(11000, Math.max(5200, payload.text.length * 100));
  narratorTimer = setTimeout(() => els.narratorOverlay.classList.add('hidden'), displayMs);
  narratorBusyUntil = Date.now() + Math.min(9000, Math.max(3200, payload.text.length * 75));
  if (voiceEnabled) speakKorean(payload.text);
}
function ensureBotSpeechBubble() {
  let el = document.getElementById('botSpeechBubble');
  if (el) return el;
  el = document.createElement('div');
  el.id = 'botSpeechBubble';
  el.className = 'bot-speech-bubble hidden';
  el.innerHTML = '<div class="bot-speech-icon">♞</div><div><b id="botSpeechName">컴퓨터 기사</b><p id="botSpeechText"></p></div>';
  document.body.appendChild(el);
  return el;
}
function botVoice(profile = 0) {
  const voices = koreanVoices();
  const nonYuna = voices.filter(v => !/(^|\b)yuna(\b|$)|유나/i.test(`${v.name} ${v.voiceURI}`));
  const maleFirst = nonYuna.filter(v => /injoon|hyunsu|minsu|joon|jun|young|male|남성|민수|현수|준/i.test(`${v.name} ${v.voiceURI}`));
  const pool = maleFirst.length ? maleFirst : nonYuna;
  return pool.length ? pool[Math.abs(Number(profile || 0)) % pool.length] : (voices[0] || null);
}
function speakBotKorean(payload) {
  if (!('speechSynthesis' in window) || !payload?.text) return;
  const voice = botVoice(payload.voiceProfile);
  if (!voice) return;
  const utter = new SpeechSynthesisUtterance(String(payload.text).replace(/·/g, ', '));
  utter.voice = voice;
  utter.lang = 'ko-KR';
  const profile = Math.abs(Number(payload.voiceProfile || 0));
  utter.rate = [0.93, 0.98, 1.02, 0.96][profile % 4];
  utter.pitch = [0.86, 0.94, 1.02, 0.9, 0.98][profile % 5];
  utter.volume = 1;
  speechSynthesis.speak(utter);
}
function showBotSpeech(payload) {
  if (!payload?.text) return;
  const bubble = ensureBotSpeechBubble();
  const name = bubble.querySelector('#botSpeechName');
  const text = bubble.querySelector('#botSpeechText');
  if (name) name.textContent = payload.name || '컴퓨터 기사';
  if (text) text.textContent = payload.text;
  bubble.dataset.tone = payload.tone || 'neutral';
  bubble.classList.remove('hidden');
  clearTimeout(botSpeechTimer);
  botSpeechTimer = setTimeout(() => bubble.classList.add('hidden'), Math.min(11000, Math.max(5200, payload.text.length * 115)));
  const speakWhenNarratorDone = () => {
    const wait = narratorBusyUntil - Date.now() + 280;
    if (wait > 0) return setTimeout(speakWhenNarratorDone, wait);
    speakBotKorean(payload);
  };
  setTimeout(speakWhenNarratorDone, 350);
}

function koreanVoices() {
  if (!('speechSynthesis' in window)) return [];
  return speechSynthesis.getVoices().filter(v => /^ko[-_]/i.test(v.lang) || /Korean|한국/i.test(v.name));
}
function preferredVoice() {
  const voices = koreanVoices();
  return voices.find(v => /(^|\b)yuna(\b|$)|유나/i.test(`${v.name} ${v.voiceURI}`)) || null;
}
function populateVoiceOptions() {
  if (!els.voiceSelect) return;
  const yuna = preferredVoice();
  els.voiceSelect.innerHTML = yuna
    ? `<option value="${escapeHtml(yuna.voiceURI)}">Yuna · 유나 (고정)</option>`
    : '<option value="">Yuna 음성을 이 기기에서 찾지 못했습니다</option>';
  els.voiceSelect.disabled = true;
}
function announcerScript(text) {
  return String(text || '')
    .replace(/·/g, ', ')
    .replace(/\s+/g, ' ')
    .replace(/주세요\./g, '주세요.')
    .trim();
}
function speakKorean(text) {
  if (!('speechSynthesis' in window)) return;
  try {
    speechGeneration += 1;
    const generation = speechGeneration;
    speechSynthesis.cancel();
    const script = announcerScript(text);
    const chunks = script.match(/[^.!?]+[.!?]?/g)?.map(s => s.trim()).filter(Boolean) || [script];
    const voice = preferredVoice();
    if (!voice && !yunaWarningShown) { yunaWarningShown = true; showToast('이 기기에서 Yuna 음성을 찾지 못했습니다. 화면 안내는 계속 표시됩니다.', 5200); }
    const speakChunk = index => {
      if (generation !== speechGeneration || !voiceEnabled || index >= chunks.length) return;
      const utter = new SpeechSynthesisUtterance(chunks[index]);
      if (!voice) return;
      utter.voice = voice;
      utter.lang = 'ko-KR';
      utter.rate = 0.96;
      utter.pitch = 1.0;
      utter.volume = 1;
      utter.onend = () => setTimeout(() => speakChunk(index + 1), 125);
      speechSynthesis.speak(utter);
    };
    speakChunk(0);
  } catch (_) {}
}
function openModal(el) { if (el) el.classList.remove('hidden'); }
function closeModal(el) { if (el) el.classList.add('hidden'); }
function clearRtcPeers() {
  for (const { pc } of peers.values()) { try { pc.close(); } catch (_) {} }
  peers.clear(); remoteStreams.clear(); peerSocketByClient.clear(); pendingIce.clear();
}
function resetClientToEntry(message = '') {
  if (usagePollTimer) { clearInterval(usagePollTimer); usagePollTimer = null; }
  rtcRosterSignature = '';
  clearRtcPeers();
  if (socket) { try { socket.disconnect(); } catch (_) {} socket = null; }
  if (localStream) { for (const track of localStream.getTracks()) track.stop(); localStream = null; }
  currentState = null; privateRole = null; selectedTeam = new Set(); lastPhase = null; ladyResult = null; excaliburResult = null;
  currentRoomCode = '';
  history.replaceState(null, '', location.pathname);
  els.gameScreen.classList.add('hidden');
  els.entryScreen.classList.remove('hidden');
  updateMediaButtons();
  if (message) showToast(message, 3300);
}
async function leaveCurrentRoom() {
  if (!currentRoomCode) return resetClientToEntry();
  const activeParticipant = currentState && isParticipant() && !['lobby','game_over'].includes(currentState.phase);
  const msg = activeParticipant
    ? '지금 게임 참가자가 방을 나가면 진행 중인 판은 중단되고 남은 사람들은 대기실로 돌아갑니다. 정말 나갈까요?'
    : '현재 방에서 나갈까요?';
  if (!confirm(msg)) return;
  const code = currentRoomCode;
  if (socket?.connected) {
    socket.emit('leave-room', {}, () => {
      deleteResumeToken(code);
      resetClientToEntry('방에서 나왔습니다.');
    });
    setTimeout(() => { if (currentRoomCode === code) { deleteResumeToken(code); resetClientToEntry('방에서 나왔습니다.'); } }, 1200);
  } else {
    deleteResumeToken(code); resetClientToEntry('방에서 나왔습니다.');
  }
}

els.createBtn.addEventListener('click', () => enterRoom('create'));
els.joinBtn.addEventListener('click', () => enterRoom('join'));
els.roomInput.addEventListener('input', () => { els.roomInput.value = els.roomInput.value.toUpperCase().replace(/[^A-Z2-9]/g, '').slice(0, 5); });
els.roomInput.addEventListener('keydown', ev => { if (ev.key === 'Enter') enterRoom('join'); });
els.nameInput.addEventListener('keydown', ev => { if (ev.key === 'Enter' && els.roomInput.value.length === 5) enterRoom('join'); });
els.copyCodeBtn.addEventListener('click', async () => {
  const shareText = `Avalon Live 방 코드: ${currentRoomCode}\n${location.origin}${location.pathname}?room=${currentRoomCode}`;
  try {
    if (navigator.share) await navigator.share({ title: 'Avalon Live', text: shareText, url: `${location.origin}${location.pathname}?room=${currentRoomCode}` });
    else await navigator.clipboard.writeText(shareText);
    showToast('방 코드와 초대 링크를 공유했습니다.');
  } catch (_) {
    try { await navigator.clipboard.writeText(shareText); showToast('초대 링크를 복사했습니다.'); } catch (_) {}
  }
});
els.voiceBtn.addEventListener('click', () => showToast('사회자 음성은 Yuna로 항상 켜져 있습니다.'));
els.cameraBtn.addEventListener('click', () => {
  if (currentState && !isParticipant()) return showToast('관전자 모드에서는 카메라를 사용하지 않습니다.');
  if (serviceBlocked) return showToast('월간 안전 한도로 서비스가 일시정지되었습니다.');
  if (currentState?.coverFaces) return showToast('비밀 단계에서는 영상 송출이 자동으로 중지됩니다.');
  cameraEnabled = !cameraEnabled; applyLocalTrackState();
});
els.micBtn.addEventListener('click', () => {
  if (currentState && !isParticipant()) return showToast('관전자 모드에서는 마이크를 사용하지 않습니다.');
  if (serviceBlocked) return showToast('월간 안전 한도로 서비스가 일시정지되었습니다.');
  if (currentState?.autoSilence) return showToast('비밀 단계에서는 마이크가 자동 음소거됩니다.');
  micEnabled = !micEnabled; applyLocalTrackState();
});
els.narratorClose.addEventListener('click', () => els.narratorOverlay.classList.add('hidden'));
els.guideBtn?.addEventListener('click', () => openModal(els.guideModal));
els.entryGuideBtn?.addEventListener('click', () => openModal(els.guideModal));
els.voiceSettingsBtn?.addEventListener('click', () => { populateVoiceOptions(); openModal(els.voiceModal); });
siteLockButtons.forEach(btn => btn.addEventListener('click', lockSiteFromMain));
els.leaveBtn?.addEventListener('click', leaveCurrentRoom);
els.abortBtn?.addEventListener('click', () => {
  if (!isHost() || !currentState || ['lobby','game_over'].includes(currentState.phase)) return;
  if (!confirm('현재 진행 중인 판을 중단하고 모든 플레이어를 대기실로 돌려보낼까요?')) return;
  socket.emit('abort-game', {}, ack => { if (!ack?.ok) showToast(ack?.error || '게임을 중단할 수 없습니다.'); });
});
els.voiceTestBtn?.addEventListener('click', () => speakKorean('원탁의 기사 여러분, 준비가 되셨다면 첫 번째 원정을 시작하겠습니다.'));
document.querySelectorAll('[data-close-modal]').forEach(btn => btn.addEventListener('click', () => closeModal($(btn.dataset.closeModal))));
document.querySelectorAll('.modal-backdrop').forEach(modal => modal.addEventListener('click', ev => { if (ev.target === modal) closeModal(modal); }));
window.addEventListener('keydown', ev => { if (ev.key === 'Escape') { closeModal(els.guideModal); closeModal(els.voiceModal); } });
if ('speechSynthesis' in window) { speechSynthesis.onvoiceschanged = populateVoiceOptions; setTimeout(populateVoiceOptions, 150); }

loadConfig().then(() => checkUsageGuard(false));
checkSiteGate().then(() => startSitePolling());
window.addEventListener('beforeunload', () => {
  if (usagePollTimer) clearInterval(usagePollTimer);
  if (sitePollTimer) clearInterval(sitePollTimer);
  for (const { pc } of peers.values()) { try { pc.close(); } catch (_) {} }
  if (localStream) for (const t of localStream.getTracks()) t.stop();
});
