// 서버와의 실시간 연결 (자동 재접속)
export class Net {
  constructor({ onMessage, onStatus, hello }) {
    this.onMessage = onMessage;
    this.onStatus = onStatus;
    this.hello = hello;
    this.ws = null;
    this.retry = 0;
    this.stopped = false;
    this.pingTimer = null;
    this.lastPong = 0;
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && !this.isOpen() && !this.stopped) this.connect(true);
    });
    window.addEventListener('online', () => { if (!this.isOpen() && !this.stopped) this.connect(true); });
  }

  isOpen() {
    return this.ws && this.ws.readyState === WebSocket.OPEN;
  }

  connect(now = false) {
    if (this.stopped) return;
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) return;
    clearTimeout(this.retryTimer);
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/ws`);
    this.ws = ws;
    ws.onopen = () => {
      this.retry = 0;
      this.lastPong = Date.now();
      this.onStatus('open');
      ws.send(JSON.stringify(this.hello()));
      clearInterval(this.pingTimer);
      this.pingTimer = setInterval(() => {
        if (ws.readyState !== WebSocket.OPEN) return;
        if (Date.now() - this.lastPong > 45000) {
          try { ws.close(); } catch {}
          return;
        }
        try { ws.send('ping'); } catch {}
      }, 20000);
    };
    ws.onmessage = (e) => {
      this.lastPong = Date.now();
      if (e.data === 'pong') return;
      let m;
      try { m = JSON.parse(e.data); } catch { return; }
      if (m.t === 'dup') this.stopped = true;
      this.onMessage(m);
    };
    ws.onclose = () => {
      clearInterval(this.pingTimer);
      if (this.ws !== ws) return;
      this.onStatus(this.stopped ? 'stopped' : 'closed');
      if (this.stopped) return;
      const wait = now ? 300 : Math.min(8000, 600 * 2 ** this.retry++);
      this.retryTimer = setTimeout(() => this.connect(), wait);
      now = false;
    };
    ws.onerror = () => {};
  }

  resume() {
    this.stopped = false;
    this.retry = 0;
    this.connect(true);
  }

  send(obj) {
    if (!this.isOpen()) return false;
    this.ws.send(JSON.stringify(obj));
    return true;
  }
}
