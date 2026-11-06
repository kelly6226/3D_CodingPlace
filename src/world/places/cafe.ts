// ☕ 판교 새벽 카페: 통창 너머 판교의 등대, 긴 테이블, 커피 카운터, 금요일 배포 버튼
import * as THREE from 'three';
import { DUCK_LINES, RACK_LINES } from '../../config';
import { seatObstacles, type Box, type PlaceLayout, type Seat } from '../layout';
import { buildSkyline } from '../skyline';
import * as T from '../textures';
import {
  DUCK_PET,
  alarmKit,
  beanbagModel,
  bounce,
  box,
  builder,
  chairModel,
  cyl,
  duckModel,
  floorDecal,
  floorSlab,
  ledField,
  lightKit,
  mesh,
  plane,
  plantModel,
  wallCutaway,
  std,
  stoolModel,
  type V3,
} from './kit';
import type { PlaceDef } from './types';

// ── 배치도 ─────────────────────────────────────────
const ROOM = { x0: -7, x1: 7, z0: -5, z1: 5, wallH: 3.2 };
/** 시점이 향하는 방 한가운데(눈높이쯤) */
const ROOM_CENTER = new THREE.Vector3((ROOM.x0 + ROOM.x1) / 2, 0.6, (ROOM.z0 + ROOM.z1) / 2);
const TABLE = { x0: -3.2, x1: 3.2, z0: -1.9, z1: -0.9, h: 0.75 };
const LOW_TABLE = { x: -4.9, z: 2.9, r: 0.5, h: 0.42 };
const STAND_DESKS = [2.1, 3.7];

const seats: Seat[] = [];
// 창가 바 자리: 창밖 판교를 보면서
[-4.4, -2.2, 0, 2.2, 4.4].forEach((x, i) =>
  seats.push({ id: `bar-${i + 1}`, kind: 'stool', label: '창가 바 자리', x, z: -3.95, yaw: Math.PI, h: 0.72, ax: x, az: -3.35, lx: x, ly: 1.05, lz: -4.42, lyaw: 0 }),
);
// 가운데 긴 테이블
[-2.4, -0.8, 0.8, 2.4].forEach((x, i) => {
  seats.push({ id: `table-n${i + 1}`, kind: 'chair', label: '긴 테이블', x, z: -2.25, yaw: 0, h: 0.45, ax: x, az: -2.85, lx: x, ly: TABLE.h, lz: -1.72, lyaw: Math.PI });
  seats.push({ id: `table-s${i + 1}`, kind: 'chair', label: '긴 테이블', x, z: -0.55, yaw: Math.PI, h: 0.45, ax: x, az: 0.05, lx: x, ly: TABLE.h, lz: -1.08, lyaw: 0 });
});
// 빈백 소파 (git log TV 앞)
[
  [-5.9, 3.3],
  [-4.05, 3.65],
  [-4.9, 1.85],
].forEach(([x, z], i) => {
  const dx = x - LOW_TABLE.x;
  const dz = z - LOW_TABLE.z;
  const len = Math.hypot(dx, dz);
  const ux = dx / len;
  const uz = dz / len;
  const yaw = Math.atan2(-ux, -uz);
  seats.push({
    id: `beanbag-${i + 1}`,
    kind: 'beanbag',
    label: '빈백 소파',
    x,
    z,
    yaw,
    h: 0.3,
    ax: x + ux * 0.72,
    az: z + uz * 0.72,
    lx: LOW_TABLE.x + ux * 0.24,
    ly: LOW_TABLE.h,
    lz: LOW_TABLE.z + uz * 0.24,
    lyaw: yaw + Math.PI,
  });
});
// 스탠딩 데스크
STAND_DESKS.forEach((z, i) =>
  seats.push({ id: `stand-${i + 1}`, kind: 'stand', label: '스탠딩 데스크', x: 5.72, z, yaw: Math.PI / 2, h: 0, ax: 5.55, az: z, lx: 6.3, ly: 0.72, lz: z, lyaw: -Math.PI / 2 }),
);

