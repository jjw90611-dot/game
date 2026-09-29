'use strict';

class CloudSocket {
  constructor(roomCode) {
    this.roomCode = String(roomCode || '').toUpperCase();
    this.handlers = new Map();
    this.acks = new Map();
    this.ws = null;
    this.id = null;
    this.connected = false;
    this.shouldReconnect = true;
    this.connecting = false;
    this.reconnectTimer = null;
    this.reconnectAttempt = 0;
    this.seq = 0;
  }

  on(event, fn) {
    if (!this.handlers.has(event)) this.handlers.set(event, new Set());
    this.handlers.get(event).add(fn);
    return this;
  }

  fire(event, payload) {
    for (const fn of this.handlers.get(event) || []) {
      try { fn(payload); } catch (err) { console.error(`socket handler ${event}`, err); }
    }
  }

  connect() {
    if (this.connected || this.connecting) return;
    this.shouldReconnect = true;
    this.connecting = true;
    clearTimeout(this.reconnectTimer);
    const scheme = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const base = location.pathname.startsWith('/avalon') ? '/avalon' : '';
    const url = `${scheme}//${location.host}${base}/ws/${encodeURIComponent(this.roomCode)}`;
    try { this.ws = new WebSocket(url); }
    catch (err) {
      this.connecting = false;
      this.fire('connect_error', err);
      return this.scheduleReconnect();
    }

    this.ws.onmessage = ev => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch { return; }
      if (msg.type === 'welcome') {
        this.id = msg.socketId;
        this.connected = true;
        this.connecting = false;
        this.reconnectAttempt = 0;
        this.fire('connect');
        return;
      }
      if (msg.type === 'ack') {
        const entry = this.acks.get(msg.requestId);
        if (!entry) return;
        clearTimeout(entry.timer);
        this.acks.delete(msg.requestId);
        try { entry.cb(msg.payload); } catch (_) {}
        return;
      }
      if (msg.type === 'event') this.fire(msg.event, msg.payload);
    };

    this.ws.onerror = () => {
      if (!this.connected) this.fire('connect_error', new Error('WebSocket connection failed'));
    };

    this.ws.onclose = () => {
      const hadConnection = this.connected;
      this.connected = false;
      this.connecting = false;
      this.id = null;
      for (const [key, entry] of this.acks) {
        clearTimeout(entry.timer);
        try { entry.cb({ ok: false, error: '서버 연결이 끊겼습니다.' }); } catch (_) {}
        this.acks.delete(key);
      }
      if (hadConnection) this.fire('disconnect');
      if (this.shouldReconnect) this.scheduleReconnect();
    };
  }

  scheduleReconnect() {
    if (!this.shouldReconnect || this.connected || this.connecting) return;
    clearTimeout(this.reconnectTimer);
    const delay = Math.min(3500, 700 + this.reconnectAttempt * 450);
    this.reconnectAttempt += 1;
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  disconnect() {
    this.shouldReconnect = false;
    clearTimeout(this.reconnectTimer);
    try { this.ws?.close(1000, 'client disconnect'); } catch (_) {}
  }

  emit(event, payload, ack) {
    if (typeof payload === 'function') { ack = payload; payload = {}; }
    if (payload == null) payload = {};
    if (!this.connected || this.ws?.readyState !== WebSocket.OPEN) {
      if (typeof ack === 'function') ack({ ok: false, error: '서버에 연결되어 있지 않습니다.' });
      return;
    }
    const requestId = typeof ack === 'function' ? `${Date.now()}-${++this.seq}` : null;
    if (requestId) {
      const timer = setTimeout(() => {
        const entry = this.acks.get(requestId);
        if (!entry) return;
        this.acks.delete(requestId);
        try { entry.cb({ ok: false, error: '서버 응답 시간이 초과되었습니다.' }); } catch (_) {}
      }, 12000);
      this.acks.set(requestId, { cb: ack, timer });
    }
    try {
      this.ws.send(JSON.stringify({ type: 'event', event, payload, requestId }));
    } catch (_) {
      if (requestId) {
        const entry = this.acks.get(requestId);
        if (entry) { clearTimeout(entry.timer); this.acks.delete(requestId); entry.cb({ ok: false, error: '요청을 전송하지 못했습니다.' }); }
      }
    }
  }
}

window.CloudSocket = CloudSocket;
