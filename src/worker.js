// Cloudflare Worker 진입점
// /ws → 실시간 서버(Durable Object), 그 외 → public 폴더의 정적 파일
export { Hub } from './hub.js';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
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
