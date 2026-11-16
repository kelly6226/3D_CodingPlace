// 세 게임이 같이 쓰는 캔버스 그리기 도우미
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

const EMOJI_FONT = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
const UI_FONT = 'Pretendard, "Apple SD Gothic Neo", sans-serif';

/** 위쪽 점수 줄의 높이 */
export const TOP_BAR_H = 40;

export function drawEmoji(g: CanvasRenderingContext2D, emoji: string, x: number, y: number, size: number) {
  g.font = `${size}px ${EMOJI_FONT}`;
  // 컬러 이모지도 fillStyle의 투명도를 따라가서, 앞에서 칠한 반투명 색이 남아 있으면 흐려져요
  g.fillStyle = '#000';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(emoji, x, y);
}

interface LabelStyle {
  size?: number;
  color?: string;
  weight?: number;
  align?: CanvasTextAlign;
}

export function drawLabel(g: CanvasRenderingContext2D, text: string, x: number, y: number, { size = 11, color = C.muted, weight = 700, align = 'center' }: LabelStyle = {}) {
  g.font = `${weight} ${size}px ${UI_FONT}`;
  g.fillStyle = color;
  g.textAlign = align;
  g.textBaseline = 'middle';
  g.fillText(text, x, y);
}

/** 위쪽 점수 줄: 왼쪽엔 점수, 오른쪽엔 남은 목숨이나 시간 */
export function drawTopBar(g: CanvasRenderingContext2D, left: string, right: string) {
  g.fillStyle = 'rgba(0, 0, 0, 0.35)';
  g.fillRect(0, 0, STAGE_W, TOP_BAR_H);
  drawLabel(g, left, 14, TOP_BAR_H / 2, { size: 15, color: C.fg, weight: 800, align: 'left' });
  drawLabel(g, right, STAGE_W - 14, TOP_BAR_H / 2, { size: 15, color: C.fg, weight: 800, align: 'right' });
}

export function isWithin(ax: number, ay: number, bx: number, by: number, r: number) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy <= r * r;
}

export const randomBetween = (min: number, max: number) => min + Math.random() * (max - min);
export const pickOne = <T,>(list: readonly T[]) => list[Math.floor(Math.random() * list.length)];

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
