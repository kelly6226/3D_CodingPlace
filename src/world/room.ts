// 판교 새벽 카페 인테리어
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { LOW_TABLE, ROOM, SEATS, SPOTS, STAND_DESKS, TABLE } from './layout';
import * as T from './textures';

export type Interact = 'coffee' | 'duck' | 'deploy' | 'tv' | 'rack' | 'whiteboard' | 'poster' | 'menu';

const M = {
  wood: new THREE.MeshStandardMaterial({ color: '#7a4e32', roughness: 0.6 }),
  oak: new THREE.MeshStandardMaterial({ color: '#9a6a43', roughness: 0.55 }),
  darkWood: new THREE.MeshStandardMaterial({ color: '#4a3021', roughness: 0.7 }),
  metal: new THREE.MeshStandardMaterial({ color: '#1f2126', roughness: 0.45, metalness: 0.6 }),
  chrome: new THREE.MeshStandardMaterial({ color: '#c9ccd2', roughness: 0.2, metalness: 0.9 }),
  frame: new THREE.MeshStandardMaterial({ color: '#23262d', roughness: 0.5, metalness: 0.4 }),
  cream: new THREE.MeshStandardMaterial({ color: '#e8e0d0', roughness: 0.6 }),
  marble: new THREE.MeshStandardMaterial({ color: '#e9e6e0', roughness: 0.25 }),
  black: new THREE.MeshStandardMaterial({ color: '#17181c', roughness: 0.6 }),
  white: new THREE.MeshStandardMaterial({ color: '#f4f2ec', roughness: 0.5 }),
  pot: new THREE.MeshStandardMaterial({ color: '#b5663f', roughness: 0.85 }),
  leaf: new THREE.MeshStandardMaterial({ color: '#3f7a46', roughness: 0.7 }),
  leaf2: new THREE.MeshStandardMaterial({ color: '#5d9a55', roughness: 0.7 }),
  duck: new THREE.MeshStandardMaterial({ color: '#ffd23f', roughness: 0.35 }),
  beak: new THREE.MeshStandardMaterial({ color: '#ff8a2a', roughness: 0.4 }),
  red: new THREE.MeshStandardMaterial({ color: '#d42a2a', roughness: 0.3, emissive: '#ff2020', emissiveIntensity: 0.6 }),
  shade: new THREE.MeshStandardMaterial({ color: '#2f4a3e', roughness: 0.5, metalness: 0.3, side: THREE.DoubleSide }),
  bulb: new THREE.MeshBasicMaterial({ color: '#ffe2b0' }),
};

type V3 = [number, number, number];

function mesh(g: THREE.BufferGeometry, m: THREE.Material | THREE.Material[], p: V3, shadow = true) {
  const o = new THREE.Mesh(g, m);
  o.position.set(...p);
  o.castShadow = shadow;
  o.receiveShadow = true;
  return o;
}
const box = (w: number, h: number, d: number, m: THREE.Material | THREE.Material[], p: V3, shadow = true) =>
  mesh(new THREE.BoxGeometry(w, h, d), m, p, shadow);
const cyl = (rt: number, rb: number, h: number, m: THREE.Material, p: V3, seg = 20) =>
  mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m, p);
const plane = (w: number, h: number, map: THREE.Texture, p: V3, ry = 0, basic = true) => {
  const m = basic
    ? new THREE.MeshBasicMaterial({ map, transparent: true })
    : new THREE.MeshStandardMaterial({ map, roughness: 0.8 });
  const o = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
  o.position.set(...p);
  o.rotation.y = ry;
  return o;
};

function tag<O extends THREE.Object3D>(o: O, interact: Interact): O {
  o.traverse((c) => (c.userData.interact = interact));
  return o;
}

