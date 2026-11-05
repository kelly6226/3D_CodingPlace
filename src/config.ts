// 서비스 전체에서 쓰는 상수와 밈 데이터

/** 사이트 이름과 소개 (index.html의 메타 태그와 같게) */
export const SITE = {
  name: '온라인 모각코',
  title: '온라인 모각코 · 혼자 하면 야근, 같이 하면 모각코',
  /** 개인정보 문의·계정 삭제 요청 받는 곳 (public/privacy.html에도 같은 주소) */
  contact: 'code_alone_together@naver.com',
};

/** 브라우저 탭 제목: 기본 방은 사이트 제목, 다른 방은 방 이름을 앞에 */
export const pageTitle = (room: { slug: string; name: string }) => (room.slug === DEFAULT_ROOM ? SITE.title : `${room.name} · ${SITE.name}`);

/** 방 하나가 꽉 차면 2호점, 3호점… 으로 나눠요. 몇 호점까지 열지 (한 호점 정원은 장소마다 PLACES의 cap) */
export const MAX_INSTANCE = 9;

export const SPRINT_PRESETS = [
  { id: '25', label: '25분 집중 · 5분 휴식', focus: 25, rest: 5 },
  { id: '50', label: '50분 집중 · 10분 휴식', focus: 50, rest: 10 },
] as const;

export interface StatusDef {
  id: string;
  emoji: string;
  label: string;
}

export const STATUSES: StatusDef[] = [
  { id: 'coding', emoji: '💻', label: '코딩 중' },
  { id: 'bug', emoji: '🐛', label: '버그 잡는 중' },
  { id: 'hotfix', emoji: '🔥', label: '핫픽스 중' },
  { id: 'review', emoji: '👀', label: '코드리뷰 중' },
  { id: 'study', emoji: '📚', label: '공부 중' },
  { id: 'design', emoji: '🧠', label: '설계 고민 중' },
  { id: 'duck', emoji: '🦆', label: '오리랑 대화 중' },
  { id: 'deploy', emoji: '📦', label: '배포 기다리는 중' },
  { id: 'pray', emoji: '🙏', label: '빌드 기도 중' },
  { id: 'overtime', emoji: '😵', label: '야근 중' },
  { id: 'meal', emoji: '🍜', label: '밥 먹는 중' },
  { id: 'away', emoji: '💤', label: '자리 비움' },
];

export const statusById = (id: string): StatusDef =>
  STATUSES.find((s) => s.id === id) ?? STATUSES[0];

export interface EmoteDef {
  id: string;
  emoji: string;
  label: string;
}

export const EMOTES: EmoteDef[] = [
  { id: 'lgtm', emoji: '👍', label: 'LGTM' },
  { id: 'fire', emoji: '🔥', label: '불났다' },
  { id: 'ship', emoji: '🎉', label: '배포 성공' },
  { id: 'pray', emoji: '🙏', label: '제발 돼라' },
  { id: 'why-works', emoji: '🤯', label: '왜 되지?' },
  { id: 'why-not', emoji: '😇', label: '왜 안 되지?' },
  { id: 'coffee', emoji: '☕', label: '커피 수혈' },
  { id: 'wave', emoji: '👋', label: '안녕하세요' },
];

export const emoteById = (id: string): EmoteDef | undefined => EMOTES.find((e) => e.id === id);

export interface LangDef {
  id: string;
  label: string;
  color: string;
}

export const LANGS: LangDef[] = [
  { id: 'ts', label: 'TypeScript', color: '#3178c6' },
  { id: 'js', label: 'JavaScript', color: '#f1d538' },
  { id: 'py', label: 'Python', color: '#3776ab' },
  { id: 'go', label: 'Go', color: '#00add8' },
  { id: 'rs', label: 'Rust', color: '#dea584' },
  { id: 'java', label: 'Java', color: '#b07219' },
  { id: 'kt', label: 'Kotlin', color: '#a97bff' },
  { id: 'swift', label: 'Swift', color: '#f05138' },
  { id: 'cpp', label: 'C++', color: '#f34b7d' },
  { id: 'rb', label: 'Ruby', color: '#cc342d' },
  { id: 'dart', label: 'Dart', color: '#00b4ab' },
  { id: 'html', label: 'HTML (프로그래밍 언어 맞음)', color: '#e34c26' },
];

