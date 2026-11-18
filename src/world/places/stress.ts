// 스트레스 해소 코너: 장소마다 치는 물건 하나, 내리치는 물건 하나
//
// 물건을 누르면 main.ts가 내 캐릭터를 물건 앞으로 데려가 치기·내리치기 동작(config STRESS_ACTIONS)을 시키고,
// 동작이 물건에 닿는 순간(actions.ts STRESS_HITS_S)마다 poke로 물건을 흔들어요.
// 동작은 두 가지뿐이고, 무엇을 치는지(모양, 말풍선, 소리, 튀는 조각)는 장소 컨셉에 맞춘 테마가 정해요.
// 사람은 때릴 수 없고 물건만 쳐요 (토스 미니앱 민감 콘텐츠 기준: 코믹 장면, 부상 없음).
import * as THREE from 'three';
import type { StressActionId } from '../../config';
import type { DebrisKind } from '../actionProps';
import { boxAt, type Box, type FacingSpot } from '../layout';
import * as T from '../textures';
import { label } from './tex2';
import { box, cyl, mesh, plane, sphere, std, type Builder, type InteractData } from './kit';

/** 치는 물건 (선 채로 주먹으로 쳐요) */
export type PunchThemeId = 'beanSack' | 'legacyServer' | 'mondayCushion' | 'bugPlush';
/** 내리치는 물건 (허리 높이 더미를 두 주먹으로 내리쳐요) */
export type SmashThemeId = 'keyboards' | 'pagers' | 'bubbleWrap' | 'cans';
export type StressThemeId = PunchThemeId | SmashThemeId;

/** 물건을 놓는 곳. yaw는 물건 앞면이 보는 방향이고, 치는 사람은 앞면 쪽에 서요 */
interface ObjectPlace<Theme extends StressThemeId> {
  theme: Theme;
  x: number;
  z: number;
  yaw: number;
}

/** 장소 하나의 코너. 동작(punch·smash)마다 물건이 하나씩 있어요 */
export interface StressCorner {
  punch: ObjectPlace<PunchThemeId>;
  smash: ObjectPlace<SmashThemeId>;
}

/** 맞았을 때 나는 소리 (audio.ts의 같은 이름 함수) */
export type StressSound = 'thud' | 'soft' | 'clatter' | 'beep' | 'pops' | 'crunch';

interface StressModel {
  root: THREE.Group;
  poke(): void;
  update(dt: number): void;
}

export interface StressTheme {
  /** 머리 위 말풍선 */
  bubble: { emoji: string; line: string };
  sound: StressSound;
  /** 내리칠 때 튀는 조각 */
  debris?: DebrisKind;
  /** 물건에 붙은 글자 (첫 줄이 크게). 웹폰트 미리 받기에도 써요 */
  label: string[];
  build(label: string[]): StressModel;
}

/** 물건 가운데에서 치는 사람이 서는 곳까지 (주먹이 닿는 거리) */
const STAND_DIST = 0.7;
/** 걸어서 지나갈 수 없는 물건 둘레 (가로·세로 m) */
const FOOTPRINT: Record<StressActionId, [number, number]> = {
  punch: [0.6, 0.6],
  smash: [0.7, 0.55],
};

