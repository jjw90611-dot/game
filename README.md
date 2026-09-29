# 보드게임 모음집

휴대폰과 컴퓨터에서 설치 없이 바로 즐기는 **실시간 멀티플레이 보드게임 사이트**입니다.
방을 만들고 링크를 보내 친구를 초대하거나, 로비에서 처음 만난 사람들과 채팅하며 함께 게임할 수 있어요.

- 🎮 16가지 게임 (인기 순서대로 배치) + 화상 추리 게임 **레지스탕스 아발론**
- 💬 로비 채팅 · 게임방 채팅 · 관전 · 초대 링크 · 방 번호로 입장 · 비공개 방
- 🤖 혼자일 때는 봇과 연습 (오목, 리버시, 요트, 러미, 원카드, 숫자 암호, 과일 종치기, 보석 상인, 쿠데타)
- 📱 휴대폰/PC 모두 지원, 홈 화면에 추가 가능 (PWA)
- 🔄 새로고침하거나 잠깐 연결이 끊겨도 같은 방·같은 판으로 자동 복귀
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
| 2 | 아발론 | 레지스탕스 아발론 (화상 · 음성 · CPU 기사) | 5~10 | ✅ CPU |
| 2 | 단어 스파이 | 코드네임 | 4~8 | |
| 2 | 컬러 원카드 | 우노 | 2~8 | ✅ |
| 2 | 숫자 암호 | 다빈치 코드 | 2~4 | ✅ |
| 2 | 과일 종치기 | 할리갈리 | 2~6 | ✅ |
| 2 | 그림 릴레이 | 텔레스트레이션 | 4~10 | |
| 2 | 리버시 | 오델로 | 2 | ✅ |
| 3 | 보석 상인 | 스플렌더 | 2~4 | ✅ |
| 3 | 하룻밤 늑대인간 | 한밤의 늑대인간 | 3~10 | |
| 3 | 쿠데타 | 쿠 (Coup) | 2~6 | ✅ |

> 루미큐브·캐치마인드·아발론·코드네임·우노·다빈치 코드·할리갈리·텔레스트레이션·오델로·스플렌더·쿠 등은
> **등록 상표**라서 사이트에서는 다른 이름을 쓰고, 그림·카드 데이터도 모두 직접 만들었어요.
> 이름은 `public/js/catalog.js`에서 `name: '...'` 한 줄만 고치면 바꿀 수 있어요.

## 내 컴퓨터에서 실행하기

