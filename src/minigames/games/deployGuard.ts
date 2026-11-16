// 금요일 배포 막기: 배포 버튼으로 뻗어 오는 손을 눌러서 막아요.
// 초록 소매에 ✓ 도장이 찍힌 손은 QA를 통과한 거라 보내 줘야 해요. 막으면 목숨이 줄어요.
import { sound } from '../../audio';
import { C, FloatTexts, TOP_BAR_H, buzz, drawLabel, drawTopBar, isWithin, lifeText, pickOne, randomBetween } from '../draw';
import { drawSprite } from '../sprites';
import { STAGE_H, STAGE_W, type GameModule, type GameRound } from '../types';

const BUTTON = { x: STAGE_W / 2, y: 396, r: 40 };
const LIVES = 3;
/** 손을 이만큼 가까이 누르면 막은 걸로 쳐요 (손가락이 커서 손 그림보다 넉넉하게) */
const HAND_HIT_R = 36;
const HAND_SIZE = 40;
const ARM_W = 12;
const ARM_OUTLINE_W = 16;

/** 처음 손이 나오는 간격(초). 손이 하나 나올 때마다 STEP만큼 줄고, MIN보다 짧아지지 않아요 */
const SPAWN_GAP_START = 1.2;
const SPAWN_GAP_STEP = 0.025;
const SPAWN_GAP_MIN = 0.42;
/** 시작하고 첫 손이 나오기까지 (초) */
const FIRST_SPAWN_SEC = 0.4;

/** 손이 다가오는 속도(px/초). 하나 막을 때마다 STEP만큼 빨라져요 */
const HAND_SPEED_START = 68;
const HAND_SPEED_STEP = 2.2;
/** 진짜 금요일(KST)엔 손이 이만큼 더 빨라요 */
const FRIDAY_SPEED = 1.3;
const RETREAT_SPEED = 560;

/** 이 점수부터 QA 통과한 손이 섞여 나와요 */
const QA_FROM_SCORE = 5;
const QA_CHANCE = 0.18;
const QA_BONUS = 3;

/** 배포돼 버렸을 때 화면이 빨갛게 번쩍이고 흔들리는 시간(초)과 세기(px) */
const FLASH_SEC = 0.45;
const SHAKE_PX = 6;
const SIREN_SEC = 0.8;
const FAIL_BUZZ_MS = 120;

const NAMES = ['신입', 'PM님', 'CTO', '인턴', '옆 팀', '어제의 나', '대표님', '외주'] as const;
/** 동료들 소매 색 (QA 통과한 손만 초록) */
const SLEEVES = ['#f2b45a', '#58a6ff', '#c792ea', '#a2a6b4', '#ff9e3d'] as const;
const QA_SLEEVE = '#3fb950';
const OUTLINE = '#141826';

/** 손이 나오는 곳: 왼쪽·오른쪽 벽, 위쪽 */
const SPAWN_Y_RANGE = [TOP_BAR_H + 50, 320] as const;
const SPAWN_X_RANGE = [40, STAGE_W - 40] as const;
const EDGE_MARGIN = 14;

interface Hand {
  fromX: number;
  fromY: number;
  x: number;
  y: number;
  /** 손가락이 버튼 쪽을 보게 돌리는 각도 */
  angle: number;
  speed: number;
  name: string;
  sleeve: string;
  qa: boolean;
  retreating: boolean;
}

function isFridayKst(now: Date) {
  return new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Seoul', weekday: 'short' }).format(now) === 'Fri';
}

function spawnPoint(): { x: number; y: number } {
  const side = pickOne(['left', 'right', 'top'] as const);
  if (side === 'left') return { x: -EDGE_MARGIN, y: randomBetween(...SPAWN_Y_RANGE) };
  if (side === 'right') return { x: STAGE_W + EDGE_MARGIN, y: randomBetween(...SPAWN_Y_RANGE) };
  return { x: randomBetween(...SPAWN_X_RANGE), y: TOP_BAR_H - EDGE_MARGIN };
}