export const STRESS_THEMES: Record<StressThemeId, StressTheme> = {
  // ☕ 카페: 회의에서 받은 스트레스
  beanSack: {
    bubble: { emoji: '🥊', line: '요구사항 또 바뀌었어?!' },
    sound: 'thud',
    label: ['요구사항 v27', '최종_진짜최종'],
    build: (l) => standingBag({ bag: std('#a8835a', 0.95), base: std('#3a2a1e', 0.7), label: l, labelColors: ['#efe3cc', '#5a3a1e'], tie: true }),
  },
  keyboards: {
    bubble: { emoji: '⌨️', line: '키보드가 문제였어' },
    sound: 'clatter',
    debris: 'keycaps',
    label: ['부숴도 됨', '고장 난 키보드'],
    build: (l) => pileOnCrate(l, '#f2c230', keyboardItems),
  },
  // 🖥️ 서버실: 레거시와 온콜
  legacyServer: {
    bubble: { emoji: '🥊', line: '재부팅해도 안 되잖아!' },
    sound: 'thud',
    label: ['legacy-01', '재부팅 금지'],
    build: legacyServerBag,
  },
  pagers: {
    bubble: { emoji: '📟', line: '새벽 3시 호출 그만!' },
    sound: 'beep',
    debris: 'pagerBits',
    label: ['온콜 호출기', '새벽 3시 담당'],
    build: (l) => pileOnCrate(l, '#d62f2f', pagerItems, '#ffffff'),
  },
  // 🛏️ 원룸: 새벽 2시, 내일은 월요일
  mondayCushion: {
    bubble: { emoji: '😤', line: '월요일 오지 마…' },
    sound: 'soft',
    label: ['월요일'],
    build: mondayCushion,
  },
  bubbleWrap: {
    bubble: { emoji: '🫧', line: '뽁뽁뽁뽁' },
    sound: 'pops',
    debris: 'bubbles',
    label: ['택배', '뽁뽁이 들어 있음'],
    build: bubbleWrapParcel,
  },
  // 🏆 해커톤장: 데모 직전
  bugPlush: {
    bubble: { emoji: '🐛', line: '데모 5분 전에 왜 나와!' },
    sound: 'thud',
    label: ['데모 직전 버그'],
    build: bugPlush,
  },
  cans: {
    bubble: { emoji: '🥫', line: '에너지 드링크 다 마셨다' },
    sound: 'crunch',
    debris: 'canTabs',
    label: ['빈 캔 압축', '분리수거'],
    build: (l) => pileOnCrate(l, '#3f7ad8', canItems, '#ffffff'),
  },
};

/** 캔버스에 그리는 글자 (웹폰트 미리 받기용, places/index.ts ALL_CANVAS_TEXT) */
export const STRESS_TEXT = Object.values(STRESS_THEMES)
  .map((t) => t.label.join(' '))
  .join(' ');

export function stressThemeOf(c: StressCorner, id: StressActionId): StressTheme {
  return STRESS_THEMES[c[id].theme];
}

/** 이 동작을 하러 서는 곳: 물건 앞면 쪽으로 STAND_DIST, 물건을 바라봐요 */
export function stressSpot(c: StressCorner, id: StressActionId): FacingSpot {
  const o = c[id];
  return {
    x: o.x + Math.sin(o.yaw) * STAND_DIST,
    z: o.z + Math.cos(o.yaw) * STAND_DIST,
    yaw: o.yaw + Math.PI,
  };
}

export function stressObstacles(c: StressCorner): Box[] {
  return (['punch', 'smash'] as const).map((id) => {
    const [w, d] = FOOTPRINT[id];
    // 옆으로 돌려 놓은 물건은 가로·세로가 바뀌어요
    const sideways = Math.abs(Math.sin(c[id].yaw)) > 0.5;
    return boxAt(c[id].x, c[id].z, sideways ? d : w, sideways ? w : d);
  });
}

/** 클릭하면 main.ts가 key(동작 id)로 그 동작을 하러 가요 */
const stressClick = (id: StressActionId): InteractData => ({ interact: 'stress', key: id });

export function buildStressCorner(b: Builder, corner: StressCorner) {
  const models = {} as Record<StressActionId, StressModel>;
  for (const id of ['punch', 'smash'] as const) {
    const at = corner[id];
    const theme = STRESS_THEMES[at.theme];
    const model = theme.build(theme.label);
    model.root.position.set(at.x, 0, at.z);
    model.root.rotation.y = at.yaw;
    b.click(model.root, stressClick(id));
    b.keep.add(model.root);
    models[id] = model;
  }
  return {
    /** 물건이 맞았을 때. 이 코너의 물건(key가 동작 id)이면 true */
    poke(key: string): boolean {
      if (key !== 'punch' && key !== 'smash') return false;
      models[key].poke();
      return true;
    },
    update(dt: number) {
      models.punch.update(dt);
      models.smash.update(dt);
    },
  };
}