export const langById = (id: string): LangDef => LANGS.find((l) => l.id === id) ?? LANGS[0];

export const HOODIE_COLORS = [
  '#3b4a6b', // 네이비
  '#6b7a52', // 올리브
  '#8c4a4a', // 버건디
  '#d9d3c7', // 오트밀
  '#2f2f35', // 블랙
  '#c9873a', // 머스타드
  '#5b7fa6', // 스카이
  '#7a5a8c', // 보라
];

export const HAIR_COLORS = ['#1d1a18', '#2b2220', '#4a3426', '#6b4a2e', '#262a33', '#3a2e2a'];
export const SKIN_TONES = ['#f3d2b8', '#eac3a3', '#d9a988', '#c68f6c', '#f6dcc6'];

export const DEFAULT_NAMES = [
  '야근하는 주니어',
  '레거시 수호자',
  'console.log 장인',
  'PR 리뷰 대기자',
  '세미콜론 수집가',
  '풀스택 고양이',
  '익명의 시니어',
  '다크모드 신봉자',
  '잔디 농부',
  '주석 없는 개발자',
  'Vim 탈출 실패자',
  '도커 선장',
  '스택오버플로 순례자',
  '탭파 대표',
  '스페이스파 대표',
  '사이드 프로젝트 7개',
];

export const COMMIT_TYPES = ['feat', 'fix', 'chore', 'refactor', 'docs', 'test', 'hotfix', 'revert', 'wip'];

export const BOT_COMMITS = [
  'fix: 진짜 마지막 수정',
  'fix: 진짜진짜 마지막 수정',
  'feat: 일단 돌아감',
  'chore: 주석 지움 (이유는 묻지 마세요)',
  'revert: 어제의 나',
  'fix: typo',
  'wip',
  'refactor: 아무도 모르게 고침',
  'hotfix: 금요일 오후 6시',
  'docs: README에 TODO 추가',
  'test: 테스트는 다음 스프린트에',
  'feat: 버튼 색 바꿈 (PM 요청 3차)',
  'fix: 내 컴퓨터에선 됐는데',
  'chore: console.log 237개 삭제',
  'feat: 다크모드 추가 (필수)',
  'fix: 왜 되는지 모르겠지만 됨',
  'style: 탭을 스페이스로 (전쟁 선포)',
  'perf: 0.001초 빨라짐',
  'fix: 시간대 버그 (또)',
  'feat: AI 붙임',
];

export const DUCK_LINES = [
  '꽥. 그 변수, 진짜 그 값 맞아?',
  '꽥. 로그는 찍어봤어?',
  '꽥. 캐시 지워봤어?',
  '꽥. 껐다 켜봤어?',
  '꽥. 에러 메시지 끝까지 읽었어?',
  '꽥. 어제는 됐다며?',
  '꽥. 그거 오타 아니야?',
  '꽥. 일단 커밋하고 생각하자.',
  '꽥. 문서에 써 있을걸.',
  '꽥. 혹시 환경변수…?',
  '꽥. 타임존 문제야. 항상 타임존이야.',
  '꽥. 한 줄씩 나한테 설명해봐.',
];

export const RACK_LINES = [
  '🔒 prod 서버예요. 만지면 안 돼요.',
  '🔒 사장님이 개발자 출신이라 카페에 서버가 있어요.',
  '🔒 LED가 초록색이면 평화로운 거예요.',
  '🔒 여기 있는 건 레거시 서버예요. 아무도 구조를 몰라요.',
];

export const COFFEE_LINES = [
  '☕ 카페인 +1. 코드 변환 효율이 올라갑니다.',
  '☕ 아메리카노 = 코드 1,000줄',
  '☕ 커피를 코드로 바꾸는 중…',
  '☕ 오늘도 수혈 완료',
];

// ── 방 ───────────────────────────────────────────

export interface RoomTag {
  id: string;
  label: string;
}

