// 스트레스 해소 코너: '레거시 코드' 샌드백과 부숴도 되는 고장 난 키보드 더미 (장소마다 하나씩)
//
// 물건을 누르면 main.ts가 내 캐릭터를 물건 앞(layout.spots.sandbag·keyboards)으로 데려가 치는 동작
// (config STRESS_ACTIONS)을 시키고, 동작이 물건에 닿는 순간(actions.ts STRESS_HITS_S)마다 poke로 물건을 흔들어요.
// 사람은 때릴 수 없고 물건만 쳐요 (토스 미니앱 민감 콘텐츠 기준: 코믹 장면, 부상 없음).
import * as THREE from 'three';
import type { StressObjectId } from '../../config';
import { boxAt, type Box, type FacingSpot } from '../layout';
import * as T from '../textures';
import { label } from './tex2';
import { box, cyl, mesh, plane, std, type Builder, type InteractData } from './kit';

/** 물건을 놓는 곳. yaw는 물건 앞면이 보는 방향이고, 치는 사람은 앞면 쪽에 서요 */
export interface StressObjectPlace {
  x: number;
  z: number;
  yaw: number;
}

export type StressCorner = Record<StressObjectId, StressObjectPlace>;

/** 물건 가운데에서 치는 사람이 서는 곳까지 (주먹이 닿는 거리) */
const STAND_DIST = 0.7;
/** 걸어서 지나갈 수 없는 물건 둘레 (가로·세로 m) */
const FOOTPRINT: Record<StressObjectId, [number, number]> = {
  sandbag: [0.6, 0.6],
  keyboards: [0.7, 0.55],
};

/** 캔버스에 그리는 글자 (웹폰트 미리 받기용, places/index.ts ALL_CANVAS_TEXT) */
export const STRESS_TEXT = '레거시 코드 부숴도 됨 고장 난 키보드';

export function stressSpots(c: StressCorner): Record<StressObjectId, FacingSpot> {
  const spotOf = (o: StressObjectPlace): FacingSpot => ({
    x: o.x + Math.sin(o.yaw) * STAND_DIST,
    z: o.z + Math.cos(o.yaw) * STAND_DIST,
    yaw: o.yaw + Math.PI,
  });
  return { sandbag: spotOf(c.sandbag), keyboards: spotOf(c.keyboards) };
}

export function stressObstacles(c: StressCorner): Box[] {
  return (Object.keys(c) as StressObjectId[]).map((id) => {
    const [w, d] = FOOTPRINT[id];
    // 옆으로 돌려 놓은 물건은 가로·세로가 바뀌어요
    const sideways = Math.abs(Math.sin(c[id].yaw)) > 0.5;
    return boxAt(c[id].x, c[id].z, sideways ? d : w, sideways ? w : d);
  });
}

const stressClick = (key: StressObjectId): InteractData => ({ interact: 'stress', key });

/** 맞으면 뒤로 넘어갔다가 오뚝이처럼 돌아오는 시간(초) */
const SANDBAG_WOBBLE_S = 1.4;
/** 내리치면 키보드들이 들썩이는 시간(초) */
const PILE_JUMP_S = 0.6;

export function buildStressCorner(b: Builder, corner: StressCorner) {
  const sandbag = sandbagModel();
  const pile = keyboardPileModel();
  for (const [id, o] of [
    ['sandbag', sandbag.root],
    ['keyboards', pile.root],
  ] as const) {
    const at = corner[id];
    o.position.set(at.x, 0, at.z);
    o.rotation.y = at.yaw;
    b.click(o, stressClick(id));
    b.keep.add(o);
  }

  let wobble = 0;
  let jump = 0;
  return {
    /** 물건이 맞았을 때. 이 코너의 물건이면 true */
    poke(key: string): boolean {
      if (key === 'sandbag') wobble = SANDBAG_WOBBLE_S;
      else if (key === 'keyboards') jump = PILE_JUMP_S;
      else return false;
      return true;
    },
    update(dt: number) {
      if (wobble > 0) {
        wobble = Math.max(0, wobble - dt);
        const t = SANDBAG_WOBBLE_S - wobble;
        // 앞에서 맞아서 뒤(-z)로 넘어가요. rotation.x가 음수면 윗부분이 뒤로 가요
        sandbag.bag.rotation.x = -0.45 * Math.exp(-3 * t) * Math.cos(9 * t);
      }
      if (jump > 0) {
        jump = Math.max(0, jump - dt);
        const k = jump / PILE_JUMP_S;
        pile.boards.forEach((kb, i) => {
          kb.position.y = kb.userData.baseY + Math.abs(Math.sin(k * 14 + i)) * 0.07 * k;
          kb.rotation.y = kb.userData.baseYaw + Math.sin(k * 20 + i * 2) * 0.12 * k;
        });
      }
    },
  };
}