export function buildRoom(scene: THREE.Scene, mobile: boolean) {
  const root = new THREE.Group();
  scene.add(root);
  const clickables: THREE.Object3D[] = [];
  const add = (o: THREE.Object3D, parent: THREE.Object3D = root) => {
    parent.add(o);
    return o;
  };
  const addClick = (o: THREE.Object3D, interact: Interact, parent: THREE.Object3D = root) => {
    tag(o, interact);
    parent.add(o);
    clickables.push(o);
    return o;
  };

  // ── 바닥 (공중에 떠 있는 디오라마 판) ─────────────────
  const W = ROOM.x1 - ROOM.x0;
  const D = ROOM.z1 - ROOM.z0;
  const side = new THREE.MeshStandardMaterial({ color: '#1c1a1f', roughness: 0.9 });
  const floorMat = new THREE.MeshStandardMaterial({ map: T.woodFloor(), roughness: 0.75 });
  const floor = box(W + 0.4, 0.4, D + 0.2, [side, side, floorMat, side, side, side], [0, -0.2, -0.1], false);
  floor.name = 'floor';
  floor.userData.floor = true;
  add(floor);
  // 앞쪽 테두리 몰딩
  add(box(W + 0.4, 0.06, 0.06, M.darkWood, [0, 0.03, ROOM.z1 - 0.03], false));

  const rug = plane(7.6, 2.9, T.rug(), [0, 0.006, -1.4], 0, false);
  rug.rotation.x = -Math.PI / 2;
  rug.receiveShadow = true;
  rug.userData.floor = true;
  add(rug);
  const roundRug = new THREE.Mesh(
    new THREE.CircleGeometry(1.55, 40),
    new THREE.MeshStandardMaterial({ color: '#6b4b3a', roughness: 1 }),
  );
  roundRug.rotation.x = -Math.PI / 2;
  roundRug.position.set(LOW_TABLE.x, 0.006, LOW_TABLE.z);
  roundRug.receiveShadow = true;
  roundRug.userData.floor = true;
  add(roundRug);
  const mat = plane(0.9, 1.3, T.doormat(), [6.25, 0.007, 0.3], 0, false);
  mat.rotation.set(-Math.PI / 2, 0, Math.PI / 2);
  mat.userData.floor = true;
  add(mat);

  // ── 벽: 카메라가 바깥쪽에 있으면 숨김 ─────────────────
  const leftWall = new THREE.Group();
  const rightWall = new THREE.Group();
  const backWall = new THREE.Group();
  add(leftWall);
  add(rightWall);
  add(backWall);
  const H = ROOM.wallH;

  const brickMat = new THREE.MeshStandardMaterial({ map: T.brick(), roughness: 0.9 });
  const lw = box(0.2, H, D, brickMat, [ROOM.x0 - 0.1, H / 2, 0], false);
  lw.receiveShadow = true;
  add(lw, leftWall);

  const plasterMat = new THREE.MeshStandardMaterial({ map: T.plaster('#cdbfa8'), roughness: 0.95 });
  // 오른쪽 벽에는 출입문(z 0.3)
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
  const sill = box(W + 0.4, 0.35, 0.22, M.frame, [0, 0.175, ROOM.z0 - 0.1]);
  add(sill, backWall);
  const top = box(W + 0.4, H - 2.6, 0.22, M.frame, [0, 2.6 + (H - 2.6) / 2, ROOM.z0 - 0.1]);
  add(top, backWall);
  for (let i = 0; i <= 6; i++) {
    const x = ROOM.x0 + (W * i) / 6;
    add(box(0.09, 2.25, 0.16, M.frame, [x, 0.35 + 1.125, ROOM.z0 - 0.1]), backWall);
  }
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(W, 2.25), glassMat);
  glass.position.set(0, 0.35 + 1.125, ROOM.z0 - 0.05);
  add(glass, backWall);

  // 네온: while (alive) { code(); }
  const neon = plane(3.9, 0.6, T.neonSign('while (alive) { code(); }', '#ff6fb5'), [0, 2.9, ROOM.z0 + 0.02]);
  (neon.material as THREE.MeshBasicMaterial).blending = THREE.AdditiveBlending;
  (neon.material as THREE.MeshBasicMaterial).depthWrite = false;
  add(neon, backWall);
  // 창문에 붙은 메모
  add(plane(0.62, 0.62, T.stickyNote(['판교의 등대는', '오늘도', '켜져 있다']), [-3.4, 1.65, ROOM.z0 + 0.0], 0), backWall);

  // ── 왼쪽 벽: 커피 카운터, 메뉴판, git log TV, 와이파이 ──
  const menu = plane(1.95, 1.27, T.menuBoard(), [ROOM.x0 + 0.02, 2.3, -1.0], Math.PI / 2);
  addClick(menu, 'menu', leftWall);
  const tvFrame = box(0.07, 1.42, 2.5, M.black, [ROOM.x0 + 0.04, 1.85, 2.75], false);
  add(tvFrame, leftWall);
  const gitlog = new T.GitLogScreen();
  const tv = plane(2.38, 1.34, gitlog.texture, [ROOM.x0 + 0.085, 1.85, 2.75], Math.PI / 2);
  (tv.material as THREE.MeshBasicMaterial).transparent = false;
  addClick(tv, 'tv', leftWall);
  add(
    plane(0.9, 0.45, T.smallSign('Wi-Fi  pangyo_mogakco', 'PW  1q2w3e4r!', '#20241f', '#f1ede0'), [ROOM.x0 + 0.02, 2.45, -4.1], Math.PI / 2),
    leftWall,
  );

  // ── 오른쪽 벽: 판교 사투리 사전, 시계 두 개 ─────────────
  addClick(plane(1.05, 1.4, T.dialectPoster(), [ROOM.x1 - 0.02, 1.75, -2.4], -Math.PI / 2, false), 'poster', rightWall);
  const clocks: { hour: THREE.Object3D; min: THREE.Object3D; fmt: Intl.DateTimeFormat }[] = [];
  const keep = new Set<THREE.Object3D>();
  STAND_DESKS.forEach((z, i) => {
    const g = new THREE.Group();
    g.position.set(ROOM.x1 - 0.03, 2.35, z);
    g.rotation.y = -Math.PI / 2;
    const face = new THREE.Mesh(
      new THREE.CircleGeometry(0.26, 40),
      new THREE.MeshStandardMaterial({ map: T.clockFace(i === 0 ? 'KST' : 'UTC'), roughness: 0.5 }),
    );
    g.add(face);
    const hour = new THREE.Group();
    hour.add(box(0.02, 0.13, 0.01, M.black, [0, 0.055, 0.01], false));
    const min = new THREE.Group();
    min.add(box(0.014, 0.2, 0.01, M.black, [0, 0.09, 0.015], false));
    g.add(hour, min);
    keep.add(hour).add(min);
    clocks.push({
      hour,
      min,
      fmt: new Intl.DateTimeFormat('en-GB', { timeZone: i === 0 ? 'Asia/Seoul' : 'UTC', hour: 'numeric', minute: 'numeric', hourCycle: 'h23' }),
    });
    add(g, rightWall);
  });
  add(
    plane(0.7, 0.35, T.smallSign('서버는 UTC', '타임존 버그 주의', '#f4efe4', '#26324a'), [ROOM.x1 - 0.02, 1.82, 2.9], -Math.PI / 2, false),
    rightWall,
  );

  // ── 창가 바 ─────────────────────────────────────
  add(box(11.2, 0.06, 0.58, M.oak, [0, 1.05, -4.47]));
  add(box(11.2, 1.0, 0.1, M.darkWood, [0, 0.5, -4.22]));
  const strip = box(11.0, 0.02, 0.02, new THREE.MeshBasicMaterial({ color: '#ffcf8a' }), [0, 1.0, -4.18], false);
  add(strip);
  for (const x of [-5.5, 5.5]) add(box(0.06, 1.0, 0.5, M.metal, [x, 0.5, -4.47]));

  // ── 긴 테이블 + 멀티탭 ──────────────────────────────
  const tw = TABLE.x1 - TABLE.x0;
  const td = TABLE.z1 - TABLE.z0;
  const tcx = (TABLE.x0 + TABLE.x1) / 2;
  const tcz = (TABLE.z0 + TABLE.z1) / 2;
  add(box(tw, 0.06, td, M.wood, [tcx, TABLE.h - 0.03, tcz]));
  for (const x of [TABLE.x0 + 0.25, tcx, TABLE.x1 - 0.25]) {
    add(box(0.06, TABLE.h - 0.06, td - 0.15, M.metal, [x, (TABLE.h - 0.06) / 2, tcz]));
  }
  // 모각코 필수템: 멀티탭
  const tap = new THREE.Group();
  tap.position.set(tcx, TABLE.h, tcz);
  tap.add(box(0.9, 0.04, 0.1, M.white, [0, 0.02, 0]));
  for (let i = 0; i < 6; i++) {
    tap.add(box(0.06, 0.02, 0.06, new THREE.MeshBasicMaterial({ color: i % 2 ? '#ff7a3d' : '#2b2b2b' }), [-0.36 + i * 0.145, 0.045, 0], false));
  }
  add(tap);

  // 의자 · 스툴 · 빈백
  const seatHits: THREE.Object3D[] = [];
  const hitMat = new THREE.MeshBasicMaterial({ visible: false });
  const beanColors = ['#c9873a', '#3f6f74', '#a5533f'];
  let bean = 0;
  for (const s of SEATS) {
    const g = new THREE.Group();
    g.position.set(s.x, 0, s.z);
    g.rotation.y = s.yaw;
    if (s.kind === 'chair') {
      g.add(box(0.44, 0.05, 0.42, M.oak, [0, 0.45, 0]));
      g.add(box(0.44, 0.36, 0.04, M.oak, [0, 0.72, -0.2]));
      for (const [x, z] of [
        [-0.19, -0.18],
        [0.19, -0.18],
        [-0.19, 0.18],
        [0.19, 0.18],
      ]) {
        g.add(cyl(0.015, 0.015, 0.45, M.metal, [x, 0.225, z], 8));
      }
    } else if (s.kind === 'stool') {
      g.add(cyl(0.19, 0.19, 0.05, M.oak, [0, 0.72, 0]));
      g.add(cyl(0.025, 0.025, 0.7, M.metal, [0, 0.35, 0], 8));
      g.add(cyl(0.18, 0.2, 0.03, M.metal, [0, 0.015, 0]));
      const foot = mesh(new THREE.TorusGeometry(0.15, 0.012, 6, 24), M.metal, [0, 0.3, 0]);
      foot.rotation.x = Math.PI / 2;
      g.add(foot);
    } else if (s.kind === 'beanbag') {
      const bb = mesh(
        new THREE.SphereGeometry(0.42, 24, 16),
        new THREE.MeshStandardMaterial({ color: beanColors[bean++ % 3], roughness: 1 }),
        [0, 0.22, 0],
      );
      bb.scale.set(1, 0.6, 1);
      g.add(bb);
      const back = mesh(bb.geometry, bb.material as THREE.Material, [0, 0.38, -0.24]);
      back.scale.set(0.9, 0.55, 0.5);
      g.add(back);
    }
    const hit = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.1, 0.6), hitMat);
    hit.position.y = 0.55;
    g.add(hit);
    g.traverse((o) => (o.userData.seatId = s.id));
    add(g);
    seatHits.push(g);
  }

  // ── 빈백 테이블 ────────────────────────────────
  add(cyl(LOW_TABLE.r, LOW_TABLE.r, 0.04, M.oak, [LOW_TABLE.x, LOW_TABLE.h - 0.02, LOW_TABLE.z], 32));
  add(cyl(0.05, 0.12, LOW_TABLE.h - 0.04, M.metal, [LOW_TABLE.x, (LOW_TABLE.h - 0.04) / 2, LOW_TABLE.z], 12));
  // 과자 그릇
  add(cyl(0.11, 0.07, 0.06, M.cream, [LOW_TABLE.x + 0.18, LOW_TABLE.h + 0.03, LOW_TABLE.z + 0.18], 16));

  // ── 스탠딩 데스크 ─────────────────────────────
  for (const z of STAND_DESKS) {
    add(box(0.75, 0.04, 1.0, M.oak, [6.55, 0.72, z]));
    for (const dz of [-0.38, 0.38]) {
      add(box(0.08, 0.7, 0.08, M.metal, [6.6, 0.35, z + dz]));
      add(box(0.6, 0.03, 0.08, M.metal, [6.6, 0.015, z + dz]));
    }
  }
  // 선인장 (키보드 옆 필수 반려식물)
  add(cyl(0.04, 0.035, 0.06, M.pot, [6.75, 0.77, 3.95], 12));
  add(mesh(new THREE.CapsuleGeometry(0.025, 0.07, 4, 8), M.leaf, [6.75, 0.85, 3.95]));

  // ── 커피 카운터: 커피를 코드로 바꾸는 곳 ─────────────
  const coffee = new THREE.Group();
  coffee.add(box(0.85, 1.0, 3.4, M.cream, [-6.575, 0.5, -1.0]));
  coffee.add(box(0.95, 0.05, 3.5, M.marble, [-6.575, 1.025, -1.0]));
  coffee.add(box(0.02, 0.9, 3.3, M.darkWood, [-6.14, 0.5, -1.0]));
  // 에스프레소 머신
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
  // 그라인더
  coffee.add(cyl(0.08, 0.1, 0.22, M.black, [-6.65, 1.16, -1.65], 16));
  coffee.add(cyl(0.12, 0.05, 0.16, new THREE.MeshStandardMaterial({ color: '#7a4a2a', transparent: true, opacity: 0.8 }), [-6.65, 1.35, -1.65], 16));
  // 에너지 드링크 피라미드 (브랜드 없음)
  const canG = new THREE.CylinderGeometry(0.033, 0.033, 0.12, 12);
  const canMats = [new THREE.MeshStandardMaterial({ color: '#2b6cff', metalness: 0.6, roughness: 0.3 }), new THREE.MeshStandardMaterial({ color: '#1fbf6a', metalness: 0.6, roughness: 0.3 })];
  let ci = 0;
  for (let row = 0; row < 3; row++) {
    for (let k = 0; k < 3 - row; k++) {
      const can = new THREE.Mesh(canG, canMats[ci++ % 2]);
      can.position.set(-6.6, 1.11 + row * 0.12, 0.1 + (k - (2 - row) / 2) * 0.07);
      can.castShadow = true;
      coffee.add(can);
    }
  }
  // 컵 쌓기
  for (let i = 0; i < 4; i++) coffee.add(cyl(0.045, 0.035, 0.09, M.white, [-6.6, 1.1 + i * 0.07, -0.45], 14));
  // 빵 진열장
  coffee.add(box(0.5, 0.3, 0.6, new THREE.MeshStandardMaterial({ color: '#cfe3f0', transparent: true, opacity: 0.25, roughness: 0.1 }), [-6.6, 1.2, 0.35], false));
  for (let i = 0; i < 3; i++) coffee.add(mesh(new THREE.SphereGeometry(0.06, 10, 8), new THREE.MeshStandardMaterial({ color: '#c98a45' }), [-6.6, 1.11, 0.15 + i * 0.18]));
  addClick(coffee, 'coffee');
  const coffeeSign = plane(0.8, 0.4, T.smallSign('COFFEE → CODE', '커피를 코드로 바꾸는 곳'), [-6.13, 0.65, -1.0], Math.PI / 2, false);
  addClick(coffeeSign, 'coffee');

  // ── 책장 ──────────────────────────────────────
  const shelf = new THREE.Group();
  shelf.position.set(-6.78, 0, -4.1);
  shelf.add(box(0.42, 1.9, 0.04, M.darkWood, [0, 0.95, -0.78]));
  shelf.add(box(0.42, 1.9, 0.04, M.darkWood, [0, 0.95, 0.78]));
  for (let i = 0; i < 5; i++) shelf.add(box(0.42, 0.03, 1.6, M.darkWood, [0, 0.02 + i * 0.46, 0]));
  const bookColors = ['#c44536', '#2f5d8a', '#e0b84a', '#3d7a5a', '#6b4a8c', '#d9d3c7', '#1d1d22', '#b8733a'];
  const bookG = new THREE.BoxGeometry(1, 1, 1);
  const bookMats = bookColors.map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8 }));
  for (let lvl = 0; lvl < 4; lvl++) {
    let z = -0.74;
    while (z < 0.7) {
      const t = 0.04 + Math.random() * 0.04;
      const h = 0.26 + Math.random() * 0.14;
      const b = new THREE.Mesh(bookG, bookMats[Math.floor(Math.random() * bookMats.length)]);
      b.scale.set(0.28, h, t);
      b.position.set(0.02, 0.035 + lvl * 0.46 + h / 2, z + t / 2);
      if (Math.random() < 0.08) b.rotation.x = 0.25;
      shelf.add(b);
      z += t + 0.005;
    }
  }
  add(shelf);

  // ── 화이트보드 (앞: It works on my machine / 뒤: TODO) ──
  const wb = new THREE.Group();
  wb.position.set(SPOTS.whiteboard.x, 0, SPOTS.whiteboard.z);
  wb.rotation.y = SPOTS.whiteboard.yaw;
  wb.add(box(2.12, 1.32, 0.04, M.frame, [0, 1.38, 0]));
  const wbFront = plane(2.04, 1.26, T.whiteboardFront(), [0, 1.38, 0.022], 0, false);
  wb.add(wbFront);
  wb.add(plane(2.04, 1.26, T.whiteboardBack(), [0, 1.38, -0.022], Math.PI, false));
  for (const x of [-1.08, 1.08]) {
    wb.add(box(0.04, 2.0, 0.04, M.metal, [x, 1.0, 0]));
    wb.add(box(0.06, 0.03, 0.6, M.metal, [x, 0.06, 0]));
    for (const z of [-0.27, 0.27]) wb.add(mesh(new THREE.SphereGeometry(0.03, 8, 6), M.black, [x, 0.03, z]));
  }
  addClick(wb, 'whiteboard');

  // ── 서버랙 (prod, 만지지 마시오) ───────────────────
  const rack = new THREE.Group();
  rack.position.set(SPOTS.rack.x, 0, SPOTS.rack.z);
  rack.add(box(0.75, 2.0, 0.85, M.black, [0, 1.0, 0]));
  rack.add(plane(0.66, 1.86, T.rackFace(), [0, 1.0, 0.426], 0, false));
  const ledG = new THREE.BoxGeometry(0.02, 0.02, 0.01);
  const ledMat = new THREE.MeshBasicMaterial({ color: '#ffffff' });
  const leds = new THREE.InstancedMesh(ledG, ledMat, 39);
  let li = 0;
  const dummy = new THREE.Object3D();
  for (let r = 0; r < 13; r++) {
    for (let k = 0; k < 3; k++) {
      dummy.position.set(0.14 + k * 0.05, 0.16 + r * 0.133 + 0.07, 0.432);
      dummy.updateMatrix();
      leds.setMatrixAt(li, dummy.matrix);
      leds.setColorAt(li, new THREE.Color('#3fe07a'));
      li++;
    }
  }
  rack.add(leds);
  const rackSign = plane(0.6, 0.3, T.smallSign('PROD', '만지지 마시오', '#d62f2f', '#ffffff'), [0, 2.2, 0.3], 0);
  rackSign.rotation.x = -0.3;
  rack.add(rackSign);
  addClick(rack, 'rack');

  // ── 금요일 배포 버튼 ─────────────────────────────
  const dep = new THREE.Group();
  dep.position.set(SPOTS.deployButton.x, 0, SPOTS.deployButton.z);
  dep.add(cyl(0.26, 0.3, 0.9, M.frame, [0, 0.45, 0], 24));
  const stripe = new THREE.Mesh(
    new THREE.CylinderGeometry(0.265, 0.265, 0.1, 24, 1, true),
    new THREE.MeshStandardMaterial({ map: T.hazardStripes(), roughness: 0.6 }),
  );
  stripe.position.y = 0.82;
  dep.add(stripe);
  dep.add(cyl(0.22, 0.22, 0.04, M.black, [0, 0.92, 0], 24));
  const dome = mesh(new THREE.SphereGeometry(0.14, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), M.red, [0, 0.93, 0]);
  dome.scale.y = 0.7;
  dep.add(dome);
  const depSign = plane(0.7, 0.35, T.smallSign('금요일 배포 버튼', '누르지 마시오', '#f2c230', '#1a1a1a'), [0.55, 1.15, 0], -0.35, false);
  dep.add(depSign);
  dep.add(box(0.03, 1.0, 0.03, M.metal, [0.55, 0.5, -0.02]));
  addClick(dep, 'deploy');

  // ── 거대 러버덕 ────────────────────────────────
  const duck = new THREE.Group();
  duck.position.set(SPOTS.duck.x, 0, SPOTS.duck.z);
  duck.rotation.y = 0.45;
  const dbody = mesh(new THREE.SphereGeometry(0.42, 28, 20), M.duck, [0, 0.36, 0]);
  dbody.scale.set(1.05, 0.8, 1.25);
  duck.add(dbody);
  duck.add(mesh(new THREE.SphereGeometry(0.27, 24, 18), M.duck, [0, 0.86, 0.2]));
  const beak = mesh(new THREE.SphereGeometry(0.14, 16, 10), M.beak, [0, 0.8, 0.45]);
  beak.scale.set(1.15, 0.45, 0.9);
  duck.add(beak);
  for (const x of [-0.11, 0.11]) duck.add(mesh(new THREE.SphereGeometry(0.035, 10, 8), M.black, [x, 0.93, 0.42]));
  const tail = mesh(new THREE.ConeGeometry(0.12, 0.25, 12), M.duck, [0, 0.55, -0.5]);
  tail.rotation.x = -0.9;
  duck.add(tail);
  const duckSign = plane(0.66, 0.33, T.smallSign('러버덕 상담소', '24시간 · 무료', '#f4efe4', '#26324a'), [0.62, 0.42, 0.25], -0.3, false);
  duckSign.rotation.x = -0.5;
  duck.add(duckSign);
  addClick(duck, 'duck');

  // ── 화분 ───────────────────────────────────────
  const plant = (x: number, z: number, h: number) => {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.add(cyl(0.22, 0.17, 0.4, M.pot, [0, 0.2, 0], 16));
    g.add(cyl(0.025, 0.03, h, M.darkWood, [0, 0.4 + h / 2, 0], 6));
    const leafG = new THREE.SphereGeometry(0.16, 10, 8);
    for (let i = 0; i < 9; i++) {
      const a = i * 2.4;
      const y = 0.55 + (i / 9) * h + 0.1;
      const l = new THREE.Mesh(leafG, i % 2 ? M.leaf : M.leaf2);
      l.position.set(Math.cos(a) * 0.17, y, Math.sin(a) * 0.17);
      l.scale.set(1.2, 0.35, 0.8);
      l.rotation.set(0.4, a, 0.3);
      l.castShadow = true;
      g.add(l);
    }
    add(g);
  };
  plant(6.5, -3.5, 1.1);
  plant(-6.5, 4.5, 1.3);
  plant(6.5, 4.6, 0.9);
  plant(0.7, 4.55, 0.7);

  // ── 조명 ───────────────────────────────────────
  const lights: THREE.PointLight[] = [];
  const glowTex = T.glowSprite('rgb(255,196,128)');
  const glow = (p: V3, s: number) => {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.55 }));
    sp.position.set(...p);
    sp.scale.setScalar(s);
    add(sp);
  };
  const point = (p: V3, color: string, intensity: number, distance: number) => {
    const l = new THREE.PointLight(color, intensity, distance, 2);
    l.position.set(...p);
    add(l);
    lights.push(l);
    return l;
  };
  // 테이블 펜던트
  for (const x of [-2.1, 0, 2.1]) {
    add(cyl(0.006, 0.006, H - 2.35, M.black, [x, 2.35 + (H - 2.35) / 2, -1.4], 4));
    const shade = mesh(new THREE.ConeGeometry(0.24, 0.2, 24, 1, true), M.shade, [x, 2.28, -1.4]);
    add(shade);
    add(mesh(new THREE.SphereGeometry(0.06, 12, 8), M.bulb, [x, 2.2, -1.4], false));
    glow([x, 2.16, -1.4], 1.1);
  }
  point([0, 2.15, -1.4], '#ffbe7a', mobile ? 14 : 12, 8);
  if (!mobile) point([-2.6, 2.1, -1.4], '#ffbe7a', 5, 5);
  // 바 위 에디슨 전구
  for (const x of [-3.3, 0, 3.3]) {
    add(cyl(0.004, 0.004, 0.7, M.black, [x, H - 0.35, -3.9], 4));
    add(mesh(new THREE.SphereGeometry(0.05, 12, 8), M.bulb, [x, 2.48, -3.9], false));
    glow([x, 2.48, -3.9], 0.7);
  }
  point([0, 2.4, -3.8], '#ffb46b', 6, 7);
  // 커피 카운터
  point([-5.8, 2.3, -1.0], '#ffc58a', 6, 5);
  // 빈백 코너 스탠드
  add(cyl(0.18, 0.2, 0.03, M.black, [-6.3, 0.015, 1.7]));
  add(cyl(0.012, 0.012, 1.4, M.black, [-6.3, 0.72, 1.7], 6));
  add(mesh(new THREE.CylinderGeometry(0.14, 0.22, 0.26, 20, 1, true), new THREE.MeshStandardMaterial({ color: '#efe2c8', emissive: '#ffcc88', emissiveIntensity: 0.6, side: THREE.DoubleSide }), [-6.3, 1.48, 1.7]));
  point([-6.2, 1.45, 1.8], '#ffc07a', 5, 5);
  // 스탠딩 데스크 쪽
  point([5.3, 2.4, 2.9], '#ffd3a0', 9, 6);

  // 장애 경보용 빨간 조명
  const alarm = new THREE.PointLight('#ff2a2a', 0, 18, 1.5);
  alarm.position.set(1, 2.9, 0);
  add(alarm);

  // ── 컷어웨이: 카메라 쪽 벽 숨기기 ─────────────────
  const updateWalls = (cam: THREE.Camera) => {
    leftWall.visible = cam.position.x > ROOM.x0 + 1.5;
    rightWall.visible = cam.position.x < ROOM.x1 - 1.5;
  };

  // ── 매 프레임 ──────────────────────────────────
  const ledColors = ['#3fe07a', '#3fe07a', '#3fe07a', '#e3b341', '#3fe07a'];
  const tmpC = new THREE.Color();
  let ledT = 0;
  let t = 0;
  let alarmT = 0;
  let duckT = 0;
  let clockT = 0;
  const update = (dt: number, cam: THREE.Camera) => {
    t += dt;
    updateWalls(cam);
    // LED 깜빡
    ledT -= dt;
    if (ledT <= 0) {
      ledT = alarmT > 0 ? 0.12 : 0.25;
      for (let i = 0; i < leds.count; i++) {
        if (alarmT > 0) tmpC.set(Math.random() < 0.6 ? '#ff2a2a' : '#330808');
        else if (Math.random() < 0.3) tmpC.set(Math.random() < 0.15 ? '#1a3322' : ledColors[Math.floor(Math.random() * ledColors.length)]);
        else continue;
        leds.setColorAt(i, tmpC);
      }
      if (leds.instanceColor) leds.instanceColor.needsUpdate = true;
    }
    // 배포 버튼 숨쉬기
    M.red.emissiveIntensity = alarmT > 0 ? (Math.sin(t * 20) > 0 ? 2.5 : 0.2) : 0.5 + Math.sin(t * 2.5) * 0.35;
    // 경보
    if (alarmT > 0) {
      alarmT -= dt;
      alarm.intensity = Math.max(0, Math.sin(t * 9)) * 40;
      alarm.position.x = Math.sin(t * 4) * 5;
      if (alarmT <= 0) alarm.intensity = 0;
    }
    // 오리 끄덕
    if (duckT > 0) {
      duckT -= dt;
      duck.rotation.z = Math.sin(duckT * 18) * 0.12 * duckT;
      duck.position.y = Math.abs(Math.sin(duckT * 9)) * 0.08 * duckT;
    }
    // 시계 (1초에 한 번)
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
  };

  // ── 정적인 가구는 재질별로 합쳐서 그리기 횟수 줄이기 ─────
  keep.add(duck).add(leftWall).add(rightWall).add(backWall);
  for (const c of [...clickables]) {
    if ((c as THREE.Mesh).isMesh) continue;
    // 합치면 클릭 판정이 사라지니 보이지 않는 상자를 대신 둠
    const bb = new THREE.Box3().setFromObject(c);
    const size = bb.getSize(new THREE.Vector3());
    const proxy = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), hitMat);
    bb.getCenter(proxy.position);
    proxy.userData.interact = c.userData.interact;
    root.add(proxy);
    clickables.push(proxy);
  }
  mergeStatic(root, keep);
  mergeStatic(leftWall, keep);
  mergeStatic(rightWall, keep);
  mergeStatic(backWall, keep);

  return {
    root,
    floor,
    clickables,
    seatHits,
    gitlog,
    lights,
    update,
    alarm(seconds: number) {
      alarmT = seconds;
    },
    quack() {
      duckT = 1;
    },
    get alarming() {
      return alarmT > 0;
    },
  };
}

