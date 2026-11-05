// 장소를 만들 때 같이 쓰는 도구 (도형, 재질, 의자, 오리, 합치기, 벽 숨기기)
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { RoomBounds, Seat } from '../layout';
import { glowSprite } from '../textures';

export type V3 = [number, number, number];

/** 클릭했을 때 할 일. world.ts가 읽어서 main.ts로 넘겨요 */
export interface InteractData {
  interact: 'use' | 'deploy' | 'tv' | 'pet' | 'note';
  /** note/pet: 토스트로 띄울 문구 중 하나 */
  lines?: string[];
  /** pet: 소리 */
  sound?: 'quack' | 'meow';
  /** pet: 어느 동물을 움직일지 */
  key?: string;
}

export const std = (color: string, roughness = 0.7, metalness = 0, extra: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });

export function mesh(g: THREE.BufferGeometry, m: THREE.Material | THREE.Material[], p: V3, shadow = true) {
  const o = new THREE.Mesh(g, m);
  o.position.set(...p);
  o.castShadow = shadow;
  o.receiveShadow = true;
  return o;
}
export const box = (w: number, h: number, d: number, m: THREE.Material | THREE.Material[], p: V3, shadow = true) =>
  mesh(new THREE.BoxGeometry(w, h, d), m, p, shadow);
export const cyl = (rt: number, rb: number, h: number, m: THREE.Material, p: V3, seg = 20) =>
  mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m, p);
export const sphere = (r: number, m: THREE.Material, p: V3, seg = 16) => mesh(new THREE.SphereGeometry(r, seg, Math.max(8, seg * 0.6)), m, p);

/** 글자나 그림을 붙인 판. basic이면 조명 영향 없이 그대로 보임 (화면, 네온) */
export function plane(w: number, h: number, map: THREE.Texture, p: V3, ry = 0, basic = true) {
  const m = basic
    ? new THREE.MeshBasicMaterial({ map, transparent: true })
    : new THREE.MeshStandardMaterial({ map, roughness: 0.8 });
  const o = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
  o.position.set(...p);
  o.rotation.y = ry;
  return o;
}

/** 바닥에 까는 판 (러그, 매트) */
export function floorDecal(w: number, d: number, m: THREE.Material, p: V3, rz = 0) {
  const o = new THREE.Mesh(new THREE.PlaneGeometry(w, d), m);
  o.rotation.set(-Math.PI / 2, 0, rz);
  o.position.set(...p);
  o.receiveShadow = true;
  o.userData.floor = true;
  return o;
}

export function tagInteract<O extends THREE.Object3D>(o: O, data: InteractData): O {
  o.traverse((c) => Object.assign(c.userData, data));
  return o;
}

export const hitMat = new THREE.MeshBasicMaterial({ visible: false });

