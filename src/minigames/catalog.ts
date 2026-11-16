// 탕비실 오락기에 있는 게임들. 목록에 보일 글자만 여기 두고, 게임 코드는 고를 때 받아와요
import { overtimeClock } from './overtimeClock';
import type { GameRound } from './types';

/** 게임을 더하거나 빼면 supabase/schema.sql 9번의 game 목록(check)과 game_score_max도 같이 바꿔요 */
export type GameId = 'deploy-guard' | 'bug-catch' | 'overtime-run' | 'commit-maze';

export interface GameDef {
  id: GameId;
  emoji: string;
  title: string;
  howTo: string;
  /** 점수를 사람이 읽는 글로 ('손 12개', '밤 11:42') */
  formatScore(score: number): string;
  /** 게임 코드를 받아와서 새 판을 만드는 함수를 돌려줘요 */
  load(): Promise<() => GameRound>;
}

export const GAMES: readonly GameDef[] = [
  {
    id: 'deploy-guard',
    emoji: '🚫',
    title: '금요일 배포 막기',
    howTo: '배포 버튼으로 뻗어 오는 손을 눌러 막아요. ✅ QA 통과 도장이 찍힌 손은 보내 줘요.',
    formatScore: (n) => `손 ${n}개 막음`,
    load: () => import('./games/deployGuard').then((m) => m.createDeployGuard),
  },
  {
    id: 'bug-catch',
    emoji: '🐛',
    title: '버그 잡기',
    howTo: '30초 동안 기어 나오는 버그를 눌러 잡아요. 🪳 프로덕션 버그는 점수가 크고, 🦋는 기능이라 잡으면 깎여요.',
    formatScore: (n) => `${n}점`,
    load: () => import('./games/bugCatch').then((m) => m.createBugCatch),
  },
  {
    id: 'overtime-run',
    emoji: '🏃',
    title: '야근 러너',
    howTo: '화면을 누르거나 스페이스로 뛰어서 회의·멘션·핫픽스를 넘어요. ☕를 마시면 더 오래 버텨요.',
    formatScore: (n) => `${overtimeClock(n)}까지`,
    load: () => import('./games/overtimeRunner').then((m) => m.createOvertimeRunner),
  },
  {
    id: 'commit-maze',
    emoji: '🟩',
    title: '커밋 미로',
    howTo: '방향키나 쓸어넘기기로 미로를 돌며 커밋을 다 먹어요. 📅 회의·🙋 질문·🚨 장애 알림을 피하고, ☕를 마시면 잠깐 거꾸로 잡을 수 있어요.',
    formatScore: (n) => `${n}점`,
    load: () => import('./games/commitMaze').then((m) => m.createCommitMaze),
  },
];
