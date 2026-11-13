// 정각 세션: 매시 정각(KST)에 다 같이 50분 집중하고 10분 쉬어요.
// 모두 같은 시계를 보니까 서버에 물어볼 필요가 없어요. 한국은 서머타임이 없어서 KST로 고정해요.

export const FOCUS_MINUTES = 50;
export const BREAK_MINUTES = 10;

/** 집중 시간 중 이만큼 넘게 있었으면 세션 하나를 끝낸 걸로 쳐요 (정각보다 조금 늦게 와도 인정) */
export const SESSION_DONE_MIN_MS = 40 * 60e3;

const KST_OFFSET_MS = 9 * 3600e3;
const HOUR_MS = 3600e3;
const TICK_MS = 1000;

export type SessionPhase = 'focus' | 'break';

export interface SessionState {
  phase: SessionPhase;
  /** 지금 단계가 끝나는 시각(ms) */
  endsAt: number;
  /** 이번 세션(정각부터 한 시간)이 몇 시 세션인지 (KST 0~23) */
  hour: number;
}

/** 그 시각의 세션 단계 */
export function sessionAt(now: number): SessionState {
  const hourStart = Math.floor((now + KST_OFFSET_MS) / HOUR_MS) * HOUR_MS - KST_OFFSET_MS;
  const focusEnd = hourStart + FOCUS_MINUTES * 60e3;
  const hour = new Date(hourStart + KST_OFFSET_MS).getUTCHours();
  if (now < focusEnd) return { phase: 'focus', endsAt: focusEnd, hour };
  return { phase: 'break', endsAt: hourStart + HOUR_MS, hour };
}

/** 남은 시간을 23:41처럼 */
export function clockText(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export interface SessionWatchHandlers {
  /** 매초. 남은 시간 표시용 */
  onTick(s: SessionState): void;
  /** 집중 ↔ 휴식이 바뀔 때 한 번 (탭이 오래 잠들었다 깨서 다음 시간의 같은 단계로 건너뛰어도 불러요) */
  onPhaseChange(next: SessionState, prev: SessionState): void;
}

/** 페이지가 열려 있는 동안 세션 시계를 돌려요. 처음 한 번은 바로 onTick을 불러요 */
export function watchSession({ onTick, onPhaseChange }: SessionWatchHandlers) {
  let prev = sessionAt(Date.now());
  onTick(prev);
  window.setInterval(() => {
    const next = sessionAt(Date.now());
    if (next.phase !== prev.phase || next.hour !== prev.hour) onPhaseChange(next, prev);
    prev = next;
    onTick(next);
  }, TICK_MS);
}
