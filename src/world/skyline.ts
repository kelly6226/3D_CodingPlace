// 창밖 판교 야경: 밤새 불 켜진 오피스(판교의 등대) + 비
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { officeWindows, skyGradient } from './textures';

let s = 42;
const rnd = () => {
  s = (s * 16807) % 2147483647;
  return (s - 1) / 2147483646;
};

/** 박스 UV를 실제 크기에 맞춰 창문 크기가 일정하게 */
function building(w: number, h: number, d: number, x: number, y: number, z: number) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  // 면 순서: +x, -x, +y, -y, +z, -z (면마다 정점 4개)
  const dims: [number, number][] = [
    [d, h],
    [d, h],
    [0, 0],
    [0, 0],
    [w, h],
    [w, h],
  ];
  const ox = rnd();
  const oy = rnd();
  for (let f = 0; f < 6; f++) {
    const [du, dv] = dims[f];
    for (let v = 0; v < 4; v++) {
      const i = f * 4 + v;
      if (du === 0) {
        uv.setXY(i, 0.01, 0.01); // 지붕은 창 없는 칸
      } else {
        uv.setXY(i, uv.getX(i) * (du / 7) + ox, uv.getY(i) * (dv / 14) + oy);
      }
    }
  }
  g.translate(x, y, z);
  return g;
}