/** 장소 하나를 만드는 동안 쓰는 상자: 붙이기, 클릭 등록, 자리 등록 */
export function builder(scene: THREE.Scene) {
  const root = new THREE.Group();
  scene.add(root);
  const clickables: THREE.Object3D[] = [];
  const seatHits: THREE.Object3D[] = [];
  const keep = new Set<THREE.Object3D>();
  const add = <O extends THREE.Object3D>(o: O, parent: THREE.Object3D = root): O => {
    parent.add(o);
    return o;
  };
  const click = <O extends THREE.Object3D>(o: O, data: InteractData, parent: THREE.Object3D = root): O => {
    tagInteract(o, data);
    parent.add(o);
    clickables.push(o);
    return o;
  };
  const note = <O extends THREE.Object3D>(o: O, lines: string[], parent: THREE.Object3D = root) => click(o, { interact: 'note', lines }, parent);
  const seatGroup = (s: Seat, build: (g: THREE.Group) => void) => {
    const g = new THREE.Group();
    g.position.set(s.x, 0, s.z);
    g.rotation.y = s.yaw;
    build(g);
    const hit = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.1, 0.6), hitMat);
    hit.position.y = 0.55;
    g.add(hit);
    g.traverse((o) => (o.userData.seatId = s.id));
    root.add(g);
    seatHits.push(g);
    return g;
  };
  /** 끝에 한 번: 클릭 대상에 보이지 않는 판정 상자를 두고, 정적인 메시를 합침 */
  const finish = (containers: THREE.Object3D[] = []) => {
    root.updateMatrixWorld(true);
    for (const c of [...clickables]) {
      // 메시 하나짜리(TV 등)는 합치지 않고 그대로 둬야 클릭 판정이 남아요
      if ((c as THREE.Mesh).isMesh) {
        keep.add(c);
        continue;
      }
      const bb = new THREE.Box3().setFromObject(c);
      if (bb.isEmpty()) continue;
      const size = bb.getSize(new THREE.Vector3());
      const proxy = new THREE.Mesh(new THREE.BoxGeometry(Math.max(size.x, 0.2), Math.max(size.y, 0.2), Math.max(size.z, 0.2)), hitMat);
      bb.getCenter(proxy.position);
      // 벽에 붙은 물건은 판정 상자도 벽 그룹에 (벽이 숨으면 같이 숨게)
      const parent = c.parent ?? root;
      parent.worldToLocal(proxy.position);
      const { interact, lines, sound, key } = c.userData as InteractData;
      Object.assign(proxy.userData, { interact, lines, sound, key });
      parent.add(proxy);
      clickables.push(proxy);
    }
    for (const c of containers) keep.add(c);
    mergeStatic(root, keep);
    for (const c of containers) mergeStatic(c, keep);
  };
  return { root, clickables, seatHits, keep, add, click, note, seatGroup, finish };
}

export type Builder = ReturnType<typeof builder>;

/** container 안의 움직이지 않는 메시를 재질별로 하나로 합침 (그리기 횟수 줄이기) */
export function mergeStatic(container: THREE.Object3D, keep: Set<THREE.Object3D>) {
  container.updateMatrixWorld(true);
  const inv = container.matrixWorld.clone().invert();
  const buckets = new Map<string, { mat: THREE.Material; cast: boolean; geos: THREE.BufferGeometry[] }>();
  const done: THREE.Mesh[] = [];
  container.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || (m as THREE.InstancedMesh).isInstancedMesh) return;
    for (let p: THREE.Object3D | null = m; p && p !== container; p = p.parent) if (keep.has(p)) return;
    if (Array.isArray(m.material)) return;
    const mat = m.material;
    if (!mat.visible || mat.transparent || m.userData.floor) return;
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
    const mm = new THREE.Mesh(merged, b.mat);
    mm.castShadow = b.cast;
    mm.receiveShadow = true;
    container.add(mm);
    b.geos.forEach((g) => g.dispose());
  }
}

/** 장소를 바꿀 때 GPU 메모리 정리 */
export function disposeTree(root: THREE.Object3D) {
  const seen = new Set<unknown>();
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.geometry && !seen.has(m.geometry)) {
      seen.add(m.geometry);
      m.geometry.dispose();
    }
    const mats = m.material ? (Array.isArray(m.material) ? m.material : [m.material]) : [];
    for (const mat of mats) {
      if (seen.has(mat)) continue;
      seen.add(mat);
      for (const v of Object.values(mat as unknown as Record<string, unknown>)) {
        if (v instanceof THREE.Texture && !seen.has(v)) {
          seen.add(v);
          v.dispose();
        }
      }
      mat.dispose();
    }
  });
}

/** 카메라 쪽 옆벽은 숨겨서 안이 보이게 */
export function sideWallCutaway(left: THREE.Object3D, right: THREE.Object3D, room: RoomBounds) {
  return (cam: THREE.Camera) => {
    left.visible = cam.position.x > room.x0 + 1.5;
    right.visible = cam.position.x < room.x1 - 1.5;
  };
}

