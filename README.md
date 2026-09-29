# 보드게임 모음집

휴대폰과 컴퓨터에서 설치 없이 바로 즐기는 **실시간 멀티플레이 보드게임 사이트**입니다.
방을 만들고 링크를 보내 친구를 초대하거나, 로비에서 모르는 사람들과 채팅하며 함께 게임할 수 있어요.

- 🎮 16가지 게임 (인기 순서대로 배치)
- 💬 로비 채팅 · 게임방 채팅 · 관전
- 🤖 혼자일 때는 봇과 연습 (오목, 요트, 러미 등)
- 📱 휴대폰/PC 모두 지원 (홈 화면에 추가 가능)
- ☁️ Cloudflare Workers + Durable Objects (무료 플랜으로 운영 가능)
- 🔤 전체 글꼴: G마켓 산스 (Light / Medium / Bold)

## 게임 목록

| 순위 | 사이트 이름 | 원작 스타일 | 인원 | 봇 |
|---|---|---|---|---|
| 1 | 라이어 게임 | 라이어 게임 | 3~8 | |
| 1 | 마피아 | 마피아 | 5~12 | |
| 1 | 그림 맞히기 | 캐치마인드 | 3~8 | |
| 1 | 러미 타일 | 루미큐브 | 2~4 | ✅ |
| 1 | 요트 다이스 | 요트 다이스 | 1~4 | ✅ |
| 1 | 오목 | 오목 | 2 | ✅ |
| 2 | 원탁의 스파이 | 아발론 | 5~10 | |
| 2 | 단어 스파이 | 코드네임 | 4~8 | |
| 2 | 컬러 원카드 | 우노 | 2~8 | ✅ |
| 2 | 숫자 암호 | 다빈치 코드 | 2~4 | ✅ |
| 2 | 과일 종치기 | 할리갈리 | 2~6 | ✅ |
| 2 | 그림 릴레이 | 텔레스트레이션 | 4~10 | |
| 2 | 리버시 | 오델로 | 2 | ✅ |
| 3 | 보석 상인 | 스플렌더 | 2~4 | ✅ |
| 3 | 하룻밤 늑대인간 | 한밤의 늑대인간 | 3~10 | |
| 3 | 쿠데타 | 쿠 (Coup) | 2~6 | ✅ |

> 루미큐브·캐치마인드·아발론·코드네임·우노·할리갈리 등은 **등록 상표**라서 사이트에서는 다른 이름을 쓰고,
> 그림·카드 데이터도 모두 직접 만들었어요. 이름은 `public/js/catalog.js`에서 한 줄만 고치면 바꿀 수 있어요.

## 내 컴퓨터에서 실행하기

[Node.js](https://nodejs.org) 18 이상이 필요해요.

```bash
npm install
npm run dev
```

브라우저에서 <http://localhost:8787> 을 열면 됩니다. 창을 여러 개(시크릿 창 포함) 열면 혼자서도 여러 명처럼 테스트할 수 있어요.

게임 규칙 테스트: `npm test`

## Cloudflare에 배포하기 (GitHub 연동)

이 사이트는 실시간 서버(Durable Object)를 쓰기 때문에 **Cloudflare Pages가 아니라 Cloudflare Workers**로 배포해요.
Workers도 GitHub에 올리면 자동으로 배포돼요.

1. [Cloudflare 대시보드](https://dash.cloudflare.com)에 가입/로그인합니다.
2. 왼쪽 메뉴 **Workers & Pages** → **Create** (애플리케이션 만들기) → **Import a repository** 를 누릅니다.
3. GitHub 계정을 연결하고 이 저장소(`game`)를 선택합니다.
4. 설정 화면에서
   - **Project name**: `boardgame-collection` (`wrangler.toml`의 `name`과 같아야 해요)
   - **Build command**: 비워 두기
   - **Deploy command**: `npx wrangler deploy` (기본값)
   - **Production branch**: 배포할 브랜치 (보통 `main`)
5. **Deploy**를 누르면 1~2분 뒤 `https://boardgame-collection.<내-계정>.workers.dev` 주소가 생겨요.
6. 이후 GitHub에 push할 때마다 자동으로 다시 배포됩니다.
7. (선택) 내 도메인을 쓰려면 Worker 설정 → **Domains & Routes** → **Add → Custom domain**.

명령어로 직접 배포하려면:

```bash
npx wrangler login
npm run deploy
```

### 무료 플랜 안내

- Workers 무료 플랜: 하루 10만 요청
- Durable Objects(SQLite 저장소)도 무료 플랜에서 사용 가능해요 (하루 사용량 한도 있음)
- 이 사이트는 서버 객체 하나로 로비와 모든 방을 관리해서 무료 한도 안에서 운영하기 좋게 만들었어요.
- 사람이 많아져서 한도를 넘으면 Workers Paid(월 $5) 플랜으로 올리면 돼요.

## 폴더 구조

```
public/                 ← 화면 (그대로 배포되는 정적 파일)
  index.html
  css/style.css         ← 공통 디자인 (G마켓 산스, 카드형 게임 목록, 모바일 레이아웃)
  css/games.css         ← 게임별 디자인
  fonts/                ← G마켓 산스 (woff2)
  js/app.js             ← 로비 · 방 · 채팅 · 대기실 화면
  js/catalog.js         ← 게임 목록/이름/규칙/옵션 (서버와 공용)
  js/art.js             ← 게임 카드 일러스트 (SVG)
  js/games/*.js         ← 게임별 화면
  js/shared/*.js        ← 서버와 화면이 함께 쓰는 규칙 (러미, 원카드 등)
src/
  worker.js             ← Cloudflare Worker 진입점
  hub.js                ← 실시간 서버 (로비, 방, 채팅, 봇, 타이머, 저장)
  games/*.js            ← 게임별 규칙 (서버에서 판정 → 부정행위 방지)
test/games.test.js      ← 모든 게임을 무작위로 수천 판 돌려 보는 테스트
```

## 새 게임 추가하기

1. `src/games/새게임.js` 에 규칙 작성 (`setup`, `action`, `view`, `timeout`, `actors`, `auto`)
2. `src/games/index.js` 에 등록
3. `public/js/catalog.js` 에 이름·인원·규칙 추가, `public/js/art.js` 에 카드 그림 추가
4. `public/js/games/새게임.js` 에 화면 작성
