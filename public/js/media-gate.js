// Presentation only. Admission is enforced again by the Worker and game Hub.
export function createMediaGate({
  doc = document, win = window, request = (...args) => fetch(...args), onChange = () => {}
} = {}) {
  let pending = null, destroyed = false;
  async function refresh() {
    if (destroyed) return;
    if (pending) return pending;
    pending = (async () => {
      let access;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      try {
        const r = await request('/api/media-status', { cache: 'no-store', credentials: 'same-origin', signal: controller.signal });
        access = await r.json();
        if (!r.ok || access.ok !== true || typeof access.open !== 'boolean') throw new Error('Invalid media gate');
      } catch { access = { open: false, locked: true, reason: 'status-unavailable', error: '잠금 상태를 확인하지 못했습니다. 음성·화상 게임 입장을 일시 제한합니다.' }; }
      finally { clearTimeout(timeout); }
      if (destroyed) return;
      const banner = doc.getElementById('media-gate-banner');
      if (banner) {
        banner.hidden = false;
        banner.classList.toggle('is-open', access.open);
        banner.textContent = access.open ? '음성·화상 게임 23개 열림 · TURN 월 한도를 함께 사용합니다.' : (access.error || '관리자가 음성·화상 게임을 잠갔습니다. 잠금 해제 후 입장해 주세요.') + ' ' + '노래 맞히기와 초성 퀴즈는 계속 이용할 수 있습니다.';
      }
      onChange(access);
      return access;
    })();
    try { return await pending; } finally { pending = null; }
  }
  const onReturn = () => { if (doc.visibilityState !== 'hidden') void refresh(); };
  win.addEventListener('focus', onReturn);
  win.addEventListener('pageshow', onReturn);
  doc.addEventListener('visibilitychange', onReturn);
  const timer = win.setInterval(onReturn, 15000);
  return { refresh, destroy() {
    destroyed = true;
    win.clearInterval(timer);
    win.removeEventListener('focus', onReturn);
    win.removeEventListener('pageshow', onReturn);
    doc.removeEventListener('visibilitychange', onReturn);
  } };
}
