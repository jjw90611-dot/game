> **2026-09-30 미디어 전용 잠금 업데이트:** 잠금/800GB 도달 시 게임은 계속 이용하고 음성·화상/TURN만 중지합니다. 자세한 내용은 `../MEDIA_ONLY_LOCK.md`를 확인하세요.

# Avalon Live — 2026 Royal Table UI / Cloudflare Edition

## v5.2 컴퓨터 기사 모드

사람이 5명을 채우기 어려울 때 방장이 **컴퓨터 플레이어(CPU 기사)** 를 추가해 5~10인 게임을 완성할 수 있습니다. 컴퓨터는 단순 자리 채우기가 아니라 역할을 실제로 배정받고, 원정대 제안·찬반 투표·비밀 임무 카드·호수의 여인·엑스칼리버·마지막 암살까지 서버에서 자동으로 판단합니다.

- 대기실의 `♞ 컴퓨터 1명 추가` 버튼으로 인원 부족분을 채움
- 컴퓨터는 카메라/마이크/WebRTC를 사용하지 않아 영상 통신량을 추가로 만들지 않음
- 선 역할은 공개 정보와 자기 역할이 허용하는 비밀 정보만 사용해 의심도를 계산
- 악 역할은 자신이 아는 악 동료를 활용해 팀을 구성하고, 필요하면 성공 카드를 내며 정체를 숨김
- 실패 원정에 참여한 악 CPU는 실제로 **“저는 성공을 냈습니다”** 같은 거짓 주장으로 다른 사람을 의심하게 만들 수 있음
- 컴퓨터 암살자는 투표·원정대 선택 기록을 바탕으로 멀린 후보를 추리하고 자동 지목
- 컴퓨터마다 다른 음성 프로필을 사용하며, 사회자 음성 Yuna와 분리됨
- 기기에 여러 한국어 음성이 있으면 서로 다른 음성을 우선 사용하고, 음성이 부족한 기기에서는 말속도/음높이 차이로 인물을 구분
- 외부 LLM/API를 호출하지 않는 **서버 내 규칙 기반 AI**이므로 별도 AI API 요금이나 키가 필요 없음

컴퓨터는 게임 규칙상 알 수 없는 역할을 직접 읽어서 판단하지 않도록 설계했습니다. 예를 들어 충신 CPU는 실제 악 역할을 보지 못하고 원정/투표 결과만으로 추리하며, 멀린 CPU도 모드레드는 비밀 정보로 알아내지 못합니다.

## v5.1.1 메인 화면 사이트 잠금 버튼

관리자 비밀번호로 `/admin`에서 잠금을 해제한 뒤 게임 사이트로 이동하면, 관리자 세션이 살아 있는 동안 메인 화면과 게임 상단에 **`🔒 사이트 잠금`** 버튼이 표시됩니다. 이 버튼을 누르면 사이트를 잠그고 관리자 세션도 종료한 뒤 잠금 화면으로 돌아갑니다. 일반 참가자에게는 이 버튼이 보이지 않습니다.


레지스탕스: 아발론 한국어판 규칙을 기반으로 한 **5~10인 실시간 휴대폰 웹게임**입니다. 각자 휴대폰으로 접속해 카메라/마이크로 얼굴을 보며 토론하고, 역할 확인·원정대 구성·찬반 투표·비밀 임무·암살까지 사이트가 진행합니다.

배포 구조:

```text
GitHub → Cloudflare Workers Builds
       → Worker + SQLite Durable Objects + Native WebSocket
       → WebRTC P2P + Cloudflare STUN/TURN fallback
```


## v5.1 operations additions

- Global site gate: the site starts LOCKED and can be managed at `/admin`.
- Set the Cloudflare Worker Secret `SITE_ADMIN_PASSWORD` to the owner password. Do not commit the password to GitHub.
- Spectator mode: the host selects exactly 5-10 game participants; unchecked members remain spectators with no camera, microphone, role, vote, mission card, or WebRTC peer connection.
- Narrator: Yuna only and always enabled. If the device has no Yuna Web Speech voice, on-screen narration continues without a fallback voice.
- Guide: expandable 5/6/7/8/9/10 player recommended-card explanations were added.
- Accessibility: small UI text was increased throughout while preserving the Royal UI layout.

## v5.1 디자인 개정

이번 버전은 기존의 “설명 이미지/포스터를 화면에 그대로 붙이는” 구성을 제거하고, **실제 UI 자체를 하나의 프리미엄 중세 보드게임처럼 다시 설계**했습니다.

- 어두운 성곽·원탁 분위기의 남청/흑철 UI + 금박 포인트
- 첫 화면은 멀린과 암살자의 초상을 장식 요소로 자연스럽게 합성한 히어로 레이아웃
- 전체 설명 이미지를 붙이는 대신 **HTML 기반 게임 가이드**로 재구성
- 같은 역할 초상을 `인물 도감 → 대기실 카드 미리보기 → 내 비밀 역할 → 게임 종료 공개`에 일관되게 사용
- 역할 확인 카드는 실제 보드게임 카드처럼 `초상 / 진영 / 능력 / 내가 아는 정보`를 한 장에 표시
- 퍼시벌 규칙: 모르가나 OFF면 멀린을 정확히 알고, ON이면 멀린/모르가나 두 후보를 보되 구분하지 못함
- 영상 타일·원정 트랙·투표·성공/실패 카드·사회자 알림도 같은 디자인 언어로 통일
- 상단에 눈에 띄는 **방 나가기** 버튼 유지
- 방장 전용 진행 중 게임 중단 기능 유지
- Yuna voice only, always enabled; no alternate narrator voice is selected.
- 기존 Cloudflare TURN + 월 800GB 안전 정지 유지