// ── 반응 ─────────────────────────────────────────

/** 맞으면 뒤로 넘어갔다가 오뚝이처럼 돌아오는 시간(초) */
const WOBBLE_S = 1.4;

/** 받침 위 한 점을 축으로 뒤(-z)로 넘어갔다 돌아와요. pivot.rotation.x가 음수면 윗부분이 뒤로 가요 */
function wobble(pivot: THREE.Object3D) {
  let left = 0;
  return {
    poke() {
      left = WOBBLE_S;
    },
    update(dt: number) {
      if (left <= 0) return;
      left = Math.max(0, left - dt);
      const t = WOBBLE_S - left;
      pivot.rotation.x = -0.45 * Math.exp(-3 * t) * Math.cos(9 * t);
    },
  };
}

/** 내리치면 더미 위 물건들이 들썩이는 시간(초) */
const JUMP_S = 0.6;

/** 더미 위 물건들이 저마다 조금씩 튀어요. 처음 자리는 userData.baseY·baseYaw */
function jumpAll(items: THREE.Object3D[]) {
  let left = 0;
  return {
    poke() {
      left = JUMP_S;
    },
    update(dt: number) {
      if (left <= 0) return;
      left = Math.max(0, left - dt);
      const k = left / JUMP_S;
      items.forEach((o, i) => {
        o.position.y = o.userData.baseY + Math.abs(Math.sin(k * 14 + i)) * 0.07 * k;
        o.rotation.y = o.userData.baseYaw + Math.sin(k * 20 + i * 2) * 0.12 * k;
      });
    },
  };
}

// ── 치는 물건 ───────────────────────────────────────

const BASE_H = 0.12;

/** 바닥에 세워 두는 오뚝이 샌드백 (원두 자루). 앞면이 +z */
function standingBag(o: { bag: THREE.Material; base: THREE.Material; label: string[]; labelColors: [string, string]; tie?: boolean }): StressModel {
  const root = new THREE.Group();
  const BAG_R = 0.2;
  const BAG_H = 0.95;
  root.add(cyl(0.3, 0.32, BASE_H, o.base, [0, BASE_H / 2, 0], 24));
  const pivot = new THREE.Group();
  pivot.position.y = BASE_H;
  pivot.add(cyl(0.09, 0.12, 0.12, o.base, [0, 0.06, 0], 16));
  pivot.add(cyl(BAG_R, BAG_R * 1.05, BAG_H, o.bag, [0, 0.12 + BAG_H / 2, 0], 20));
  const top = mesh(new THREE.SphereGeometry(BAG_R, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), o.bag, [0, 0.12 + BAG_H, 0]);
  top.scale.y = 0.45;
  pivot.add(top);
  if (o.tie) {
    // 자루 입구를 묶은 끈
    const knot = mesh(new THREE.TorusGeometry(0.06, 0.02, 8, 16), std('#5a3a1e', 0.9), [0, 0.12 + BAG_H + 0.1, 0]);
    knot.rotation.x = Math.PI / 2;
    pivot.add(knot);
  }
  pivot.add(plane(0.36, 0.2, label(o.label, ...o.labelColors), [0, 0.12 + BAG_H * 0.6, BAG_R * 1.03 + 0.004]));
  root.add(pivot);
  return { root, ...wobble(pivot) };
}

