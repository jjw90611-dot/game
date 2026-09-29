import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// 보드게임 모음집에 합쳐진 뒤에는 저장소 루트의 wrangler.toml 을 사용합니다.
test('Wrangler config binds static assets, SQLite Durable Object, and 800GB safety variable', () => {
  const cfg = fs.readFileSync(new URL('../../wrangler.toml', import.meta.url), 'utf8');
  assert.match(cfg, /directory = "\.\/public"/);
  assert.match(cfg, /binding = "ASSETS"/);
  assert.match(cfg, /name = "ROOMS"\s+class_name = "AvalonRoom"/);
  assert.match(cfg, /name = "GATE"\s+class_name = "SiteGate"/);
  assert.match(cfg, /new_sqlite_classes = \["AvalonRoom", "SiteGate"\]/);
  assert.match(cfg, /run_worker_first = \["\/avalon", "\/avalon\/\*"\]/);
  assert.match(cfg, /TURN_MONTHLY_CAP_GB = "800"/);
});

test('frontend uses native CloudSocket and no Socket.IO dependency', () => {
  const html = fs.readFileSync(new URL('../../public/avalon/index.html', import.meta.url), 'utf8');
  const app = fs.readFileSync(new URL('../../public/avalon/app.js', import.meta.url), 'utf8');
  assert.match(html, /socket-client\.js/);
  assert.doesNotMatch(html, /socket\.io/);
  assert.match(app, /new CloudSocket\(roomCode\)/);
  assert.match(app, /\/api\/rooms/);
  assert.match(app, /\/api\/usage/);
  assert.match(app, /lady-result/);
  assert.match(app, /excalibur-result/);
});

test('Worker contains fail-closed TURN analytics guard', () => {
  const src = fs.readFileSync(new URL('../src/index.js', import.meta.url), 'utf8');
  assert.match(src, /callsTurnUsageAdaptiveGroups/);
  assert.match(src, /CF_ACCOUNT_ID/);
  assert.match(src, /CF_ANALYTICS_API_TOKEN/);
  assert.match(src, /TURN_MONTHLY_CAP_GB/);
  assert.match(src, /usage-check-failed/);
  assert.match(src, /turnAllowed: false/);
  assert.match(src, /\/api\/usage/);
});


test('2026 UI includes guide, matching role portraits, announcer controls, and room exit controls', () => {
  const html = fs.readFileSync(new URL('../../public/avalon/index.html', import.meta.url), 'utf8');
  const app = fs.readFileSync(new URL('../../public/avalon/app.js', import.meta.url), 'utf8');
  assert.match(html, /id="guideModal"/);
  assert.match(html, /id="voiceSelect"/);
  assert.match(html, /id="leaveBtn"/);
  assert.match(html, /id="abortBtn"/);
  assert.match(app, /leave-room/);
  assert.match(app, /ROLE_IMAGES/);
  for (const name of ['merlin','percival','servant','assassin','mordred','morgana','oberon','minion','lancelot_good','lancelot_evil']) {
    assert.equal(fs.existsSync(new URL(`../../public/avalon/assets/roles/${name}.jpg`, import.meta.url)), true, `${name} portrait missing`);
  }
  assert.doesNotMatch(html, /avalon-guide\.png|hero-poster|guide-image/);
  assert.match(html, /class="guide-flow"/);
  assert.match(html, /class="codex-grid"/);
  assert.match(html, /방 나가기/);
  assert.match(html, /data-site-lock/);
  assert.match(app, /lockSiteFromMain/);
  assert.match(app, /\/api\/admin\/lock/);
});


test('site gate, spectator controls, Yuna-only narrator, and large-type guide are wired in', () => {
  const html = fs.readFileSync(new URL('../../public/avalon/index.html', import.meta.url), 'utf8');
  const app = fs.readFileSync(new URL('../../public/avalon/app.js', import.meta.url), 'utf8');
  const worker = fs.readFileSync(new URL('../src/index.js', import.meta.url), 'utf8');
  const room = fs.readFileSync(new URL('../src/room.js', import.meta.url), 'utf8');
  const css = fs.readFileSync(new URL('../../public/avalon/styles.css', import.meta.url), 'utf8');
  assert.match(worker, /SITE_ADMIN_PASSWORD/);
  assert.match(worker, /\/api\/admin\/unlock/);
  assert.match(worker, /\/api\/admin\/lock/);
  assert.match(worker, /\/admin/);
  assert.match(room, /set-participant/);
  assert.match(room, /update-player-limit/);
  assert.match(room, /isParticipant/);
  assert.match(app, /preferredVoice/);
  assert.match(app, /Yuna/);
  assert.match(app, /syncParticipationRtc/);
  assert.match(html, /player-set-accordions/);
  assert.match(css, /participant-toggle/);
  assert.match(css, /spectator-cover/);
  assert.match(css, /Larger type for easier reading/);
});


test('computer knights are wired through server AI, lobby controls, speech, and no-WebRTC tiles', () => {
  const app = fs.readFileSync(new URL('../../public/avalon/app.js', import.meta.url), 'utf8');
  const room = fs.readFileSync(new URL('../src/room.js', import.meta.url), 'utf8');
  const bot = fs.readFileSync(new URL('../src/bot-ai.js', import.meta.url), 'utf8');
  const css = fs.readFileSync(new URL('../../public/avalon/styles.css', import.meta.url), 'utf8');
  assert.match(room, /add-bot/);
  assert.match(room, /remove-bot/);
  assert.match(room, /processBotTeamVotes/);
  assert.match(room, /processBotMissionVotes/);
  assert.match(room, /processBotAssassination/);
  assert.match(bot, /decideBotMissionVote/);
  assert.match(bot, /chooseBotAssassinationTarget/);
  assert.match(app, /컴퓨터 1명 추가/);
  assert.match(app, /bot-speech/);
  assert.match(app, /showBotSpeech/);
  assert.match(app, /!p\.isBot && p\.connected/);
  assert.match(css, /bot-speech-bubble/);
  assert.match(css, /bot-cover/);
});
