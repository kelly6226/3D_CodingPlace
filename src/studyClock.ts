// 오늘 모각코한 시간을 재는 시계
// 화면 그리기(requestAnimationFrame)는 다른 창이나 탭을 보고 있으면 멈춰서,
// 그걸로 재면 IDE를 앞에 두고 코딩하는 동안의 시간이 빠져요. 그래서 실제 시각(Date.now)으로 재요.

/** 시각을 확인하는 간격 */
const TICK_MS = 1000;

/**
 * 두 번 확인하는 사이가 이보다 길면 그 사이는 세지 않아요 (노트북을 덮어 잠들었던 경우).
 * 크롬은 5분 넘게 숨겨진 탭의 타이머를 1분에 한 번만 깨워서, 그보다 넉넉하게 잡았어요.
 */
const MAX_COUNTED_GAP_MS = 2 * 60_000;

/** 실제로 흐른 시간(ms)을 onElapsed로 알려줘요. 페이지가 열려 있는 동안 계속 돌아요 */
export function startStudyClock(onElapsed: (ms: number) => void) {
  let last = Date.now();
  window.setInterval(() => {
    const now = Date.now();
    const gap = now - last;
    last = now;
    if (0 < gap && gap <= MAX_COUNTED_GAP_MS) onElapsed(gap);
  }, TICK_MS);
}
