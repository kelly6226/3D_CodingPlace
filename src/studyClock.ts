// 오늘 모각코한 시간을 재는 시계
// 화면 그리기(requestAnimationFrame)는 다른 창이나 탭을 보고 있으면 멈춰서,
// 그걸로 재면 IDE를 앞에 두고 코딩하는 동안의 시간이 빠져요. 그래서 실제 시각(Date.now)으로 재요.
import { kstDate } from './store';

/** 시각을 확인하는 간격 */
const TICK_MS = 1000;

/**
 * 두 번 확인하는 사이가 이보다 길면 그 사이는 세지 않아요 (노트북을 덮어 잠들었던 경우).
 * 크롬은 5분 넘게 숨겨진 탭의 타이머를 1분에 한 번만 깨워서, 그보다 넉넉하게 잡았어요.
 */
const MAX_COUNTED_GAP_MS = 2 * 60_000;

export interface StudyClockHandlers {
  /** 실제로 흐른 시간(ms) */
  onElapsed(ms: number): void;
  /** 잠들었던 것처럼 너무 길게 멈췄다 깨어나서 세지 않고 버린 시간(ms) */
  onSkipped(ms: number): void;
}

/** 페이지가 열려 있는 동안 계속 돌아요 */
export function startStudyClock({ onElapsed, onSkipped }: StudyClockHandlers) {
  let last = Date.now();
  window.setInterval(() => {
    const now = Date.now();
    const gap = now - last;
    last = now;
    if (gap <= 0) return;
    if (gap <= MAX_COUNTED_GAP_MS) onElapsed(gap);
    else onSkipped(gap);
  }, TICK_MS);
}

/** 그 시각이 속한 날(KST)의 0시 */
export function kstMidnight(now: number): number {
  return new Date(`${kstDate(new Date(now))}T00:00:00+09:00`).getTime();
}

/**
 * 오늘 누적 시간을 '기준 시각' 하나로 나타내요: 지금 시각 - 기준 시각 = 오늘 누적 시간.
 * 방 사람들에게는 이 기준 시각만 한 번 보내고, 받는 쪽이 매초 직접 계산해요.
 * 그래서 Presence를 계속 보내지 않아도 숫자가 늘어나고, 이 방에 있은 시간(⏱)보다 작게 보이지 않아요.
 */
export function studySinceFor(todayMs: number, now: number): number {
  return now - todayMs;
}

/** 기준 시각으로 지금의 오늘 누적 시간 계산. 자정(KST)을 넘기면 0시부터 다시 세요 */
export function studyTodayAt(studySince: number, now: number): number {
  return Math.max(0, now - Math.max(studySince, kstMidnight(now)));
}