/** 왼쪽·오른쪽·뒤 벽 세 장 (앞은 카메라 쪽이라 비워둠) */
export function plainWalls(b: Builder, room: RoomBounds, mat: THREE.Material, backMat: THREE.Material = mat) {
  const H = room.wallH;
  const W = room.x1 - room.x0;
  const D = room.z1 - room.z0;
  const cx = (room.x0 + room.x1) / 2;
  const cz = (room.z0 + room.z1) / 2;
  const left = b.add(new THREE.Group());
  const right = b.add(new THREE.Group());
  const back = b.add(new THREE.Group());
  b.add(box(0.2, H, D, mat, [room.x0 - 0.1, H / 2, cz], false), left);
  b.add(box(0.2, H, D, mat, [room.x1 + 0.1, H / 2, cz], false), right);
  b.add(box(W + 0.4, H, 0.2, backMat, [cx, H / 2, room.z0 - 0.1], false), back);
  return { left, right, back };
}

/** 벽 아래 걸레받이 */
export function baseboards(b: Builder, room: RoomBounds, walls: { left: THREE.Object3D; right: THREE.Object3D; back: THREE.Object3D }, mat: THREE.Material) {
  const W = room.x1 - room.x0;
  const D = room.z1 - room.z0;
  const cx = (room.x0 + room.x1) / 2;
  const cz = (room.z0 + room.z1) / 2;
  b.add(box(0.03, 0.09, D, mat, [room.x0 + 0.015, 0.045, cz], false), walls.left);
  b.add(box(0.03, 0.09, D, mat, [room.x1 - 0.015, 0.045, cz], false), walls.right);
  b.add(box(W, 0.09, 0.03, mat, [cx, 0.045, room.z0 + 0.015], false), walls.back);
}

/** 떠 있는 바닥판 (디오라마) */
export function floorSlab(b: Builder, room: RoomBounds, top: THREE.Material, side = std('#1c1a1f', 0.9)) {
  const W = room.x1 - room.x0;
  const D = room.z1 - room.z0;
  const f = box(W + 0.4, 0.4, D + 0.2, [side, side, top, side, side, side], [(room.x0 + room.x1) / 2, -0.2, (room.z0 + room.z1) / 2 - 0.1], false);
  f.name = 'floor';
  f.userData.floor = true;
  b.add(f);
  return f;
}

// ── 공용 가구 ─────────────────────────────────────

export function chairModel(g: THREE.Group, seatMat: THREE.Material, legMat: THREE.Material) {
  g.add(box(0.44, 0.05, 0.42, seatMat, [0, 0.45, 0]));
  g.add(box(0.44, 0.36, 0.04, seatMat, [0, 0.72, -0.2]));
  for (const [x, z] of [
    [-0.19, -0.18],
    [0.19, -0.18],
    [-0.19, 0.18],
    [0.19, 0.18],
  ]) {
    g.add(cyl(0.015, 0.015, 0.45, legMat, [x, 0.225, z], 8));
  }
}

export function foldingChairModel(g: THREE.Group, seatMat: THREE.Material, legMat: THREE.Material) {
  g.add(box(0.42, 0.04, 0.4, seatMat, [0, 0.45, 0]));
  g.add(box(0.42, 0.28, 0.03, seatMat, [0, 0.78, -0.2]));
  for (const x of [-0.2, 0.2]) {
    const a = box(0.025, 0.62, 0.025, legMat, [x, 0.3, 0]);
    a.rotation.x = 0.35;
    g.add(a);
    const c = box(0.025, 0.62, 0.025, legMat, [x, 0.3, 0]);
    c.rotation.x = -0.35;
    g.add(c);
    g.add(box(0.025, 0.5, 0.025, legMat, [x, 0.7, -0.2]));
  }
}

export function stoolModel(g: THREE.Group, seatMat: THREE.Material, legMat: THREE.Material) {
  g.add(cyl(0.19, 0.19, 0.05, seatMat, [0, 0.72, 0]));
  g.add(cyl(0.025, 0.025, 0.7, legMat, [0, 0.35, 0], 8));
  g.add(cyl(0.18, 0.2, 0.03, legMat, [0, 0.015, 0]));
  const foot = mesh(new THREE.TorusGeometry(0.15, 0.012, 6, 24), legMat, [0, 0.3, 0]);
  foot.rotation.x = Math.PI / 2;
  g.add(foot);
}

