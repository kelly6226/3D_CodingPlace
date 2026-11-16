// 버그 잡기: 30초 동안 에디터에서 기어 나오는 버그를 눌러 잡아요.
// 🪳 프로덕션 버그는 빠르고 점수가 크고, 🦋는 '기능'이라 잡으면 점수가 깎여요.
import { sound } from '../../audio';
import { C, FloatTexts, TOP_BAR_H, drawEmoji, drawLabel, drawTopBar, isWithin, randomBetween } from '../draw';
import { STAGE_H, STAGE_W, type GameRound } from '../types';

const ROUND_SEC = 30;
const EDITOR = { x: 14, y: TOP_BAR_H + 12, w: STAGE_W - 28, h: STAGE_H - TOP_BAR_H - 26 };
const GUTTER_W = 30;
const LINE_H = 18;

/** 버그가 나오는 간격(초): 처음엔 START, 끝날 즈음엔 END까지 점점 짧아져요 */
const SPAWN_GAP_START = 0.7;
const SPAWN_GAP_END = 0.3;
/** 시작하고 첫 버그가 나오기까지 (초) */
const FIRST_SPAWN_SEC = 0.3;
const MAX_ON_SCREEN = 7;
const BUG_HIT_R = 28;
const BUG_SIZE = 30;
/** 나타나고 사라질 때 커지고 작아지는 시간(초) */
const POP_SEC = 0.15;
/** 이만큼마다 방향을 바꿔요 (초) */
const TURN_GAP = [0.35, 0.9] as const;

type BugKind = 'bug' | 'prod' | 'feature';

const KINDS: Record<BugKind, { emoji: string; points: number; lifeSec: number; speed: number }> = {
  bug: { emoji: '🐛', points: 1, lifeSec: 1.7, speed: 45 },
  prod: { emoji: '🪳', points: 3, lifeSec: 1.05, speed: 115 },
  feature: { emoji: '🦋', points: -2, lifeSec: 2, speed: 35 },
};

/** 나올 확률. 나머지는 평범한 버그 */
const PROD_CHANCE = 0.15;
const FEATURE_CHANCE = 0.2;

interface Bug {
  kind: BugKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  turnIn: number;
}

function pickKind(): BugKind {
  const r = Math.random();
  if (r < PROD_CHANCE) return 'prod';
  if (r < PROD_CHANCE + FEATURE_CHANCE) return 'feature';
  return 'bug';
}

function aim(bug: Bug) {
  const angle = Math.random() * Math.PI * 2;
  const speed = KINDS[bug.kind].speed;
  bug.vx = Math.cos(angle) * speed;
  bug.vy = Math.sin(angle) * speed;
  bug.turnIn = randomBetween(...TURN_GAP);
}

/** 에디터 안에서만 움직이게: 벽에 닿으면 튕겨요 */
function keepInEditor(bug: Bug) {
  const pad = BUG_SIZE / 2;
  const minX = EDITOR.x + GUTTER_W + pad;
  const maxX = EDITOR.x + EDITOR.w - pad;
  const minY = EDITOR.y + pad;
  const maxY = EDITOR.y + EDITOR.h - pad;
  if (bug.x < minX || bug.x > maxX) bug.vx *= -1;
  if (bug.y < minY || bug.y > maxY) bug.vy *= -1;
  bug.x = Math.min(maxX, Math.max(minX, bug.x));
  bug.y = Math.min(maxY, Math.max(minY, bug.y));
}

/** 나타날 때 커지고, 숨을 때 작아지는 크기 비율 */
function popScale(bug: Bug) {
  const life = KINDS[bug.kind].lifeSec;
  const grow = Math.min(1, bug.age / POP_SEC);
  const shrink = Math.min(1, (life - bug.age) / POP_SEC);
  return Math.max(0, Math.min(grow, shrink));
}

/** 에디터 줄마다 코드처럼 보이는 막대 (들여쓰기, 길이) */
function makeCodeLines(count: number) {
  return Array.from({ length: count }, () => ({ indent: Math.floor(Math.random() * 3), width: randomBetween(40, 200) }));
}

