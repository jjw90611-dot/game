# 23개 게임 공통 잠금 패치

작성: 2026-09-30. 이 버전은 앞서 제공한 아발론 전용 잠금 패치를 대체합니다.

## 적용 방법

이 ZIP은 전체 프로젝트가 아닌 **변경·추가 파일 패치**입니다. 먼저 기존 프로젝트를 백업하고, 압축을 푼 `game-main` 폴더 **안의 내용**을 기존 프로젝트의 같은 경로에 덮어쓰세요. `public` 폴더 전체를 삭제하면 안 됩니다.

이전 잠금 버튼 수정도 포함하므로 원본에 바로 적용하거나, 이전 패치가 적용된 프로젝트에 적용할 수 있습니다. 이 버전 적용 후 이전 패치를 다시 덮어쓰지 마세요.

`npm test` 후 기존 GitHub 연동 배포 또는 `npm run deploy`로 재배포하세요. 배포 후 브라우저를 새로고침하세요. `wrangler.toml`, Durable Object 바인딩, 기존 관리자 비밀번호와 TURN/Analytics Secret은 변경하지 않습니다.

**이 버전을 처음 적용하면 23개 게임은 잠금 상태로 시작합니다.** 기존 아발론의 열림 상태를 그대로 승계하지 않습니다. 배포 중 진행 중인 게임이 종료될 수 있으므로 게임을 마친 뒤 배포하세요.

## 사용 방법

메인 상단 **잠금 관리** → 관리자 로그인 → 잠금 해제. 게임을 마치면 메인 상단 **음성·화상 잠금**을 누르세요. 기존 `/avalon/admin` 관리 주소도 그대로 사용합니다. 메인 잠금 버튼은 같은 도메인·브라우저에서 관리자 로그인 후 표시됩니다.

## 대상 게임

현재 전체 25개 중 화상 1개와 음성 22개가 공통 잠금 대상입니다. 음성을 끄고 플레이하더라도 해당 게임의 입장자체를 잠그도록 했습니다.

| ID | 게임 | 카탈로그 음성 설정 | 공통 잠금 |
|---|---|---|---|
| `liar` | 라이어 게임 | `rec` | 대상 |
| `mafia` | 마피아 | `rec` | 대상 |
| `avalon` | 아발론 | `video` | 대상 |
| `werewolf` | 하룻밤 늑대인간 | `rec` | 대상 |
| `coup` | 쿠데타 | `rec` | 대상 |
| `drawguess` | 그림 맞히기 | `on` | 대상 |
| `relay` | 그림 릴레이 | `on` | 대상 |
| `wordspy` | 단어 스파이 | `on` | 대상 |
| `rummy` | 러미 타일 | `on` | 대상 |
| `onecard` | 컬러 원카드 | `on` | 대상 |
| `numbercode` | 숫자 암호 | `on` | 대상 |
| `fruitbell` | 과일 종치기 | `on` | 대상 |
| `gems` | 보석 상인 | `on` | 대상 |
| `omok` | 오목 | `on` | 대상 |
| `reversi` | 리버시 | `on` | 대상 |
| `yacht` | 요트 다이스 | `on` | 대상 |
| `song` | 노래 맞히기 | `off` | 제외 |
| `indian` | 인디언 포커 | `rec` | 대상 |
| `yut` | 윷놀이 | `on` | 대상 |
| `dice` | 라이어 다이스 | `rec` | 대상 |
| `rankwar` | 계급 전쟁 | `on` | 대상 |
| `spotit` | 같은 그림 찾기 | `on` | 대상 |
| `chosung` | 초성 퀴즈 | `off` | 제외 |
| `oneword` | 한 단어 | `on` | 대상 |
| `connect4` | 사목 | `on` | 대상 |

`voiceMode()`는 `voice`가 없으면 `on`을 반환합니다. 따라서 ‘음성 추천’ 배지가 없는 오목·러미 타일 등도 대상입니다. 노래 맞히기와 초성 퀴즈만 `off`입니다.

## 서버에서 차단하는 범위

잠금 상태에서는 대상 게임의 새 방·빠른 시작·입장·관전·재입장을 차단합니다. 기존 WebSocket을 사용한 요청에도 공통 정책를 적용합니다. 일반 음성 게임방은 종료하고 참가자에게 나가기 알림을 보냅니다. 아발론은 기존 서버 잠금 검사와 클라이언트 상태 확인을 사용합니다.

`/api/ice`와 아발론 `/config`를 직접 요청해도 잠금을 우회할 수 없게 했습니다. 관리자의 로그인 쿠키도 잠긴 게임을 우회하지 못합니다. 일반 음성의 TURN 정보는 열림 상태에서도 해당 방의 실제 접속 참가자에게만 발급합니다.

