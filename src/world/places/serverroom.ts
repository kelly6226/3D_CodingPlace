// 🖥️ 서버실: 18°C, 팬 소리, 랙 앞 바닥에 앉아서 코딩. 기둥에는 EPO(비상 전원 차단) 버튼
import * as THREE from 'three';
import { DUCK_LINES } from '../../config';
import { FACE, boxAt, seat, seatObstacles, type Box, type PlaceLayout, type Seat } from '../layout';
import * as T from '../textures';
import * as T2 from './tex2';
import {
  DUCK_PET,
  alarmKit,
  baseboards,
  bounce,
  box,
  builder,
  cushionModel,
  cyl,
  duckModel,
  floorDecal,
  floorSlab,
  foldingChairModel,
  ledField,
  lightKit,
  mesh,
  plainWalls,
  plane,
  wallCutaway,
  std,
  type V3,
} from './kit';
import type { PlaceDef } from './types';

// ── 배치도 ─────────────────────────────────────────
const ROOM = { x0: -6, x1: 6, z0: -4.5, z1: 4.5, wallH: 3.2 };
const RACK = { w: 0.6, h: 2.0, d: 1.0, gap: 0.62 };
/** 뒤 벽 랙 줄 (앞면이 +z) */
const ROW_A = { n: 8, x: -5.35, z: ROOM.z0 + 0.05 + RACK.d / 2 };
/** 왼쪽 벽 랙 줄 (앞면이 +x, 앞쪽 끝부터 안쪽으로) */
const ROW_B = { n: 6, x: ROOM.x0 + 0.05 + RACK.d / 2, z: 0.55 };
const ROW_A_FRONT = ROW_A.z + RACK.d / 2; // -3.45
const ROW_B_FRONT = ROW_B.x + RACK.d / 2; // -4.95
const NOC = { x0: 0.3, x1: 3.6, z0: -3.0, z1: -2.4, h: 0.75 };
const WAR = { x0: 0.6, x1: 3.3, z0: -0.2, z1: 0.5, h: 0.75 };
const CART = { x: -1.01, z: -3.15 };
const EPO = { x: 5.45, z: -0.3 };
const VENDING = { x0: ROOM.x0 + 0.05, x1: ROOM.x0 + 0.8, z0: 1.6, z1: 2.5 };
const CRAC = { x0: 4.4, x1: 5.95, z0: ROOM.z0 + 0.05, z1: ROOM.z0 + 0.95 };

const FLOOR_LY = 0.32;
const seats: Seat[] = [
  // 랙에 등 기대고 바닥에 앉기 (서버실에서 제일 시원한 자리)
  seat('floor-a1', 'floor', '랙 앞 바닥', -4.0, ROW_A_FRONT + 0.4, FACE.S, { ly: FLOOR_LY, ax: -4.62, az: -2.8 }),
  seat('floor-a2', 'floor', '랙 앞 바닥', -2.6, ROW_A_FRONT + 0.4, FACE.S, { ly: FLOOR_LY, ax: -3.22, az: -2.8 }),
  seat('floor-b1', 'floor', '랙 앞 바닥', ROW_B_FRONT + 0.4, -1.75, FACE.E, { ly: FLOOR_LY, ax: -4.55, az: -1.1 }),
  seat('floor-b2', 'floor', '랙 앞 바닥', ROW_B_FRONT + 0.4, -0.15, FACE.E, { ly: FLOOR_LY, ax: -4.55, az: 0.5 }),
  // 크래시 카트: 서서 콘솔 붙잡고 있기
  seat('cart', 'stand', '크래시 카트', CART.x, -2.6, FACE.N, { back: 0.3, dist: 0.45, ly: 0.95 }),
  // NOC 데스크: 모니터링 벽을 보는 자리
  ...[0.85, 1.95, 3.05].map((x, i) => seat(`noc-${i + 1}`, 'chair', 'NOC 데스크', x, NOC.z1 + 0.35, FACE.N)),
  // 워룸 테이블: 장애 나면 여기 모임
  ...[1.3, 2.6].map((x, i) => seat(`war-n${i + 1}`, 'chair', '워룸 테이블', x, WAR.z0 - 0.35, FACE.S)),
  ...[1.3, 2.6].map((x, i) => seat(`war-s${i + 1}`, 'chair', '워룸 테이블', x, WAR.z1 + 0.35, FACE.N)),
];

