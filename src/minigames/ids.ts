// 게임 id 목록. 방 사람들에게 보내는 신기록 알림 검사(net/validate.ts)도 써서, 게임 코드와 떨어뜨려 가볍게 둬요

/** 게임을 더하거나 빼면 supabase/schema.sql 9번의 game 목록(check)과 game_score_max도 같이 바꿔요 */
export const GAME_IDS = ['deploy-guard', 'bug-catch', 'overtime-run', 'commit-maze'] as const;

export type GameId = (typeof GAME_IDS)[number];

export const isGameId = (v: unknown): v is GameId => typeof v === 'string' && (GAME_IDS as readonly string[]).includes(v);

/**
 * 게임 주소. /games는 오락기 목록, /games/<게임 id>는 그 게임을 열어요 (방 앱이 그대로 떠요).
 * 바꾸면 vercel.json rewrites도 같이 바꿔요
 */
export const GAMES_PATH = '/games';

/** 게임 링크 (링크 복사에 써요). game이 없으면 목록 */
export const gamesUrl = (game: GameId | null) => `${location.origin}${GAMES_PATH}${game ? `/${game}` : ''}`;

const GAMES_PATH_RE = new RegExp(`^${GAMES_PATH}(?:/([\\w-]+))?/?$`);

/** 주소가 게임 주소면 열 게임(없거나 모르는 id면 null = 목록), 아니면 undefined */
export function gameFromPath(path: string): { game: GameId | null } | undefined {
  const m = path.match(GAMES_PATH_RE);
  if (!m) return undefined;
  return { game: isGameId(m[1]) ? m[1] : null };
}
