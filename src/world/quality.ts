// 느린 기기에서 화면 해상도를 조금씩 낮춰요 (동적 해상도).
// 프레임이 계속 늦으면 픽셀 비율을 한 단계씩 내리고, 다시 올리지는 않아요(오르내리며 깜빡이지 않게).
import type * as THREE from 'three';

/** 이보다 프레임 간격이 길면 느린 것으로 봐요 (약 40fps) */
const SLOW_FRAME_MS = 25;
/** 이만큼 모아서 평균을 내요 */
const WINDOW_MS = 2000;
/** 느린 구간이 이만큼 이어져야 내려요 (잠깐 버벅인 걸로는 안 내려요) */
const SLOW_WINDOWS_TO_DROP = 2;
/** 한 번에 내리는 폭과 가장 낮은 값 */
const STEP = 0.25;
const MIN_RATIO = 1;
/** 탭을 옮겼다 돌아오는 등 이보다 긴 간격은 세지 않아요 */
const IGNORE_GAP_MS = 250;

export class ResolutionGovernor {
  private last = 0;
  private sum = 0;
  private count = 0;
  private windowStart = 0;
  private slowWindows = 0;

  constructor(private renderer: THREE.WebGLRenderer) {}

  /** 매 프레임 불러요 */
  tick(now = performance.now()) {
    const gap = now - this.last;
    this.last = now;
    if (gap <= 0 || gap > IGNORE_GAP_MS) {
      this.windowStart = now;
      this.sum = 0;
      this.count = 0;
      return;
    }
    this.sum += gap;
    this.count++;
    if (now - this.windowStart < WINDOW_MS) return;
    const avg = this.sum / this.count;
    this.windowStart = now;
    this.sum = 0;
    this.count = 0;
    this.slowWindows = avg > SLOW_FRAME_MS ? this.slowWindows + 1 : 0;
    if (this.slowWindows < SLOW_WINDOWS_TO_DROP) return;
    this.slowWindows = 0;
    const ratio = this.renderer.getPixelRatio();
    if (ratio <= MIN_RATIO) return;
    // setPixelRatio가 지금 크기로 캔버스를 다시 맞춰요
    this.renderer.setPixelRatio(Math.max(MIN_RATIO, ratio - STEP));
  }
}