/** 방에 붙일 수 있는 주제 태그 (DB 체크 조건과 같아야 함: supabase/schema.sql) */
export const ROOM_TAGS: RoomTag[] = [
  { id: 'free', label: '자유' },
  { id: 'frontend', label: '프론트엔드' },
  { id: 'backend', label: '백엔드' },
  { id: 'mobile', label: '앱' },
  { id: 'ai', label: 'AI·데이터' },
  { id: 'algo', label: '알고리즘' },
  { id: 'job', label: '취준·이직' },
  { id: 'side', label: '사이드 프로젝트' },
  { id: 'study', label: '공부' },
];

export const tagLabel = (id: string) => ROOM_TAGS.find((t) => t.id === id)?.label ?? id;

export interface RoomInfo {
  slug: string;
  name: string;
  tags: string[];
  isPublic: boolean;
  /** 어느 장소인지 (PLACES의 id) */
  place: PlaceId;
  builtin?: boolean;
  creator?: string;
  createdAt?: number;
}

/** 처음부터 있는 방들. DB에 없어도 늘 목록에 떠요 */
export const BUILTIN_ROOMS: RoomInfo[] = [
  { slug: 'pangyo', name: '판교 새벽 카페', tags: ['free'], isPublic: true, builtin: true, place: 'cafe' },
  { slug: 'frontend', name: '프론트엔드 방', tags: ['frontend'], isPublic: true, builtin: true, place: 'cafe' },
  { slug: 'backend', name: '백엔드 방', tags: ['backend'], isPublic: true, builtin: true, place: 'serverroom' },
  { slug: 'algo', name: '코테 준비방', tags: ['algo', 'job'], isPublic: true, builtin: true, place: 'studio' },
  { slug: 'side', name: '사이드 프로젝트 방', tags: ['side'], isPublic: true, builtin: true, place: 'hackathon' },
];

export const DEFAULT_ROOM = 'pangyo';
export const ROOM_SLUG_RE = /^[a-z0-9-]{3,32}$/;

export const builtinRoom = (slug: string) => BUILTIN_ROOMS.find((r) => r.slug === slug);

export function newRoomSlug(): string {
  const abc = 'abcdefghijkmnpqrstuvwxyz23456789';
  let s = '';
  for (let i = 0; i < 8; i++) s += abc[Math.floor(Math.random() * abc.length)];
  return s;
}

/** 방 주소: /r/<slug>. 기본 방은 루트에서도 열림 */
export function roomUrl(slug: string): string {
  return `${location.origin}/r/${slug}`;
}

// ── 장소 ─────────────────────────────────────────
// 3D 모델은 src/world/places/ 에 있고, 여기엔 화면 글자와 숫자만 있어요.
// id는 supabase/schema.sql의 rooms_place_check와 같아야 해요.

export type PlaceId = 'cafe' | 'serverroom' | 'studio' | 'hackathon';

export interface PlaceMeta {
  id: PlaceId;
  name: string;
  emoji: string;
  /** 입장 화면 맨 위 한 줄 */
  tagline: string;
  /** 방 만들기에서 보이는 설명 */
  desc: string;
  /** 한 호점 정원 */
  cap: number;
  /** 하단 액션바의 먹고 마시기 버튼 */
  use: { emoji: string; label: string; making: string; unit: string; lines: string[] };
  /** 배포 버튼: 확인 창 글자, 참았을 때(calm), 경보(alarm, {name}에 누른 사람), 복구(done) */
  deploy: { confirmTitle: string; confirmBody: string; yes: string; no: string; calm: string; alarm: string; done: string };
}

