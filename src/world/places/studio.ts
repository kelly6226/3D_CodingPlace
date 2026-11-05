// 🛏️ 새벽 2시 원룸: 모니터 불빛만 켜진 작은 방. 침대, 좌식 테이블, 컵라면, 고양이
import * as THREE from 'three';
import { DUCK_LINES } from '../../config';
import { FACE, boxAt, seat, seatObstacles, type Box, type PlaceLayout, type Seat } from '../layout';
import * as T from '../textures';
import * as T2 from './tex2';
import {
  DUCK_PET,
  alarmKit,
  beanbagModel,
  bounce,
  box,
  builder,
  cushionModel,
  cyl,
  duckModel,
  floorDecal,
  floorSlab,
  gamingChairModel,
  lightKit,
  mesh,
  plane,
  sideWallCutaway,
  std,
} from './kit';
import type { PlaceDef } from './types';

// ── 배치도 ─────────────────────────────────────────
const ROOM = { x0: -4, x1: 4, z0: -3, z1: 3, wallH: 2.7 };
const DESK = { x0: -1.0, x1: 1.2, z0: ROOM.z0, z1: -2.35, h: 0.75 };
const BED = { x0: ROOM.x0, x1: -2.55, z0: ROOM.z0, z1: -0.85, top: 0.5 };
const LOW = { x0: -0.25, x1: 0.85, z0: 0.55, z1: 1.25, h: 0.36 };
const KITCHEN = { x0: 3.4, x1: ROOM.x1, z0: ROOM.z0, z1: -1.0, h: 0.85 };
const FRIDGE = { x0: 3.45, x1: ROOM.x1, z0: -0.95, z1: -0.4 };
const WINDOW = { x0: 1.8, x1: 3.4, y0: 0.95, y1: 2.15 };
const DOOR_Z = 0.65;
const lowCx = (LOW.x0 + LOW.x1) / 2;
const lowCz = (LOW.z0 + LOW.z1) / 2;

const seats: Seat[] = [
  seat('desk', 'chair', '책상', 0.1, -1.85, FACE.N, { h: 0.47, dist: 0.65 }),
  // 침대에 기대 앉아서 무릎 위 노트북
  seat('bed-1', 'bed', '침대 위', -3.6, -2.25, FACE.S, { h: 0.55, dist: 0.45, ly: 0.62, ax: -2.25, az: -2.2 }),
  seat('bed-2', 'bed', '침대 위', -2.95, -2.25, FACE.S, { h: 0.55, dist: 0.45, ly: 0.62, ax: -2.25, az: -2.2 }),
  // 좌식 테이블에 방석 깔고
  seat('low-n', 'floor', '좌식 테이블', lowCx, LOW.z0 - 0.35, FACE.S, { dist: 0.55, ly: LOW.h }),
  seat('low-s', 'floor', '좌식 테이블', lowCx, LOW.z1 + 0.35, FACE.N, { dist: 0.55, ly: LOW.h }),
  seat('low-w', 'floor', '좌식 테이블', LOW.x0 - 0.45, lowCz, FACE.E, { dist: 0.55, ly: LOW.h }),
  seat('low-e', 'floor', '좌식 테이블', LOW.x1 + 0.45, lowCz, FACE.W, { dist: 0.55, ly: LOW.h }),
  seat('beanbag', 'beanbag', '빈백', 3.0, 2.2, FACE.W, { dist: 0.3, ly: 0.45, ax: 2.25, az: 2.2 }),
];

const obstacles: Box[] = [
  DESK,
  BED,
  LOW,
  KITCHEN,
  FRIDGE,
  boxAt(-2.9, 1.5, 1.05, 0.5), // 빨래 건조대
  boxAt(-3.5, 2.5, 0.8, 0.7), // 택배 상자
  boxAt(-1.25, -2.7, 0.3, 0.3), // 컵라면 탑
  ...seatObstacles(seats),
];