/** 바닥에 세워 두는 오뚝이 샌드백. bag을 기울여서 흔들어요 (앞면이 +z) */
function sandbagModel() {
  const root = new THREE.Group();
  const baseMat = std('#1d1f26', 0.6);
  const bagMat = std('#b8322c', 0.55);
  const BASE_H = 0.12;
  const BAG_R = 0.2;
  const BAG_H = 0.95;
  root.add(cyl(0.3, 0.32, BASE_H, baseMat, [0, BASE_H / 2, 0], 24));
  // 받침 위 한 점을 축으로 기울어요
  const bag = new THREE.Group();
  bag.position.y = BASE_H;
  bag.add(cyl(0.09, 0.12, 0.12, baseMat, [0, 0.06, 0], 16));
  bag.add(cyl(BAG_R, BAG_R, BAG_H, bagMat, [0, 0.12 + BAG_H / 2, 0], 20));
  const top = mesh(new THREE.SphereGeometry(BAG_R, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), bagMat, [0, 0.12 + BAG_H, 0]);
  top.scale.y = 0.45;
  bag.add(top);
  const tag = plane(0.34, 0.13, label(['레거시 코드'], '#f4efe4', '#1a1a1a'), [0, 0.12 + BAG_H * 0.62, BAG_R + 0.003]);
  bag.add(tag);
  root.add(bag);
  return { root, bag };
}

const KEYBOARD_COUNT = 4;

/** 나무 상자 위에 쌓인 고장 난 키보드들 (앞면이 +z). boards를 들썩여요 */
function keyboardPileModel() {
  const root = new THREE.Group();
  const crateMat = std('#8a6440', 0.85);
  const CRATE_H = 0.3;
  root.add(box(0.62, CRATE_H, 0.42, crateMat, [0, CRATE_H / 2, 0]));
  const sign = plane(0.4, 0.17, label(['부숴도 됨', '고장 난 키보드'], '#f2c230', '#1a1a1a'), [0, CRATE_H / 2, 0.212]);
  root.add(sign);

  const caseMat = std('#2b2f3a', 0.6);
  const keysMat = new THREE.MeshStandardMaterial({ map: keysTexture(), roughness: 0.6 });
  const boards: THREE.Group[] = [];
  for (let i = 0; i < KEYBOARD_COUNT; i++) {
    const kb = new THREE.Group();
    kb.add(box(0.46, 0.028, 0.16, caseMat, [0, 0, 0]));
    const keys = new THREE.Mesh(new THREE.PlaneGeometry(0.44, 0.14), keysMat);
    keys.rotation.x = -Math.PI / 2;
    keys.position.y = 0.0145;
    kb.add(keys);
    const baseY = CRATE_H + 0.016 + i * 0.032;
    const baseYaw = (i % 2 ? 1 : -1) * (0.15 + i * 0.08);
    kb.position.set((i % 2 ? 0.04 : -0.03) * (i + 1), baseY, (i % 3) * 0.02 - 0.02);
    kb.rotation.y = baseYaw;
    kb.userData.baseY = baseY;
    kb.userData.baseYaw = baseYaw;
    boards.push(kb);
    root.add(kb);
  }
  return { root, boards };
}

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
      // 몇 개는 이미 빠져서 비어 있어요
      if ((r * 7 + k * 3) % 11 === 0) continue;
      ctx.fillStyle = (r + k) % 9 === 0 ? '#f2b45a' : '#e8e4da';
      ctx.fillRect(k * cw + 2, r * rh + 2, cw - 4, rh - 4);
    }
  }
  return T.tex(c);
}
