// Main-site controls for the shared 23-game media gate.
const BASE = '/avalon';
const LOCK_LABEL = '음성·화상 잠금';

export function initSiteAdmin({
  doc = document,
  win = window,
  request = (...args) => fetch(...args),
  notify = (message) => win.alert(message),
} = {}) {
  const button = doc.getElementById('avalon-lock');
  const label = doc.getElementById('avalon-lock-label');
  const adminLink = doc.getElementById('avalon-admin-link');
  if (!button) return { refresh: async () => null, destroy() {} };

  let state = null, busy = false, destroyed = false, pending = null, version = 0;

  function paint() {
    if (destroyed) return;
    button.hidden = !(state?.admin && !state?.locked);
    button.disabled = busy;
    button.setAttribute('aria-busy', String(busy));
    if (label) label.textContent = busy ? '잠금 중…' : LOCK_LABEL;
    if (adminLink) adminLink.title = state
      ? (state.locked ? '음성·화상 잠금 상태 · 관리 페이지에서 해제' : '음성·화상 게임 열림 상태 · 잠금 및 관리')
      : '잠금 관리자 로그인 및 잠금 관리';
  }

  async function api(path, options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    try {
      const res = await request(BASE + path, {
        ...options, credentials: 'same-origin', cache: 'no-store', signal: controller.signal,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok !== true) throw new Error(data?.error || '요청을 처리하지 못했어요. 다시 시도해 주세요.');
      return data;
    } catch (error) {
      if (error?.name === 'AbortError') throw new Error('서버 응답이 없어요. 관리 페이지에서 잠금 상태를 확인해 주세요.');
      throw error;
    } finally { clearTimeout(timer); }
  }

  function refresh() {
    if (destroyed || busy) return Promise.resolve(state);
    if (pending) return pending;
    const current = ++version;
    pending = (async () => {
      try {
        const data = await api('/api/site-status');
        if (typeof data.admin !== 'boolean' || typeof data.locked !== 'boolean') throw new Error('Invalid gate status');
        if (!destroyed && !busy && current === version) state = data;
      } catch (_) {
        // A stale/failed session must never reveal administrator-only controls.
        if (!destroyed && !busy && current === version) state = null;
      } finally { pending = null; paint(); }
      return state;
    })();
    return pending;
  }

  async function lock() {
    if (destroyed || busy || !state?.admin || state?.locked) return;
    if (!win.confirm('음성·화상 지원 게임 23개를 잠글까요?\n\n아발론과 음성 게임의 새 방·입장·TURN 발급을 차단합니다. 일반 음성 게임방은 종료되고 참가자는 로비로 나갑니다. 아발론도 잠금 확인 후 연결을 종료합니다.\n\n노래 맞히기와 초성 퀴즈는 계속 이용합니다. 이 브라우저의 관리자도 로그아웃합니다.')) return;
    busy = true;
    ++version; // Ignore status responses started before this write.
    paint();
    let locked = false;
    try {
      const data = await api('/api/admin/lock', { method: 'POST' });
      if (data.locked !== true) throw new Error('잠금 완료를 확인하지 못했어요. 관리 페이지에서 확인해 주세요.');
      locked = true;
      state = { ...state, locked: true };
      paint();
      try {
        await api('/api/admin/logout', { method: 'POST' });
        state = { ...state, admin: false };
        notify('음성·화상 게임을 잠그고 관리자 로그아웃을 완료했어요.', 'good');
      } catch (_) {
        notify('음성·화상 게임은 잠겼지만 로그아웃을 확인하지 못했어요. 잠금 관리에서 로그아웃을 다시 해 주세요.', 'err');
      }
    } catch (error) {
      notify(error?.message || '음성·화상 잠금에 실패했어요.', 'err');
    } finally {
      busy = false;
      paint();
      if (!locked) {
        // Wait for any pre-write read to finish before fetching authoritative state.
        if (pending) await pending;
        await refresh();
      }
    }
  }

  const onReturn = () => { if (doc.visibilityState !== 'hidden') void refresh(); };
  button.addEventListener('click', lock);
  win.addEventListener('focus', onReturn);
  win.addEventListener('pageshow', onReturn);
  doc.addEventListener('visibilitychange', onReturn);
  paint();
  void refresh();

  return {
    refresh,
    lock,
    destroy() {
      destroyed = true;
      ++version;
      button.removeEventListener('click', lock);
      win.removeEventListener('focus', onReturn);
      win.removeEventListener('pageshow', onReturn);
      doc.removeEventListener('visibilitychange', onReturn);
    },
  };
}
