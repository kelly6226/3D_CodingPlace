// 🏆 해커톤장: 팀 테이블 네 개, 피자 탑, 무대 위 카운트다운. 배포 버튼은 '최종 제출'
import * as THREE from 'three';
import { DUCK_LINES } from '../../config';
import { FACE, boxAt, seat, seatObstacles, type Box, type PlaceLayout, type Seat } from '../layout';
import * as T from '../textures';
import * as T2 from './tex2';
import {
  DUCK_PET,
  alarmKit,
  baseboards,
  beanbagModel,
  bounce,
  box,
  builder,
  chairModel,
  cyl,
  duckModel,
  floorDecal,
  floorSlab,
  foldingChairModel,
  lightKit,
  mesh,
  plainWalls,
  plane,
  sideWallCutaway,
  std,
  type V3,
} from './kit';
import type { PlaceDef } from './types';

// ── 배치도 ─────────────────────────────────────────
const ROOM = { x0: -8, x1: 8, z0: -6, z1: 6, wallH: 3.6 };
const STAGE = { x0: -4.6, x1: 4.6, z0: ROOM.z0, z1: -4.6, h: 0.3 };
const TABLE = { w: 2.4, d: 1.0, h: 0.75 };
const TEAMS: { x: number; z: number; name: string; motto: string; color: string }[] = [
  { x: -3.2, z: -1.6, name: 'TEAM 01', motto: '아이디어만 47개', color: '#ff6fb5' },
  { x: 3.2, z: -1.6, name: 'TEAM 02', motto: '노코드로 다 함', color: '#58a6ff' },
  { x: -3.2, z: 2.2, name: 'TEAM 03', motto: '일단 블록체인', color: '#f2b45a' },
  { x: 3.2, z: 2.2, name: 'TEAM 04', motto: '잠은 데모 후에', color: '#7ee787' },
];
const PIZZA = { x0: ROOM.x0 + 0.05, x1: ROOM.x0 + 0.85, z0: -1.9, z1: 0.9, h: 0.78 };
const MENTOR = { x0: 6.4, x1: 7.0, z0: -2.4, z1: -0.8, h: 0.75 };
const PODIUM = { x: 3.8, z: -4.0 };
const DOOR_Z = 4.8;

const seats: Seat[] = [];
TEAMS.forEach((t, ti) => {
  for (const dx of [-0.6, 0.6]) {
    const n = seats.length;
    seats.push(seat(`t${ti + 1}-${n % 4 + 1}`, 'chair', `${t.name} 테이블`, t.x + dx, t.z - TABLE.d / 2 - 0.35, FACE.S));
    seats.push(seat(`t${ti + 1}-${n % 4 + 2}`, 'chair', `${t.name} 테이블`, t.x + dx, t.z + TABLE.d / 2 + 0.35, FACE.N));
  }
});
// 쉬는 곳 빈백 (오른쪽 벽)
[1.0, 2.1, 3.2].forEach((z, i) => seats.push(seat(`bean-${i + 1}`, 'beanbag', '빈백 존', 7.0, z, FACE.W, { dist: 0.3, ly: 0.45, ax: 6.25, az: z })));
// 멘토 자리
seats.push(seat('mentor', 'chair', '멘토 데스크', 7.4, -1.6, FACE.W, { dist: 0.65, ax: 7.4, az: -0.45 }));

const obstacles: Box[] = [
  STAGE,
  ...TEAMS.map((t) => boxAt(t.x, t.z, TABLE.w, TABLE.d)),
  PIZZA,
  MENTOR,
  boxAt(PODIUM.x, PODIUM.z, 0.6, 0.5),
  boxAt(-6.1, 4.9, 1.9, 0.75), // 침낭
  boxAt(-7.4, -4.6, 0.6, 0.6), // 쓰레기통
  ...seatObstacles(seats),
];

