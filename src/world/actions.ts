// 큰 동작(춤, 노트북 던지기, 책상 뒤집기, 기절)의 몸 자세
// 시간(초)에 따라 자세 값을 정해요. 바탕 자세(걷기·앉기)에서 서서히 이어지고 끝나면 서서히 돌아와요.
import type { ActionId } from '../config';

/** 관절·몸 기울기 값 (라디안, 높이는 m). Avatar.animate가 매 프레임 만들고 동작이 덧씌워요 */
export interface Pose {
  legL: number;
  legR: number;
  armLX: number;
  armRX: number;
  /** 팔을 옆으로 벌리는 정도 (왼팔은 음수가 바깥쪽, 오른팔은 양수가 바깥쪽) */
  armLZ: number;
  armRZ: number;
  headX: number;
  headY: number;
  headZ: number;
  bob: number;
  /** 몸 전체를 좌우로 옮기는 거리 */
  sway: number;
  /** 몸 앞뒤 기울기 (음수가 뒤로) */
  pitch: number;
  /** 몸 좌우 기울기 */
  roll: number;
  /** 제자리 회전 각도. 다른 값과 달리 부드럽게 따라가지 않고 그대로 써요 */
  spin: number;
}

/** 동작이 시작하고 끝날 때 바탕 자세와 섞는 시간(초) */
const BLEND_S = 0.3;

/** 노트북을 손에서 놓는 시각(초). 아바타가 이때 날아가는 노트북을 만들어요 */
export const THROW_RELEASE_S = 0.8;
/** 책상을 뒤집는 시각(초) */
export const FLIP_RELEASE_S = 0.7;

/** 기절한 몸이 바닥에 누울 때, 몸통 중심이 바닥 아래로 꺼지지 않게 올려 주는 높이(m) */
const LYING_LIFT = 0.22;
/** 기절해서 뒤로 쓰러지는 각도 */
const FAINT_FALL_PITCH = -1.5;

const smooth = (a: number, b: number, x: number) => {
  const k = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return k * k * (3 - 2 * k);
};

/** t: 동작을 시작하고 지난 초, seconds: 동작 전체 길이(config의 ACTIONS), seated: 앉아 있는지, p: 덮어쓸 자세 */
type PoseFn = (t: number, seconds: number, seated: boolean, p: Pose) => void;

const DANCE_BEAT = 9;
/** 춤은 같은 길이의 동작 세 가지(팔 올리기, 한 바퀴, 디스코)를 차례로 해요 */
const DANCE_MOVES = 3;

const dance: PoseFn = (t, seconds, seated, p) => {
  const s = Math.sin(DANCE_BEAT * t);
  const half = Math.sin((DANCE_BEAT * t) / 2);
  const moveS = seconds / DANCE_MOVES;
  const move = Math.min(DANCE_MOVES - 1, Math.floor(t / moveS));
  p.headZ = s * 0.14;
  p.headX = 0.08 + Math.abs(Math.cos(DANCE_BEAT * t)) * 0.1;
  p.bob = Math.abs(s) * (seated ? 0.025 : 0.07);
  p.roll = half * (seated ? 0.14 : 0.1);
  p.sway = seated ? 0 : half * 0.07;
  if (!seated) {
    p.legL = s * 0.5;
    p.legR = -s * 0.5;
  }
  if (move === 0) {
    // 양팔 번갈아 올리기
    p.armLX = -2.7 + s * 0.45;
    p.armRX = -2.7 - s * 0.45;
    p.armLZ = -0.3;
    p.armRZ = 0.3;
  } else if (move === 1) {
    // 팔 벌리고 한 바퀴
    p.spin = ((t - moveS) / moveS) * Math.PI * 2;
    p.armLX = -0.1;
    p.armRX = -0.1;
    p.armLZ = -1.35;
    p.armRZ = 1.35;
  } else {
    // 디스코: 한 손은 하늘, 한 손은 허리 쪽. 반 박자마다 바뀜
    const rightUp = half > 0;
    p.armRX = rightUp ? -2.9 : 0.2;
    p.armLX = rightUp ? 0.2 : -2.9;
    p.armRZ = rightUp ? 0.35 : 0.55;
    p.armLZ = rightUp ? -0.55 : -0.35;
  }
};

