// 게임마다 내 최고 기록. 이 브라우저에만 남고 서버로 보내지 않아요
import type { GameId } from './catalog';

const KEY = 'mogakco:games:v1';

type Records = Partial<Record<GameId, number>>;

/** 이번 판이 기록으로 어땠는지 */
export type RecordOutcome =
  | { kind: 'first' }
  | { kind: 'new'; prev: number }
  | { kind: 'kept'; best: number };

function readRecords(): Records {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    if (!parsed || typeof parsed !== 'object') return {};
    const out: Records = {};
    for (const [id, score] of Object.entries(parsed)) {
      if (Number.isFinite(score)) out[id as GameId] = score as number;
    }
    return out;
  } catch {
    return {};
  }
}

export function bestScore(id: GameId): number | null {
  return readRecords()[id] ?? null;
}

/** 이번 점수가 최고 기록이면 남겨요. 저장이 막힌 브라우저(사생활 보호 모드 등)면 기억만 못 해요 */
export function recordScore(id: GameId, score: number): RecordOutcome {
  const records = readRecords();
  const prev = records[id];
  if (prev !== undefined && prev >= score) return { kind: 'kept', best: prev };
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...records, [id]: score }));
  } catch {
    /* 저장 못 해도 게임은 계속 */
  }
  return prev === undefined ? { kind: 'first' } : { kind: 'new', prev };
}