const layout: PlaceLayout = {
  room: ROOM,
  spawn: { x: 7.3, z: DOOR_Z },
  seats,
  obstacles,
  spots: {
    use: { x: PIZZA.x1 + 0.5, z: -0.5, yaw: FACE.W },
    deploy: { x: PODIUM.x, z: PODIUM.z + 0.65, yaw: FACE.N },
    pet: { x: 6.0, z: -1.9 },
    idle: { x: 0, z: 3.6 },
  },
};

// ── 만들기 ─────────────────────────────────────────
function build(scene: THREE.Scene, mobile: boolean) {
  const b = builder(scene);
  const { add, click, note } = b;
  const M = {
    white: std('#f1efe9', 0.7),
    cloth: std('#e9e6f2', 0.9),
    metal: std('#9aa1ab', 0.4, 0.7),
    black: std('#17171d', 0.6),
    stage: std('#1d1b2c', 0.6),
    stageEdge: new THREE.MeshBasicMaterial({ color: '#7c6cff' }),
    wood: std('#8a6a4a', 0.6),
    cardboard: std('#d9b27c', 0.85),
    chair: std('#3a3f52', 0.6),
    red: std('#d42a2a', 0.3, 0, { emissive: '#ff2020', emissiveIntensity: 0.6 }),
    can: [std('#2b6cff', 0.3, 0.6), std('#1fbf6a', 0.3, 0.6), std('#e8433a', 0.3, 0.6), std('#f2c230', 0.3, 0.6)],
  };
  const H = ROOM.wallH;

  // 바닥 + 벽
  const floor = floorSlab(b, ROOM, std('#ffffff', 0.95, 0, { map: T2.carpet('#353b62', '#8f80ff') }), std('#14131c', 0.9));
  const walls = plainWalls(b, ROOM, std('#ffffff', 0.95, 0, { map: T.plaster('#3a3d5e') }));
  baseboards(b, ROOM, walls, M.black);
  // 무대 앞 레드카펫 (발표하러 걸어가는 길)
  add(floorDecal(1.4, 3.0, std('#5a1f3a', 1), [0, 0.006, STAGE.z1 + 1.5]));

  // ── 무대 ─────────────────────────────────────
  const sw = STAGE.x1 - STAGE.x0;
  const sd = STAGE.z1 - STAGE.z0;
  add(box(sw, STAGE.h, sd, M.stage, [0, STAGE.h / 2, (STAGE.z0 + STAGE.z1) / 2]));
  add(box(sw, 0.03, 0.03, M.stageEdge, [0, STAGE.h - 0.01, STAGE.z1], false));
  const count = new T2.CountdownScreen();
  add(box(3.75, 1.55, 0.08, M.black, [0, 2.25, ROOM.z0 + 0.04], false), walls.back);
  const countPlane = plane(3.6, 1.41, count.texture, [0, 2.25, ROOM.z0 + 0.085], 0);
  (countPlane.material as THREE.MeshBasicMaterial).transparent = false;
  note(countPlane, ['⏳ 데모까지 남은 시간이에요. 아직 아무 팀도 배포를 안 했어요.', '⏳ 발표 자료는 아직 Lorem ipsum이에요.'], walls.back);
  // 트러스 + 배너
  for (const x of [-4.4, 4.4]) add(box(0.18, H - STAGE.h, 0.18, M.metal, [x, STAGE.h + (H - STAGE.h) / 2, -5.4]));
  add(box(9.0, 0.18, 0.18, M.metal, [0, H - 0.12, -5.4]));
  add(plane(5.2, 0.48, T2.label(['HACK THE NIGHT 2026'], '#14102e', '#c9bcff', 1024, 96, T.FONT_MONO, 700), [0, H - 0.5, -5.3], 0, false));
  // 스피커
  for (const x of [-3.9, 3.9]) {
    add(box(0.55, 0.9, 0.5, M.black, [x, STAGE.h + 0.45, -5.0]));
    add(cyl(0.16, 0.16, 0.02, std('#2a2a33', 0.4), [x, STAGE.h + 0.55, -4.74], 20)).rotation.x = Math.PI / 2;
  }
  // 무대 조명 (트러스에 매달린 캔 조명)
  const stageCans: { p: V3; c: string }[] = [
    { p: [-3.0, H - 0.3, -5.4], c: '#ff4fd8' },
    { p: [-1.0, H - 0.3, -5.4], c: '#4ff0ff' },
    { p: [1.0, H - 0.3, -5.4], c: '#ff4fd8' },
    { p: [3.0, H - 0.3, -5.4], c: '#4ff0ff' },
  ];
  for (const s of stageCans) {
    const can = add(cyl(0.1, 0.13, 0.25, M.black, s.p, 14));
    can.rotation.x = -0.9;
  }

  // 최종 제출 단상
  const pod = new THREE.Group();
  pod.position.set(PODIUM.x, 0, PODIUM.z);
  pod.add(box(0.6, 1.05, 0.45, M.wood, [0, 0.525, 0]));
  const top = box(0.66, 0.05, 0.5, M.wood, [0, 1.08, 0.02]);
  top.rotation.x = 0.18;
  pod.add(top);
  pod.add(cyl(0.11, 0.12, 0.05, M.black, [0, 1.13, 0.05], 20));
  const dome = mesh(new THREE.SphereGeometry(0.09, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), M.red, [0, 1.15, 0.05]);
  dome.scale.y = 0.7;
  pod.add(dome);
  pod.add(plane(0.5, 0.25, T.smallSign('최종 제출', '되돌릴 수 없음', '#f2c230', '#1a1a1a'), [0, 0.7, 0.228], 0, false));
  click(pod, { interact: 'deploy' });

  // ── 팀 테이블 ─────────────────────────────────
  TEAMS.forEach((t, ti) => {
    add(box(TABLE.w, 0.04, TABLE.d, M.cloth, [t.x, TABLE.h - 0.02, t.z]));
    add(box(TABLE.w, TABLE.h - 0.1, 0.02, M.cloth, [t.x, (TABLE.h - 0.04) / 2 + 0.03, t.z + TABLE.d / 2 - 0.01]));
    add(box(TABLE.w, TABLE.h - 0.1, 0.02, M.cloth, [t.x, (TABLE.h - 0.04) / 2 + 0.03, t.z - TABLE.d / 2 + 0.01]));
    // 텐트 카드 (양쪽에서 보이게)
    const tent = new THREE.Group();
    tent.position.set(t.x, TABLE.h, t.z);
    const tex = T2.label([t.name, t.motto], t.color, '#16141f', 512, 192);
    for (const k of [-1, 1]) {
      const p = plane(0.5, 0.19, tex, [0, 0.09, k * 0.035], k > 0 ? 0 : Math.PI, false);
      p.rotation.x = k * -0.38;
      tent.add(p);
    }
    note(tent, [`🏷️ ${t.name} · ${t.motto}`, `🏷️ ${t.name}: 기획서는 3장, 코드는 0줄이래요.`, `🏷️ ${t.name}: 팀 이름 정하는 데 2시간 걸렸대요.`]);
    // 에너지 드링크, 포스트잇, 멀티탭
    for (let i = 0; i < 3; i++) add(cyl(0.033, 0.033, 0.12, M.can[(ti + i) % 4], [t.x - 1.0 + i * 0.95, TABLE.h + 0.06, t.z + (i % 2 ? 0.32 : -0.33)], 10));
    add(box(0.5, 0.04, 0.1, M.white, [t.x, TABLE.h + 0.02, t.z + 0.03]));
    add(box(0.09, 0.005, 0.09, std(['#ffe680', '#ffb3c7', '#a7e3ff', '#b9f0a7'][ti], 0.9), [t.x + 0.9, TABLE.h + 0.003, t.z - 0.1], false));
  });

  // ── 피자 스테이션 (왼쪽 벽) ──────────────────────
  const pizza = new THREE.Group();
  const pw = PIZZA.x1 - PIZZA.x0;
  const pl = PIZZA.z1 - PIZZA.z0;
  pizza.position.set((PIZZA.x0 + PIZZA.x1) / 2, 0, (PIZZA.z0 + PIZZA.z1) / 2);
  pizza.add(box(pw, 0.04, pl, M.cloth, [0, PIZZA.h - 0.02, 0]));
  pizza.add(box(0.02, PIZZA.h - 0.1, pl, M.cloth, [pw / 2 - 0.01, (PIZZA.h - 0.04) / 2 + 0.03, 0]));
  const lid = std('#ffffff', 0.85, 0, { map: T2.pizzaLid() });
  const boxMats = [M.cardboard, M.cardboard, lid, M.cardboard, M.cardboard, M.cardboard];
  [-1.0, -0.45, 0.6].forEach((z, k) => {
    const n = [6, 4, 5][k];
    for (let i = 0; i < n; i++) {
      const pb = box(0.42, 0.05, 0.42, boxMats, [0, PIZZA.h + 0.025 + i * 0.052, z]);
      pb.rotation.y = (i % 2 ? 0.08 : -0.06) + k;
      pizza.add(pb);
    }
  });
  // 열린 박스: 마지막 한 조각
  pizza.add(box(0.42, 0.02, 0.42, M.cardboard, [0, PIZZA.h + 0.01, 0.08]));
  const slice = mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.02, 24, 1, false, 0, Math.PI / 4), std('#e8a33d', 0.7), [0, PIZZA.h + 0.03, 0.08]);
  pizza.add(slice);
  for (let i = 0; i < 4; i++) pizza.add(cyl(0.045, 0.045, 0.28, M.can[i], [0.15 - (i % 2) * 0.3, PIZZA.h + 0.14, -1.35 + i * 0.05], 12));
  click(pizza, { interact: 'use' });
  click(plane(1.0, 0.5, T.smallSign('🍕 1인 2조각', '마지막 한 조각은 양보', '#f4efe4', '#3a2a1a'), [ROOM.x0 + 0.02, 1.75, -0.5], Math.PI / 2, false), { interact: 'use' }, walls.left);

  // ── 왼쪽 벽: git log TV, 아이디어 벽, 와이파이 ─────────
  const gitlog = new T.GitLogScreen();
  add(box(0.07, 1.45, 2.5, M.black, [ROOM.x0 + 0.04, 1.9, -4.0], false), walls.left);
  const tv = plane(2.38, 1.34, gitlog.texture, [ROOM.x0 + 0.085, 1.9, -4.0], Math.PI / 2);
  (tv.material as THREE.MeshBasicMaterial).transparent = false;
  click(tv, { interact: 'tv' }, walls.left);
  note(
    plane(3.2, 1.6, T2.ideaWall(), [ROOM.x0 + 0.02, 1.8, 3.2], Math.PI / 2, false),
    ['💡 아이디어 15개 중에 하나만 동그라미 쳤어요. 모각코 매칭이요.', '💡 "할 일 앱 (8번째)"에 누가 +1을 붙였어요.'],
    walls.left,
  );
  note(plane(0.9, 0.45, T.smallSign('Wi-Fi  HACK_GUEST', 'PW  hackthenight', '#20241f', '#f1ede0'), [ROOM.x0 + 0.02, 2.5, 1.0], Math.PI / 2), ['📶 와이파이에 200명이 붙어서 npm install이 안 끝나요.'], walls.left);

  // 쓰레기통 (빈 캔 산)
  add(cyl(0.28, 0.25, 0.75, std('#3a6f4a', 0.6), [-7.4, 0.375, -4.6], 18));
  for (let i = 0; i < 8; i++) add(cyl(0.033, 0.033, 0.12, M.can[i % 4], [-7.4 + Math.cos(i * 1.7) * 0.15, 0.8 + (i % 3) * 0.04, -4.6 + Math.sin(i * 1.7) * 0.15], 10));

  // 침낭 (자고 있는 참가자)
  const bag = new THREE.Group();
  bag.position.set(-6.1, 0, 4.9);
  bag.rotation.y = 0.08;
  const bagBody = mesh(new THREE.CapsuleGeometry(0.28, 1.3, 6, 16), std('#3f6f74', 0.9), [0, 0.2, 0]);
  bagBody.rotation.z = Math.PI / 2;
  bagBody.scale.set(0.7, 1, 1);
  bag.add(bagBody);
  bag.add(mesh(new THREE.SphereGeometry(0.17, 16, 12), std('#2b2220', 0.8), [-0.92, 0.22, 0]));
  note(bag, ['💤 누군가 자고 있어요. 데모 1시간 전에 깨워달래요.', '💤 침낭에 "건드리면 머지 충돌"이라고 써 있어요.']);

  // ── 오른쪽: 멘토 데스크, 빈백 존, 문 ────────────
  const mw = MENTOR.x1 - MENTOR.x0;
  const ml = MENTOR.z1 - MENTOR.z0;
  const mcx = (MENTOR.x0 + MENTOR.x1) / 2;
  const mcz = (MENTOR.z0 + MENTOR.z1) / 2;
  add(box(mw, 0.04, ml, M.cloth, [mcx, MENTOR.h - 0.02, mcz]));
  add(box(0.02, MENTOR.h - 0.1, ml, M.cloth, [MENTOR.x0 + 0.01, (MENTOR.h - 0.04) / 2 + 0.03, mcz]));
  const mentorSign = plane(0.6, 0.3, T.smallSign('멘토 데스크', '질문 환영 · 코드는 안 짜줌', '#7c6cff', '#ffffff'), [MENTOR.x0 + 0.05, 0.95, mcz + 0.45], -Math.PI / 2, false);
  note(mentorSign, ['🧑‍🏫 멘토: "그거 왜 그렇게 짰어요?" (칭찬 아님)', '🧑‍🏫 멘토: "일단 돌아가게 만들고 생각해요."', '🧑‍🏫 멘토: "데모는 기능 하나만 확실하게."']);
  const duck = duckModel(0.2);
  duck.position.set(mcx, MENTOR.h, MENTOR.z0 + 0.25);
  duck.rotation.y = -Math.PI / 2 + 0.3;
  click(duck, DUCK_PET(DUCK_LINES));
  b.keep.add(duck);
  const duckAnim = bounce(duck);
  add(plane(1.0, 0.5, T.smallSign('빈백 존', '여기서 자면 탈락', '#f4efe4', '#26324a'), [ROOM.x1 - 0.02, 1.7, 2.1], -Math.PI / 2, false), walls.right);
  const door = new THREE.Group();
  door.position.set(ROOM.x1 - 0.02, 0, DOOR_Z);
  door.add(box(0.06, 2.3, 1.6, std('#4a4f63', 0.5, 0.3), [0, 1.15, 0]));
  door.add(box(0.07, 0.04, 1.6, M.metal, [0, 2.3, 0]));
  door.add(box(0.07, 2.3, 0.04, M.black, [0, 1.15, 0]));
  door.add(box(0.05, 0.04, 0.3, M.metal, [-0.05, 1.05, -0.25]));
  door.add(box(0.05, 0.04, 0.3, M.metal, [-0.05, 1.05, 0.25]));
  add(door, walls.right);
  add(plane(0.9, 0.3, T.smallSign('EXIT', '비상구', '#1f8f5a', '#ffffff'), [ROOM.x1 - 0.02, 2.62, DOOR_Z], -Math.PI / 2), walls.right);

  // ── 자리 가구 ─────────────────────────────────
  const beanColors = ['#ff6fb5', '#58a6ff', '#f2b45a'];
  let bi = 0;
  for (const s of seats) {
    b.seatGroup(s, (g) => {
      if (s.kind === 'beanbag') beanbagModel(g, beanColors[bi++ % 3]);
      else if (s.id === 'mentor') chairModel(g, M.chair, M.metal);
      else foldingChairModel(g, M.chair, M.metal);
    });
  }

  // ── 조명 ─────────────────────────────────────
  const L = lightKit(b);
  const stageLights = [
    L.point([-2.0, 2.8, -4.3], '#ff4fd8', 8, 9),
    L.point([2.0, 2.8, -4.3], '#4ff0ff', 8, 9),
  ];
  for (const s of stageCans) L.glow([s.p[0], s.p[1] - 0.15, s.p[2] + 0.15], 0.9, s.c === '#ff4fd8' ? 'rgb(255,90,220)' : 'rgb(90,240,255)', 0.6);
  for (const t of TEAMS) {
    add(cyl(0.006, 0.006, 0.6, M.black, [t.x, H - 0.3, t.z], 4));
    add(mesh(new THREE.ConeGeometry(0.3, 0.22, 24, 1, true), std('#e9e4f5', 0.5, 0, { side: THREE.DoubleSide, emissive: '#ffe2b0', emissiveIntensity: 0.25 }), [t.x, H - 0.65, t.z]));
    add(mesh(new THREE.SphereGeometry(0.07, 12, 8), new THREE.MeshBasicMaterial({ color: '#ffe2b0' }), [t.x, H - 0.73, t.z], false));
    L.glow([t.x, H - 0.77, t.z], 1.3);
  }
  if (mobile) L.point([0, 2.6, 0.3], '#ffd3a0', 18, 13);
  else for (const t of TEAMS) L.point([t.x, H - 0.8, t.z], '#ffd3a0', 10, 7);
  L.point([-6.8, 2.2, -0.5], '#ffc58a', 5, 5);
  if (!mobile) L.point([6.8, 2.2, 1.5], '#b9a8ff', 4, 6);

  const alarm = alarmKit(b, ROOM, [M.red]);
  const wallsCut = sideWallCutaway(walls.left, walls.right, ROOM);
  b.finish([walls.left, walls.right, walls.back]);

  let t = 0;
  return {
    root: b.root,
    floor,
    clickables: b.clickables,
    seatHits: b.seatHits,
    gitlog,
    update(dt: number, cam: THREE.Camera) {
      t += dt;
      wallsCut(cam);
      alarm.update(dt);
      count.update(dt, alarm.on);
      duckAnim.update(dt);
      // 무대 조명이 천천히 숨쉬듯
      stageLights[0].intensity = 7 + Math.sin(t * 0.9) * 2.5;
      stageLights[1].intensity = 7 + Math.cos(t * 0.7) * 2.5;
    },
    alarm: (sec: number) => alarm.start(sec),
    poke: (key: string) => key === 'duck' && duckAnim.poke(),
    get alarming() {
      return alarm.on;
    },
  };
}

export const hackathon: PlaceDef = {
  id: 'hackathon',
  layout,
  ambience: 'hackathon',
  env: {
    background: () => new THREE.Color('#07060f'),
    hemi: { sky: '#8a8ac8', ground: '#2a2232', intensity: 1.15 },
    sun: { color: '#c8c0ff', intensity: 0.7, pos: [-4, 14, 8] },
    exposure: 1.2,
  },
  canvasText:
    'HACK THE NIGHT 2026 TEAM 01 아이디어만 47개 TEAM 02 노코드로 다 함 TEAM 03 일단 블록체인 TEAM 04 잠은 데모 후에 최종 제출 되돌릴 수 없음 🍕 1인 2조각 마지막 한 조각은 양보 Wi-Fi HACK_GUEST PW hackthenight 멘토 데스크 질문 환영 · 코드는 안 짜줌 빈백 존 여기서 자면 탈락 EXIT 비상구',
  build,
};