const laptopBoxes = seats.filter((s) => s.kind === 'floor').map((s) => ({ x: s.lx, z: s.lz, rot: s.yaw }));

const obstacles: Box[] = [
  { x0: ROW_A.x - RACK.w / 2, x1: ROW_A.x + (ROW_A.n - 1) * RACK.gap + RACK.w / 2, z0: ROOM.z0, z1: ROW_A_FRONT },
  { x0: ROOM.x0, x1: ROW_B_FRONT, z0: ROW_B.z - (ROW_B.n - 1) * RACK.gap - RACK.w / 2, z1: ROW_B.z + RACK.w / 2 },
  { x0: CRAC.x0, x1: CRAC.x1, z0: CRAC.z0, z1: CRAC.z1 },
  NOC,
  WAR,
  boxAt(CART.x, CART.z, 0.65, 0.5),
  boxAt(EPO.x, EPO.z, 0.5, 0.5),
  VENDING,
  { x0: 5.35, x1: ROOM.x1, z0: -2.8, z1: -1.2 }, // 예비 부품 선반
  boxAt(-5.65, 3.75, 0.45, 0.45), // 소화약제 탱크
  boxAt(-5.65, 2.85, 0.35, 0.35), // 쓰레기통
  ...laptopBoxes.map((l) => (Math.abs(Math.sin(l.rot)) > 0.5 ? boxAt(l.x, l.z, 0.35, 0.45) : boxAt(l.x, l.z, 0.45, 0.35))),
  ...seatObstacles(seats),
];

const layout: PlaceLayout = {
  room: ROOM,
  spawn: { x: 5.25, z: 3.4 },
  seats,
  obstacles,
  spots: {
    use: { x: VENDING.x1 + 0.45, z: (VENDING.z0 + VENDING.z1) / 2, yaw: FACE.W },
    deploy: { x: EPO.x, z: EPO.z + 0.7, yaw: FACE.N },
    pet: { x: -4.3, z: 1.15 },
    idle: { x: 3.2, z: 2.8 },
  },
};

const RACK_NOTES = [
  '🗄️ legacy-01이에요. 아무도 구조를 몰라요. 재부팅하면 안 돼요.',
  '🗄️ 2014년부터 uptime이 안 끊겼어요. 다들 무서워해요.',
  '🗄️ LED가 초록색이면 평화로운 거예요.',
  '🗄️ 랙 뒤쪽(핫 아일)이 제일 따뜻해요. 손 녹이러 가는 곳이에요.',
  '🗄️ 이 서버, 이름이 test인데 prod 트래픽을 받고 있어요.',
];

const LABELS: [string, string, string, string][] = [
  ['legacy-01', '건드리지 마시오', '#d62f2f', '#ffffff'],
  ['prod-db', '백업 있음 (아마도)', '#f4efe4', '#1a1a1a'],
  ['DO NOT', 'REBOOT', '#f2c230', '#1a1a1a'],
  ['k8s-node-3', '이름만 k8s', '#f4efe4', '#1a1a1a'],
  ['test-01', '사실 prod', '#58a6ff', '#0b1220'],
];