const throwLaptop: PoseFn = (t, _seconds, seated, p) => {
  const lean = seated ? 0.5 : 1;
  if (t < THROW_RELEASE_S) {
    // 팔을 뒤로 젖힘
    const k = smooth(0, 0.5, t);
    p.armRX = -3.6 * k;
    p.armRZ = 0.15;
    p.armLX = -0.9 * k;
    p.pitch = -0.28 * k * lean;
    p.headX = -0.1 * k;
  } else {
    // 던지고 난 뒤: 몸이 앞으로 쏠림 → 머리를 감싸 쥠
    const k = smooth(THROW_RELEASE_S, THROW_RELEASE_S + 0.2, t);
    const panic = smooth(1.4, 1.8, t);
    p.armRX = -3.6 + (-1.3 + 3.6) * k + (-2.9 + 1.3) * panic;
    p.armLX = -0.9 + (-2.8 + 0.9) * panic;
    p.armLZ = -0.5 * panic;
    p.armRZ = 0.15 + 0.35 * panic;
    p.pitch = (-0.28 + 0.63 * k) * lean * (1 - panic);
    p.headY = Math.sin(t * 14) * 0.3 * panic;
    p.headX = 0.2 * panic;
  }
};

const flipTable: PoseFn = (t, _seconds, seated, p) => {
  const lean = seated ? 0.5 : 1;
  if (t < FLIP_RELEASE_S) {
    // 책상 끝을 붙잡고 숨을 고름 → 번쩍 들어올림
    const grab = smooth(0, 0.3, t);
    const heave = smooth(0.3, FLIP_RELEASE_S, t);
    p.armLX = -0.9 * grab + (-2.5 + 0.9) * heave;
    p.armRX = p.armLX;
    p.pitch = (0.15 * grab - 0.35 * heave) * lean;
    p.headX = 0.2 * grab;
  } else {
    // 씩씩거림
    const settle = smooth(FLIP_RELEASE_S, FLIP_RELEASE_S + 0.4, t);
    p.armLX = -2.5 * (1 - settle) + -0.3 * settle;
    p.armRX = p.armLX;
    p.armLZ = -0.2 * settle;
    p.armRZ = 0.2 * settle;
    p.pitch = -0.2 * lean * (1 - settle);
    p.headX = 0.2 * (1 - settle);
    p.bob = Math.sin(t * 22) * 0.012 * settle;
    p.headY = Math.sin(t * 9) * 0.25 * settle;
  }
};

/** 기절: 휘청거리는 시간, 쓰러지기까지, 그리고 끝나기 전에 일어나는 데 걸리는 시간(초) */
const FAINT_STAGGER_S = 0.9;
const FAINT_DOWN_S = 1.6;
const FAINT_GETUP_S = 0.8;

/** 쓰러져서 별이 도는 구간인지 (동작을 시작하고 지난 초 기준) */
export function faintStarsAt(t: number, seconds: number): boolean {
  return FAINT_STAGGER_S <= t && t <= seconds - FAINT_GETUP_S;
}

const faint: PoseFn = (t, seconds, seated, p) => {
  const stagger = smooth(0, FAINT_STAGGER_S, t) * (1 - smooth(FAINT_STAGGER_S, FAINT_DOWN_S, t));
  const lying = smooth(FAINT_STAGGER_S, FAINT_DOWN_S, t) * (1 - smooth(seconds - FAINT_GETUP_S, seconds, t));
  // 휘청휘청
  p.roll = Math.sin(t * 13) * 0.13 * stagger;
  p.headX = 0.35 * stagger;
  p.armLX = p.armRX = 0.4 * stagger;
  if (!seated) p.legL = Math.sin(t * 13) * 0.3 * stagger;
  if (seated) {
    // 책상에 엎드림
    p.pitch = 0.28 * lying;
    p.headX += 1.15 * lying;
    p.armLX += -1.2 * lying;
    p.armRX += -1.2 * lying;
  } else {
    p.pitch = FAINT_FALL_PITCH * lying;
    p.bob = LYING_LIFT * lying;
    p.armLZ = -1.1 * lying;
    p.armRZ = 1.1 * lying;
    p.headX += -0.2 * lying;
  }
};

const POSES: Record<ActionId, PoseFn> = { dance, throw: throwLaptop, flip: flipTable, faint };

/** 바탕 자세 pose에 동작 자세를 섞어 넣어요. t는 동작을 시작하고 지난 초, seconds는 동작 전체 길이 */
export function applyActionPose(id: ActionId, t: number, seconds: number, seated: boolean, pose: Pose) {
  const target: Pose = { ...pose };
  POSES[id](t, seconds, seated, target);
  const w = smooth(0, BLEND_S, t) * smooth(0, BLEND_S, seconds - t);
  for (const key of Object.keys(pose) as (keyof Pose)[]) pose[key] += (target[key] - pose[key]) * w;
}

export function emptyPose(): Pose {
  return {
    legL: 0,
    legR: 0,
    armLX: 0,
    armRX: 0,
    armLZ: 0,
    armRZ: 0,
    headX: 0,
    headY: 0,
    headZ: 0,
    bob: 0,
    sway: 0,
    pitch: 0,
    roll: 0,
    spin: 0,
  };
}