export type Room = ReturnType<typeof buildRoom>;

/** container 안의 움직이지 않는 메시를 재질별로 하나로 합침 */
function mergeStatic(container: THREE.Object3D, keep: Set<THREE.Object3D>) {
  container.updateMatrixWorld(true);
  const inv = container.matrixWorld.clone().invert();
  const buckets = new Map<string, { mat: THREE.Material; cast: boolean; geos: THREE.BufferGeometry[] }>();
  const done: THREE.Mesh[] = [];
  container.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || (m as THREE.InstancedMesh).isInstancedMesh) return;
    for (let p: THREE.Object3D | null = m; p && p !== container; p = p.parent) if (keep.has(p) && p !== container) return;
    if (Array.isArray(m.material)) return;
    const mat = m.material;
    if (!mat.visible || mat.transparent) return;
    const g = (m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone()) as THREE.BufferGeometry;
    for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name);
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    g.applyMatrix4(inv.clone().multiply(m.matrixWorld));
    const key = mat.uuid + (m.castShadow ? ':c' : ':n');
    let b = buckets.get(key);
    if (!b) buckets.set(key, (b = { mat, cast: m.castShadow, geos: [] }));
    b.geos.push(g);
    done.push(m);
  });
  for (const m of done) m.removeFromParent();
  for (const b of buckets.values()) {
    const merged = mergeGeometries(b.geos);
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, b.mat);
    mesh.castShadow = b.cast;
    mesh.receiveShadow = true;
    container.add(mesh);
    b.geos.forEach((g) => g.dispose());
  }
}