export function beanbagModel(g: THREE.Group, color: string) {
  const m = std(color, 1);
  const bb = mesh(new THREE.SphereGeometry(0.42, 24, 16), m, [0, 0.22, 0]);
  bb.scale.set(1, 0.6, 1);
  g.add(bb);
  const back = mesh(bb.geometry, m, [0, 0.38, -0.24]);
  back.scale.set(0.9, 0.55, 0.5);
  g.add(back);
}

export function cushionModel(g: THREE.Group, color: string) {
  const c = mesh(new THREE.CylinderGeometry(0.28, 0.3, 0.09, 20), std(color, 1), [0, 0.045, 0]);
  c.scale.z = 0.9;
  g.add(c);
}

export function gamingChairModel(g: THREE.Group, accent: string) {
  const body = std('#1c1d22', 0.6);
  const acc = std(accent, 0.5);
  g.add(box(0.5, 0.09, 0.48, body, [0, 0.47, 0]));
  g.add(box(0.48, 0.7, 0.1, body, [0, 0.88, -0.24]));
  g.add(box(0.3, 0.6, 0.02, acc, [0, 0.9, -0.18]));
  g.add(box(0.22, 0.12, 0.08, body, [0, 1.3, -0.24]));
  g.add(cyl(0.03, 0.03, 0.36, std('#30323a', 0.4, 0.6), [0, 0.25, 0], 8));
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const leg = box(0.3, 0.03, 0.04, body, [Math.cos(a) * 0.15, 0.05, Math.sin(a) * 0.15]);
    leg.rotation.y = -a;
    g.add(leg);
  }
}

const duckMat = std('#ffd23f', 0.35);
const beakMat = std('#ff8a2a', 0.4);
const eyeMat = std('#17181c', 0.6);

/** 러버덕. scale 1이면 거대 오리(높이 약 1.1m) */
export function duckModel(scale = 1) {
  const duck = new THREE.Group();
  const dbody = mesh(new THREE.SphereGeometry(0.42, 28, 20), duckMat, [0, 0.36, 0]);
  dbody.scale.set(1.05, 0.8, 1.25);
  duck.add(dbody);
  duck.add(mesh(new THREE.SphereGeometry(0.27, 24, 18), duckMat, [0, 0.86, 0.2]));
  const beak = mesh(new THREE.SphereGeometry(0.14, 16, 10), beakMat, [0, 0.8, 0.45]);
  beak.scale.set(1.15, 0.45, 0.9);
  duck.add(beak);
  for (const x of [-0.11, 0.11]) duck.add(mesh(new THREE.SphereGeometry(0.035, 10, 8), eyeMat, [x, 0.93, 0.42]));
  const tail = mesh(new THREE.ConeGeometry(0.12, 0.25, 12), duckMat, [0, 0.55, -0.5]);
  tail.rotation.x = -0.9;
  duck.add(tail);
  duck.scale.setScalar(scale);
  return duck;
}

export const DUCK_PET = (lines: string[]): InteractData => ({ interact: 'pet', sound: 'quack', key: 'duck', lines });

/** 화분 */
export function plantModel(h: number) {
  const pot = std('#b5663f', 0.85);
  const stem = std('#4a3021', 0.7);
  const leaf = std('#3f7a46', 0.7);
  const leaf2 = std('#5d9a55', 0.7);
  const g = new THREE.Group();
  g.add(cyl(0.22, 0.17, 0.4, pot, [0, 0.2, 0], 16));
  g.add(cyl(0.025, 0.03, h, stem, [0, 0.4 + h / 2, 0], 6));
  const leafG = new THREE.SphereGeometry(0.16, 10, 8);
  for (let i = 0; i < 9; i++) {
    const a = i * 2.4;
    const y = 0.55 + (i / 9) * h + 0.1;
    const l = new THREE.Mesh(leafG, i % 2 ? leaf : leaf2);
    l.position.set(Math.cos(a) * 0.17, y, Math.sin(a) * 0.17);
    l.scale.set(1.2, 0.35, 0.8);
    l.rotation.set(0.4, a, 0.3);
    l.castShadow = true;
    g.add(l);
  }
  return g;
}