const layout: PlaceLayout = {
  room: ROOM,
  spawn: { x: 3.5, z: DOOR_Z },
  seats,
  obstacles,
  spots: {
    use: { x: 2.95, z: -1.9, yaw: FACE.E },
    deploy: { x: 0.95, z: -1.95, yaw: FACE.N },
    pet: { x: -2.2, z: -1.1 },
    idle: { x: 1.8, z: -0.4 },
  },
};

const CAT_LINES = [
  '🐱 냥. (키보드 위에 앉고 싶어 해요)',
  '🐱 고양이가 Ctrl+S 대신 Ctrl+W를 눌렀어요.',
  '🐱 냥. 그 코드, 내가 짜도 그것보단 낫겠다.',
  '🐱 골골골… 집중력이 10 올랐어요.',
  '🐱 새벽 2시에 우다다 시작. 아랫집에서 연락 올 것 같아요.',
];

/** 식빵 굽는 고양이 */
function catModel() {
  const g = new THREE.Group();
  const fur = std('#e0954a', 0.95);
  const white = std('#f4efe6', 0.95);
  const dark = std('#2a1d14', 0.6);
  const body = mesh(new THREE.SphereGeometry(0.2, 18, 12), fur, [0, 0.12, 0]);
  body.scale.set(0.85, 0.6, 1.2);
  g.add(body);
  g.add(mesh(new THREE.SphereGeometry(0.12, 16, 12), fur, [0, 0.24, 0.2]));
  const muzzle = mesh(new THREE.SphereGeometry(0.06, 12, 8), white, [0, 0.21, 0.3]);
  muzzle.scale.set(1.1, 0.7, 0.6);
  g.add(muzzle);
  for (const x of [-0.065, 0.065]) {
    const ear = mesh(new THREE.ConeGeometry(0.045, 0.08, 4), fur, [x, 0.35, 0.19]);
    ear.rotation.z = -x * 2;
    g.add(ear);
    const eye = mesh(new THREE.SphereGeometry(0.016, 8, 6), dark, [x * 0.7, 0.255, 0.308]);
    eye.scale.set(1.3, 0.35, 0.6);
    g.add(eye);
  }
  const tail = mesh(new THREE.TorusGeometry(0.17, 0.03, 6, 16, Math.PI * 0.9), fur, [0, 0.04, 0]);
  tail.rotation.set(-Math.PI / 2, 0, Math.PI * 1.05);
  g.add(tail);
  return g;
}

