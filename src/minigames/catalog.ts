// 탕비실 오락기에 있는 게임들. 목록에 보일 글만 여기 두고, 게임 코드와 시작 화면 설명은 고를 때 받아와요
import { overtimeClock } from './overtimeClock';
import type { SpriteName } from './sprites';
import type { GameModule } from './types';

/** 게임을 더하거나 빼면 supabase/schema.sql 9번의 game 목록(check)과 game_score_max도 같이 바꿔요 */
export type GameId = 'deploy-guard' | 'bug-catch' | 'overtime-run' | 'commit-maze';

export interface GameDef {
  id: GameId;
  icon: SpriteName;
  title: string;
  /** 목록에 보일 한 줄 */
  tagline: string;
  /** 점수를 사람이 읽는 글로 ('손 12개', '밤 11:42') */
  formatScore(score: number): string;
  /** 게임 코드를 받아와요 (처음 고를 때 한 번) */
  load(): Promise<GameModule>;
}

export const GAMES: readonly GameDef[] = [
  {
    id: 'deploy-guard',
    icon: 'hand',
    title: '금요일 배포 막기',
    tagline: '금요일 6시, 배포 버튼으로 손이 뻗어 와요',
    formatScore: (n) => `손 ${n}개 막음`,
    load: () => import('./games/deployGuard').then((m) => m.deployGuard),
  },
  {
    id: 'bug-catch',
    icon: 'bug0',
    title: '버그 잡기',
    tagline: '30초 동안 에디터에 기어 나온 버그 잡기',
    formatScore: (n) => `${n}점`,
    load: () => import('./games/bugCatch').then((m) => m.bugCatch),
  },
  {
    id: 'overtime-run',
    icon: 'run0',
    title: '야근 러너',
    tagline: '회의·멘션·핫픽스를 넘어 몇 시까지 버틸까',
    formatScore: (n) => `${overtimeClock(n)}까지`,
    load: () => import('./games/overtimeRunner').then((m) => m.overtimeRunner),
  },
  {
    id: 'commit-maze',
    icon: 'me',
    title: '커밋 미로',
    tagline: '회의와 장애 알림을 피해 커밋을 다 모아요',
    formatScore: (n) => `${n}점`,
    load: () => import('./games/commitMaze').then((m) => m.commitMaze),
  },
];