export function createBugCatch(): GameRound {
  const floats = new FloatTexts();
  const codeLines = makeCodeLines(Math.floor(EDITOR.h / LINE_H));
  let bugs: Bug[] = [];
  let score = 0;
  let elapsed = 0;
  let spawnIn = FIRST_SPAWN_SEC;

  function spawn() {
    const bug: Bug = {
      kind: pickKind(),
      x: randomBetween(EDITOR.x + GUTTER_W + BUG_SIZE, EDITOR.x + EDITOR.w - BUG_SIZE),
      y: randomBetween(EDITOR.y + BUG_SIZE, EDITOR.y + EDITOR.h - BUG_SIZE),
      vx: 0,
      vy: 0,
      age: 0,
      turnIn: 0,
    };
    aim(bug);
    bugs.push(bug);
  }

  function spawnGapNow() {
    const progress = Math.min(1, elapsed / ROUND_SEC);
    return SPAWN_GAP_START + (SPAWN_GAP_END - SPAWN_GAP_START) * progress;
  }

  function drawEditor(g: CanvasRenderingContext2D) {
    g.fillStyle = C.panel;
    g.fillRect(EDITOR.x, EDITOR.y, EDITOR.w, EDITOR.h);
    codeLines.forEach((line, i) => {
      const y = EDITOR.y + 12 + i * LINE_H;
      drawLabel(g, String(i + 1), EDITOR.x + GUTTER_W - 8, y, { size: 10, weight: 500, align: 'right', color: 'rgba(162, 166, 180, 0.5)' });
      g.fillStyle = 'rgba(162, 166, 180, 0.16)';
      g.fillRect(EDITOR.x + GUTTER_W + 6 + line.indent * 14, y - 3, line.width, 6);
    });
  }

  return {
    update(dt) {
      elapsed += dt;
      floats.update(dt);
      spawnIn -= dt;
      if (spawnIn <= 0 && bugs.length < MAX_ON_SCREEN) {
        spawn();
        spawnIn = spawnGapNow();
      }
      for (const bug of bugs) {
        bug.age += dt;
        bug.turnIn -= dt;
        if (bug.turnIn <= 0) aim(bug);
        bug.x += bug.vx * dt;
        bug.y += bug.vy * dt;
        keepInEditor(bug);
      }
      // 시간이 다 된 버그는 조용히 숨어요 (놓쳐도 감점은 없어요)
      bugs = bugs.filter((bug) => bug.age < KINDS[bug.kind].lifeSec);
    },

    draw(g) {
      g.fillStyle = C.bg;
      g.fillRect(0, 0, STAGE_W, STAGE_H);
      drawEditor(g);
      for (const bug of bugs) {
        const size = BUG_SIZE * popScale(bug);
        if (size > 0) drawEmoji(g, KINDS[bug.kind].emoji, bug.x, bug.y, size);
      }
      floats.draw(g);
      const left = Math.max(0, Math.ceil(ROUND_SEC - elapsed));
      drawTopBar(g, `잡은 점수 ${score}`, `⏱ ${left}초`);
    },

    tap(x, y) {
      const bug = [...bugs].reverse().find((b) => isWithin(x, y, b.x, b.y, BUG_HIT_R));
      if (!bug) return;
      bugs = bugs.filter((b) => b !== bug);
      const { points } = KINDS[bug.kind];
      score = Math.max(0, score + points);
      if (bug.kind === 'feature') {
        floats.add(`${points} 그건 기능이에요`, bug.x, bug.y - 20, C.danger);
        sound.quack();
        return;
      }
      floats.add(`+${points}`, bug.x, bug.y - 20, bug.kind === 'prod' ? C.mint : C.amber);
      sound.pop();
    },

    press() {
      /* 누르기만 하는 게임이에요 */
    },

    result() {
      return elapsed >= ROUND_SEC ? score : null;
    },
  };
}
