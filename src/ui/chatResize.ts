// 채팅 칸 위쪽 모서리 손잡이를 끌어서 크기 조절
//
// 채팅 칸은 아래가 고정이라 위로 dy 끌면 대화 목록이 dy만큼 길어져요.
// 너비는 채팅 칸 자리(chatLayout.ts)마다 달라요. 어느 쪽이든 손잡이가 포인터 밑에 계속 붙어 있게 맞췄어요.
// - docked(왼쪽 아래): 손잡이가 오른쪽 위에 있어서 오른쪽으로 dx 끌면 너비가 dx 늘어요
// - centered(가운데): 손잡이가 왼쪽 위에 있고 양옆으로 같이 늘어나서, 왼쪽으로 dx 끌면 너비가 2dx 늘어요
// - full-width: 좌우를 꽉 채워서 높이만 바꿔요
// 크기는 손을 뗄 때 이 기기에만 저장해요 (store.ts ChatSize).

import { getChatSize, setChatSize, type ChatSize } from '../store';
import { currentChatLayout, type ChatLayout } from './chatLayout';
import { h } from './dom';

const CHAT_MIN_WIDTH = 320;
const CHAT_MAX_WIDTH = 960;
const CHAT_LOG_MIN_HEIGHT = 120;
/** 대화 목록은 화면 높이의 이 비율까지만 늘려요 (위쪽 3D 화면이 조금은 보이게) */
const CHAT_LOG_MAX_VIEWPORT_RATIO = 0.75;
/** 방향키 한 번에 손잡이가 움직이는 거리 */
const KEY_STEP_PX = 24;

/** 손잡이를 오른쪽으로 1px 끌 때 너비가 바뀌는 양 */
const WIDTH_PER_DX: Record<ChatLayout, number> = {
  docked: 1,
  centered: -2,
  'full-width': 0,
};

/** 저장된 크기를 채팅 칸에 입혀요. null이면 CSS 기본 크기로 돌아가요 */
export function applyChatSize(panel: HTMLElement, size: ChatSize | null) {
  setPxVar(panel, '--chat-w', size?.width ?? null);
  setPxVar(panel, '--chat-log-h', size?.logHeight ?? null);
}

/** 끌기·방향키로 채팅 칸 크기를 바꾸는 손잡이. 두 번 누르면 기본 크기로 돌아가요 */
export function createChatResizeGrip(panel: HTMLElement, log: HTMLElement): HTMLButtonElement {
  let drag: { x: number; y: number; from: ChatSize; fromBottom: number } | null = null;
  let current: ChatSize | null = null;

  // 목록 맨 아래와의 거리를 그대로 두면, 칸이 위로 늘어날 때 보던 줄이 제자리에 남아 있어요
  const resizeTo = (next: ChatSize, fromBottom: number) => {
    current = clampChatSize(next);
    applyChatSize(panel, current);
    log.scrollTop = log.scrollHeight - log.clientHeight - fromBottom;
  };
  const distanceFromBottom = () => log.scrollHeight - log.scrollTop - log.clientHeight;
  const measure = (): ChatSize => ({
    width: currentChatLayout() === 'full-width' ? (getChatSize()?.width ?? null) : panel.getBoundingClientRect().width,
    logHeight: log.getBoundingClientRect().height,
  });
  // 손잡이가 (dx, dy)만큼 움직였을 때의 크기
  const sizeAfterMove = (from: ChatSize, dx: number, dy: number): ChatSize => ({
    width: from.width === null ? null : from.width + WIDTH_PER_DX[currentChatLayout()] * dx,
    logHeight: from.logHeight - dy,
  });

  const grip = h('button', {
    type: 'button',
    class: 'chat-grip',
    title: '끌어서 크기 조절 · 두 번 누르면 원래 크기',
    'aria-label': '채팅 칸 크기 조절. 방향키로 손잡이를 움직이고, 두 번 누르면 원래 크기',
  });

  grip.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    grip.setPointerCapture(e.pointerId);
    drag = { x: e.clientX, y: e.clientY, from: measure(), fromBottom: distanceFromBottom() };
    panel.classList.add('resizing');
  });
  grip.addEventListener('pointermove', (e) => {
    if (!drag) return;
    resizeTo(sizeAfterMove(drag.from, e.clientX - drag.x, e.clientY - drag.y), drag.fromBottom);
  });
  grip.addEventListener('pointerup', () => endDrag());
  grip.addEventListener('pointercancel', () => endDrag());
  grip.addEventListener('dblclick', () => {
    applyChatSize(panel, null);
    setChatSize(null);
  });
  grip.addEventListener('keydown', (e) => {
    const move = KEY_MOVES[e.key];
    if (!move) return;
    e.preventDefault();
    resizeTo(sizeAfterMove(measure(), move.dx, move.dy), distanceFromBottom());
    if (current) setChatSize(current);
  });

  const endDrag = () => {
    if (!drag) return;
    drag = null;
    panel.classList.remove('resizing');
    if (current) setChatSize(current);
  };

  return grip;
}

/** 방향키는 손잡이를 그 방향으로 끈 것과 같아요 */
const KEY_MOVES: Record<string, { dx: number; dy: number }> = {
  ArrowLeft: { dx: -KEY_STEP_PX, dy: 0 },
  ArrowRight: { dx: KEY_STEP_PX, dy: 0 },
  ArrowUp: { dx: 0, dy: -KEY_STEP_PX },
  ArrowDown: { dx: 0, dy: KEY_STEP_PX },
};

function clampChatSize(size: ChatSize): ChatSize {
  const maxLogHeight = Math.max(CHAT_LOG_MIN_HEIGHT, window.innerHeight * CHAT_LOG_MAX_VIEWPORT_RATIO);
  return {
    width: size.width === null ? null : clamp(size.width, CHAT_MIN_WIDTH, CHAT_MAX_WIDTH),
    logHeight: clamp(size.logHeight, CHAT_LOG_MIN_HEIGHT, maxLogHeight),
  };
}

function clamp(v: number, min: number, max: number) {
  return Math.min(Math.max(v, min), max);
}

function setPxVar(el: HTMLElement, name: string, px: number | null) {
  if (px === null) el.style.removeProperty(name);
  else el.style.setProperty(name, `${Math.round(px)}px`);
}