// ── 빛 ──────────────────────────────────────────

export function lightKit(b: Builder) {
  const glowTexes = new Map<string, THREE.Texture>();
  const glow = (p: V3, s: number, rgb = 'rgb(255,196,128)', opacity = 0.55) => {
    let tex = glowTexes.get(rgb);
    if (!tex) glowTexes.set(rgb, (tex = glowSprite(rgb)));
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity }));
    sp.position.set(...p);
    sp.scale.setScalar(s);
    b.add(sp);
    return sp;
  };
  const point = (p: V3, color: string, intensity: number, distance: number, decay = 2) => {
    const l = new THREE.PointLight(color, intensity, distance, decay);
    l.position.set(...p);
    b.add(l);
    return l;
  };
  return { glow, point };
}

/** 장애 경보 때 빨갛게 도는 빛 + 깜빡이는 재질 */
export function alarmKit(b: Builder, room: RoomBounds, glowMats: THREE.MeshStandardMaterial[] = []) {
  const alarm = new THREE.PointLight('#ff2a2a', 0, 22, 1.5);
  alarm.position.set((room.x0 + room.x1) / 2, room.wallH - 0.3, (room.z0 + room.z1) / 2);
  b.add(alarm);
  let alarmT = 0;
  let t = 0;
  const span = (room.x1 - room.x0) * 0.35;
  return {
    start(sec: number) {
      alarmT = sec;
    },
    get on() {
      return alarmT > 0;
    },
    update(dt: number) {
      t += dt;
      for (const m of glowMats) m.emissiveIntensity = alarmT > 0 ? (Math.sin(t * 20) > 0 ? 2.5 : 0.2) : 0.5 + Math.sin(t * 2.5) * 0.35;
      if (alarmT <= 0) return;
      alarmT -= dt;
      alarm.intensity = Math.max(0, Math.sin(t * 9)) * 40;
      alarm.position.x = (room.x0 + room.x1) / 2 + Math.sin(t * 4) * span;
      if (alarmT <= 0) alarm.intensity = 0;
    },
  };
}

/** 오리·고양이 같은 동물을 눌렀을 때 들썩이기 */
export function bounce(o: THREE.Object3D) {
  let k = 0;
  const baseY = o.position.y;
  return {
    poke() {
      k = 1;
    },
    update(dt: number) {
      if (k <= 0) return;
      k = Math.max(0, k - dt);
      o.rotation.z = Math.sin(k * 18) * 0.12 * k;
      o.position.y = baseY + Math.abs(Math.sin(k * 9)) * 0.08 * k;
    },
  };
}

/** 서버랙 LED: 인스턴스 하나로 수백 개를 깜빡임 */
export function ledField(b: Builder, positions: V3[], parent?: THREE.Object3D) {
  const leds = new THREE.InstancedMesh(new THREE.BoxGeometry(0.02, 0.02, 0.012), new THREE.MeshBasicMaterial({ color: '#ffffff' }), positions.length);
  const d = new THREE.Object3D();
  positions.forEach((p, i) => {
    d.position.set(...p);
    d.updateMatrix();
    leds.setMatrixAt(i, d.matrix);
    leds.setColorAt(i, new THREE.Color('#3fe07a'));
  });
  (parent ?? b.root).add(leds);
  const colors = ['#3fe07a', '#3fe07a', '#3fe07a', '#e3b341', '#3fe07a', '#58a6ff'];
  const c = new THREE.Color();
  let t = 0;
  return {
    leds,
    update(dt: number, alarming: boolean) {
      t -= dt;
      if (t > 0) return;
      t = alarming ? 0.12 : 0.25;
      for (let i = 0; i < leds.count; i++) {
        if (alarming) c.set(Math.random() < 0.6 ? '#ff2a2a' : '#330808');
        else if (Math.random() < 0.3) c.set(Math.random() < 0.15 ? '#1a3322' : colors[Math.floor(Math.random() * colors.length)]);
        else continue;
        leds.setColorAt(i, c);
      }
      if (leds.instanceColor) leds.instanceColor.needsUpdate = true;
    },
  };
}