export function buildSkyline(scene: THREE.Scene) {
  scene.background = skyGradient();

  const groups: Record<string, THREE.BufferGeometry[]> = { warm: [], cool: [], lighthouse: [] };

  // 멀리 있는 빌딩 숲
  for (let i = 0; i < 70; i++) {
    const x = -48 + rnd() * 96;
    const z = -14 - rnd() * 46;
    const w = 4 + rnd() * 7;
    const d = 4 + rnd() * 7;
    const h = 10 + rnd() * 34 + (Math.abs(x) < 15 ? 6 : 0);
    const kind = rnd() < 0.18 ? 'lighthouse' : rnd() < 0.6 ? 'warm' : 'cool';
    groups[kind].push(building(w, h, d, x, -22 + h / 2, z));
  }
  // 양옆과 아래쪽 낮은 건물: 고층 카페라는 느낌
  for (let i = 0; i < 46; i++) {
    const side = rnd() < 0.5 ? -1 : 1;
    const x = side * (28 + rnd() * 44);
    const z = -12 + rnd() * 50;
    const w = 4 + rnd() * 8;
    const d = 4 + rnd() * 8;
    // 카페 근처 건물은 낮게 (카페를 가리지 않게)
    const near = Math.abs(x) < 45;
    const h = near ? 3 + rnd() * 8 : 6 + rnd() * 16;
    const kind = rnd() < 0.12 ? 'lighthouse' : rnd() < 0.55 ? 'warm' : 'cool';
    groups[kind].push(building(w, h, d, x, -22 + h / 2, z));
  }
  for (let i = 0; i < 16; i++) {
    const x = -24 + rnd() * 48;
    const z = 26 + rnd() * 30;
    const h = 3 + rnd() * 6;
    groups[rnd() < 0.5 ? 'warm' : 'cool'].push(building(5 + rnd() * 6, h, 5 + rnd() * 6, x, -22 + h / 2, z));
  }
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(400, 400),
    new THREE.MeshBasicMaterial({ color: '#0a0e18' }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -22.05;
  scene.add(ground);

  // 바로 앞 큰 오피스 두 채: 새벽인데도 불이 다 켜져 있음
  groups.lighthouse.push(building(12, 46, 10, -10, -22 + 23, -18));
  groups.lighthouse.push(building(10, 52, 9, 12, -22 + 26, -21));

  const mats: Record<string, THREE.Material> = {
    warm: new THREE.MeshBasicMaterial({ map: officeWindows(0.32, 'warm') }),
    cool: new THREE.MeshBasicMaterial({ map: officeWindows(0.22, 'cool') }),
    lighthouse: new THREE.MeshBasicMaterial({ map: officeWindows(0.86, 'warm') }),
  };
  for (const k of Object.keys(groups)) {
    const merged = mergeGeometries(groups[k]);
    const mesh = new THREE.Mesh(merged, mats[k]);
    scene.add(mesh);
  }

  // 옥상 항공 장애등 (깜빡)
  const beaconGeo = new THREE.SphereGeometry(0.35, 8, 6);
  const beaconMat = new THREE.MeshBasicMaterial({ color: '#ff3b3b' });
  const beacons: THREE.Mesh[] = [];
  for (const [x, y, z] of [
    [-10, 24.6, -18],
    [12, 30.6, -21],
    [-30, 14, -40],
    [28, 18, -44],
  ]) {
    const b = new THREE.Mesh(beaconGeo, beaconMat);
    b.position.set(x, y, z);
    scene.add(b);
    beacons.push(b);
  }

  // 저 아래 도로 불빛
  const road = new THREE.Mesh(
    new THREE.PlaneGeometry(200, 6),
    new THREE.MeshBasicMaterial({ color: '#1a1f2e' }),
  );
  road.rotation.x = -Math.PI / 2;
  road.position.set(0, -21.9, -11);
  scene.add(road);
  const carGeo = new THREE.BoxGeometry(1.2, 0.4, 0.6);
  const cars: { m: THREE.Mesh; v: number }[] = [];
  for (let i = 0; i < 14; i++) {
    const head = i % 2 === 0;
    const m = new THREE.Mesh(carGeo, new THREE.MeshBasicMaterial({ color: head ? '#fff1c9' : '#ff4a3d' }));
    m.position.set(-90 + rnd() * 180, -21.6, head ? -12 : -10);
    scene.add(m);
    cars.push({ m, v: (head ? 1 : -1) * (6 + rnd() * 6) });
  }

  // 비
  const N = 1400;
  const pos = new Float32Array(N * 6);
  const speeds = new Float32Array(N);
  const spread = { x0: -24, x1: 24, y0: -18, y1: 18, z0: -30, z1: -5.6 };
  for (let i = 0; i < N; i++) {
    const x = spread.x0 + rnd() * (spread.x1 - spread.x0);
    const y = spread.y0 + rnd() * (spread.y1 - spread.y0);
    const z = spread.z0 + rnd() * (spread.z1 - spread.z0);
    pos.set([x, y, z, x + 0.05, y - 0.55, z], i * 6);
    speeds[i] = 14 + rnd() * 8;
  }
  const rainGeo = new THREE.BufferGeometry();
  rainGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const rain = new THREE.LineSegments(
    rainGeo,
    new THREE.LineBasicMaterial({ color: '#9fb6e0', transparent: true, opacity: 0.32, depthWrite: false }),
  );
  rain.frustumCulled = false;
  scene.add(rain);

  let t = 0;
  return {
    update(dt: number) {
      t += dt;
      const on = Math.sin(t * 2.4) > 0.2;
      beacons.forEach((b, i) => (b.visible = i % 2 ? on : !on));
      for (const c of cars) {
        c.m.position.x += c.v * dt;
        if (c.m.position.x > 100) c.m.position.x = -100;
        if (c.m.position.x < -100) c.m.position.x = 100;
      }
      const a = rainGeo.attributes.position as THREE.BufferAttribute;
      const arr = a.array as Float32Array;
      for (let i = 0; i < N; i++) {
        const k = i * 6;
        const dy = speeds[i] * dt;
        arr[k + 1] -= dy;
        arr[k + 4] -= dy;
        if (arr[k + 1] < spread.y0) {
          arr[k + 1] += spread.y1 - spread.y0;
          arr[k + 4] += spread.y1 - spread.y0;
        }
      }
      a.needsUpdate = true;
    },
  };
}