const SPOT = {
  coffee: { x: -5.7, z: -1.0, yaw: -Math.PI / 2 },
  deploy: { x: 3.3, z: 2.75, yaw: 0 },
  deployButton: { x: 3.3, z: 3.4 },
  duck: { x: -1.8, z: 3.7 },
  rack: { x: 6.55, z: -4.5 },
  whiteboard: { x: 5.65, z: -1.6, yaw: -0.2 },
};

const obstacles: Box[] = [
  { x0: -5.6, x1: 5.6, z0: -4.75, z1: -4.2 }, // 바 카운터
  { x0: TABLE.x0, x1: TABLE.x1, z0: TABLE.z0, z1: TABLE.z1 },
  { x0: -7, x1: -6.15, z0: -2.7, z1: 0.7 }, // 커피 카운터
  { x0: -7, x1: -6.55, z0: -4.9, z1: -3.3 }, // 책장
  { x0: LOW_TABLE.x - 0.45, x1: LOW_TABLE.x + 0.45, z0: LOW_TABLE.z - 0.45, z1: LOW_TABLE.z + 0.45 },
  ...STAND_DESKS.map((z) => ({ x0: 6.2, x1: 6.95, z0: z - 0.5, z1: z + 0.5 })),
  { x0: 4.6, x1: 6.7, z0: -1.95, z1: -1.25 }, // 화이트보드
  { x0: 6.15, x1: 6.95, z0: -4.95, z1: -4.05 }, // 서버랙
  { x0: 2.95, x1: 3.65, z0: 3.05, z1: 3.75 }, // 배포 버튼
  { x0: -2.3, x1: -1.3, z0: 3.2, z1: 4.2 }, // 거대 오리
  ...[
    [6.5, -3.5],
    [-6.5, 4.5],
    [6.5, 4.6],
    [0.7, 4.55],
  ].map(([x, z]) => ({ x0: x - 0.3, x1: x + 0.3, z0: z - 0.3, z1: z + 0.3 })),
  { x0: -6.55, x1: -6.05, z0: 1.45, z1: 1.95 }, // 스탠드 조명
  ...seatObstacles(seats),
];

const layout: PlaceLayout = {
  room: ROOM,
  spawn: { x: 6.3, z: 0.3 },
  seats,
  obstacles,
  spots: {
    use: SPOT.coffee,
    deploy: SPOT.deploy,
    pet: { x: -0.9, z: 3.1 },
    idle: { x: 4.6, z: 0.8 },
  },
};