export const PLACES: PlaceMeta[] = [
  {
    id: 'cafe',
    name: '판교 새벽 카페',
    emoji: '☕',
    tagline: '판교 새벽 카페 · 24시간 영업',
    desc: '창밖에 판교의 등대. 긴 테이블과 창가 바',
    cap: 20,
    use: {
      emoji: '☕',
      label: '커피',
      making: '☕ 내리는 중…',
      unit: '잔째',
      lines: COFFEE_LINES,
    },
    deploy: {
      confirmTitle: '정말 배포하시겠어요?',
      confirmBody: '이 버튼은 언제 눌러도 금요일 배포예요. 방에 있는 모두에게 장애 경보가 울려요.',
      yes: '배포한다',
      no: '참는다',
      calm: '현명한 선택이에요. 배포는 월요일 오전에.',
      alarm: '🚨 [P1] prod 장애 발생 · {name}님이 배포 버튼을 눌렀어요',
      done: '✅ 롤백 완료. 오늘도 평화로운 판교예요.',
    },
  },
  {
    id: 'serverroom',
    name: '서버실',
    emoji: '🖥️',
    tagline: 'B2 서버실 · 출입 기록 남음',
    desc: '18°C, 팬 소리, 랙 사이 접이식 테이블',
    cap: 12,
    use: {
      emoji: '🥤',
      label: '음료',
      making: '🥤 자판기 덜컹…',
      unit: '캔째',
      lines: [
        '🥤 에너지 드링크 +1. 서버실은 음료 반입 금지인데…',
        '🥤 자판기가 동전을 먹었어요. 한 번 더 눌렀더니 나왔어요',
        '🥤 차가운 게 나왔어요. 여긴 다 차가워요',
      ],
    },
    deploy: {
      confirmTitle: 'EPO를 누르시겠어요?',
      confirmBody: '비상 전원 차단(EPO) 버튼이에요. 누르면 서버실 전원이 전부 내려가요. 방에 있는 모두에게 경보가 울려요.',
      yes: '누른다',
      no: '손 뗀다',
      calm: '손 뗐어요. 오늘도 서버실은 평화로워요.',
      alarm: '🚨 [P0] 서버실 전원 차단 · {name}님이 EPO를 눌렀어요',
      done: '✅ UPS가 버텼어요. 전원 복구 완료',
    },
  },
  {
    id: 'studio',
    name: '새벽 2시 원룸',
    emoji: '🛏️',
    tagline: '새벽 2시 원룸 · 층간소음 주의',
    desc: '모니터 불빛만 켜진 작은 방. 침대, 컵라면, 고양이',
    cap: 8,
    use: {
      emoji: '🍜',
      label: '컵라면',
      making: '🍜 물 붓고 3분…',
      unit: '개째',
      lines: [
        '🍜 컵라면 완성. 국물은 키보드에서 멀리',
        '🍜 새벽 2시 컵라면은 0칼로리래요',
        '🍜 면이 불었어요. 코드 리뷰가 길어서',
      ],
    },
    deploy: {
      confirmTitle: '집에서 배포하시겠어요?',
      confirmBody: 'VPN 연결이 안 된 것 같은데요… 새벽 2시예요. 방에 있는 모두에게 경보가 울려요.',
      yes: '배포한다',
      no: '내일 할래',
      calm: '내일 출근해서 하기로 해요. 일단 자요.',
      alarm: '🚨 [P1] {name}님이 새벽 2시에 집에서 prod 배포함',
      done: '✅ 일단 롤백 완료. 출근하면 혼날 예정',
    },
  },
  {
    id: 'hackathon',
    name: '해커톤장',
    emoji: '🏆',
    tagline: 'HACK THE NIGHT · 데모까지 얼마 안 남음',
    desc: '팀 테이블 4개, 피자 탑, 카운트다운 전광판',
    cap: 20,
    use: {
      emoji: '🍕',
      label: '피자',
      making: '🍕 식은 피자 고르는 중…',
      unit: '조각째',
      lines: [
        '🍕 피자 한 조각. 이미 식었어요',
        '🍕 마지막 한 조각은 아무도 안 먹어요',
        '🍕 페퍼로니 하나 먹고 버그 하나 고침',
      ],
    },
    deploy: {
      confirmTitle: '최종 제출하시겠어요?',
      confirmBody: '데모가 아직 안 되는 것 같은데요. 방에 있는 모두에게 경보가 울려요.',
      yes: '제출한다',
      no: '조금만 더',
      calm: '조금만 더 다듬어요. 아직 시간 있어요.',
      alarm: '🚨 제출 서버 다운 · {name}님이 마감 3초 전에 제출했어요',
      done: '✅ 운영진: 마감을 30분 연장합니다',
    },
  },
];

export const placeMeta = (id?: string | null): PlaceMeta => PLACES.find((p) => p.id === id) ?? PLACES[0];
export const isPlaceId = (id: unknown): id is PlaceId => PLACES.some((p) => p.id === id);