[Node.js](https://nodejs.org) 18 이상이 필요해요.

```bash
npm install
npm run dev
```

브라우저에서 <http://localhost:8787> 을 열면 됩니다. 창을 여러 개(시크릿 창 포함) 열면 혼자서도 여러 명처럼 테스트할 수 있어요.

게임 규칙 테스트: `npm test` (15개 게임을 각각 60판씩 무작위로 끝까지 진행하고, 아발론 테스트 43개도 함께 실행해요)

## 아발론 (화상 추리 게임)

`/avalon/` 주소에서 열리는 별도 게임이에요. 카메라·마이크로 얼굴을 보며 토론하고, 사회자 음성이 진행하며, 인원이 부족하면 CPU 기사를 넣을 수 있어요.
보드게임 모음집의 닉네임을 그대로 이어받고, 홈 화면 배너·게임 목록에서 바로 들어갈 수 있어요.

- **처음 배포하면 잠겨 있어요.** `https://내-주소/avalon/admin` 에서 관리자 비밀번호로 로그인한 뒤 **잠금 해제**를 눌러야 다른 사람이 들어올 수 있어요.
- 영상 연결(TURN) 사용량이 한 달 `TURN_MONTHLY_CAP_GB`(기본 800GB)를 넘으면 새 방을 막아 요금 폭탄을 방지해요.
- 아래 값은 **절대 GitHub에 올리지 말고** Cloudflare 대시보드 → Worker → **Settings → Variables and Secrets** 에서 *Secret* 으로 넣어 주세요.

| Secret 이름 | 용도 |
|---|---|
| `SITE_ADMIN_PASSWORD` | `/avalon/admin` 관리자 비밀번호 |
| `TURN_KEY_ID` / `TURN_KEY_API_TOKEN` | Cloudflare Realtime TURN 키 (영상이 안 붙는 네트워크용) |
| `CF_ACCOUNT_ID` / `CF_ANALYTICS_API_TOKEN` | TURN 사용량 조회 (800GB 제한 확인용) |

TURN 키가 없어도 대부분의 네트워크에서는 영상이 연결돼요. 내 컴퓨터에서 시험할 때는 `.dev.vars` 파일에 `SITE_ADMIN_PASSWORD=원하는비밀번호` 를 적으면 돼요 (이 파일은 GitHub에 올라가지 않아요).
자세한 내용은 `avalon/README.md`를 참고하세요.

## Cloudflare에 배포하기 (GitHub 연동)

이 사이트는 실시간 서버(Durable Object)를 쓰기 때문에 **Cloudflare Pages가 아니라 Cloudflare Workers**로 배포해요.
Workers도 GitHub에 올리면 자동으로 배포돼요.

1. 이 브랜치를 `main`에 합쳐(merge) 둡니다. (다른 브랜치로 배포하려면 5번에서 그 브랜치를 고르면 돼요)
2. [Cloudflare 대시보드](https://dash.cloudflare.com)에 가입/로그인합니다.
3. 왼쪽 메뉴 **Workers & Pages** → **Create** → **Import a repository** 를 누릅니다.
4. GitHub 계정을 연결하고 이 저장소(`game`)를 선택합니다.
5. 설정 화면에서
   - **Project name**: `boardgame-collection` (`wrangler.toml`의 `name`과 같아야 해요)
   - **Build command**: 비워 두기 (배포 전에 검사하고 싶으면 `npm install && npm test`)
   - **Deploy command**: `npx wrangler deploy` (기본값)
   - **Production branch**: `main`
6. **Deploy**를 누르면 1~2분 뒤 `https://boardgame-collection.<내-계정>.workers.dev` 주소가 생겨요.
7. 이후 GitHub에 push할 때마다 자동으로 다시 배포됩니다.
8. (선택) 내 도메인을 쓰려면 Worker 설정 → **Domains & Routes** → **Add → Custom domain**.

명령어로 직접 배포하려면:

```bash
npx wrangler login
npm run deploy
```

### 무료 플랜 안내

- Workers 무료 플랜: 하루 10만 요청
- Durable Objects(SQLite 저장소)도 무료 플랜에서 사용할 수 있어요 (하루 사용량 한도 있음)
- 이 사이트는 서버 객체 하나로 로비와 모든 방을 관리하고, 쉬는 동안에는 잠들도록(Hibernation) 만들어서
  무료 한도 안에서 운영하기 좋게 만들었어요.
- 사람이 많아져서 한도를 넘으면 Workers Paid(월 $5) 플랜으로 올리면 돼요.
- 새로 배포하면 접속이 잠깐 끊기지만, 방과 게임 상태는 저장되어 있어서 자동으로 다시 이어져요.
  (그림 맞히기·그림 릴레이의 그림 데이터는 저장하지 않아요)

## 폴더 구조

```
public/                 ← 화면 (그대로 배포되는 정적 파일)
  index.html
  css/style.css         ← 공통 디자인 (G마켓 산스, 상단 메뉴·슬라이드 배너·게임 카드·푸터, 모바일 레이아웃)
  css/games.css         ← 게임별 디자인
  fonts/                ← G마켓 산스 (woff2)
  js/app.js             ← 로비 · 방 · 채팅 · 대기실 화면
  js/catalog.js         ← 게임 목록/이름/순서/규칙/옵션 (서버와 공용)
  art/*.svg             ← 게임 키아트 (16:9 대표 이미지)
  js/art.js             ← 키아트 불러오기 (아발론은 표지·역할 초상화 조합)
  js/icons.js           ← 화면에 쓰는 선 아이콘
  avalon/               ← 아발론 화면 · 역할 그림
  js/draw.js            ← 그림판 (그림 맞히기 · 그림 릴레이)
  js/games/*.js         ← 게임별 화면
  js/shared/*.js        ← 서버와 화면이 함께 쓰는 규칙 (러미, 원카드, 요트, 보석 상인)
src/
  worker.js             ← Cloudflare Worker 진입점
  hub.js                ← 실시간 서버 (로비, 방, 채팅, 봇, 타이머, 저장)
  games/*.js            ← 게임별 규칙 (서버에서 판정 → 남의 패를 볼 수 없고 부정행위 방지)
  games/words.js        ← 라이어·그림 맞히기·단어 스파이 제시어 목록
avalon/src/             ← 아발론 서버 (방·게임 진행·CPU 기사·사이트 잠금)
avalon/test/            ← 아발론 테스트
test/games.test.js      ← 게임 규칙 테스트
```

## 자주 바꾸는 것

- **게임 이름·설명·규칙·인원·순서**: `public/js/catalog.js`
- **제시어 추가**: `src/games/words.js`
- **색상·글꼴 크기**: `public/css/style.css` 맨 위 `:root`
- **새 게임 추가**: `src/games/새게임.js`(규칙) → `src/games/index.js`(등록) → `catalog.js`(목록) → `public/art/새게임.svg`(대표 그림, 16:9) → `public/js/games/새게임.js`(화면)
