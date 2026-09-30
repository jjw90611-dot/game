// Main game entry point. Static catalog browsing stays public.
import avalon, { getMediaAccess, getIceServers } from '../avalon/src/index.js';
import { isMeteredGame, GAMES } from '../public/js/catalog.js';
export { Hub } from './hub.js';
export { AvalonRoom, SiteGate } from '../avalon/src/index.js';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: {
    'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store'
  } });
}
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/avalon' || url.pathname.startsWith('/avalon/')) return avalon.fetch(request, env);
    if (url.pathname === '/api/media-status') return json({ ok: true, ...await getMediaAccess(env) });
    if (url.pathname === '/api/ice') {
      if (request.method !== 'GET') return json({ ok: false, error: 'Method not allowed' }, 405);
      if (request.headers.get('origin') && request.headers.get('origin') !== url.origin) return json({ ok: false, error: 'Cross-origin request denied' }, 403);
      const access = await getMediaAccess(env);
      if (!access.open) return json({ ok: false, ...access }, access.locked ? 423 : 503);
      const game = url.searchParams.get('game');
      if (!isMeteredGame(game) || GAMES[game].external) return json({ ok: false, error: '이 게임에서는 음성 채팅을 사용할 수 없습니다.' }, 403);
      const sid = request.headers.get('x-game-session') || '';
      if (!/^[A-Za-z0-9_-]{16,64}$/.test(sid)) return json({ ok: false, error: '게임방에 먼저 입장해 주세요.' }, 403);
      // TURN is issued to an actual connected member, never from a game name alone.
      if (!env.HUB) return json({ ok: false, error: '게임방에 먼저 입장해 주세요.' }, 503);
      const auth = await env.HUB.get(env.HUB.idFromName('main')).fetch('https://hub/internal/voice-access', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sid, game })
      });
      if (!auth.ok) return json({ ok: false, error: '게임방에 먼저 입장해 주세요.' }, 403);
      const proof = await auth.json();
      if (proof.ok !== true) return json({ ok: false, error: '게임방에 먼저 입장해 주세요.' }, 403);
      const iceServers = await getIceServers(env, access.turnUsage);
      // A lock may have occurred while the upstream credentials request was in flight.
      const latest = await getMediaAccess(env);
      if (!latest.open) return json({ ok: false, ...latest }, latest.locked ? 423 : 503);
      return json({ ok: true, iceServers, turnUsage: access.turnUsage });
    }
    if (url.pathname === '/ws') {
      if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return json({ ok: false, error: 'WebSocket required' }, 426);
      if (request.headers.get('origin') && request.headers.get('origin') !== url.origin) return json({ ok: false, error: 'Cross-origin request denied' }, 403);
      return env.HUB.get(env.HUB.idFromName('main')).fetch(request);
    }
    return env.ASSETS.fetch(request);
  }
};
