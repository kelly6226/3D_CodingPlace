// 게임 id 목록. 방 사람들에게 보내는 신기록 알림 검사(net/validate.ts)도 써서, 게임 코드와 떨어뜨려 가볍게 둬요

/** 게임을 더하거나 빼면 supabase/schema.sql 9번의 game 목록(check)과 game_score_max도 같이 바꿔요 */
export const GAME_IDS = ['deploy-guard', 'bug-catch', 'overtime-run', 'commit-maze'] as const;

export type GameId = (typeof GAME_IDS)[number];

export const isGameId = (v: unknown): v is GameId => typeof v === 'string' && (GAME_IDS as readonly string[]).includes(v);