/** 서버 모양으로 만든 샌드백 'legacy-01'. 앞면이 +z */
function legacyServerBag(l: string[]): StressModel {
  const root = new THREE.Group();
  const baseMat = std('#1d1f26', 0.6);
  const bodyMat = std('#5b616c', 0.5, 0.3);
  const W = 0.42;
  const H = 1.0;
  const D = 0.36;
  root.add(cyl(0.32, 0.34, BASE_H, baseMat, [0, BASE_H / 2, 0], 24));
  const pivot = new THREE.Group();
  pivot.position.y = BASE_H;
  pivot.add(cyl(0.09, 0.12, 0.1, baseMat, [0, 0.05, 0], 16));
  pivot.add(box(W, H, D, bodyMat, [0, 0.1 + H / 2, 0]));
  // 앞면: 서버 칸 줄과 LED
  const slotMat = std('#2b2f3a', 0.6);
  for (let i = 0; i < 4; i++) pivot.add(box(W * 0.86, 0.035, 0.01, slotMat, [0, 0.38 + i * 0.12, D / 2 + 0.004]));
  const ledOn = new THREE.MeshBasicMaterial({ color: '#3fe07a' });
  const ledBad = new THREE.MeshBasicMaterial({ color: '#ff3b3b' });
  for (let i = 0; i < 4; i++) pivot.add(box(0.025, 0.025, 0.01, i === 2 ? ledBad : ledOn, [W * 0.36, 0.38 + i * 0.12, D / 2 + 0.01]));
  pivot.add(plane(0.34, 0.15, label(l, '#f2c230', '#1a1a1a'), [0, 0.1 + H * 0.88, D / 2 + 0.006]));
  root.add(pivot);
  return { root, ...wobble(pivot) };
}

/** 세워 둔 큰 쿠션 '월요일'. 맞으면 납작해졌다 부풀어요. 앞면이 +z */
function mondayCushion(l: string[]): StressModel {
  const root = new THREE.Group();
  const baseMat = std('#6b5a8a', 0.9);
  const cushionMat = std('#c9b8e8', 0.95);
  root.add(cyl(0.28, 0.3, 0.08, baseMat, [0, 0.04, 0], 20));
  const pivot = new THREE.Group();
  pivot.position.y = 0.08;
  const body = mesh(new THREE.CapsuleGeometry(0.24, 0.55, 8, 16), cushionMat, [0, 0.52, 0]);
  body.scale.z = 0.7;
  pivot.add(body);
  // 눈 감고 지친 얼굴
  const faceMat = std('#3a2f4a', 0.6);
  for (const x of [-0.08, 0.08]) pivot.add(box(0.07, 0.012, 0.01, faceMat, [x, 0.72, 0.17]));
  pivot.add(plane(0.26, 0.12, label(l, '#ffffff', '#3a2f4a'), [0, 0.5, 0.172]));
  root.add(pivot);
  let left = 0;
  const SQUASH_S = 0.7;
  return {
    root,
    poke() {
      left = SQUASH_S;
    },
    update(dt) {
      if (left <= 0) return;
      left = Math.max(0, left - dt);
      const t = SQUASH_S - left;
      const squash = 0.18 * Math.exp(-5 * t) * Math.cos(14 * t);
      pivot.scale.set(1 + squash * 0.6, 1 - squash, 1 + squash * 0.6);
      pivot.rotation.x = -0.25 * Math.exp(-4 * t) * Math.sin(10 * t);
    },
  };
}

/** 큰 버그(벌레) 인형 '데모 직전 버그'. 앞면이 +z */
function bugPlush(l: string[]): StressModel {
  const root = new THREE.Group();
  const baseMat = std('#1d1f26', 0.6);
  const bodyMat = std('#5aa04a', 0.9);
  const bellyMat = std('#8fd07a', 0.9);
  const dark = std('#1a1a1a', 0.5);
  const white = std('#ffffff', 0.4);
  root.add(cyl(0.3, 0.32, BASE_H, baseMat, [0, BASE_H / 2, 0], 24));
  const pivot = new THREE.Group();
  pivot.position.y = BASE_H;
  pivot.add(cyl(0.09, 0.12, 0.1, baseMat, [0, 0.05, 0], 16));
  const body = sphere(0.26, bodyMat, [0, 0.52, 0], 20);
  body.scale.set(1, 1.55, 0.85);
  pivot.add(body);
  const belly = sphere(0.2, bellyMat, [0, 0.46, 0.08], 18);
  belly.scale.set(0.9, 1.3, 0.6);
  pivot.add(belly);
  // 눈
  for (const x of [-0.09, 0.09]) {
    pivot.add(sphere(0.06, white, [x, 0.86, 0.17], 12));
    pivot.add(sphere(0.03, dark, [x, 0.86, 0.225], 10));
  }
  // 더듬이
  for (const s of [-1, 1]) {
    const ant = cyl(0.008, 0.008, 0.22, dark, [s * 0.08, 1.02, 0.05], 6);
    ant.rotation.z = -s * 0.4;
    pivot.add(ant);
    pivot.add(sphere(0.025, bodyMat, [s * 0.125, 1.12, 0.05], 10));
  }
  // 다리 여섯 개
  for (const y of [0.32, 0.46, 0.6]) {
    for (const s of [-1, 1]) {
      const leg = cyl(0.015, 0.015, 0.16, dark, [s * 0.3, y, 0.02], 6);
      leg.rotation.z = s * 1.2;
      pivot.add(leg);
    }
  }
  pivot.add(plane(0.3, 0.1, label(l, '#ffffff', '#2a5a22'), [0, 0.42, 0.205]));
  root.add(pivot);
  return { root, ...wobble(pivot) };
}

