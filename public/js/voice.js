// 음성 채팅: 같은 방 참가자끼리 WebRTC로 목소리를 직접 주고받아요 (서버는 연결 신호만 전달)
const FALLBACK_ICE = [{ urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.l.google.com:19302'] }];

export function createVoice({ send, me, onChange }) {
  const peers = new Map(); // uid -> { pc, audio, pending: [] }
  const levels = new Map(); // uid -> analyser
  let active = false, stream = null, micOn = true, forced = null, ice = null, ctx = null, meterTimer = null, joining = null;
  let speaking = new Set();

  const effectiveMic = () => micOn && !forced;
  const report = () => send({ t: 'voice', on: active, mic: effectiveMic() });

  function applyMic() {
    for (const t of stream?.getAudioTracks() || []) t.enabled = effectiveMic();
  }

  function analyse(uid, ms) {
    try {
      ctx ||= new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      const src = ctx.createMediaStreamSource(ms);
      const an = ctx.createAnalyser();
      an.fftSize = 512;
      src.connect(an);
      levels.set(uid, { an, buf: new Uint8Array(an.fftSize) });
    } catch {}
  }

  function meter() {
    const now = new Set();
    for (const [uid, { an, buf }] of levels) {
      if (uid === me() && !effectiveMic()) continue;
      an.getByteTimeDomainData(buf);
      let sum = 0;
      for (const v of buf) sum += (v - 128) * (v - 128);
      if (Math.sqrt(sum / buf.length) > 7) now.add(uid);
    }
    const changed = now.size !== speaking.size || [...now].some((x) => !speaking.has(x));
    speaking = now;
    if (changed) onChange?.();
  }

  function closePeer(uid) {
    const p = peers.get(uid);
    if (!p) return;
    try { p.pc.close(); } catch {}
    p.audio?.remove();
    peers.delete(uid);
    levels.delete(uid);
  }

  function createPeer(uid, offerer) {
    closePeer(uid);
    const pc = new RTCPeerConnection({ iceServers: ice || FALLBACK_ICE });
    const p = { pc, audio: null, pending: [] };
    peers.set(uid, p);
    for (const t of stream.getTracks()) pc.addTrack(t, stream);
    pc.onicecandidate = (e) => { if (e.candidate) send({ t: 'rtc', to: uid, d: { ice: e.candidate.toJSON() } }); };
    pc.ontrack = (e) => {
      const ms = e.streams[0] || new MediaStream([e.track]);
      if (!p.audio) {
        p.audio = document.createElement('audio');
        p.audio.autoplay = true;
        p.audio.setAttribute('playsinline', '');
        p.audio.dataset.voice = uid;
        document.body.appendChild(p.audio);
      }
      p.audio.srcObject = ms;
      p.audio.play().catch(() => {});
      analyse(uid, ms);
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' && peers.get(uid)?.pc === pc) {
        closePeer(uid);
        if (offerer && active) setTimeout(() => active && !peers.has(uid) && createPeer(uid, true), 1500);
      }
      onChange?.();
    };
    if (offerer) {
      pc.createOffer().then((o) => pc.setLocalDescription(o)).then(() => {
        send({ t: 'rtc', to: uid, d: { offer: pc.localDescription.toJSON() } });
      }).catch(() => {});
    }
    return p;
  }

  async function join() {
    if (active) return;
    if (joining) return joining;
    joining = (async () => {
      if (!navigator.mediaDevices?.getUserMedia || !window.RTCPeerConnection) throw new Error('이 브라우저는 음성 채팅을 지원하지 않아요.');
      try {
        const r = await fetch('/api/ice', { cache: 'no-store' });
        ice = (await r.json()).iceServers;
      } catch { ice = FALLBACK_ICE; }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
      } catch {
        throw new Error('마이크를 쓸 수 없어요. 브라우저 설정에서 마이크 권한을 허용해 주세요.');
      }
      active = true;
      applyMic();
      analyse(me(), stream);
      meterTimer = setInterval(meter, 160);
      report();
      onChange?.();
    })();
    try { await joining; } finally { joining = null; }
  }

  function leave() {
    if (!active) return;
    active = false;
    for (const uid of [...peers.keys()]) closePeer(uid);
    for (const t of stream?.getTracks() || []) t.stop();
    stream = null;
    levels.clear();
    clearInterval(meterTimer);
    speaking = new Set();
    send({ t: 'voice', on: false });
    onChange?.();
  }

  // 방 정보가 바뀔 때마다 연결 대상 맞추기 (uid가 작은 쪽이 먼저 연결을 걸어요)
  function syncRoom(room) {
    if (!active) return;
    if (!room) { leave(); return; }
    const mine = room.members.find((m) => m.uid === me());
    if (mine && (!mine.voice || mine.mic !== effectiveMic())) report();
    const want = new Set(room.members.filter((m) => m.voice && !m.bot && m.uid !== me() && m.online !== false).map((m) => m.uid));
    for (const uid of [...peers.keys()]) if (!want.has(uid)) closePeer(uid);
    for (const uid of want) if (!peers.has(uid) && me() < uid) createPeer(uid, true);
  }

  async function onSignal(from, d) {
    if (!active || !d) return;
    try {
      if (d.offer) {
        const p = createPeer(from, false);
        await p.pc.setRemoteDescription(d.offer);
        for (const c of p.pending.splice(0)) await p.pc.addIceCandidate(c).catch(() => {});
        const ans = await p.pc.createAnswer();
        await p.pc.setLocalDescription(ans);
        send({ t: 'rtc', to: from, d: { answer: p.pc.localDescription.toJSON() } });
      } else if (d.answer) {
        const p = peers.get(from);
        if (p && p.pc.signalingState === 'have-local-offer') {
          await p.pc.setRemoteDescription(d.answer);
          for (const c of p.pending.splice(0)) await p.pc.addIceCandidate(c).catch(() => {});
        }
      } else if (d.ice) {
        const p = peers.get(from);
        if (!p) return;
        if (p.pc.remoteDescription) await p.pc.addIceCandidate(d.ice).catch(() => {});
        else p.pending.push(d.ice);
      }
    } catch (e) {
      console.warn('voice signal', e);
    }
  }

  return {
    join,
    leave,
    syncRoom,
    onSignal,
    get active() { return active; },
    get micOn() { return micOn; },
    get forced() { return forced; },
    isSpeaking: (uid) => speaking.has(uid),
    connected: (uid) => ['connected', 'completed'].includes(peers.get(uid)?.pc.connectionState),
    setMic(on) {
      micOn = !!on;
      applyMic();
      if (active) report();
      onChange?.();
    },
    setForced(reason) {
      if ((reason || null) === forced) return;
      forced = reason || null;
      applyMic();
      if (active) report();
      onChange?.();
    },
  };
}