function createDeployGuard(): GameRound {
  const speedRate = isFridayKst(new Date()) ? FRIDAY_SPEED : 1;
  const caption = speedRate > 1 ? 'prod · 오늘은 진짜 금요일이라 손이 빨라요' : 'prod · 금요일 18:00';
  const floats = new FloatTexts();
  let hands: Hand[] = [];
  let score = 0;
  let lives = LIVES;
  let spawnGap = SPAWN_GAP_START;
  let spawnIn = FIRST_SPAWN_SEC;
  let flash = 0;

  function spawn() {
    const from = spawnPoint();
    const qa = score >= QA_FROM_SCORE && Math.random() < QA_CHANCE;
    hands.push({
      fromX: from.x,
      fromY: from.y,
      x: from.x,
      y: from.y,
      angle: Math.atan2(BUTTON.y - from.y, BUTTON.x - from.x) + Math.PI / 2,
      speed: (HAND_SPEED_START + score * HAND_SPEED_STEP) * speedRate,
      name: qa ? 'QA 통과' : pickOne(NAMES),
      sleeve: qa ? QA_SLEEVE : pickOne(SLEEVES),
      qa,
      retreating: false,
    });
  }

  function loseLife(text: string, x: number, y: number) {
    lives -= 1;
    flash = FLASH_SEC;
    floats.add(text, x, y, C.danger);
    buzz(FAIL_BUZZ_MS);
  }

  /** 버튼에 닿은 손: QA 통과면 보너스, 아니면 배포 사고 */
  function reachButton(hand: Hand) {
    if (hand.qa) {
      score += QA_BONUS;
      floats.add(`+${QA_BONUS} QA 통과 배포`, BUTTON.x, BUTTON.y - 60, C.mint);
      sound.chime();
      return;
    }
    loseLife(`${hand.name}이(가) 배포함`, BUTTON.x, BUTTON.y - 60);
    sound.siren(SIREN_SEC);
  }

  function moveHand(hand: Hand, dt: number): 'moving' | 'reached' | 'gone' {
    const targetX = hand.retreating ? hand.fromX : BUTTON.x;
    const targetY = hand.retreating ? hand.fromY : BUTTON.y;
    const dx = targetX - hand.x;
    const dy = targetY - hand.y;
    const dist = Math.hypot(dx, dy);
    const step = (hand.retreating ? RETREAT_SPEED : hand.speed) * dt;
    const arriveDist = hand.retreating ? step : BUTTON.r * 0.6;
    if (dist <= arriveDist) return hand.retreating ? 'gone' : 'reached';
    hand.x += (dx / dist) * step;
    hand.y += (dy / dist) * step;
    return 'moving';
  }

  function drawButton(g: CanvasRenderingContext2D) {
    g.fillStyle = 'rgba(255, 255, 255, 0.04)';
    g.fillRect(0, BUTTON.y - 70, STAGE_W, STAGE_H - BUTTON.y + 70);
    const pressed = flash > 0 ? 4 : 0;
    g.beginPath();
    g.arc(BUTTON.x, BUTTON.y + 7, BUTTON.r + 3, 0, Math.PI * 2);
    g.fillStyle = OUTLINE;
    g.fill();
    g.beginPath();
    g.arc(BUTTON.x, BUTTON.y + 6, BUTTON.r, 0, Math.PI * 2);
    g.fillStyle = '#7a1f1b';
    g.fill();
    g.beginPath();
    g.arc(BUTTON.x, BUTTON.y + pressed, BUTTON.r, 0, Math.PI * 2);
    g.fillStyle = C.danger;
    g.fill();
    drawLabel(g, 'DEPLOY', BUTTON.x, BUTTON.y + pressed, { size: 14, color: '#fff', weight: 800, mono: true });
    drawLabel(g, caption, BUTTON.x, BUTTON.y + BUTTON.r + 24, { size: 11 });
  }

  function drawHand(g: CanvasRenderingContext2D, hand: Hand) {
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(hand.fromX, hand.fromY);
    g.lineTo(hand.x, hand.y);
    g.strokeStyle = OUTLINE;
    g.lineWidth = ARM_OUTLINE_W;
    g.stroke();
    g.strokeStyle = hand.sleeve;
    g.lineWidth = ARM_W;
    g.stroke();
    drawSprite(g, 'hand', hand.x, hand.y, HAND_SIZE, { rotate: hand.angle, recolor: { a: hand.sleeve } });
    if (hand.qa) drawSprite(g, 'qaStamp', hand.x + 16, hand.y - 16, 22);
    drawLabel(g, hand.name, hand.x, hand.y - HAND_SIZE / 2 - 10, { color: hand.qa ? C.mint : C.fg });
  }

  return {
    update(dt) {
      floats.update(dt);
      flash = Math.max(0, flash - dt);
      spawnIn -= dt;
      if (spawnIn <= 0) {
        spawn();
        spawnGap = Math.max(SPAWN_GAP_MIN, spawnGap - SPAWN_GAP_STEP);
        spawnIn = spawnGap;
      }
      hands = hands.filter((hand) => {
        const state = moveHand(hand, dt);
        if (state === 'reached') reachButton(hand);
        return state === 'moving';
      });
    },

    draw(g) {
      const shake = flash > 0 ? (Math.random() - 0.5) * SHAKE_PX * (flash / FLASH_SEC) : 0;
      g.save();
      g.translate(shake, 0);
      g.fillStyle = C.bg;
      g.fillRect(-SHAKE_PX, 0, STAGE_W + SHAKE_PX * 2, STAGE_H);
      drawButton(g);
      for (const hand of hands) drawHand(g, hand);
      floats.draw(g);
      g.restore();
      drawTopBar(g, `막은 손 ${score}`, { text: lifeText(lives, LIVES), color: C.danger });
      if (flash > 0) {
        g.fillStyle = `rgba(255, 90, 82, ${(flash / FLASH_SEC) * 0.35})`;
        g.fillRect(0, 0, STAGE_W, STAGE_H);
      }
    },

    tap(x, y) {
      const hand = [...hands].reverse().find((h) => !h.retreating && isWithin(x, y, h.x, h.y, HAND_HIT_R));
      if (!hand) return;
      hand.retreating = true;
      if (hand.qa) {
        loseLife('QA까지 끝난 걸 막았어요', hand.x, hand.y - 30);
        sound.quack();
        return;
      }
      score += 1;
      floats.add('+1', hand.x, hand.y - 30, C.amber);
      sound.pop();
    },

    press() {
      /* 누르기만 하는 게임이에요 */
    },

    result() {
      return lives <= 0 ? score : null;
    },
  };
}

export const deployGuard: GameModule = {
  intro: {
    title: '금요일 배포 막기',
    rules: [
      { icon: 'hand', text: '배포 버튼으로 오는 손을 눌러 막아요' },
      { icon: 'qaStamp', text: '초록 소매에 ✓ 도장은 QA 통과한 손' },
      { text: `막지 말고 보내 주면 +${QA_BONUS}점` },
      { text: `${LIVES}번 배포되면 끝나요` },
    ],
    controls: { touch: '손을 톡 눌러요', keys: '마우스로 손을 클릭해요' },
  },
  create: createDeployGuard,
};
