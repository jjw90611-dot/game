// Cloudflare Worker 진입점
// /ws      → 보드게임 모음집 실시간 서버 (Hub)
// /api/ice → 음성 채팅 연결 정보 (STUN, 설정되어 있으면 TURN)
// /avalon  → 레지스탕스 아발론 (영상 · CPU 기사 · 사이트 잠금)
// 그 외    → public 폴더의 정적 파일
import avalon, { iceConfig } from '../avalon/src/index.js';

export { Hub } from './hub.js';
export { AvalonRoom, SiteGate } from '../avalon/src/index.js';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/avalon' || url.pathname.startsWith('/avalon/')) return avalon.fetch(request, env);
    if (url.pathname === '/api/ice') {
      const iceServers = await iceConfig(env);
      return new Response(JSON.stringify({ iceServers }), { headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
    }
    if (url.pathname === '/ws') {
      if (request.headers.get('Upgrade') !== 'websocket') {
        return new Response('WebSocket 연결만 가능해요.', { status: 426 });
      }
      const stub = env.HUB.get(env.HUB.idFromName('main'));
      return stub.fetch(request);
    }
    return env.ASSETS.fetch(request);
  },
};
