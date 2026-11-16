// 야근 러너: 크롬 공룡처럼 뛰어서 회의·멘션·핫픽스를 넘어요. 오후 6시부터 몇 시까지 버티는지가 점수예요.
// 달리는 캐릭터는 내 아바타와 같은 색 후드티를 입어요.
import { sound } from '../../audio';
import { C, FloatTexts, buzz, drawLabel, drawTopBar, pickOne, randomBetween } from '../draw';
import { overtimeClock } from '../overtimeClock';
import { drawSprite, type SpriteName } from '../sprites';
import { STAGE_H, STAGE_W, type GameModule, type GameRound, type RoundOptions } from '../types';

const GROUND_Y = 392;
const PLAYER_X = 72;
const PLAYER_SIZE = 44;
/** 부딪힘 판정은 그림보다 이만큼 안쪽으로 (억울하게 걸리지 않게) */
const HITBOX_INSET = 10;

const GRAVITY = 1900;
/** 이 속도로 뛰면 약 115px 높이까지 올라가요 */
const JUMP_SPEED = 660;

/** 화면이 흘러가는 속도(px/초): 1초마다 GAIN만큼 빨라져서 MAX까지 */
const SPEED_START = 230;
const SPEED_GAIN = 7;
const SPEED_MAX = 520;

/** 장애물 사이 시간(초). 뛰고 내려온 뒤 다시 뛸 틈이 있도록 체공 시간(약 0.7초)보다 넉넉하게 */
const OBSTACLE_GAP_SEC = [0.95, 1.7] as const;
const OBSTACLE_SIZE = 36;
/** 시작하고 첫 장애물이 나오기까지 (초) */
const FIRST_OBSTACLE_SEC = 1;
/** 이 속도부터 장애물이 두 개씩 붙어 나오기도 해요 */
const DOUBLE_FROM_SPEED = 330;
const DOUBLE_CHANCE = 0.25;

const OBSTACLES: readonly { sprite: SpriteName; label: string }[] = [
  { sprite: 'meeting', label: '회의' },
  { sprite: 'mention', label: '@멘션' },
  { sprite: 'hotfix', label: '핫픽스' },
  { sprite: 'bug0', label: '버그' },
];

/** 커피는 뛰어야 닿는 높이에 떠 있어요 */
const COFFEE_CHANCE = 0.3;
const COFFEE_Y = GROUND_Y - 110;
const COFFEE_SIZE = 30;
const COFFEE_BONUS_MIN = 15;
/** 커피는 장애물 뒤 이 거리(px) 사이에 놓여요 (장애물을 넘자마자 먹을 수 있게) */
const COFFEE_AFTER_PX = [140, 220] as const;

/** 실제 1초가 야근 시계로 몇 분인지 */
const CLOCK_MIN_PER_SEC = 5;
/** 달리는 그림이 바뀌는 빠르기 (초마다) */
const STEPS_PER_SEC = 10;
const CRASH_BUZZ_MS = 150;

interface Obstacle {
  x: number;
  sprite: SpriteName;
  label: string;
}

interface Coffee {
  x: number;
  taken: boolean;
}

/** 멀리 보이는 건물과 불 켜진 창문 (천천히 흘러가요) */
function makeSkyline() {
  const buildings: { x: number; w: number; h: number; lit: number[] }[] = [];
  for (let x = 0; x < STAGE_W * 2; x += randomBetween(30, 60)) {
    const h = randomBetween(60, 180);
    // 층마다 불 켜진 창문 위치 (야근 중인 사무실)
    const lit = Array.from({ length: Math.floor(h / 14) }, () => Math.random()).map((r) => (r < 0.35 ? 1 : 0));
    buildings.push({ x, w: randomBetween(24, 50), h, lit });
  }
  return buildings;
}

