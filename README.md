# 온라인 모각코 · 판교 새벽 카페

모여서 각자 코딩하는 3D 웹 공간이에요. 판교 어딘가, 밤새 불이 안 꺼지는 카페에 앉아서 같이 코딩해요. 말은 안 해도 괜찮아요.

[온라인 순례길](https://online-camino.com)과 [산사](https://sansatemple.com)처럼 "말없이 같이 있기" 장르를 개발자 버전으로 만든 거예요.

## 카페에 있는 것들

| 장소 / 물건 | 하는 일 |
|---|---|
| 창가 바 자리 · 긴 테이블 · 빈백 · 스탠딩 데스크 | 18자리. 의자를 누르면 걸어가서 앉고 노트북을 펴요 |
| 창밖 판교 야경 | 새벽에도 불 켜진 오피스, 일명 "판교의 등대" |
| 🚨 금요일 배포 버튼 | 누르면 방 전체에 장애 경보가 울리고, 7초 뒤 롤백돼요 (1분 쿨타임) |
| ☕ 커피 카운터 | 커피를 코드로 바꾸는 곳. 오늘 마신 잔 수가 기록돼요 |
| 🦆 러버덕 상담소 | 누르면 "꽥. 캐시 지워봤어?" 같은 디버깅 질문을 던져요 |
| 📺 git log TV | 사람들이 남긴 커밋 메시지가 올라가는 방명록 |
| 화이트보드 | 앞면 "It works on my machine", 뒷면 TODO (리팩토링은 2019년부터 예정) |
| 서버랙 | prod 서버. 만지지 마시오. 장애 나면 LED가 빨개져요 |
| 벽시계 두 개 | KST랑 UTC (서버는 UTC, 타임존 버그 주의) |
| 판교 사투리 사전 | 얼라인 = 맞춰보자, ASAP = 어제까지 |

**내 행동**: 상태 표시(🐛 버그 잡는 중, 🦆 오리랑 대화 중…), 이모트(👍 LGTM, 🔥 불났다…), 스프린트(뽀모도로 25/50분), 잔디(완료한 스프린트가 GitHub 잔디처럼 쌓임), 다른 사람한테 손 흔들기. 앉아 있을 때 진짜 키보드를 치면 아바타도 열심히 쳐요. 무슨 키를 눌렀는지는 보지 않아요.

## 로컬에서 실행

Node 18 이상이 필요해요.

```bash
npm install
npm run dev
```

http://localhost:5173 을 열면 돼요. Supabase 키가 없으면 **데모 모드**로 떠요. 봇 손님들이 자리를 옮기고, 커피를 마시고, 가끔 배포 버튼도 눌러요. 주소 뒤에 `?demo=1`을 붙이면 키가 있어도 데모 모드로 볼 수 있어요.

## 실시간 멀티플레이 켜기 (Supabase)

1. [supabase.com](https://supabase.com)에서 새 프로젝트를 만들어요. 리전은 `Northeast Asia (Seoul)`을 추천해요.
2. **SQL Editor**에 `supabase/schema.sql` 내용을 붙여넣고 Run 해요. 커밋 방명록 테이블이 생겨요.
3. **Project Settings → API Keys**에서 Project URL이랑 **publishable** 키를 복사해요. 예전 프로젝트라면 `anon` 키예요.
4. 프로젝트 루트에 `.env.local`을 만들어요.
   ```
   VITE_SUPABASE_URL=https://xxxx.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxxx
   ```
5. `npm run dev`를 다시 켜고 브라우저 창 두 개로 열어보면 서로 보여요.

연결이 안 되면 Supabase 대시보드의 **Realtime → Settings**에서 public 채널 접근이 허용돼 있는지 확인해요.

## Vercel 배포

1. 이 저장소를 GitHub에 push 해요.
2. [vercel.com/new](https://vercel.com/new)에서 저장소를 Import 해요. Vite로 자동 인식돼요 (`vercel.json`에도 적혀 있어요).
3. **Settings → Environment Variables**에 위 두 값(`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`)을 넣어요.
4. **Redeploy** 해요. Vite는 빌드할 때 환경변수를 코드에 박아 넣어서, 변수를 바꾼 뒤엔 꼭 다시 빌드해야 해요.

키를 안 넣고 배포하면 데모 모드로 올라가요.

## 비용

| | 무료 범위 | 넘으면 |
|---|---|---|
| Vercel Hobby | 전송량 월 100GB. **비상업용만 가능** | Pro 월 $20 |
| Supabase Free | 동시 접속 200명, 실시간 메시지 월 200만 건, DB 500MB. 일주일 동안 아무도 안 들어오면 일시정지 | Pro 월 $25 |

후원 버튼이나 광고를 붙이면 Vercel은 Pro가 필요해요. 메시지를 아끼려고 이동은 클릭할 때만 보내고, 타자 모션이랑 키보드 소리는 각자 브라우저에서 만들어요.

## 구조

```
src/
  main.ts            입장, 내 행동, 다른 사람 이벤트 처리, 스프린트
  config.ts          장소 이름, 상태·이모트·언어 목록, 밈 문구 (여기만 고쳐도 분위기가 바뀜)
  store.ts           브라우저에 저장하는 개인 기록 (프로필, 잔디, 커피)
  audio.ts           빗소리·타자·사이렌·꽥 (Web Audio로 합성, 파일 없음)
  net/
    types.ts         온라인/데모 공통 인터페이스
    online.ts        Supabase Realtime (Presence + Broadcast) + commits 테이블
    demo.ts          키가 없을 때 봇 손님 시뮬레이션
  world/
    layout.ts        카페 배치도: 자리, 가구, 걸을 수 없는 곳 (3D 코드 없음)
    pathfinding.ts   0.2m 격자 A* 길찾기
    room.ts          인테리어 3D 모델 (전부 코드로 만든 도형)
    skyline.ts       창밖 판교 야경, 비, 도로
    textures.ts      캔버스로 그리는 텍스처 (화이트보드, 메뉴판, git log TV…)
    avatar.ts        후드티 개발자 아바타 + 노트북
    world.ts         렌더러, 카메라, 클릭 처리
  ui/ui.ts           HUD, 하단 액션바, 시트, 토스트
supabase/schema.sql  방명록 테이블 + RLS + 도배 방지
```

외부 3D 모델이나 이미지 파일은 하나도 없어요. 전부 Three.js 기본 도형이랑 캔버스로 그려서 저작권 걱정이 없어요.

**실시간 구조**: 방 하나는 Supabase 채널 하나(`mogakco:pangyo:1`)예요. 누가 어디 앉아 있는지는 Presence로, 이동·이모트·배포 버튼은 Broadcast로 보내요. 한 방에 20명이 넘으면 늦게 온 사람은 2호점으로 자동으로 넘어가요 (`?room=pangyo-2`).

## 다음에 해볼 만한 것

- 장소 추가: 새벽 2시 원룸, 해커톤장, 서버실 (`layout.ts` + `room.ts`를 장소별로 분리)
- 닉네임·커밋 메시지 욕설 필터
- 같이 집중한 시간 랭킹 (Supabase 테이블 하나 더)
- 로그인 붙여서 잔디를 기기 간 동기화
