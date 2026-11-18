// 게임마다 내 최고 기록(이 브라우저에만)과, 스코어 판에서 나를 알아보는 비밀 번호
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

const SCORE_KEY = 'mogakco:games:key';
const SCORE_KEY_RE = /^[0-9a-f]{32}$/;

/** 스코어 판 번호 모양인지 (이어하기 서버에서 받은 값을 확인할 때도 써요) */
export function isScoreKey(v: unknown): v is string {
  return typeof v === 'string' && SCORE_KEY_RE.test(v);
}

function newScoreKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * 스코어 판에서 '내 줄'을 알아보는 비밀 번호 (16바이트 무작위, 이 브라우저에만).
 * 방에서 쓰는 id는 같은 방 사람들에게 보이니까, 그걸로 남의 줄 이름을 바꾸지 못하게 따로 만들어요.
 * 서버에는 이 번호의 해시만 남아요 (schema.sql 9번 submit_game_score)
 */
export function scoreKey(): string {
  try {
    const saved = localStorage.getItem(SCORE_KEY);
    if (saved && SCORE_KEY_RE.test(saved)) return saved;
    const fresh = newScoreKey();
    localStorage.setItem(SCORE_KEY, fresh);
    return fresh;
  } catch {
    // 저장이 막힌 브라우저: 이번 접속 동안만 쓰는 번호 (새로고침하면 판에 새 줄로 올라가요)
    return (sessionKey ??= newScoreKey());
  }
}
let sessionKey: string | null = null;

/**
 * 이어하기로 다른 기기의 스코어 판 번호를 받아 이 브라우저 번호를 바꿔요 (sync/deviceSync.ts).
 * 바꾼 뒤에 올리는 점수는 그 기기와 같은 줄에 올라가요. 이 브라우저로 이미 올린 이번 주 줄은 판에 남아요
 */
export function replaceScoreKey(key: string) {
  if (!isScoreKey(key)) return;
  sessionKey = key;
  try {
    localStorage.setItem(SCORE_KEY, key);
  } catch {
    /* 저장이 막힌 브라우저는 이번 접속 동안만 바뀌어요 */
  }
}
