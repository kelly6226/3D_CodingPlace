// 느린 기기에서 화면 해상도를 조금씩 낮추고, 다시 넉넉해지면 올려요 (동적 해상도).
// 해상도가 낮으면 방명록·메뉴판 같은 글씨가 흐려져서, 잠깐 느렸던 것 때문에 계속 낮게 남지 않게 해요.
import type * as THREE from 'three';

/** 이보다 프레임 간격이 길면 느린 것으로 봐요 (약 40fps) */
const SLOW_FRAME_MS = 25;
/** 이보다 짧으면 넉넉한 것으로 봐요 (약 55fps) */
const FAST_FRAME_MS = 18;
/** 이만큼 모아서 평균을 내요 */
const WINDOW_MS = 2000;
/** 느린 구간이 이만큼 이어져야 내려요 (잠깐 버벅인 걸로는 안 내려요) */
const SLOW_WINDOWS_TO_DROP = 2;
/** 넉넉한 구간이 이만큼 이어져야 올려요 */
const FAST_WINDOWS_TO_RAISE = 3;
/** 한 번에 바꾸는 폭과 가장 낮은 값 */
const STEP = 0.25;
const MIN_RATIO = 1;
/**
 * 처음 켤 때, 장소를 바꾼 직후, 해상도를 바꾼 직후에는 셰이더·텍스처 준비로 잠깐 느린 게 당연해서 이 시간은 세지 않아요.
 * 이걸 세면 빠른 기기도 첫 몇 초 때문에 해상도가 내려가요
 */
const SETTLE_MS = 5000;
/** 탭을 옮겼다 돌아오는 등 이보다 긴 간격은 세지 않아요 */
const IGNORE_GAP_MS = 250;

export class ResolutionGovernor {
  /** 올릴 수 있는 가장 높은 비율. 처음 비율에서 시작해서, 올렸다가 다시 느려진 비율 위로는 다시 올리지 않아요 */
  private ceiling: number;
  /** 마지막으로 올린 비율 (그 비율에서 느려지면 천장을 내려요) */
  private raisedTo: number | null = null;
  private settleUntil: number;
  private last = 0;
  private sum = 0;
  private count = 0;
  private windowStart = 0;
  private slowWindows = 0;
  private fastWindows = 0;

  constructor(
    private renderer: THREE.WebGLRenderer,
    now = performance.now(),
  ) {
    this.ceiling = renderer.getPixelRatio();
    this.settleUntil = now + SETTLE_MS;
  }

  /** 장소를 바꾼 직후처럼 잠깐 느린 게 당연할 때 불러요 */
  settle(now = performance.now()) {
    this.settleUntil = now + SETTLE_MS;
    this.slowWindows = 0;
    this.fastWindows = 0;
  }

  /** 매 프레임 불러요 */
  tick(now = performance.now()) {
    const gap = now - this.last;
    this.last = now;
    if (now < this.settleUntil || gap <= 0 || gap > IGNORE_GAP_MS) {
      this.startWindow(now);
      return;
    }
    this.sum += gap;
    this.count++;
    if (now - this.windowStart < WINDOW_MS) return;
    const avg = this.sum / this.count;
    this.startWindow(now);
    this.slowWindows = avg > SLOW_FRAME_MS ? this.slowWindows + 1 : 0;
    this.fastWindows = avg < FAST_FRAME_MS ? this.fastWindows + 1 : 0;
    if (this.slowWindows >= SLOW_WINDOWS_TO_DROP) this.drop(now);
    else if (this.fastWindows >= FAST_WINDOWS_TO_RAISE) this.raise(now);
  }

  private startWindow(now: number) {
    this.windowStart = now;
    this.sum = 0;
    this.count = 0;
  }

  private drop(now: number) {
    const ratio = this.renderer.getPixelRatio();
    if (ratio <= MIN_RATIO) {
      this.slowWindows = 0;
      return;
    }
    // 올렸더니 다시 느려졌으면 그 비율은 이 기기에 버거운 거라, 오르내리며 깜빡이지 않게 천장을 내려요
    if (ratio === this.raisedTo) this.ceiling = ratio - STEP;
    this.apply(Math.max(MIN_RATIO, ratio - STEP), now);
  }

  private raise(now: number) {
    const ratio = this.renderer.getPixelRatio();
    if (ratio >= this.ceiling) {
      this.fastWindows = 0;
      return;
    }
    const next = Math.min(this.ceiling, ratio + STEP);
    this.raisedTo = next;
    this.apply(next, now);
  }

  private apply(ratio: number, now: number) {
    // setPixelRatio가 지금 크기로 캔버스를 다시 맞춰요
    this.renderer.setPixelRatio(ratio);
    this.settle(now);
  }
}
