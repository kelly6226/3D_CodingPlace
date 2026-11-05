// 서비스 전체에서 쓰는 상수와 밈 데이터

export const PLACE = {
  id: 'pangyo',
  name: '판교 새벽 카페',
  short: '판교점',
};

/** 한 방(인스턴스)에 들어갈 수 있는 최대 인원. 넘치면 다음 호점으로 */
export const ROOM_CAP = 20;
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