// ── 만들기 ─────────────────────────────────────────
function build(scene: THREE.Scene, mobile: boolean) {
  const b = builder(scene);
  const { add, click, note } = b;
  const M = {
    wood: std('#6b4a35', 0.7),
    lightWood: std('#b48a5f', 0.6),
    white: std('#eeeae2', 0.6),
    black: std('#16171b', 0.6),
    metal: std('#a7adb5', 0.35, 0.7),
    cardboard: std('#b5895a', 0.9),
    tape: std('#d8c69a', 0.7),
    cabinet: std('#e8e2d6', 0.6),
    counter: std('#9e978b', 0.5),
    red: std('#d42a2a', 0.3, 0, { emissive: '#ff2020', emissiveIntensity: 0.6 }),
    can: [std('#2b6cff', 0.3, 0.6), std('#1fbf6a', 0.3, 0.6), std('#e8433a', 0.3, 0.6)],
    cup: std('#f3ede0', 0.7),
    cupBand: std('#d6453a', 0.6),
  };
  const H = ROOM.wallH;
  const W = ROOM.x1 - ROOM.x0;
  const D = ROOM.z1 - ROOM.z0;

  // 창밖 (맞은편 빌라 + 편의점)
  const outside = plane(3.2, 2.4, T2.nightStreet(), [(WINDOW.x0 + WINDOW.x1) / 2, 1.5, ROOM.z0 - 0.9], 0);
  (outside.material as THREE.MeshBasicMaterial).transparent = false;
  add(outside);

  // 바닥: 장판 + 동그란 러그
  const floor = floorSlab(b, ROOM, std('#ffffff', 0.8, 0, { map: T2.linoleum() }), std('#211a16', 0.9));
  const rug = new THREE.Mesh(new THREE.CircleGeometry(1.25, 40), std('#4a4060', 1));
  rug.rotation.x = -Math.PI / 2;
  rug.position.set(lowCx, 0.006, lowCz);
  rug.receiveShadow = true;
  rug.userData.floor = true;
  add(rug);
  add(floorDecal(0.75, 1.0, std('#8c8a86', 0.8), [ROOM.x1 - 0.38, 0.007, DOOR_Z])); // 현관 타일

  // 벽 (뒤 벽은 창문 자리를 비움)
  const wallMat = std('#ffffff', 0.95, 0, { map: T2.wallpaper() });
  const leftWall = add(new THREE.Group());
  const rightWall = add(new THREE.Group());
  const backWall = add(new THREE.Group());
  add(box(0.2, H, D, wallMat, [ROOM.x0 - 0.1, H / 2, 0], false), leftWall);
  add(box(0.2, H, D, wallMat, [ROOM.x1 + 0.1, H / 2, 0], false), rightWall);
  const bz = ROOM.z0 - 0.1;
  const lw = WINDOW.x0 - (ROOM.x0 - 0.2);
  add(box(lw, H, 0.2, wallMat, [ROOM.x0 - 0.2 + lw / 2, H / 2, bz], false), backWall);
  const rw = ROOM.x1 + 0.2 - WINDOW.x1;
  add(box(rw, H, 0.2, wallMat, [WINDOW.x1 + rw / 2, H / 2, bz], false), backWall);
  const ww = WINDOW.x1 - WINDOW.x0;
  const wcx = (WINDOW.x0 + WINDOW.x1) / 2;
  add(box(ww, WINDOW.y0, 0.2, wallMat, [wcx, WINDOW.y0 / 2, bz], false), backWall);
  add(box(ww, H - WINDOW.y1, 0.2, wallMat, [wcx, (H + WINDOW.y1) / 2, bz], false), backWall);
  const frame = std('#f2f2ee', 0.4);
  add(box(ww + 0.08, 0.06, 0.24, frame, [wcx, WINDOW.y0, bz], false), backWall);
  add(box(ww + 0.08, 0.06, 0.24, frame, [wcx, WINDOW.y1, bz], false), backWall);
  for (const x of [WINDOW.x0, wcx, WINDOW.x1]) add(box(0.06, WINDOW.y1 - WINDOW.y0, 0.24, frame, [x, (WINDOW.y0 + WINDOW.y1) / 2, bz], false), backWall);
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(ww, WINDOW.y1 - WINDOW.y0), new THREE.MeshBasicMaterial({ color: '#9fb8d8', transparent: true, opacity: 0.08, depthWrite: false }));
  glass.position.set(wcx, (WINDOW.y0 + WINDOW.y1) / 2, ROOM.z0 - 0.05);
  add(glass, backWall);
  add(box(ww + 0.3, 0.04, 0.16, frame, [wcx, WINDOW.y0 - 0.02, ROOM.z0 + 0.06], false), backWall); // 창틀
  // 반쯤 친 커튼
  add(cyl(0.012, 0.012, ww + 0.6, M.metal, [wcx, WINDOW.y1 + 0.18, ROOM.z0 + 0.12], 6), backWall).rotation.z = Math.PI / 2;
  const curtain = std('#56627f', 1, 0, { side: THREE.DoubleSide });
  for (let i = 0; i < 4; i++) add(box(0.14, WINDOW.y1 - WINDOW.y0 + 0.45, 0.04, curtain, [WINDOW.x0 - 0.12 + i * 0.13, (WINDOW.y0 + WINDOW.y1) / 2 - 0.05, ROOM.z0 + 0.12 + (i % 2) * 0.03], false), backWall);
  // 걸레받이
  const baseMat = std('#cfc8ba', 0.7);
  add(box(0.03, 0.08, D, baseMat, [ROOM.x0 + 0.015, 0.04, 0], false), leftWall);
  add(box(0.03, 0.08, D, baseMat, [ROOM.x1 - 0.015, 0.04, 0], false), rightWall);
  add(box(W, 0.08, 0.03, baseMat, [0, 0.04, ROOM.z0 + 0.015], false), backWall);

  // 벽 장식: 할 일 포스터 (침대 위), 보라색 LED 줄
  note(plane(0.55, 0.715, T2.todoPoster(), [ROOM.x0 + 0.02, 1.55, -1.9], Math.PI / 2, false), ['📝 할 일 5개 중 1개 했어요. 나머지는 내일의 나에게.', '📝 "일찍 자기"에 줄이 그어져 있어요. 포기한 거래요.'], leftWall);
  const ledStrip = new THREE.MeshBasicMaterial({ color: '#b48cff' });
  add(box(WINDOW.x0 - ROOM.x0 - 0.2, 0.02, 0.02, ledStrip, [(ROOM.x0 + WINDOW.x0) / 2 - 0.1, H - 0.12, ROOM.z0 + 0.02], false), backWall);

  // ── 책상 ─────────────────────────────────────
  const dw = DESK.x1 - DESK.x0;
  const dcx = (DESK.x0 + DESK.x1) / 2;
  const dcz = (DESK.z0 + DESK.z1) / 2;
  add(box(dw, 0.04, DESK.z1 - DESK.z0, M.black, [dcx, DESK.h - 0.02, dcz]));
  for (const x of [DESK.x0 + 0.05, DESK.x1 - 0.05]) add(box(0.05, DESK.h - 0.04, DESK.z1 - DESK.z0 - 0.05, M.black, [x, (DESK.h - 0.04) / 2, dcz]));
  // 모니터 = git log
  const gitlog = new T.GitLogScreen();
  add(box(0.14, 0.02, 0.12, M.black, [0.1, DESK.h + 0.01, -2.82]));
  add(box(0.04, 0.22, 0.03, M.black, [0.1, DESK.h + 0.12, -2.85]));
  add(box(1.04, 0.62, 0.04, M.black, [0.1, 1.15, -2.83]));
  const tv = plane(0.98, 0.55, gitlog.texture, [0.1, 1.15, -2.808], 0);
  (tv.material as THREE.MeshBasicMaterial).transparent = false;
  click(tv, { interact: 'tv' });
  // 세로 모니터 (코드)
  const side = new THREE.Group();
  side.position.set(-0.72, DESK.h, -2.78);
  side.rotation.y = 0.35;
  side.add(box(0.12, 0.02, 0.1, M.black, [0, 0.01, 0]));
  side.add(box(0.03, 0.15, 0.03, M.black, [0, 0.09, -0.02]));
  side.add(box(0.36, 0.62, 0.035, M.black, [0, 0.47, 0]));
  side.add(plane(0.33, 0.58, T.codeScreen(), [0, 0.47, 0.019], 0));
  add(side);
  // 마우스, 머그, 스탠드 조명
  add(box(0.06, 0.03, 0.1, M.black, [0.62, DESK.h + 0.015, -2.45]));
  add(cyl(0.045, 0.04, 0.1, std('#f4f0e6', 0.5), [-0.35, DESK.h + 0.05, -2.48], 14));
  const lampHead = std('#efe6d2', 0.6, 0, { emissive: '#ffcf8a', emissiveIntensity: 0.8 });
  add(cyl(0.08, 0.09, 0.02, M.black, [-0.88, DESK.h + 0.01, -2.75], 14));
  const arm = add(cyl(0.01, 0.01, 0.42, M.black, [-0.85, DESK.h + 0.2, -2.68], 6));
  arm.rotation.x = 0.35;
  const head = add(mesh(new THREE.ConeGeometry(0.07, 0.1, 16, 1, true), lampHead, [-0.82, DESK.h + 0.41, -2.58]));
  head.rotation.x = 0.6;
  // PC 본체 (RGB)
  add(box(0.22, 0.48, 0.46, M.black, [0.95, 0.24, -2.72]));
  const rgb = new THREE.MeshBasicMaterial({ color: '#ff4fd8' });
  add(box(0.005, 0.38, 0.02, rgb, [0.84, 0.26, -2.5], false));
  add(box(0.005, 0.02, 0.36, new THREE.MeshBasicMaterial({ color: '#4ff0ff' }), [0.84, 0.46, -2.7], false));
  // 배포 버튼 (USB 빨간 버튼)
  const dep = new THREE.Group();
  dep.position.set(0.95, DESK.h, -2.55);
  dep.add(box(0.15, 0.06, 0.15, M.black, [0, 0.03, 0]));
  const dome = mesh(new THREE.SphereGeometry(0.058, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), M.red, [0, 0.06, 0]);
  dome.scale.y = 0.8;
  dep.add(dome);
  const depSign = plane(0.22, 0.11, T.smallSign('DEPLOY', 'prod 직행', '#f2c230', '#1a1a1a'), [0, 0.2, -0.08], 0, false);
  depSign.rotation.x = -0.3;
  dep.add(depSign);
  click(dep, { interact: 'deploy' });
  // 모니터 위 작은 오리
  const duck = duckModel(0.13);
  duck.position.set(0.45, 1.46, -2.83);
  duck.rotation.y = -0.4;
  click(duck, DUCK_PET(DUCK_LINES));
  b.keep.add(duck);
  const duckAnim = bounce(duck);
  // 컵라면 탑
  const tower = new THREE.Group();
  tower.position.set(-1.25, 0, -2.7);
  for (let i = 0; i < 5; i++) {
    tower.add(cyl(0.065, 0.05, 0.11, M.cup, [0, 0.055 + i * 0.075, 0], 14));
    tower.add(cyl(0.066, 0.06, 0.02, M.cupBand, [0, 0.09 + i * 0.075, 0], 14));
  }
  note(tower, ['🍜 오늘 먹은 컵라면 탑이에요. 내일은 꼭 밥 먹기.']);

  // ── 침대 ─────────────────────────────────────
  const bw = BED.x1 - BED.x0;
  const bl = BED.z1 - BED.z0;
  const bcx = (BED.x0 + BED.x1) / 2;
  const bcz = (BED.z0 + BED.z1) / 2;
  add(box(bw, 0.3, bl, M.wood, [bcx, 0.15, bcz]));
  add(box(bw - 0.04, 0.2, bl - 0.08, std('#e8e4dc', 0.9), [bcx, 0.4, bcz + 0.02]));
  add(box(bw, 0.9, 0.08, M.wood, [bcx, 0.45, BED.z0 + 0.04]));
  add(box(bw, 0.04, 0.2, M.wood, [bcx, 0.92, BED.z0 + 0.1]));
  const pillow = std('#f1efe9', 1);
  for (const x of [-3.6, -2.95]) {
    const p = mesh(new THREE.SphereGeometry(0.3, 16, 10), pillow, [x, 0.6, BED.z0 + 0.35]);
    p.scale.set(0.95, 0.3, 0.45);
    add(p);
  }
  const blanket = std('#7f8fb8', 1);
  add(box(bw - 0.02, 0.08, 0.7, blanket, [bcx, 0.53, BED.z1 - 0.4]));
  const fold = add(box(bw * 0.7, 0.1, 0.35, blanket, [bcx + 0.15, 0.58, BED.z1 - 0.75]));
  fold.rotation.y = 0.12;
  // 침대 위 노트북 받침
  add(box(1.22, 0.025, 0.3, M.lightWood, [-3.27, 0.61, -1.78]));
  for (const x of [-3.85, -2.69]) add(box(0.03, 0.1, 0.28, M.lightWood, [x, 0.55, -1.78]));
  // 헤드 선반 위 알람시계
  const clock = new THREE.Group();
  clock.position.set(-2.78, 0.94, BED.z0 + 0.1);
  clock.add(box(0.16, 0.08, 0.06, M.black, [0, 0.04, 0]));
  clock.add(plane(0.14, 0.06, T2.label(['02:00'], '#120808', '#ff4a3d', 256, 110, T.FONT_MONO, 700), [0, 0.04, 0.031], 0));
  note(clock, ['⏰ 알람은 오전 9시. 지금 자면 {sleepHours}시간 잘 수 있어요.', '⏰ 알람을 5개 맞춰놨어요. 9:00, 9:05, 9:10, 9:15, 9:20']);
  // 이불 끝의 고양이
  const cat = catModel();
  cat.position.set(-3.2, 0.5, -1.2);
  cat.rotation.y = 0.9;
  click(cat, { interact: 'pet', sound: 'meow', key: 'cat', lines: CAT_LINES });
  b.keep.add(cat);
  const catAnim = bounce(cat);

  // ── 부엌 (오른쪽 벽) ───────────────────────────
  const kitchen = new THREE.Group();
  const kw = KITCHEN.x1 - KITCHEN.x0;
  const kl = KITCHEN.z1 - KITCHEN.z0;
  kitchen.position.set((KITCHEN.x0 + KITCHEN.x1) / 2, 0, (KITCHEN.z0 + KITCHEN.z1) / 2);
  kitchen.add(box(kw, KITCHEN.h - 0.04, kl, M.cabinet, [0, (KITCHEN.h - 0.04) / 2, 0]));
  kitchen.add(box(kw + 0.02, 0.04, kl, M.counter, [0, KITCHEN.h - 0.02, 0]));
  kitchen.add(box(0.005, 0.5, 0.01, M.counter, [-kw / 2 - 0.003, 0.45, -0.3], false));
  kitchen.add(box(0.005, 0.5, 0.01, M.counter, [-kw / 2 - 0.003, 0.45, 0.4], false));
  kitchen.add(box(kw - 0.15, 0.02, 0.5, std('#5f646b', 0.3, 0.6), [0.02, KITCHEN.h + 0.001, -0.55], false)); // 싱크
  kitchen.add(box(0.35, 0.03, 0.35, M.black, [0.02, KITCHEN.h + 0.015, 0.35])); // 인덕션
  kitchen.add(cyl(0.08, 0.09, 0.2, std('#d9dde2', 0.3, 0.5), [0.05, KITCHEN.h + 0.1, -0.05], 16)); // 전기포트
  for (let i = 0; i < 3; i++) {
    kitchen.add(cyl(0.065, 0.05, 0.11, M.cup, [-0.1, KITCHEN.h + 0.055 + i * 0.075, 0.82], 14));
    kitchen.add(cyl(0.066, 0.06, 0.02, M.cupBand, [-0.1, KITCHEN.h + 0.09 + i * 0.075, 0.82], 14));
  }
  click(kitchen, { interact: 'use' });
  const ramenNote = plane(0.26, 0.26, T.stickyNote(['컵라면은', '3분']), [KITCHEN.x0 + 0.01, 1.08, -1.6], -Math.PI / 2, false);
  click(ramenNote, { interact: 'use' }, rightWall);
  add(box(0.35, 0.55, 1.6, M.cabinet, [ROOM.x1 - 0.175, 1.85, -2.1]), rightWall); // 위 수납장
  // 냉장고 + 전자레인지
  const fridge = new THREE.Group();
  fridge.position.set((FRIDGE.x0 + FRIDGE.x1) / 2, 0, (FRIDGE.z0 + FRIDGE.z1) / 2);
  fridge.add(box(0.55, 0.85, 0.55, std('#f2f2f0', 0.4), [0, 0.425, 0]));
  fridge.add(box(0.01, 0.35, 0.03, M.metal, [-0.28, 0.55, 0.2], false));
  fridge.add(box(0.45, 0.27, 0.36, std('#d9dbdf', 0.4), [0, 0.985, 0]));
  fridge.add(box(0.01, 0.16, 0.22, M.black, [-0.226, 0.985, -0.03], false));
  fridge.add(plane(0.12, 0.12, T.stickyNote(['우유', '사기'], '#a7e3ff'), [-0.281, 0.65, -0.1], -Math.PI / 2, false));
  note(fridge, ['🧊 냉장고엔 에너지 드링크 6캔이랑 김치뿐이에요.', '🧊 전자레인지 돌리는 소리에 고양이가 깼어요.']);

  // 현관 신발
  for (const [z, c] of [
    [0.35, '#e9e5dc'],
    [0.85, '#2b2f3a'],
  ] as const) {
    for (const dz of [-0.07, 0.07]) add(box(0.26, 0.07, 0.1, std(c, 0.7), [ROOM.x1 - 0.28, 0.035, z + dz]));
  }
  // 문 (오른쪽 벽)
  const door = new THREE.Group();
  door.position.set(ROOM.x1 - 0.02, 0, DOOR_Z);
  door.add(box(0.06, 2.05, 0.9, std('#8a6e58', 0.6), [0, 1.025, 0]));
  door.add(box(0.07, 2.12, 0.05, std('#5b4636', 0.6), [0, 1.06, -0.47]));
  door.add(box(0.07, 2.12, 0.05, std('#5b4636', 0.6), [0, 1.06, 0.47]));
  door.add(box(0.05, 0.04, 0.12, M.metal, [-0.05, 1.0, 0.3]));
  door.add(box(0.03, 0.14, 0.12, M.black, [-0.04, 1.3, 0.3]));
  add(door, rightWall);

  // ── 좌식 테이블 ───────────────────────────────
  add(box(LOW.x1 - LOW.x0, 0.04, LOW.z1 - LOW.z0, M.lightWood, [lowCx, LOW.h - 0.02, lowCz]));
  for (const x of [LOW.x0 + 0.08, LOW.x1 - 0.08]) for (const z of [LOW.z0 + 0.08, LOW.z1 - 0.08]) add(box(0.05, LOW.h - 0.04, 0.05, M.lightWood, [x, (LOW.h - 0.04) / 2, z]));
  const chips = add(box(0.16, 0.22, 0.05, std('#f2c230', 0.6), [lowCx - 0.35, LOW.h + 0.09, lowCz + 0.22]));
  chips.rotation.set(-1.2, 0.4, 0);
  add(cyl(0.033, 0.033, 0.12, M.can[0], [lowCx + 0.38, LOW.h + 0.06, lowCz - 0.22], 10));
  add(cyl(0.033, 0.033, 0.12, M.can[1], [lowCx + 0.44, LOW.h + 0.06, lowCz - 0.12], 10));

  // ── 빨래 건조대 ───────────────────────────────
  const rack = new THREE.Group();
  rack.position.set(-2.9, 0, 1.5);
  for (const sx of [-0.5, 0.5]) {
    for (const k of [-1, 1]) {
      const leg = box(0.02, 1.15, 0.02, M.metal, [sx, 0.55, k * 0.12]);
      leg.rotation.x = -k * 0.22;
      rack.add(leg);
    }
  }
  for (const z of [-0.08, 0.08]) {
    const bar = cyl(0.01, 0.01, 1.05, M.metal, [0, 1.07, z], 6);
    bar.rotation.z = Math.PI / 2;
    rack.add(bar);
  }
  const clothes: [number, number, string, number, number][] = [
    [-0.32, -0.08, '#3b4a6b', 0.36, 0.5],
    [0.05, 0.08, '#c9873a', 0.3, 0.42],
    [0.36, -0.08, '#e9e5dc', 0.22, 0.3],
    [-0.05, -0.08, '#2f2f35', 0.08, 0.22],
    [0.18, 0.08, '#d6453a', 0.08, 0.2],
  ];
  for (const [x, z, c, w, h] of clothes) rack.add(box(w, h, 0.02, std(c, 1, 0, { side: THREE.DoubleSide }), [x, 1.06 - h / 2, z]));
  note(rack, ['👕 빨래가 3일째 마르는 중이에요. 원룸은 습해요.', '👕 후드티만 다섯 벌. 다 같은 색이에요.']);

  // ── 택배 상자 ─────────────────────────────────
  const boxes = new THREE.Group();
  boxes.position.set(-3.5, 0, 2.5);
  const parcels: [number, number, number, number, number, number][] = [
    [0, 0, 0.7, 0.4, 0.55, 0.05],
    [0.05, 0.4, 0.5, 0.3, 0.4, -0.15],
    [-0.02, 0.7, 0.3, 0.18, 0.25, 0.3],
  ];
  for (const [x, y, w, h, d, r] of parcels) {
    const g = new THREE.Group();
    g.position.set(x, y, 0);
    g.rotation.y = r;
    g.add(box(w, h, d, M.cardboard, [0, h / 2, 0]));
    g.add(box(0.06, 0.005, d + 0.005, M.tape, [0, h + 0.002, 0], false));
    boxes.add(g);
  }
  note(boxes, ['📦 아직 안 뜯은 택배예요. 키보드 같아요. 이번 달 세 번째.', '📦 개발 서적 세트. 포장째로 3개월째예요.']);

  // ── 자리 가구 ─────────────────────────────────
  const cushions = ['#c9873a', '#5b7fa6', '#8c4a4a', '#6b7a52'];
  let ci = 0;
  for (const s of seats) {
    b.seatGroup(s, (g) => {
      if (s.kind === 'chair') gamingChairModel(g, '#ff4d6d');
      else if (s.kind === 'floor') cushionModel(g, cushions[ci++ % cushions.length]);
      else if (s.kind === 'beanbag') beanbagModel(g, '#6a5acd');
    });
  }

  // ── 조명: 어두운 방, 모니터 불빛 ─────────────────
  const L = lightKit(b);
  L.point([0.1, 1.2, -2.25], '#7fa8ff', mobile ? 6 : 5, 4.5);
  L.glow([0.1, 1.15, -2.7], 1.6, 'rgb(130,170,255)', 0.35);
  L.point([-0.8, 1.15, -2.5], '#ffb46b', 4, 4);
  L.glow([-0.82, DESK.h + 0.36, -2.55], 0.5);
  L.point([-2.6, 2.2, -2.5], '#a36bff', mobile ? 3 : 3.5, 5);
  for (let x = ROOM.x0 + 0.5; x < WINDOW.x0 - 0.3; x += 1.1) L.glow([x, H - 0.12, ROOM.z0 + 0.05], 0.6, 'rgb(180,140,255)', 0.4);
  L.point([wcx, 1.6, ROOM.z0 + 0.4], '#ffcf8a', 2, 5);
  if (!mobile) {
    L.point([3.3, 1.45, -2.0], '#fff1d6', 2.5, 3);
    L.point([lowCx, 1.6, lowCz], '#ffd9a8', 1.6, 4);
  }

  const alarm = alarmKit(b, ROOM, [M.red]);
  const walls = sideWallCutaway(leftWall, rightWall, ROOM);
  b.finish([leftWall, rightWall, backWall]);

  return {
    root: b.root,
    floor,
    clickables: b.clickables,
    seatHits: b.seatHits,
    gitlog,
    update(dt: number, cam: THREE.Camera) {
      walls(cam);
      alarm.update(dt);
      duckAnim.update(dt);
      catAnim.update(dt);
    },
    alarm: (sec: number) => alarm.start(sec),
    poke: (key: string) => {
      if (key === 'duck') duckAnim.poke();
      if (key === 'cat') catAnim.poke();
    },
    get alarming() {
      return alarm.on;
    },
  };
}

export const studio: PlaceDef = {
  id: 'studio',
  layout,
  ambience: 'studio',
  env: {
    background: () => new THREE.Color('#04050a'),
    hemi: { sky: '#4a5680', ground: '#1a1410', intensity: 0.6 },
    sun: { color: '#8a9ad0', intensity: 0.4, pos: [3, 9, -8] },
    exposure: 1.15,
  },
  canvasText: '컵라면은 3분 우유 사기 DEPLOY prod 직행 02:00',
  build,
};

