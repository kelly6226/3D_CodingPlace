// 스코어 판 서버 함수 부르기 (supabase/schema.sql 9번)
// 이어하기(sync/api.ts)처럼 Supabase 클라이언트를 하나 더 만들지 않고 RPC 주소를 바로 불러요.
import type { GameId } from './catalog';

/** 판에 올릴 내 이름표 */
export interface Player {
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

/** 명예의 전당 한 줄 (지난 어느 주의 1~3위) */
export interface HallRow {
  rank: number;
  name: string;
  color: string;
  score: number;
  /** 그 주까지 이 게임에서 1위를 한 횟수 */
  wins: number;
  /** 1위면 그 주까지 몇 주 연속 1위인지 (1위가 아니면 0) */
  streak: number;
  mine: boolean;
}

export interface HallWeek {
  /** 그 주 월요일 (YYYY-MM-DD, KST) */
  week: string;
  rows: HallRow[];
}

/** 이 게임의 명예의 전당: 최근 주들(최근 순)과 역대 최다 우승 */
export interface Hall {
  weeks: HallWeek[];
  most: { name: string; color: string; wins: number; mine: boolean } | null;
}

/** 지난주 1위 */
export interface Champion {
  name: string;
  score: number;
  /** 그 주까지 1위를 한 횟수 */
  wins: number;
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
const WEEK_RE = /^\d{4}-\d{2}-\d{2}$/;

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const count = (v: unknown) => (Number.isInteger(v) && (v as number) >= 0 ? (v as number) : 0);
const colorOf = (v: unknown) => (typeof v === 'string' && COLOR_RE.test(v) ? v : FALLBACK_COLOR);

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
  return { ...ranked, name: name.slice(0, 20), color: colorOf(color), mine: mine === true };
}

function cleanBoard(raw: unknown): Board {
  const { top, me } = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const rows = Array.isArray(top) ? top.map(cleanRow).filter((r): r is BoardRow => r !== null) : [];
  return { top: rows, me: cleanRank(me) };
}

function cleanHallRow(raw: unknown): HallRow | null {
  const row = cleanRow(raw);
  if (!row || !isObj(raw)) return null;
  return { ...row, wins: count(raw.wins), streak: count(raw.streak) };
}

function cleanHall(raw: unknown): Hall {
  const { weeks, most } = isObj(raw) ? raw : {};
  const cleanWeeks = (Array.isArray(weeks) ? weeks : []).flatMap((w): HallWeek[] => {
    if (!isObj(w) || typeof w.week !== 'string' || !WEEK_RE.test(w.week)) return [];
    const rows = (Array.isArray(w.rows) ? w.rows : []).map(cleanHallRow).filter((r): r is HallRow => r !== null);
    return rows.length ? [{ week: w.week, rows }] : [];
  });
  const mostOk = isObj(most) && typeof most.name === 'string' && most.name.trim() && count(most.wins) > 0;
  return {
    weeks: cleanWeeks,
    most: mostOk ? { name: (most.name as string).slice(0, 20), color: colorOf(most.color), wins: count(most.wins), mine: most.mine === true } : null,
  };
}

function cleanChampion(raw: unknown): Champion | null {
  const leader = cleanLeader(raw);
  if (!leader || !isObj(raw)) return null;
  return { ...leader, wins: count(raw.wins) };
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
  async submit(game: GameId, key: string, player: Player, score: number): Promise<SubmitResult> {
    const raw = await this.rpc('submit_game_score', { p_game: game, p_player: key, p_name: player.name, p_color: player.color, p_score: score });
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

  /** 이 게임의 이번 주 TOP 10과 내 순위 (key: records.ts scoreKey) */
  async board(game: GameId, key: string): Promise<Board> {
    return cleanBoard(await this.rpc('game_board', { p_game: game, p_player: key }));
  }

  /** 이 게임의 명예의 전당 (schema.sql 10번). 끝난 주의 1~3위는 서버가 읽을 때 옮겨 적어요 */
  async hall(game: GameId, key: string): Promise<Hall> {
    return cleanHall(await this.rpc('game_hall', { p_game: game, p_player: key }));
  }

  /** 게임마다 지난주 1위 (목록에 보여줄 것) */
  async champions(): Promise<Partial<Record<GameId, Champion>>> {
    const raw = await this.rpc('game_last_champions', {});
    const out: Partial<Record<GameId, Champion>> = {};
    if (!isObj(raw)) return out;
    for (const [game, value] of Object.entries(raw)) {
      const champion = cleanChampion(value);
      if (champion) out[game as GameId] = champion;
    }
    return out;
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
