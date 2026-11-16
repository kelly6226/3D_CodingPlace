// 스코어 판 서버 함수 부르기 (supabase/schema.sql 9번)
// 이어하기(sync/api.ts)처럼 Supabase 클라이언트를 하나 더 만들지 않고 RPC 주소를 바로 불러요.
import type { GameId } from './catalog';

/** 판에 이름을 올릴 나. id는 이 브라우저의 무작위 번호예요 (방에서 쓰는 것과 같아요) */
export interface Player {
  id: string;
  name: string;
  color: string;
}

export interface BoardRow {
  rank: number;
  name: string;
  color: string;
  score: number;
  mine: boolean;
}

export interface Board {
  top: BoardRow[];
  /** 이번 주에 내 기록이 있으면 내 순위 */
  me: { rank: number; score: number } | null;
}

/** 이번 주 1위 */
export interface Leader {
  name: string;
  score: number;
}

/** 점수를 올린 뒤 이번 주 내 순위와 1위 */
export interface SubmitResult {
  rank: number;
  score: number;
  top: Leader | null;
}

/** 실패 이유. 화면 문구는 부르는 쪽(arcade.ts)이 정해요 */
export type ScoreFailure = 'bad_name' | 'busy' | 'offline' | 'server';

export class ScoreError extends Error {
  constructor(
    readonly reason: ScoreFailure,
    detail: string,
  ) {
    super(detail);
  }
}

const COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const FALLBACK_COLOR = '#a2a6b4';

/** 서버가 준 값을 화면에 그려도 되는 모양으로 */
function cleanRank(raw: unknown): { rank: number; score: number } | null {
  if (!raw || typeof raw !== 'object') return null;
  const { rank, score } = raw as Record<string, unknown>;
  if (!Number.isInteger(rank) || !Number.isInteger(score)) return null;
  return { rank: rank as number, score: score as number };
}

function cleanLeader(raw: unknown): Leader | null {
  if (!raw || typeof raw !== 'object') return null;
  const { name, score } = raw as Record<string, unknown>;
  if (typeof name !== 'string' || !name.trim() || !Number.isInteger(score)) return null;
  return { name: name.slice(0, 20), score: score as number };
}

function cleanRow(raw: unknown): BoardRow | null {
  const ranked = cleanRank(raw);
  if (!ranked) return null;
  const { name, color, mine } = raw as Record<string, unknown>;
  if (typeof name !== 'string' || !name.trim()) return null;
  return { ...ranked, name: name.slice(0, 20), color: typeof color === 'string' && COLOR_RE.test(color) ? color : FALLBACK_COLOR, mine: mine === true };
}

function cleanBoard(raw: unknown): Board {
  const { top, me } = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const rows = Array.isArray(top) ? top.map(cleanRow).filter((r): r is BoardRow => r !== null) : [];
  return { top: rows, me: cleanRank(me) };
}

/** schema.sql에서 raise exception 하는 문구로 이유를 나눠요 */
function failureOf(detail: string): ScoreFailure {
  if (detail.includes('bad name')) return 'bad_name';
  if (detail.includes('too many')) return 'busy';
  return 'server';
}

export class ScoreApi {
  constructor(
    private url: string,
    private key: string,
  ) {}

  /** 이번 판 점수를 올려요. 서버는 이번 주 내 최고 점수만 남기고, 내 순위와 1위를 돌려줘요 */
  async submit(game: GameId, player: Player, score: number): Promise<SubmitResult> {
    const raw = await this.rpc('submit_game_score', { p_game: game, p_player: player.id, p_name: player.name, p_color: player.color, p_score: score });
    const ranked = cleanRank(raw);
    if (!ranked) throw new ScoreError('server', 'bad response');
    return { ...ranked, top: cleanLeader((raw as Record<string, unknown>).top) };
  }

  /** 게임마다 이번 주 1위 (목록에 보여줄 것) */
  async leaders(): Promise<Partial<Record<GameId, Leader>>> {
    const raw = await this.rpc('game_leaders', {});
    const out: Partial<Record<GameId, Leader>> = {};
    if (!raw || typeof raw !== 'object') return out;
    for (const [game, value] of Object.entries(raw)) {
      const leader = cleanLeader(value);
      if (leader) out[game as GameId] = leader;
    }
    return out;
  }

  /** 이 게임의 이번 주 TOP 10과 내 순위 */
  async board(game: GameId, playerId: string): Promise<Board> {
    return cleanBoard(await this.rpc('game_board', { p_game: game, p_player: playerId }));
  }

  private async rpc(fn: string, args: object): Promise<unknown> {
    let res: Response;
    try {
      res = await fetch(`${this.url}/rest/v1/rpc/${fn}`, {
        method: 'POST',
        // supabase-js와 같은 머리글 (publishable 키로 anon 역할이 돼요)
        headers: { apikey: this.key, Authorization: `Bearer ${this.key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(args),
      });
    } catch (e) {
      throw new ScoreError('offline', String(e));
    }
    if (res.ok) return res.json();
    const detail = await res.text().catch(() => '');
    throw new ScoreError(failureOf(detail), `${fn} ${res.status} ${detail}`);
  }
}