음성이 없는 두 게임은 버튼만 숨기는 것이 아니라, 서버의 음성 참여와 RTC 신호 처리도 거부합니다. 음성 클라이언트는 잠금·한도 오류를 받았을 때 STUN으로 임의 우회하지 않고, 방 이동·종료 중 대기하던 마이크 권한 요청도 취소 처리합니다.

## 800GB와 잠금의 의미

**800GB는 게임별 한도가 아니라, 같은 `TURN_KEY_ID`의 월간 중계 사용량 합계를 확인하는 기준**입니다. 음성·영상이 TURN을 통과할 때 해당 사용량이 잡힙니다. 한도 도달이 확인되면 공통 대상 게임의 새 입장과 새 TURN 발급을 제한하고 기존 일반 음성 게임방도 종료합니다.

사용량 조회는 기존 30초 캐시와 통계 반영 시점의 영향을 받습니다. 다른 TURN 키와 SFU의 사용량을 포함한 계정 전체의 강제 과금 상한은 아닙니다. 사용량 조회가 불가능하거나 TURN 설정이 없으면 기존처럼 새 TURN 발급을 중지하고 직접 연결용 STUN만 제공합니다. 이 경우에도 수동 잠금은 유지됩니다.

**잠금 해제 중에는 기존처럼 누구나 입장할 수 있습니다.** 이 패치는 초대받은 사람만 허용하는 인증 기능이 아닙니다. 메인·게임 소개·커뮤니티와 음성 없는 두 게임은 잠금 중에도 공개됩니다.

**잠금이 이미 발급된 TURN 자격증명을 즉시 폐기하는 것은 아닙니다.** 정상 클라이언트는 알림·상태 확인 후 미디어를 종료하지만, 이 수정에는 Cloudflare의 별도 자격증명 철회 API 호출을 추가하지 않았습니다. 이미 시작된 임의의 외부 클라이언트 트래픽까지 즉시 0이 된다고 보장하지 않습니다.

## 검증 범위

Node.js 자동 테스트 **117개 통과**, Chromium 메인 화면 검사 **16개 통과**. 서버 테스트는 실제 Worker·Hub·SiteGate 코드에 모의 저장소와 네트워크를 사용합니다. 브라우저 검사는 실제 프론트엔드 모듈을 메모리에서 결합하고 API·WebSocket을 모의하여 실행했습니다. 320~1440px 10개 너비에서 헤더 잘림·겹침이 없었습니다.

**운영 사이트에 배포하지 않았으며, 실제 Cloudflare 계정·미디어·TURN 연결을 검증한 것은 아닙니다.** 현 환경에서 의존성 설치가 완료되지 않아 Wrangler 로컬 런타임·배포 빌드는 검증하지 못했습니다. 단, 모든 변경 JavaScript는 구문 검사와 테스트를 통과했습니다.

## 코드 근거

원본 `game-main.zip` SHA-256: `f69814eea8c73d904bc20cc689fb242822947785ae4c7cb1c718a72ed1236977`

- `public/js/catalog.js:15`: `export const GAMES`

- `public/js/catalog.js:360`: `export const voiceMode`

- `public/js/catalog.js:373`: `export function isMeteredGame`

- `avalon/src/index.js:193`: `export async function getMediaAccess`

- `avalon/src/index.js:114`: `export async function getTurnUsageStatus`

- `avalon/src/index.js:165`: `export async function getIceServers`

- `src/worker.js:17`: `url.pathname === '/api/ice'`

- `src/worker.js:16`: `url.pathname === '/api/media-status'`

- `src/hub.js:132`: `async refreshMediaAccess`

- `src/hub.js:150`: `closeMediaRooms(message)`

- `src/hub.js:146`: `assertMediaOpen(game)`

- `src/hub.js:351`: `onVoice(u, m)`

- `src/hub.js:352`: `onRtc(u, m)`

- `avalon/src/gate.js:19`: `async readState`

- `public/js/voice.js:88`: `async function join`

- `public/js/voice.js:121`: `function leave`

테스트: `test/media-access.test.js`, `test/voice-access.test.js`, 기존 `test/site-admin*.test.js` 및 게임 테스트.

공식 참고 문서: Cloudflare Realtime TURN 서비스 설명, Generate Credentials의 생성·별도 철회 절차, Workers Static Assets의 Worker-first 라우팅 설명.

```text
https://developers.cloudflare.com/realtime/turn/
https://developers.cloudflare.com/realtime/turn/generate-credentials/
https://developers.cloudflare.com/workers/static-assets/routing/worker-script/
```