// ── 내리치는 물건 ─────────────────────────────────────

const CRATE_H = 0.3;

/** 상자 위에 물건이 쌓인 더미. items가 위에 올릴 물건을 만들어요. 앞면이 +z */
function pileOnCrate(l: string[], signBg: string, items: (top: number) => THREE.Object3D[], signFg = '#1a1a1a'): StressModel {
  const root = new THREE.Group();
  root.add(box(0.62, CRATE_H, 0.42, std('#8a6440', 0.85), [0, CRATE_H / 2, 0]));
  root.add(plane(0.4, 0.17, label(l, signBg, signFg), [0, CRATE_H / 2, 0.212]));
  const things = items(CRATE_H);
  for (const o of things) {
    o.userData.baseY = o.position.y;
    o.userData.baseYaw = o.rotation.y;
    root.add(o);
  }
  return { root, ...jumpAll(things) };
}

const KEYBOARD_COUNT = 4;

/** 고장 난 키보드 네 개를 엇갈려 쌓음 */
function keyboardItems(top: number) {
  const caseMat = std('#2b2f3a', 0.6);
  const keysMat = new THREE.MeshStandardMaterial({ map: keysTexture(), roughness: 0.6 });
  return Array.from({ length: KEYBOARD_COUNT }, (_, i) => {
    const kb = new THREE.Group();
    kb.add(box(0.46, 0.028, 0.16, caseMat, [0, 0, 0]));
    const keys = new THREE.Mesh(new THREE.PlaneGeometry(0.44, 0.14), keysMat);
    keys.rotation.x = -Math.PI / 2;
    keys.position.y = 0.0145;
    kb.add(keys);
    kb.position.set((i % 2 ? 0.04 : -0.03) * (i + 1), top + 0.016 + i * 0.032, (i % 3) * 0.02 - 0.02);
    kb.rotation.y = (i % 2 ? 1 : -1) * (0.15 + i * 0.08);
    return kb;
  });
}

/** 삐삐(호출기)와 오래된 업무폰 */
function pagerItems(top: number) {
  const bodyMat = std('#1d1f26', 0.5);
  const screenMat = new THREE.MeshBasicMaterial({ color: '#7ee787' });
  const out: THREE.Object3D[] = [];
  const spots: [number, number, number][] = [
    [-0.17, -0.06, 0.4],
    [0.0, 0.08, -0.3],
    [0.17, -0.05, 0.9],
    [-0.07, 0.1, 1.6],
    [0.12, 0.1, -1.1],
    [0.02, -0.02, 0.1],
  ];
  spots.forEach(([x, z, yaw], i) => {
    const p = new THREE.Group();
    p.add(box(0.12, 0.035, 0.07, bodyMat, [0, 0, 0]));
    p.add(box(0.07, 0.002, 0.035, screenMat, [-0.015, 0.019, 0]));
    p.position.set(x, top + 0.02 + (i > 3 ? 0.035 : 0), z);
    p.rotation.y = yaw;
    out.push(p);
  });
  return out;
}