function createOvertimeRunner({ playerColor }: RoundOptions): GameRound {
  const floats = new FloatTexts();
  const skyline = makeSkyline();
  const outfit = { a: playerColor };
  let obstacles: Obstacle[] = [];
  let coffees: Coffee[] = [];
  let elapsed = 0;
  let bonusMin = 0;
  let coffeeCount = 0;
  let speed = SPEED_START;
  let scroll = 0;
  let nextIn = FIRST_OBSTACLE_SEC;
  let y = GROUND_Y - PLAYER_SIZE / 2;
  let vy = 0;
  let crashed = false;

  const onGround = () => y >= GROUND_Y - PLAYER_SIZE / 2;
  const minutes = () => Math.floor(elapsed * CLOCK_MIN_PER_SEC) + bonusMin;

  function spawn() {
    const x = STAGE_W + OBSTACLE_SIZE;
    obstacles.push({ x, ...pickOne(OBSTACLES) });
    if (speed >= DOUBLE_FROM_SPEED && Math.random() < DOUBLE_CHANCE) obstacles.push({ x: x + OBSTACLE_SIZE, ...pickOne(OBSTACLES) });
    if (Math.random() < COFFEE_CHANCE) coffees.push({ x: x + randomBetween(...COFFEE_AFTER_PX), taken: false });
  }

  function hitsPlayer(cx: number, cy: number, size: number) {
    const half = (PLAYER_SIZE + size) / 2 - HITBOX_INSET;
    return Math.abs(cx - PLAYER_X) < half && Math.abs(cy - y) < half;
  }

  function jump() {
    if (crashed || !onGround()) return;
    vy = -JUMP_SPEED;
  }

  function drawBackground(g: CanvasRenderingContext2D) {
    g.fillStyle = C.bg;
    g.fillRect(0, 0, STAGE_W, STAGE_H);
    // 건물은 땅보다 1/5 빠르기로 흘러가요
    const far = (scroll * 0.2) % (STAGE_W * 2);
    for (const b of skyline) {
      const bx = (((b.x - far) % (STAGE_W * 2)) + STAGE_W * 2) % (STAGE_W * 2) - 40;
      g.fillStyle = 'rgba(162, 166, 180, 0.08)';
      g.fillRect(bx, GROUND_Y - b.h, b.w, b.h);
      g.fillStyle = 'rgba(242, 180, 90, 0.35)';
      b.lit.forEach((on, floor) => {
        if (on) g.fillRect(bx + 5, GROUND_Y - b.h + 8 + floor * 14, 4, 5);
      });
    }
    g.fillStyle = C.line;
    g.fillRect(0, GROUND_Y, STAGE_W, 2);
    g.fillStyle = 'rgba(162, 166, 180, 0.25)';
    for (let x = -(scroll % 40); x < STAGE_W; x += 40) g.fillRect(x, GROUND_Y + 14, 14, 2);
  }

  function playerSprite(): SpriteName {
    if (crashed) return 'knockedOut';
    if (!onGround()) return 'jump';
    return Math.floor(elapsed * STEPS_PER_SEC) % 2 === 0 ? 'run0' : 'run1';
  }

  return {
    update(dt) {
      if (crashed) return;
      elapsed += dt;
      floats.update(dt);
      speed = Math.min(SPEED_MAX, speed + SPEED_GAIN * dt);
      const dx = speed * dt;
      scroll += dx;

      vy += GRAVITY * dt;
      y = Math.min(GROUND_Y - PLAYER_SIZE / 2, y + vy * dt);
      if (onGround()) vy = 0;

      nextIn -= dt;
      if (nextIn <= 0) {
        spawn();
        nextIn = randomBetween(...OBSTACLE_GAP_SEC);
      }
      for (const o of obstacles) o.x -= dx;
      for (const c of coffees) c.x -= dx;
      obstacles = obstacles.filter((o) => o.x > -OBSTACLE_SIZE);
      coffees = coffees.filter((c) => c.x > -COFFEE_SIZE && !c.taken);

      for (const c of coffees) {
        if (!hitsPlayer(c.x, COFFEE_Y, COFFEE_SIZE)) continue;
        c.taken = true;
        coffeeCount += 1;
        bonusMin += COFFEE_BONUS_MIN;
        floats.add(`+${COFFEE_BONUS_MIN}분`, c.x, COFFEE_Y - 24, C.amber);
        sound.pop();
      }
      if (obstacles.some((o) => hitsPlayer(o.x, GROUND_Y - OBSTACLE_SIZE / 2, OBSTACLE_SIZE))) {
        crashed = true;
        sound.quack();
        buzz(CRASH_BUZZ_MS);
      }
    },

    draw(g) {
      drawBackground(g);
      for (const c of coffees) drawSprite(g, 'coffee', c.x, COFFEE_Y, COFFEE_SIZE);
      for (const o of obstacles) {
        drawSprite(g, o.sprite, o.x, GROUND_Y - OBSTACLE_SIZE / 2, OBSTACLE_SIZE);
        drawLabel(g, o.label, o.x, GROUND_Y + 30, { size: 10 });
      }
      drawSprite(g, playerSprite(), PLAYER_X, y, PLAYER_SIZE, { recolor: outfit });
      floats.draw(g);
      drawTopBar(g, overtimeClock(minutes()), { text: String(coffeeCount), icon: 'coffee' });
    },

    tap: jump,
    press: jump,

    result() {
      return crashed ? minutes() : null;
    },
  };
}

export const overtimeRunner: GameModule = {
  intro: {
    title: '야근 러너',
    rules: ['회의·멘션·핫픽스·버그를 뛰어넘어요', `커피를 마시면 ${COFFEE_BONUS_MIN}분 더 버텨요`, '갈수록 빨라져요. 몇 시까지 버틸까요?'],
    controls: { touch: '화면을 톡 눌러 점프', keys: '스페이스나 ↑로 점프' },
  },
  create: createOvertimeRunner,
};
