// 게임 한 판을 캔버스에 돌려요: 화면 크기 맞추기, 매 프레임 그리기, 누르기·쓸어넘기기·키보드 입력
import { C, drawLabel } from './draw';
import { STAGE_H, STAGE_W, type Direction, type GameRound } from './types';

/** 프레임 사이가 이보다 길면(다른 탭을 다녀옴) 이만큼만 흐른 걸로 쳐요 */
const MAX_FRAME_SEC = 0.05;
/** 고해상도 화면이어도 캔버스는 2배까지만 키워요 (메모리) */
const MAX_PIXEL_RATIO = 2;
/** 손가락을 이만큼(CSS px) 넘게 밀면 쓸어넘기기로 봐요 */
const SWIPE_MIN_PX = 24;

const STEER_KEYS: Record<string, Direction> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  w: 'up',
  s: 'down',
  a: 'left',
  d: 'right',
};

type Phase = 'ready' | 'playing' | 'over';
type KeyAction = 'press' | Direction;

function swipeDirection(dx: number, dy: number): Direction | null {
  if (Math.hypot(dx, dy) < SWIPE_MIN_PX) return null;
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'right' : 'left';
  return dy > 0 ? 'down' : 'up';
}

export class RoundView {
  readonly canvas: HTMLCanvasElement;
  private g: CanvasRenderingContext2D;
  private phase: Phase = 'ready';
  private raf = 0;
  private lastAt = 0;
  private resizeWatch: ResizeObserver;
  private swipeFrom: { x: number; y: number } | null = null;

  constructor(
    private round: GameRound,
    title: string,
    private onOver: (score: number) => void,
  ) {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'arcade-canvas';
    this.canvas.setAttribute('role', 'img');
    this.canvas.tabIndex = 0;
    this.canvas.setAttribute('aria-label', `${title} 게임 화면. 화면을 누르거나 스페이스를 눌러서 시작해요`);
    this.g = this.canvas.getContext('2d')!;
    this.canvas.addEventListener('pointerdown', this.onPointerDown);
    this.canvas.addEventListener('pointerup', this.onPointerUp);
    this.resizeWatch = new ResizeObserver(() => this.fit());
    this.resizeWatch.observe(this.canvas);
    this.raf = requestAnimationFrame(this.frame);
  }

  /** 키보드. 게임이 받았으면 true (끝난 뒤엔 결과 버튼이 받도록 false) */
  key(key: string): boolean {
    if (this.phase === 'over') return false;
    const action = this.actionOf(key);
    if (!action) return false;
    if (this.phase === 'ready') {
      this.begin();
      // 방향키로 시작했으면 그 방향으로 바로 출발해요 (스페이스는 시작만)
      if (action !== 'press') this.round.steer?.(action);
      return true;
    }
    if (action === 'press') this.round.press();
    else this.round.steer?.(action);
    return true;
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.resizeWatch.disconnect();
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.removeEventListener('pointerup', this.onPointerUp);
  }

  /** 방향을 받는 게임이면 방향키·WASD, 아니면 위 화살표만 '누르기'로 */
  private actionOf(key: string): KeyAction | null {
    if (key === ' ') return 'press';
    const dir = STEER_KEYS[key.length === 1 ? key.toLowerCase() : key];
    if (!dir) return null;
    if (this.round.steer) return dir;
    return dir === 'up' ? 'press' : null;
  }

  private begin() {
    this.phase = 'playing';
    this.lastAt = performance.now();
  }

  private onPointerDown = (e: PointerEvent) => {
    e.preventDefault();
    this.swipeFrom = { x: e.clientX, y: e.clientY };
    if (this.phase === 'over') return;
    if (this.phase === 'ready') {
      this.begin();
      return;
    }
    const rect = this.canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * STAGE_W;
    const y = ((e.clientY - rect.top) / rect.height) * STAGE_H;
    this.round.tap(x, y);
  };

  private onPointerUp = (e: PointerEvent) => {
    const from = this.swipeFrom;
    this.swipeFrom = null;
    if (!from || this.phase !== 'playing' || !this.round.steer) return;
    const dir = swipeDirection(e.clientX - from.x, e.clientY - from.y);
    if (dir) this.round.steer(dir);
  };

  /** 보이는 크기에 맞춰 캔버스 픽셀 수를 정하고, 그림은 늘 STAGE_W × STAGE_H 좌표로 그려요 */
  private fit() {
    const ratio = Math.min(MAX_PIXEL_RATIO, window.devicePixelRatio || 1);
    const width = Math.round(this.canvas.clientWidth * ratio);
    if (!width) return;
    this.canvas.width = width;
    this.canvas.height = Math.round((width * STAGE_H) / STAGE_W);
    const scale = width / STAGE_W;
    this.g.setTransform(scale, 0, 0, scale, 0, 0);
  }

  private frame = (now: number) => {
    if (this.phase === 'playing') {
      this.round.update(Math.min(MAX_FRAME_SEC, (now - this.lastAt) / 1000));
      this.lastAt = now;
    }
    this.round.draw(this.g);
    if (this.phase === 'ready') this.drawReady();

    const score = this.phase === 'playing' ? this.round.result() : null;
    if (score !== null) {
      this.phase = 'over';
      this.onOver(score);
      return;
    }
    this.raf = requestAnimationFrame(this.frame);
  };

  private drawReady() {
    this.g.fillStyle = 'rgba(5, 7, 14, 0.55)';
    this.g.fillRect(0, 0, STAGE_W, STAGE_H);
    drawLabel(this.g, '눌러서 시작', STAGE_W / 2, STAGE_H / 2, { size: 22, color: C.amber, weight: 800 });
    drawLabel(this.g, '화면을 누르거나 스페이스', STAGE_W / 2, STAGE_H / 2 + 30, { size: 12 });
  }
}
