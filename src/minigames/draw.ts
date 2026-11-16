// 네 게임이 같이 쓰는 캔버스 그리기 도우미
import { drawSprite, type SpriteName } from './sprites';
import { STAGE_W } from './types';

const css = getComputedStyle(document.documentElement);
const cssColor = (name: string) => css.getPropertyValue(name).trim();

/** style.css의 :root 색을 그대로 써요 (색을 바꾸면 게임도 같이 바뀌어요) */
export const C = {
  bg: cssColor('--bg'),
  panel: cssColor('--panel-solid'),
  line: cssColor('--line'),
  fg: cssColor('--fg'),
  muted: cssColor('--muted'),
  amber: cssColor('--amber'),
  mint: cssColor('--mint'),
  danger: cssColor('--danger'),
  /** 잔디 그래프의 진한 초록 */
  grass: cssColor('--g3'),
};

export const UI_FONT = 'Pretendard, "Apple SD Gothic Neo", sans-serif';
const MONO_FONT = '"JetBrains Mono", "D2Coding", ui-monospace, monospace';

/** 위쪽 점수 줄의 높이 */
export const TOP_BAR_H = 40;
const TOP_BAR_ICON = 18;

interface LabelStyle {
  size?: number;
  color?: string;
  weight?: number;
  align?: CanvasTextAlign;
  mono?: boolean;
}

export function drawLabel(g: CanvasRenderingContext2D, text: string, x: number, y: number, { size = 11, color = C.muted, weight = 700, align = 'center', mono = false }: LabelStyle = {}) {
  g.font = `${weight} ${size}px ${mono ? MONO_FONT : UI_FONT}`;
  g.fillStyle = color;
  g.textAlign = align;
  g.textBaseline = 'middle';
  g.fillText(text, x, y);
}

/** 오른쪽 칸: 글자만, 또는 작은 그림 + 글자 */
export interface TopBarRight {
  text: string;
  color?: string;
  icon?: SpriteName;
}

/** 위쪽 점수 줄: 왼쪽엔 점수, 오른쪽엔 남은 목숨이나 시간 */
export function drawTopBar(g: CanvasRenderingContext2D, left: string, right: TopBarRight) {
  g.fillStyle = 'rgba(0, 0, 0, 0.35)';
  g.fillRect(0, 0, STAGE_W, TOP_BAR_H);
  const mid = TOP_BAR_H / 2;
  drawLabel(g, left, 14, mid, { size: 15, color: C.fg, weight: 800, align: 'left' });
  drawLabel(g, right.text, STAGE_W - 14, mid, { size: 15, color: right.color ?? C.fg, weight: 800, align: 'right', mono: true });
  if (!right.icon) return;
  const textW = g.measureText(right.text).width;
  drawSprite(g, right.icon, STAGE_W - 14 - textW - 4 - TOP_BAR_ICON / 2, mid, TOP_BAR_ICON);
}

/** 목숨을 ♥(남음)와 ♡(잃음)로 */
export function lifeText(lives: number, max: number) {
  return '♥'.repeat(Math.max(0, lives)) + '♡'.repeat(Math.max(0, max - lives));
}

export function isWithin(ax: number, ay: number, bx: number, by: number, r: number) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy <= r * r;
}

export const randomBetween = (min: number, max: number) => min + Math.random() * (max - min);
export const pickOne = <T,>(list: readonly T[]) => list[Math.floor(Math.random() * list.length)];

/** 휴대폰을 짧게 떨게 해요 (안드로이드 크롬 등 되는 곳에서만, 안 되면 조용히 넘어가요) */
export function buzz(ms: number) {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* 지원하지 않는 브라우저 */
  }
}

/** 점수가 오르내릴 때 잠깐 떠올랐다 사라지는 글자 */
const FLOAT_SEC = 0.9;
const FLOAT_RISE_PX = 36;

interface FloatText {
  text: string;
  x: number;
  y: number;
  color: string;
  age: number;
}

export class FloatTexts {
  private items: FloatText[] = [];

  add(text: string, x: number, y: number, color: string = C.fg) {
    this.items.push({ text, x, y, color, age: 0 });
  }

  update(dt: number) {
    for (const f of this.items) f.age += dt;
    this.items = this.items.filter((f) => f.age < FLOAT_SEC);
  }

  draw(g: CanvasRenderingContext2D) {
    for (const f of this.items) {
      const t = f.age / FLOAT_SEC;
      g.globalAlpha = 1 - t;
      drawLabel(g, f.text, f.x, f.y - t * FLOAT_RISE_PX, { size: 15, color: f.color, weight: 800 });
    }
    g.globalAlpha = 1;
  }
}