/** 다 마신 에너지 드링크 캔 */
function canItems(top: number) {
  const mats = [std('#3fae5a', 0.3, 0.6), std('#c9ccd2', 0.25, 0.8), std('#1f2126', 0.3, 0.6)];
  const g = new THREE.CylinderGeometry(0.035, 0.035, 0.12, 14);
  const out: THREE.Object3D[] = [];
  for (let i = 0; i < 7; i++) {
    const can = new THREE.Mesh(g, mats[i % mats.length]);
    can.castShadow = true;
    const row = i < 4 ? 0 : 1;
    const col = row === 0 ? i : i - 4;
    can.position.set(-0.15 + col * 0.1 + row * 0.05, top + 0.06, row ? 0.06 : -0.06);
    // 몇 개는 이미 쓰러져 있어요
    if (i % 3 === 2) {
      can.rotation.z = Math.PI / 2;
      can.position.y = top + 0.035;
    }
    out.push(can);
  }
  return out;
}

/** 택배 상자 위에 깔린 뽁뽁이. 내리치면 뽁뽁이가 들썩여요. 앞면이 +z */
function bubbleWrapParcel(l: string[]): StressModel {
  const root = new THREE.Group();
  const H = 0.34;
  root.add(box(0.56, H, 0.42, std('#c49a6c', 0.9), [0, H / 2, 0]));
  root.add(box(0.57, 0.04, 0.06, std('#e0c9a4', 0.6), [0, H - 0.01, 0])); // 테이프
  root.add(plane(0.36, 0.15, label(l, '#f4efe4', '#5a3a1e'), [0, H / 2, 0.212]));
  const wrap = new THREE.Group();
  const sheet = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.46), new THREE.MeshStandardMaterial({ map: bubbleTexture(), transparent: true, opacity: 0.85, roughness: 0.15 }));
  sheet.rotation.x = -Math.PI / 2;
  wrap.add(sheet);
  wrap.position.y = H + 0.012;
  wrap.rotation.y = 0.12;
  wrap.userData.baseY = wrap.position.y;
  wrap.userData.baseYaw = wrap.rotation.y;
  root.add(wrap);
  return { root, ...jumpAll([wrap]) };
}

// ── 텍스처 ──────────────────────────────────────────

/** 키보드 윗면: 키캡 줄 몇 개 (몇 개는 빠져 있어요) */
function keysTexture() {
  const W = 256;
  const H = 80;
  const { c, ctx } = T.canvas(W, H);
  ctx.fillStyle = '#2b2f3a';
  ctx.fillRect(0, 0, W, H);
  const ROWS = 4;
  const COLS = 14;
  const cw = W / COLS;
  const rh = H / ROWS;
  for (let r = 0; r < ROWS; r++) {
    for (let k = 0; k < COLS; k++) {
      if ((r * 7 + k * 3) % 11 === 0) continue;
      ctx.fillStyle = (r + k) % 9 === 0 ? '#f2b45a' : '#e8e4da';
      ctx.fillRect(k * cw + 2, r * rh + 2, cw - 4, rh - 4);
    }
  }
  return T.tex(c);
}

/** 뽁뽁이 판: 동그란 방울이 줄지어 있고, 몇 개는 이미 터졌어요 */
function bubbleTexture() {
  const S = 256;
  const { c, ctx } = T.canvas(S, S);
  ctx.fillStyle = 'rgba(220,240,255,0.35)';
  ctx.fillRect(0, 0, S, S);
  const R = 9;
  for (let y = R + 2; y < S; y += R * 2 + 4) {
    for (let x = R + 2 + ((y / (R * 2 + 4)) % 2) * (R + 2); x < S; x += R * 2 + 4) {
      const popped = (x * 7 + y * 3) % 13 === 0;
      ctx.beginPath();
      ctx.arc(x, y, R, 0, Math.PI * 2);
      ctx.fillStyle = popped ? 'rgba(200,220,235,0.25)' : 'rgba(245,252,255,0.85)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(150,180,200,0.6)';
      ctx.stroke();
    }
  }
  return T.tex(c);
}