## 역할 카드 이미지

`public/assets/roles/`의 초상 이미지는 게임 전 과정에서 동일하게 사용됩니다.

```text
merlin.jpg          멀린
percival.jpg        퍼시벌
servant.jpg         충신
assassin.jpg        암살자
mordred.jpg         모드레드
morgana.jpg         모르가나
oberon.jpg          오베론
minion.jpg          모드레드의 하수인
lancelot_good.jpg   선의 란슬롯
lancelot_evil.jpg   악의 란슬롯
lady.jpg            호수의 여인
lancelot.jpg        란슬롯 확장
excalibur.jpg       엑스칼리버
```

## 기본 추천 세팅

```text
멀린        항상 포함
암살자      항상 포함
퍼시벌      ON
모드레드    ON
모르가나    OFF
오베론      OFF
호수의 여인 OFF
란슬롯      OFF
엑스칼리버  OFF
```

### 5명 기본 예시

```text
선 3명: 멀린 / 퍼시벌 / 충신
악 2명: 암살자 / 모드레드
```

## 인원별 규칙

| 인원 | 선 | 악 | 1R | 2R | 3R | 4R | 5R |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 5 | 3 | 2 | 2 | 3 | 2 | 3 | 3 |
| 6 | 4 | 2 | 2 | 3 | 4 | 3 | 4 |
| 7 | 4 | 3 | 2 | 3 | 3 | 4 | 4 |
| 8 | 5 | 3 | 3 | 4 | 4 | 5 | 5 |
| 9 | 6 | 3 | 3 | 4 | 4 | 5 | 5 |
| 10 | 6 | 4 | 3 | 4 | 4 | 5 | 5 |

- 찬성이 반대보다 많아야 승인됩니다. 동수는 부결입니다.
- 원정대 제안이 5회 연속 부결되면 악이 승리합니다.
- 선은 원정에서 성공만 제출할 수 있습니다.
- 악은 성공/실패 중 선택할 수 있습니다.
- 7명 이상 게임의 4번째 원정은 실패 카드 2장 이상이어야 실패합니다.
- 선이 원정 3회를 성공하면 암살 단계로 이동합니다.
- 암살자가 멀린을 맞히면 악이 최종 승리합니다.

## 누가 누구를 아나요?

- **멀린**: 모드레드를 제외한 악을 확인합니다.
- **퍼시벌**: 모르가나가 없으면 멀린을 정확히 압니다. 모르가나가 있으면 멀린/모르가나 두 후보를 보지만 구분하지 못합니다.
- **암살자 / 모르가나 / 모드레드 / 일반 하수인**: 오베론을 제외한 일반 악끼리 서로 압니다.
- **오베론**: 다른 악을 모르며 다른 악도 오베론을 모릅니다.
- **악의 란슬롯**: 다른 악에게는 보이지만 본인은 다른 악을 보지 못합니다.

## 사회자 음성

Yuna is the only narrator voice and narration stays enabled during game flow. The browser Web Speech API is used; if Yuna is not installed on that device, the visual narrator remains available and the app does not substitute another voice.

## 방 나가기 / 연결 끊김

- 상단 `방 나가기` 버튼으로 명시적으로 퇴장
- 대기실에서 방장이 나가면 다음 플레이어에게 방장 자동 이전
- 진행 중 누군가 명시적으로 나가면 현재 판을 중단하고 남은 인원을 대기실로 안전 복귀
- 단순 네트워크 끊김/새로고침은 슬롯을 보존하고 재접속 토큰으로 복구
- 방장은 진행 중 `게임 중단`으로 판을 종료하고 대기실로 돌아갈 수 있음

## Cloudflare 배포

GitHub 저장소 루트에 다음이 보이면 됩니다.

```text
src/
public/
test/
package.json
wrangler.jsonc
README.md
```

Cloudflare Workers Builds:

```text
Production branch: main
Build command: npm run build
Deploy command: npx wrangler deploy
```

기존에 등록한 아래 Secret은 그대로 사용합니다.

```text
TURN_KEY_ID
TURN_KEY_API_TOKEN
CF_ACCOUNT_ID
CF_ANALYTICS_API_TOKEN
SITE_ADMIN_PASSWORD
```

확인 URL:

```text
https://<worker>.workers.dev/health
https://<worker>.workers.dev/api/usage?refresh=1
https://<worker>.workers.dev/config
```

`wrangler.jsonc`의 `TURN_MONTHLY_CAP_GB = 800` 안전장치도 그대로 유지됩니다.

## 개발 / 테스트

```bash
npm run check
npm test
npm run build
```

자동 테스트는 총 43개이며 5~10인 규칙, 퍼시벌/멀린/모드레드 정보, 선의 실패 카드 위조 차단, 5회 부결, 7인 이상 4R 2실패, 암살, 호수의 여인, 란슬롯, 엑스칼리버, 방 나가기, 방장 이전, 게임 중단, 관전자, 컴퓨터 기사 자동 추리/투표/임무/암살, TURN 800GB fail-closed 안전장치를 검증합니다.

## WebRTC 참고

현재 영상은 P2P mesh 방식이며 약 320×240, 12fps, 피어당 최대 약 180kbps로 제한합니다. 5~7명은 비교적 가볍고 8~10명은 기기/네트워크에 따라 발열과 업로드 부담이 커질 수 있습니다.