// ── 만들기 ─────────────────────────────────────────
function build(scene: THREE.Scene, mobile: boolean) {
  const b = builder(scene);
  const { add, click, note } = b;
  const M = {
    rack: std('#1d2026', 0.55, 0.4),
    rackTop: std('#2a2e36', 0.6, 0.4),
    face: std('#ffffff', 0.6, 0.2, { map: T.rackFace() }),
    metal: std('#9aa1ab', 0.4, 0.7),
    darkMetal: std('#3a3f48', 0.5, 0.6),
    tableTop: std('#e9e9e4', 0.5),
    chairSeat: std('#2f3540', 0.6),
    cardboard: std('#b5895a', 0.9),
    cardboardDark: std('#8f6a42', 0.9),
    yellow: std('#f2c230', 0.6),
    black: std('#16181c', 0.6),
    red: std('#d42a2a', 0.3, 0, { emissive: '#ff2020', emissiveIntensity: 0.6 }),
    can: [std('#2b6cff', 0.3, 0.6), std('#1fbf6a', 0.3, 0.6), std('#e8433a', 0.3, 0.6)],
  };
  const H = ROOM.wallH;

  // 바닥: 이중 바닥 타일
  const ft = T2.raisedFloor();
  ft.repeat.set(5, 3.75);
  const floor = floorSlab(b, ROOM, std('#ffffff', 0.7, 0.1, { map: ft }), std('#15181d', 0.9));
  // 바닥 노란 테이프 (랙 앞 안전선)
  const tape = new THREE.MeshBasicMaterial({ color: '#d9ad2a' });
  const aLen = ROW_A.n * RACK.gap;
  add(floorDecal(aLen, 0.05, tape, [ROW_A.x - RACK.w / 2 + aLen / 2, 0.006, ROW_A_FRONT + 0.12]));
  const bLen = ROW_B.n * RACK.gap;
  add(floorDecal(0.05, bLen, tape, [ROW_B_FRONT + 0.12, 0.006, ROW_B.z + RACK.w / 2 - bLen / 2]));

  // 벽
  const wallMat = std('#ffffff', 0.95, 0, { map: T.plaster('#7e8792') });
  const walls = plainWalls(b, ROOM, wallMat);
  baseboards(b, ROOM, walls, M.black);

  // ── 랙 두 줄 ───────────────────────────────────
  const ledPositions: { parent: THREE.Group; pos: V3[] }[] = [];
  const rackRow = (n: number, labelAt: Record<number, number>) => {
    const g = new THREE.Group();
    const pos: V3[] = [];
    for (let i = 0; i < n; i++) {
      const x = i * RACK.gap;
      g.add(box(RACK.w, RACK.h, RACK.d, M.rack, [x, RACK.h / 2, 0]));
      g.add(box(RACK.w + 0.01, 0.04, RACK.d + 0.01, M.rackTop, [x, RACK.h + 0.02, 0]));
      const f = new THREE.Mesh(new THREE.PlaneGeometry(RACK.w - 0.06, RACK.h - 0.14), M.face);
      f.position.set(x, RACK.h / 2, RACK.d / 2 + 0.004);
      g.add(f);
      for (let r = 0; r < 13; r++) for (let k = 0; k < 3; k++) pos.push([x + 0.1 + k * 0.045, 0.16 + r * 0.133 + 0.07, RACK.d / 2 + 0.012]);
      const li = labelAt[i];
      if (li !== undefined) {
        const [t1, t2, bg, fg] = LABELS[li];
        g.add(plane(0.46, 0.23, T.smallSign(t1, t2, bg, fg), [x, RACK.h - 0.2, RACK.d / 2 + 0.01], 0, false));
      }
    }
    // 위쪽 케이블 트레이
    const len = (n - 1) * RACK.gap + RACK.w;
    const cx = ((n - 1) * RACK.gap) / 2;
    for (const z of [-0.22, 0.22]) g.add(box(len, 0.03, 0.03, M.darkMetal, [cx, 2.5, z], false));
    for (let x = 0; x <= len; x += 0.3) g.add(box(0.025, 0.02, 0.44, M.darkMetal, [x - RACK.w / 2, 2.5, 0], false));
    g.add(box(len - 0.1, 0.07, 0.12, std('#2f6fd6', 0.7), [cx, 2.55, -0.08], false));
    g.add(box(len - 0.3, 0.06, 0.1, std('#e3b341', 0.7), [cx + 0.1, 2.55, 0.1], false));
    for (let i = 0; i < n; i += 2) g.add(box(0.06, 0.48, 0.08, std('#2f6fd6', 0.7), [i * RACK.gap, 2.26, -0.15], false));
    for (const x of [0.2, len - 0.6]) g.add(cyl(0.008, 0.008, H - 2.5, M.darkMetal, [x, 2.5 + (H - 2.5) / 2, 0], 4));
    ledPositions.push({ parent: g, pos });
    return g;
  };

  const rowA = rackRow(ROW_A.n, { 1: 0, 3: 1, 6: 2 });
  rowA.position.set(ROW_A.x, 0, ROW_A.z);
  note(rowA, RACK_NOTES);
  const rowB = rackRow(ROW_B.n, { 0: 4, 2: 3 });
  rowB.position.set(ROW_B.x, 0, ROW_B.z);
  rowB.rotation.y = Math.PI / 2; // 앞면이 방 안쪽(+x)을 보게
  note(rowB, RACK_NOTES);
  const ledFields = ledPositions.map((l) => ledField(b, l.pos, l.parent));

  // 랙 위 러버덕 (앞쪽 끝 랙)
  const duck = duckModel(0.36);
  duck.position.set(ROW_B.x, RACK.h + 0.04, ROW_B.z);
  duck.rotation.y = Math.PI / 2 - 0.3;
  click(duck, DUCK_PET(DUCK_LINES));
  b.keep.add(duck);
  const duckAnim = bounce(duck);

  // 바닥에 앉는 자리: 골판지 방석 + 노트북 받침 박스
  for (const s of seats) {
    if (s.kind === 'floor') b.seatGroup(s, (g) => cushionModel(g, '#9c7a4f'));
    else if (s.kind === 'chair') b.seatGroup(s, (g) => foldingChairModel(g, M.chairSeat, M.metal));
    else b.seatGroup(s, () => {});
  }
  for (const l of laptopBoxes) {
    const g = new THREE.Group();
    g.position.set(l.x, 0, l.z);
    g.rotation.y = l.rot;
    g.add(box(0.45, FLOOR_LY, 0.35, M.cardboard, [0, FLOOR_LY / 2, 0]));
    g.add(box(0.46, 0.012, 0.06, M.cardboardDark, [0, FLOOR_LY - 0.004, 0], false));
    add(g);
  }

  // 케이블 스파게티 (랙에서 쏟아져 나옴)
  const spaghetti = new THREE.Group();
  const cableColors = ['#2f6fd6', '#e3b341', '#d6453a', '#3fae5a', '#e8e8e8', '#ff8a2a', '#8a8f98'].map((c) => std(c, 0.6));
  let sd = 5;
  const rr = () => ((sd = (sd * 16807) % 2147483647) - 1) / 2147483646;
  const sx = ROW_A.x + 6 * RACK.gap - 0.62;
  for (let i = 0; i < 9; i++) {
    const pts = [
      new THREE.Vector3(sx + (rr() - 0.5) * 0.4, 0.9 + rr() * 0.8, ROW_A_FRONT + 0.02),
      new THREE.Vector3(sx + (rr() - 0.5) * 0.6, 0.35 + rr() * 0.3, ROW_A_FRONT + 0.18 + rr() * 0.15),
      new THREE.Vector3(sx + (rr() - 0.5) * 0.9, 0.03, ROW_A_FRONT + 0.4 + rr() * 0.3),
      new THREE.Vector3(sx + (rr() - 0.5) * 1.2, 0.02, ROW_A_FRONT + 0.6 + rr() * 0.4),
    ];
    spaghetti.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 20, 0.012, 5), cableColors[i % cableColors.length]));
  }
  note(spaghetti, ['🍝 케이블 정리는 2021년부터 예정이래요.', '🍝 이 중 하나를 뽑으면 결제가 멈춘대요. 어느 건지는 아무도 몰라요.']);

  // 크래시 카트
  const cart = new THREE.Group();
  cart.position.set(CART.x, 0, CART.z);
  cart.add(box(0.6, 0.03, 0.45, M.darkMetal, [0, 0.93, 0]));
  cart.add(box(0.6, 0.03, 0.45, M.darkMetal, [0, 0.35, 0]));
  for (const [x, z] of [
    [-0.27, -0.19],
    [0.27, -0.19],
    [-0.27, 0.19],
    [0.27, 0.19],
  ]) {
    cart.add(box(0.03, 0.9, 0.03, M.metal, [x, 0.48, z]));
    cart.add(mesh(new THREE.SphereGeometry(0.035, 8, 6), M.black, [x, 0.035, z]));
  }
  cart.add(box(0.38, 0.28, 0.03, M.black, [0, 1.12, -0.18]));
  cart.add(plane(0.34, 0.24, T.codeScreen(), [0, 1.12, -0.163], 0));
  cart.add(box(0.36, 0.25, 0.2, M.cardboard, [0, 0.49, 0]));
  add(cart);

  // ── 모니터링 벽 (git log + 대시보드) ─────────────
  const back = walls.back;
  const gitlog = new T.GitLogScreen();
  add(box(2.15, 1.25, 0.06, M.black, [0.85, 1.95, ROOM.z0 + 0.03], false), back);
  const tv = plane(2.05, 1.15, gitlog.texture, [0.85, 1.95, ROOM.z0 + 0.065], 0);
  (tv.material as THREE.MeshBasicMaterial).transparent = false;
  click(tv, { interact: 'tv' }, back);
  const dash = new T2.DashboardScreen();
  add(box(2.15, 1.25, 0.06, M.black, [3.1, 1.95, ROOM.z0 + 0.03], false), back);
  const dashPlane = plane(2.05, 1.15, dash.texture, [3.1, 1.95, ROOM.z0 + 0.065], 0);
  (dashPlane.material as THREE.MeshBasicMaterial).transparent = false;
  note(dashPlane, ['📈 CPU 그래프는 매일 이 모양이에요. 다들 익숙해졌어요.', '📈 알림이 37개인데 다 무시해도 되는 거래요. 아마도.'], back);
  const noc = plane(1.5, 0.24, T.neonSign('NOC · 24/7', '#58a6ff', 1024, 160), [1.95, 2.85, ROOM.z0 + 0.05]);
  (noc.material as THREE.MeshBasicMaterial).blending = THREE.AdditiveBlending;
  (noc.material as THREE.MeshBasicMaterial).depthWrite = false;
  add(noc, back);

  // 항온항습기
  const crac = new THREE.Group();
  const cw = CRAC.x1 - CRAC.x0;
  crac.position.set((CRAC.x0 + CRAC.x1) / 2, 0, (CRAC.z0 + CRAC.z1) / 2);
  crac.add(box(cw, 2.1, CRAC.z1 - CRAC.z0, std('#c3c5bf', 0.6), [0, 1.05, 0]));
  crac.add(plane(cw - 0.04, 2.06, T2.cracFace(), [0, 1.05, (CRAC.z1 - CRAC.z0) / 2 + 0.005], 0, false));
  note(crac, ['🥶 항상 18°C예요. 서버는 춥게, 사람은 더 춥게.', '🥶 겉옷 챙겨 오세요. 여기 반팔로 온 사람은 다 감기 걸렸어요.']);

  // 예비 부품 선반 (오른쪽 벽)
  const shelf = new THREE.Group();
  shelf.position.set(5.65, 0, -2.0);
  for (const [x, z] of [
    [-0.27, -0.77],
    [0.27, -0.77],
    [-0.27, 0.77],
    [0.27, 0.77],
  ])
    shelf.add(box(0.025, 1.2, 0.025, M.metal, [x, 0.6, z]));
  for (const y of [0.1, 0.55, 1.0]) shelf.add(box(0.58, 0.02, 1.58, M.metal, [0, y, 0]));
  for (let i = 0; i < 8; i++) {
    const y = [0.1, 0.55, 1.0][i % 3] + 0.01;
    const w = 0.2 + (i % 3) * 0.06;
    shelf.add(box(0.36, w * 0.6, w, i % 2 ? M.cardboard : M.black, [-0.04, y + w * 0.3, -0.6 + i * 0.17]));
  }
  note(shelf, ['🧰 예비 부품 선반. RMA 보내야 할 디스크가 2019년부터 대기 중이에요.']);

  // EPO 기둥
  const epo = new THREE.Group();
  epo.position.set(EPO.x, 0, EPO.z);
  epo.add(box(0.5, H, 0.5, std('#a9afb7', 0.8), [0, H / 2, 0]));
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.51, 0.25, 0.51), std('#ffffff', 0.6, 0, { map: T.hazardStripes() }));
  stripe.position.y = 0.2;
  epo.add(stripe);
  epo.add(box(0.36, 0.36, 0.04, M.yellow, [0, 1.35, 0.27]));
  const btn = cyl(0.09, 0.1, 0.07, M.red, [0, 1.35, 0.32], 24);
  btn.rotation.x = Math.PI / 2;
  epo.add(btn);
  epo.add(box(0.3, 0.3, 0.12, std('#cfe3f0', 0.1, 0, { transparent: true, opacity: 0.25 }), [0, 1.35, 0.35], false));
  epo.add(plane(0.42, 0.21, T.smallSign('EPO', '비상 전원 차단', '#d62f2f', '#ffffff'), [0, 1.78, 0.255], 0, false));
  click(epo, { interact: 'deploy' });

  // 자판기 + 음료 반입 금지
  const vend = new THREE.Group();
  const vd = VENDING.x1 - VENDING.x0;
  const vw = VENDING.z1 - VENDING.z0;
  vend.position.set((VENDING.x0 + VENDING.x1) / 2, 0, (VENDING.z0 + VENDING.z1) / 2);
  vend.add(box(vd, 1.85, vw, std('#e1e5ea', 0.4, 0.2), [0, 0.925, 0]));
  vend.add(plane(vw - 0.04, 1.81, T2.vendingFace(), [vd / 2 + 0.005, 0.925, 0], Math.PI / 2));
  click(vend, { interact: 'use' });
  add(plane(0.9, 0.45, T.smallSign('음료 반입 금지', '서버실 규칙 제3조', '#d62f2f', '#ffffff'), [ROOM.x0 + 0.02, 2.3, (VENDING.z0 + VENDING.z1) / 2], Math.PI / 2, false), walls.left);
  // 빈 캔 가득한 쓰레기통
  add(cyl(0.16, 0.14, 0.5, M.darkMetal, [-5.65, 0.25, 2.85], 16));
  for (let i = 0; i < 5; i++) add(cyl(0.033, 0.033, 0.12, M.can[i % 3], [-5.65 + Math.cos(i * 1.3) * 0.07, 0.55, 2.85 + Math.sin(i * 1.3) * 0.07], 10));

  // 소화약제 탱크 + 경고문
  add(cyl(0.18, 0.18, 1.3, std('#c0262d', 0.4, 0.2), [-5.65, 0.65, 3.75], 18));
  add(mesh(new THREE.SphereGeometry(0.18, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), std('#c0262d', 0.4, 0.2), [-5.65, 1.3, 3.75]));
  add(cyl(0.04, 0.04, 0.12, M.metal, [-5.65, 1.52, 3.75], 10));
  note(
    plane(0.8, 0.4, T.smallSign('소화약제 방출 시', '즉시 대피하세요', '#1f6f3f', '#ffffff'), [ROOM.x0 + 0.02, 2.2, 3.75], Math.PI / 2, false),
    ['🧯 불나면 가스가 나와요. 산소도 같이 나가요. 바로 나가세요.'],
    walls.left,
  );

  // 오른쪽 벽: 출입문 + 카드 리더
  const door = new THREE.Group();
  door.position.set(ROOM.x1 - 0.02, 0, 3.4);
  door.add(box(0.06, 2.2, 1.05, std('#5c6470', 0.5, 0.4), [0, 1.1, 0]));
  door.add(box(0.07, 2.28, 0.06, M.darkMetal, [0, 1.14, -0.55]));
  door.add(box(0.07, 2.28, 0.06, M.darkMetal, [0, 1.14, 0.55]));
  door.add(box(0.07, 0.06, 1.16, M.darkMetal, [0, 2.26, 0]));
  door.add(box(0.05, 0.03, 0.3, M.metal, [-0.05, 1.05, -0.35]));
  door.add(box(0.04, 0.16, 0.1, M.black, [-0.04, 1.25, -0.75]));
  door.add(box(0.045, 0.02, 0.02, new THREE.MeshBasicMaterial({ color: '#3fe07a' }), [-0.045, 1.3, -0.75], false));
  add(door, walls.right);
  note(plane(0.7, 0.35, T.smallSign('출입 기록 남음', '보안팀이 보고 있어요', '#f4efe4', '#26324a'), [ROOM.x1 - 0.02, 1.75, 2.45], -Math.PI / 2, false), ['🪪 출입 기록이 남아요. 새벽 2시에 들어온 기록도요.'], walls.right);

  // ── 테이블 ────────────────────────────────────
  const table = (t: { x0: number; x1: number; z0: number; z1: number; h: number }) => {
    const w = t.x1 - t.x0;
    const d = t.z1 - t.z0;
    const cx = (t.x0 + t.x1) / 2;
    const cz = (t.z0 + t.z1) / 2;
    add(box(w, 0.04, d, M.tableTop, [cx, t.h - 0.02, cz]));
    for (const x of [t.x0 + 0.08, t.x1 - 0.08]) for (const z of [t.z0 + 0.08, t.z1 - 0.08]) add(cyl(0.015, 0.015, t.h - 0.04, M.metal, [x, (t.h - 0.04) / 2, z], 6));
  };
  table(NOC);
  table(WAR);
  for (let i = 0; i < 4; i++) add(cyl(0.033, 0.033, 0.12, M.can[i % 3], [NOC.x0 + 0.35 + i * 0.95, NOC.h + 0.06, NOC.z0 + 0.12], 10));
  const manual = new THREE.Group();
  manual.position.set((WAR.x0 + WAR.x1) / 2, WAR.h, (WAR.z0 + WAR.z1) / 2);
  manual.add(box(0.32, 0.05, 0.24, std('#d6453a', 0.7), [0, 0.025, 0]));
  manual.add(box(0.3, 0.035, 0.225, M.tableTop, [0.01, 0.025, 0], false));
  manual.rotation.y = 0.3;
  note(manual, ['📒 장애 대응 매뉴얼 v1.0 (2017). 1페이지: 당황하지 마세요.', '📒 매뉴얼 마지막 페이지: 그래도 안 되면 김 책임님께 전화']);

  // ── 조명: 차가운 형광등 ─────────────────────────
  const L = lightKit(b);
  const tubeMat = new THREE.MeshBasicMaterial({ color: '#e8f1ff' });
  const fixtures: V3[] = [
    [-3.2, 2.95, -2.0],
    [0.9, 2.95, -2.1],
    [3.6, 2.95, -1.2],
    [-2.6, 2.95, 1.6],
    [1.6, 2.95, 1.8],
  ];
  for (const p of fixtures) {
    add(box(1.3, 0.05, 0.2, M.darkMetal, [p[0], p[1], p[2]], false));
    add(box(1.2, 0.02, 0.12, tubeMat, [p[0], p[1] - 0.035, p[2]], false));
    for (const dx of [-0.55, 0.55]) add(cyl(0.004, 0.004, H - p[1], M.black, [p[0] + dx, (H + p[1]) / 2, p[2]], 4));
    L.glow([p[0], p[1] - 0.08, p[2]], 1.3, 'rgb(200,225,255)', 0.35);
  }
  const lights = [
    L.point([-2.8, 2.7, -1.6], '#d6e6ff', 10, 9),
    L.point([2.2, 2.7, -1.6], '#d6e6ff', 10, 9),
    ...(mobile ? [] : [L.point([0, 2.7, 2.0], '#d6e6ff', 7, 9)]),
  ];
  const lightBase = lights.map((l) => l.intensity);
  // 랙 LED 쪽 푸른 기운
  L.point([-4.2, 1.2, -2.4], '#4f8cff', mobile ? 3 : 4, 4);

  const alarm = alarmKit(b, ROOM, [M.red]);
  const wallsCut = wallCutaway(walls, ROOM);

  // 랙 줄은 줄마다 따로 합침 (LED 인스턴스는 그대로 남음)
  b.finish([walls.left, walls.right, walls.back, rowA, rowB]);

  let darkK = 0;
  return {
    root: b.root,
    floor,
    clickables: b.clickables,
    seatHits: b.seatHits,
    gitlog,
    update(dt: number, cam: THREE.Camera) {
      wallsCut(cam);
      alarm.update(dt);
      for (const f of ledFields) f.update(dt, alarm.on);
      dash.update(dt, alarm.on);
      duckAnim.update(dt);
      // EPO: 형광등이 꺼지고 비상등만
      const target = alarm.on ? 1 : 0;
      if (darkK !== target) {
        darkK += Math.sign(target - darkK) * Math.min(Math.abs(target - darkK), dt * 4);
        lights.forEach((l, i) => (l.intensity = lightBase[i] * (1 - darkK * 0.92)));
        tubeMat.color.setRGB(0.91 - darkK * 0.8, 0.95 - darkK * 0.84, 1 - darkK * 0.86);
      }
    },
    alarm: (sec: number) => alarm.start(sec),
    poke: (key: string) => key === 'duck' && duckAnim.poke(),
    get alarming() {
      return alarm.on;
    },
  };
}

export const serverroom: PlaceDef = {
  id: 'serverroom',
  layout,
  ambience: 'server',
  env: {
    background: () => new THREE.Color('#06080c'),
    hemi: { sky: '#9db8e8', ground: '#1a2230', intensity: 0.75 },
    sun: { color: '#d8e6ff', intensity: 0.75, pos: [3, 12, 6] },
    exposure: 1.05,
  },
  canvasText:
    '건드리지 마시오 백업 있음 (아마도) 이름만 k8s 사실 prod 음료 반입 금지 서버실 규칙 제3조 소화약제 방출 시 즉시 대피하세요 출입 기록 남음 보안팀이 보고 있어요 비상 전원 차단 NOC · 24/7 legacy-01 prod-db DO NOT REBOOT k8s-node-3 test-01 EPO',
  build,
};
