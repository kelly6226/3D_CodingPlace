// 게임 한 판을 캔버스에 돌려요: 화면 크기 맞추기, 매 프레임 그리기, 누르기·쓸어넘기기·키보드 입력
import { C, UI_FONT, drawLabel } from './draw';
import { drawSprite } from './sprites';
import { STAGE_H, STAGE_W, type Direction, type GameRound, type RoundIntro } from './types';

/** 프레임 사이가 이보다 길면(다른 탭을 다녀옴) 이만큼만 흐른 걸로 쳐요 */
const MAX_FRAME_SEC = 0.05;
/** 고해상도 화면이어도 캔버스는 2배까지만 키워요 (메모리) */
const MAX_PIXEL_RATIO = 2;
/** 손가락을 이만큼(CSS px) 넘게 밀면 쓸어넘기기로 봐요 */
const SWIPE_MIN_PX = 24;
/** 시작 화면의 '눌러서 시작'이 진해졌다 옅어지는 빠르기 (초마다 몇 번) */
const READY_PULSE_PER_SEC = 1.2;
const READY_LINE_H = 30;
const READY_RULE_SIZE = 13;
const READY_ICON = 24;
const READY_ICON_GAP = 10;

/** 터치가 주된 입력인 기기인지 (시작 화면에 폰 조작법을 보여줄지) */
const isTouchFirst = () => window.matchMedia('(pointer: coarse)').matches;

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
    private intro: RoundIntro,
    private onOver: (score: number) => void,
  ) {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'arcade-canvas';
    this.canvas.setAttribute('role', 'img');
    this.canvas.tabIndex = 0;
    this.canvas.setAttribute('aria-label', `${intro.title} 게임 화면. ${intro.rules.map((r) => r.text).join(' ')} ${intro.controls.keys}. 화면을 누르거나 스페이스를 눌러서 시작해요`);
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

  /** 시작 전: 게임 화면 위에 하는 법을 띄워요 */
  private drawReady() {
    const g = this.g;
    const { title, rules, controls } = this.intro;
    const touch = isTouchFirst();
    g.fillStyle = 'rgba(5, 7, 14, 0.78)';
    g.fillRect(0, 0, STAGE_W, STAGE_H);
    const top = STAGE_H / 2 - ((rules.length + 4) * READY_LINE_H) / 2;
    drawLabel(g, title, STAGE_W / 2, top, { size: 22, color: C.fg, weight: 800 });
    // 규칙은 그림 칸 + 글을 한 덩어리로 묶어 가운데에 두고, 줄마다 왼쪽을 맞춰요
    g.font = `500 ${READY_RULE_SIZE}px ${UI_FONT}`;
    const textW = Math.max(...rules.map((r) => g.measureText(r.text).width));
    const left = (STAGE_W - (READY_ICON + READY_ICON_GAP + textW)) / 2;
    rules.forEach((rule, i) => {
      const y = top + (i + 1.6) * READY_LINE_H;
      if (rule.icon) drawSprite(g, rule.icon, left + READY_ICON / 2, y, READY_ICON);
      drawLabel(g, rule.text, left + READY_ICON + READY_ICON_GAP, y, { size: READY_RULE_SIZE, color: C.fg, weight: 500, align: 'left' });
    });
    const after = top + (rules.length + 1.6) * READY_LINE_H;
    drawLabel(g, touch ? controls.touch : controls.keys, STAGE_W / 2, after + 4, { size: 12, color: C.muted, weight: 600 });
    const pulse = 0.55 + 0.45 * Math.sin((performance.now() / 1000) * READY_PULSE_PER_SEC * Math.PI * 2);
    g.globalAlpha = pulse;
    drawLabel(g, touch ? '▶ 탭해서 시작' : '▶ 클릭하거나 스페이스로 시작', STAGE_W / 2, after + READY_LINE_H * 2, { size: 18, color: C.amber, weight: 800 });
    g.globalAlpha = 1;
  }
}