// ── 만들기 ─────────────────────────────────────────
function build(scene: THREE.Scene, mobile: boolean) {
  const b = builder(scene);
  const { add, click, note } = b;
  const M = {
    wood: std('#7a4e32', 0.6),
    oak: std('#9a6a43', 0.55),
    darkWood: std('#4a3021', 0.7),
    metal: std('#1f2126', 0.45, 0.6),
    chrome: std('#c9ccd2', 0.2, 0.9),
    frame: std('#23262d', 0.5, 0.4),
    cream: std('#e8e0d0', 0.6),
    marble: std('#e9e6e0', 0.25),
    black: std('#17181c', 0.6),
    white: std('#f4f2ec', 0.5),
    red: std('#d42a2a', 0.3, 0, { emissive: '#ff2020', emissiveIntensity: 0.6 }),
    shade: std('#2f4a3e', 0.5, 0.3, { side: THREE.DoubleSide }),
    bulb: new THREE.MeshBasicMaterial({ color: '#ffe2b0' }),
  };
  const H = ROOM.wallH;
  const W = ROOM.x1 - ROOM.x0;
  const D = ROOM.z1 - ROOM.z0;

  // 창밖 판교
  const outside = new THREE.Group();
  add(outside);
  const skyline = buildSkyline(outside);

  // 바닥
  const floor = floorSlab(b, ROOM, std('#ffffff', 0.75, 0, { map: T.woodFloor() }));
  add(box(W + 0.4, 0.06, 0.06, M.darkWood, [0, 0.03, ROOM.z1 - 0.03], false));
  add(floorDecal(7.6, 2.9, std('#ffffff', 0.9, 0, { map: T.rug() }), [0, 0.006, -1.4]));
  const round = new THREE.Mesh(new THREE.CircleGeometry(1.55, 40), std('#6b4b3a', 1));
  round.rotation.x = -Math.PI / 2;
  round.position.set(LOW_TABLE.x, 0.006, LOW_TABLE.z);
  round.receiveShadow = true;
  round.userData.floor = true;
  add(round);
  add(floorDecal(0.9, 1.3, std('#ffffff', 0.9, 0, { map: T.doormat() }), [6.25, 0.007, 0.3], Math.PI / 2));

  // 벽
  const leftWall = add(new THREE.Group());
  const rightWall = add(new THREE.Group());
  const backWall = add(new THREE.Group());
  add(box(0.2, H, D, std('#ffffff', 0.9, 0, { map: T.brick() }), [ROOM.x0 - 0.1, H / 2, 0], false), leftWall);
  const plasterMat = std('#ffffff', 0.95, 0, { map: T.plaster('#cdbfa8') });
  add(box(0.2, H, 5.2, plasterMat, [ROOM.x1 + 0.1, H / 2, -2.6], false), rightWall);
  add(box(0.2, H, 4.2, plasterMat, [ROOM.x1 + 0.1, H / 2, 2.9], false), rightWall);
  add(box(0.2, H - 2.25, 1.0, plasterMat, [ROOM.x1 + 0.1, 2.25 + (H - 2.25) / 2, 0.3], false), rightWall);
  add(box(0.24, 0.08, 1.1, M.darkWood, [ROOM.x1 + 0.1, 2.25, 0.3]), rightWall);
  for (const z of [-0.22, 0.82]) add(box(0.24, 2.25, 0.08, M.darkWood, [ROOM.x1 + 0.1, 1.125, z]), rightWall);
  const glassMat = new THREE.MeshBasicMaterial({ color: '#9fb8d8', transparent: true, opacity: 0.1, depthWrite: false });
  const door = new THREE.Group();
  door.position.set(ROOM.x1 + 0.1, 0, -0.18);
  door.rotation.y = -0.5;
  door.add(box(0.05, 2.2, 0.06, M.frame, [0, 1.1, 0.03]));
  door.add(box(0.05, 2.2, 0.06, M.frame, [0, 1.1, 0.95]));
  door.add(box(0.05, 0.06, 0.98, M.frame, [0, 2.17, 0.49]));
  door.add(box(0.05, 0.06, 0.98, M.frame, [0, 0.05, 0.49]));
  const dg = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 2.1), glassMat);
  dg.rotation.y = Math.PI / 2;
  dg.position.set(0, 1.1, 0.49);
  door.add(dg);
  rightWall.add(door);

  // 뒤: 통창
  add(box(W + 0.4, 0.35, 0.22, M.frame, [0, 0.175, ROOM.z0 - 0.1]), backWall);
  add(box(W + 0.4, H - 2.6, 0.22, M.frame, [0, 2.6 + (H - 2.6) / 2, ROOM.z0 - 0.1]), backWall);
  for (let i = 0; i <= 6; i++) add(box(0.09, 2.25, 0.16, M.frame, [ROOM.x0 + (W * i) / 6, 0.35 + 1.125, ROOM.z0 - 0.1]), backWall);
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(W, 2.25), glassMat);
  glass.position.set(0, 0.35 + 1.125, ROOM.z0 - 0.05);
  add(glass, backWall);
  const neon = plane(3.9, 0.6, T.neonSign('while (alive) { code(); }', '#ff6fb5'), [0, 2.9, ROOM.z0 + 0.02]);
  (neon.material as THREE.MeshBasicMaterial).blending = THREE.AdditiveBlending;
  (neon.material as THREE.MeshBasicMaterial).depthWrite = false;
  add(neon, backWall);
  note(plane(0.62, 0.62, T.stickyNote(['판교의 등대는', '오늘도', '켜져 있다']), [-3.4, 1.65, ROOM.z0]), ['🏢 저 건물들, 새벽인데 불이 다 켜져 있어요. 판교의 등대예요.'], backWall);

  // 왼쪽 벽: 메뉴판, git log TV, 와이파이
  note(plane(1.95, 1.27, T.menuBoard(), [ROOM.x0 + 0.02, 2.3, -1.0], Math.PI / 2), ['☕ 오늘의 메뉴는 NullPointer 라떼예요. 가끔 안 나와요.', '☕ 디카페인은 의미가 없대요.'], leftWall);
  add(box(0.07, 1.42, 2.5, M.black, [ROOM.x0 + 0.04, 1.85, 2.75], false), leftWall);
  const gitlog = new T.GitLogScreen();
  const tv = plane(2.38, 1.34, gitlog.texture, [ROOM.x0 + 0.085, 1.85, 2.75], Math.PI / 2);
  (tv.material as THREE.MeshBasicMaterial).transparent = false;
  click(tv, { interact: 'tv' }, leftWall);
  note(
    plane(0.9, 0.45, T.smallSign('Wi-Fi  pangyo_mogakco', 'PW  1q2w3e4r!', '#20241f', '#f1ede0'), [ROOM.x0 + 0.02, 2.45, -4.1], Math.PI / 2),
    ['📶 와이파이 비번이 1q2w3e4r!래요. 보안팀이 보면 울어요.'],
    leftWall,
  );

  // 오른쪽 벽: 판교 사투리 사전, 시계 두 개
  note(plane(1.05, 1.4, T.dialectPoster(), [ROOM.x1 - 0.02, 1.75, -2.4], -Math.PI / 2, false), ['📖 판교 사투리 사전: ASAP = 어제까지, R&R = 네 일', '📖 판교 사투리 사전: 얼라인 = 맞춰보자, 싱크 = 회의하자'], rightWall);
  const clocks: { hour: THREE.Object3D; min: THREE.Object3D; fmt: Intl.DateTimeFormat }[] = [];
  STAND_DESKS.forEach((z, i) => {
    const g = new THREE.Group();
    g.position.set(ROOM.x1 - 0.03, 2.35, z);
    g.rotation.y = -Math.PI / 2;
    g.add(new THREE.Mesh(new THREE.CircleGeometry(0.26, 40), std('#ffffff', 0.5, 0, { map: T.clockFace(i === 0 ? 'KST' : 'UTC') })));
    const hour = new THREE.Group();
    hour.add(box(0.02, 0.13, 0.01, M.black, [0, 0.055, 0.01], false));
    const min = new THREE.Group();
    min.add(box(0.014, 0.2, 0.01, M.black, [0, 0.09, 0.015], false));
    g.add(hour, min);
    b.keep.add(hour).add(min);
    clocks.push({ hour, min, fmt: new Intl.DateTimeFormat('en-GB', { timeZone: i === 0 ? 'Asia/Seoul' : 'UTC', hour: 'numeric', minute: 'numeric', hourCycle: 'h23' }) });
    note(g, ['🕐 왼쪽은 KST, 오른쪽은 UTC예요. 서버는 UTC로 돌아요.'], rightWall);
  });
  add(plane(0.7, 0.35, T.smallSign('서버는 UTC', '타임존 버그 주의', '#f4efe4', '#26324a'), [ROOM.x1 - 0.02, 1.82, 2.9], -Math.PI / 2, false), rightWall);

  // 창가 바
  add(box(11.2, 0.06, 0.58, M.oak, [0, 1.05, -4.47]));
  add(box(11.2, 1.0, 0.1, M.darkWood, [0, 0.5, -4.22]));
  add(box(11.0, 0.02, 0.02, new THREE.MeshBasicMaterial({ color: '#ffcf8a' }), [0, 1.0, -4.18], false));
  for (const x of [-5.5, 5.5]) add(box(0.06, 1.0, 0.5, M.metal, [x, 0.5, -4.47]));

  // 긴 테이블 + 멀티탭
  const tw = TABLE.x1 - TABLE.x0;
  const td = TABLE.z1 - TABLE.z0;
  const tcz = (TABLE.z0 + TABLE.z1) / 2;
  add(box(tw, 0.06, td, M.wood, [0, TABLE.h - 0.03, tcz]));
  for (const x of [TABLE.x0 + 0.25, 0, TABLE.x1 - 0.25]) add(box(0.06, TABLE.h - 0.06, td - 0.15, M.metal, [x, (TABLE.h - 0.06) / 2, tcz]));
  const tap = new THREE.Group();
  tap.position.set(0, TABLE.h, tcz);
  tap.add(box(0.9, 0.04, 0.1, M.white, [0, 0.02, 0]));
  const tapOn = new THREE.MeshBasicMaterial({ color: '#ff7a3d' });
  const tapOff = new THREE.MeshBasicMaterial({ color: '#2b2b2b' });
  for (let i = 0; i < 6; i++) tap.add(box(0.06, 0.02, 0.06, i % 2 ? tapOn : tapOff, [-0.36 + i * 0.145, 0.045, 0], false));
  note(tap, ['🔌 모각코 필수템 멀티탭. 자리 고를 때 콘센트부터 봐요.']);

  // 의자 · 스툴 · 빈백
  const beanColors = ['#c9873a', '#3f6f74', '#a5533f'];
  let bean = 0;
  for (const s of seats) {
    if (s.kind === 'stand') continue;
    b.seatGroup(s, (g) => {
      if (s.kind === 'chair') chairModel(g, M.oak, M.metal);
      else if (s.kind === 'stool') stoolModel(g, M.oak, M.metal);
      else beanbagModel(g, beanColors[bean++ % 3]);
    });
  }
  for (const s of seats) if (s.kind === 'stand') b.seatGroup(s, () => {});

  // 빈백 테이블
  add(cyl(LOW_TABLE.r, LOW_TABLE.r, 0.04, M.oak, [LOW_TABLE.x, LOW_TABLE.h - 0.02, LOW_TABLE.z], 32));
  add(cyl(0.05, 0.12, LOW_TABLE.h - 0.04, M.metal, [LOW_TABLE.x, (LOW_TABLE.h - 0.04) / 2, LOW_TABLE.z], 12));
  add(cyl(0.11, 0.07, 0.06, M.cream, [LOW_TABLE.x + 0.18, LOW_TABLE.h + 0.03, LOW_TABLE.z + 0.18], 16));

  // 스탠딩 데스크 + 선인장
  for (const z of STAND_DESKS) {
    add(box(0.75, 0.04, 1.0, M.oak, [6.55, 0.72, z]));
    for (const dz of [-0.38, 0.38]) {
      add(box(0.08, 0.7, 0.08, M.metal, [6.6, 0.35, z + dz]));
      add(box(0.6, 0.03, 0.08, M.metal, [6.6, 0.015, z + dz]));
    }
  }
  add(cyl(0.04, 0.035, 0.06, std('#b5663f', 0.85), [6.75, 0.77, 3.95], 12));
  add(mesh(new THREE.CapsuleGeometry(0.025, 0.07, 4, 8), std('#3f7a46', 0.7), [6.75, 0.85, 3.95]));

  // 커피 카운터
  const coffee = new THREE.Group();
  coffee.add(box(0.85, 1.0, 3.4, M.cream, [-6.575, 0.5, -1.0]));
  coffee.add(box(0.95, 0.05, 3.5, M.marble, [-6.575, 1.025, -1.0]));
  coffee.add(box(0.02, 0.9, 3.3, M.darkWood, [-6.14, 0.5, -1.0]));
  const em = new THREE.Group();
  em.position.set(-6.65, 1.05, -1.0);
  em.add(box(0.48, 0.4, 0.62, M.chrome, [0, 0.2, 0]));
  em.add(box(0.5, 0.06, 0.64, M.black, [0, 0.43, 0]));
  for (const z of [-0.16, 0.16]) {
    const head = cyl(0.04, 0.04, 0.08, M.black, [0.28, 0.1, z], 12);
    head.rotation.z = Math.PI / 2;
    em.add(head);
    em.add(cyl(0.035, 0.03, 0.06, M.white, [0.3, 0.03, z], 12));
  }
  em.add(box(0.02, 0.06, 0.16, new THREE.MeshBasicMaterial({ color: '#7ee787' }), [0.25, 0.33, 0], false));
  coffee.add(em);
  coffee.add(cyl(0.08, 0.1, 0.22, M.black, [-6.65, 1.16, -1.65], 16));
  coffee.add(cyl(0.12, 0.05, 0.16, std('#7a4a2a', 0.7, 0, { transparent: true, opacity: 0.8 }), [-6.65, 1.35, -1.65], 16));
  const canG = new THREE.CylinderGeometry(0.033, 0.033, 0.12, 12);
  const canMats = [std('#2b6cff', 0.3, 0.6), std('#1fbf6a', 0.3, 0.6)];
  let ci = 0;
  for (let row = 0; row < 3; row++) {
    for (let k = 0; k < 3 - row; k++) {
      const can = new THREE.Mesh(canG, canMats[ci++ % 2]);
      can.position.set(-6.6, 1.11 + row * 0.12, 0.1 + (k - (2 - row) / 2) * 0.07);
      can.castShadow = true;
      coffee.add(can);
    }
  }
  for (let i = 0; i < 4; i++) coffee.add(cyl(0.045, 0.035, 0.09, M.white, [-6.6, 1.1 + i * 0.07, -0.45], 14));
  coffee.add(box(0.5, 0.3, 0.6, std('#cfe3f0', 0.1, 0, { transparent: true, opacity: 0.25 }), [-6.6, 1.2, 0.35], false));
  const bread = std('#c98a45', 0.7);
  for (let i = 0; i < 3; i++) coffee.add(mesh(new THREE.SphereGeometry(0.06, 10, 8), bread, [-6.6, 1.11, 0.15 + i * 0.18]));
  click(coffee, { interact: 'use' });
  // 간판은 카운터 앞판(x -6.14 ± 0.01) 앞면보다 1cm 앞에 둠. 같은 면에 겹치면 두 면이 번갈아 그려져서 지지직거려요(z-fighting)
  click(plane(0.8, 0.4, T.smallSign('COFFEE → CODE', '커피를 코드로 바꾸는 곳'), [-6.12, 0.65, -1.0], Math.PI / 2, false), { interact: 'use' });

  // 책장
  const shelf = new THREE.Group();
  shelf.position.set(-6.78, 0, -4.1);
  shelf.add(box(0.42, 1.9, 0.04, M.darkWood, [0, 0.95, -0.78]));
  shelf.add(box(0.42, 1.9, 0.04, M.darkWood, [0, 0.95, 0.78]));
  for (let i = 0; i < 5; i++) shelf.add(box(0.42, 0.03, 1.6, M.darkWood, [0, 0.02 + i * 0.46, 0]));
  const bookMats = ['#c44536', '#2f5d8a', '#e0b84a', '#3d7a5a', '#6b4a8c', '#d9d3c7', '#1d1d22', '#b8733a'].map((c) => std(c, 0.8));
  const bookG = new THREE.BoxGeometry(1, 1, 1);
  let seed = 3;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  for (let lvl = 0; lvl < 4; lvl++) {
    let z = -0.74;
    while (z < 0.7) {
      const t = 0.04 + rnd() * 0.04;
      const h = 0.26 + rnd() * 0.14;
      const bk = new THREE.Mesh(bookG, bookMats[Math.floor(rnd() * bookMats.length)]);
      bk.scale.set(0.28, h, t);
      bk.position.set(0.02, 0.035 + lvl * 0.46 + h / 2, z + t / 2);
      if (rnd() < 0.08) bk.rotation.x = 0.25;
      shelf.add(bk);
      z += t + 0.005;
    }
  }
  note(shelf, ['📚 동물 표지 책이 가득해요. 다들 1장까지만 읽었대요.']);

  // 화이트보드
  const wb = new THREE.Group();
  wb.position.set(SPOT.whiteboard.x, 0, SPOT.whiteboard.z);
  wb.rotation.y = SPOT.whiteboard.yaw;
  wb.add(box(2.12, 1.32, 0.04, M.frame, [0, 1.38, 0]));
  wb.add(plane(2.04, 1.26, T.whiteboardFront(), [0, 1.38, 0.022], 0, false));
  wb.add(plane(2.04, 1.26, T.whiteboardBack(), [0, 1.38, -0.022], Math.PI, false));
  for (const x of [-1.08, 1.08]) {
    wb.add(box(0.04, 2.0, 0.04, M.metal, [x, 1.0, 0]));
    wb.add(box(0.06, 0.03, 0.6, M.metal, [x, 0.06, 0]));
    for (const z of [-0.27, 0.27]) wb.add(mesh(new THREE.SphereGeometry(0.03, 8, 6), M.black, [x, 0.03, z]));
  }
  note(wb, ["📝 뒷면에는 TODO가 있어요. 리팩토링은 2080년부터 예정이래요."]);

  // 서버랙
  const rack = new THREE.Group();
  rack.position.set(SPOT.rack.x, 0, SPOT.rack.z);
  rack.add(box(0.75, 2.0, 0.85, M.black, [0, 1.0, 0]));
  rack.add(plane(0.66, 1.86, T.rackFace(), [0, 1.0, 0.426], 0, false));
  const ledPos: V3[] = [];
  for (let r = 0; r < 13; r++) for (let k = 0; k < 3; k++) ledPos.push([0.14 + k * 0.05, 0.16 + r * 0.133 + 0.07, 0.432]);
  const leds = ledField(b, ledPos, rack);
  const rackSign = plane(0.6, 0.3, T.smallSign('PROD', '만지지 마시오', '#d62f2f', '#ffffff'), [0, 2.2, 0.3], 0);
  rackSign.rotation.x = -0.3;
  rack.add(rackSign);
  note(rack, RACK_LINES);

  // 금요일 배포 버튼
  const dep = new THREE.Group();
  dep.position.set(SPOT.deployButton.x, 0, SPOT.deployButton.z);
  dep.add(cyl(0.26, 0.3, 0.9, M.frame, [0, 0.45, 0], 24));
  const stripe = new THREE.Mesh(new THREE.CylinderGeometry(0.265, 0.265, 0.1, 24, 1, true), std('#ffffff', 0.6, 0, { map: T.hazardStripes() }));
  stripe.position.y = 0.82;
  dep.add(stripe);
  dep.add(cyl(0.22, 0.22, 0.04, M.black, [0, 0.92, 0], 24));
  const dome = mesh(new THREE.SphereGeometry(0.14, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), M.red, [0, 0.93, 0]);
  dome.scale.y = 0.7;
  dep.add(dome);
  dep.add(plane(0.7, 0.35, T.smallSign('금요일 배포 버튼', '누르지 마시오', '#f2c230', '#1a1a1a'), [0.55, 1.15, 0], -0.35, false));
  dep.add(box(0.03, 1.0, 0.03, M.metal, [0.55, 0.5, -0.02]));
  click(dep, { interact: 'deploy' });

  // 거대 러버덕
  const duck = duckModel();
  duck.position.set(SPOT.duck.x, 0, SPOT.duck.z);
  duck.rotation.y = 0.45;
  const duckSign = plane(0.66, 0.33, T.smallSign('러버덕 상담소', '24시간 · 무료', '#f4efe4', '#26324a'), [0.62, 0.42, 0.25], -0.3, false);
  duckSign.rotation.x = -0.5;
  duck.add(duckSign);
  click(duck, DUCK_PET(DUCK_LINES));
  b.keep.add(duck);
  const duckAnim = bounce(duck);

  // 화분
  for (const [x, z, h] of [
    [6.5, -3.5, 1.1],
    [-6.5, 4.5, 1.3],
    [6.5, 4.6, 0.9],
    [0.7, 4.55, 0.7],
  ]) {
    const p = plantModel(h);
    p.position.set(x, 0, z);
    add(p);
  }

  // 조명
  const L = lightKit(b);
  for (const x of [-2.1, 0, 2.1]) {
    add(cyl(0.006, 0.006, H - 2.35, M.black, [x, 2.35 + (H - 2.35) / 2, -1.4], 4));
    add(mesh(new THREE.ConeGeometry(0.24, 0.2, 24, 1, true), M.shade, [x, 2.28, -1.4]));
    add(mesh(new THREE.SphereGeometry(0.06, 12, 8), M.bulb, [x, 2.2, -1.4], false));
    L.glow([x, 2.16, -1.4], 1.1);
  }
  L.point([0, 2.15, -1.4], '#ffbe7a', mobile ? 14 : 12, 8);
  if (!mobile) L.point([-2.6, 2.1, -1.4], '#ffbe7a', 5, 5);
  for (const x of [-3.3, 0, 3.3]) {
    add(cyl(0.004, 0.004, 0.7, M.black, [x, H - 0.35, -3.9], 4));
    add(mesh(new THREE.SphereGeometry(0.05, 12, 8), M.bulb, [x, 2.48, -3.9], false));
    L.glow([x, 2.48, -3.9], 0.7);
  }
  L.point([0, 2.4, -3.8], '#ffb46b', 6, 7);
  L.point([-5.8, 2.3, -1.0], '#ffc58a', 6, 5);
  add(cyl(0.18, 0.2, 0.03, M.black, [-6.3, 0.015, 1.7]));
  add(cyl(0.012, 0.012, 1.4, M.black, [-6.3, 0.72, 1.7], 6));
  add(mesh(new THREE.CylinderGeometry(0.14, 0.22, 0.26, 20, 1, true), std('#efe2c8', 0.7, 0, { emissive: '#ffcc88', emissiveIntensity: 0.6, side: THREE.DoubleSide }), [-6.3, 1.48, 1.7]));
  L.point([-6.2, 1.45, 1.8], '#ffc07a', 5, 5);
  L.point([5.3, 2.4, 2.9], '#ffd3a0', 9, 6);

  const alarm = alarmKit(b, ROOM, [M.red]);
  const walls = wallCutaway({ left: leftWall, right: rightWall, back: backWall }, ROOM);

  b.keep.add(outside).add(rack);
  b.finish([leftWall, rightWall, backWall]);

  let clockT = 0;
  return {
    root: b.root,
    floor,
    clickables: b.clickables,
    seatHits: b.seatHits,
    gitlog,
    update(dt: number, cam: THREE.Camera) {
      walls(cam);
      // 뒷벽 뒤로 돌아가도 창밖 빌딩 몸체 안에 파묻히지 않게
      skyline.pullOutOfBuildings(cam.position, ROOM_CENTER);
      skyline.update(dt);
      alarm.update(dt);
      leds.update(dt, alarm.on);
      duckAnim.update(dt);
      clockT -= dt;
      if (clockT > 0) return;
      clockT = 1;
      const now = new Date();
      for (const c of clocks) {
        const parts = c.fmt.formatToParts(now);
        const h = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
        const m = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
        c.min.rotation.z = -(m / 60) * Math.PI * 2;
        c.hour.rotation.z = -(((h % 12) + m / 60) / 12) * Math.PI * 2;
      }
    },
    alarm: (sec: number) => alarm.start(sec),
    poke: (key: string) => key === 'duck' && duckAnim.poke(),
    get alarming() {
      return alarm.on;
    },
  };
}

export const cafe: PlaceDef = {
  id: 'cafe',
  layout,
  ambience: 'cafe',
  env: {
    background: () => T.skyGradient(),
    fog: { color: '#141a2c', near: 34, far: 120 },
    hemi: { sky: '#5a6a9a', ground: '#2a1e16', intensity: 0.9 },
    sun: { color: '#9db2ff', intensity: 0.9, pos: [-5, 13, -15] },
    exposure: 1.15,
  },
  canvasText: '',
  build,
};
