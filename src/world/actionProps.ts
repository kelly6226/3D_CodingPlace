// 큰 동작에서 날아가고 뒤집히는 소품 (던진 노트북, 뒤집힌 책상, 기절했을 때 도는 별)
import * as THREE from 'three';

const PI = Math.PI;
const GRAVITY = 9.8;
/** 바닥에 닿은 소품이 놓이는 높이 */
const FLOOR_Y = 0.02;
/** 땅에 떨어진 소품이 그대로 있다가 줄어들며 사라지기까지 */
const REST_S = 1.6;
const SHRINK_S = 0.3;

export interface Prop {
  readonly group: THREE.Object3D;
  /** 매 프레임 호출. 끝났으면 false */
  update(dt: number): boolean;
}

const geo = {
  base: new THREE.BoxGeometry(0.34, 0.016, 0.23),
  lid: new THREE.BoxGeometry(0.34, 0.22, 0.012),
  screen: new THREE.PlaneGeometry(0.31, 0.19),
  top: new THREE.BoxGeometry(0.7, 0.04, 0.4),
  leg: new THREE.BoxGeometry(0.04, 0.36, 0.04),
  star: new THREE.OctahedronGeometry(0.035, 0),
};

const mat = {
  lap: new THREE.MeshStandardMaterial({ color: '#b9bec8', roughness: 0.35, metalness: 0.7 }),
  screen: new THREE.MeshBasicMaterial({ color: '#4a6fd8' }),
  wood: new THREE.MeshStandardMaterial({ color: '#a47a4b', roughness: 0.8 }),
  woodDark: new THREE.MeshStandardMaterial({ color: '#7d5a36', roughness: 0.85 }),
  star: new THREE.MeshBasicMaterial({ color: '#ffe27a' }),
};

/** 끝난 소품이 사라질 때 천천히 작아지게 하는 값 (0~1) */
function shrinkAt(rest: number) {
  return rest <= REST_S ? 1 : Math.max(0, 1 - (rest - REST_S) / SHRINK_S);
}

/** 열린 노트북 모양 (던질 때도, 맨손으로 들 때도 이 모양이에요) */
export function makeLaptopMesh(): THREE.Group {
  const g = new THREE.Group();
  const base = new THREE.Mesh(geo.base, mat.lap);
  const hinge = new THREE.Group();
  hinge.position.set(0, 0.016, -0.11);
  hinge.rotation.x = -0.28;
  const lid = new THREE.Mesh(geo.lid, mat.lap);
  lid.position.set(0, 0.11, -0.006);
  const screen = new THREE.Mesh(geo.screen, mat.screen);
  screen.position.set(0, 0.11, 0.001);
  hinge.add(lid, screen);
  g.add(base, hinge);
  return g;
}

/** 시작점에서 yaw 방향으로 distance만큼 날아가 떨어지는 노트북 */
export class ThrownLaptop implements Prop {
  readonly group = new THREE.Group();
  private t = 0;
  private start: THREE.Vector3;
  private vx: number;
  private vz: number;
  private vy: number;
  private flight: number;

  constructor(start: THREE.Vector3, yaw: number, distance: number, flight = 0.9) {
    this.start = start.clone();
    this.flight = flight;
    this.vx = (Math.sin(yaw) * distance) / flight;
    this.vz = (Math.cos(yaw) * distance) / flight;
    // 시작 높이에서 flight초 뒤에 바닥에 닿는 위로 던지는 속도
    this.vy = (FLOOR_Y - start.y + 0.5 * GRAVITY * flight * flight) / flight;

    this.group.add(makeLaptopMesh());
    this.group.position.copy(start);
    this.group.rotation.y = yaw;
  }

  update(dt: number) {
    this.t += dt;
    const g = this.group;
    if (this.t < this.flight) {
      const t = this.t;
      g.position.set(this.start.x + this.vx * t, this.start.y + this.vy * t - 0.5 * GRAVITY * t * t, this.start.z + this.vz * t);
      g.rotation.x += dt * 16;
      g.rotation.z += dt * 7;
      return true;
    }
    // 땅에 닿은 뒤: 두어 번 통통 튀다가 가만히 있다가 사라짐
    const rest = this.t - this.flight;
    g.position.set(this.start.x + this.vx * this.flight, FLOOR_Y + Math.abs(Math.sin(rest * 9)) * 0.18 * Math.exp(-rest * 4.5), this.start.z + this.vz * this.flight);
    const k = Math.min(1, dt * 14);
    g.rotation.x += (Math.round(g.rotation.x / (PI * 2)) * PI * 2 - g.rotation.x) * k;
    g.rotation.z += (Math.round(g.rotation.z / (PI * 2)) * PI * 2 - g.rotation.z) * k;
    g.scale.setScalar(Math.max(0.001, shrinkAt(rest)));
    return rest < REST_S + SHRINK_S;
  }
}

/** 앞쪽 가장자리를 축으로 뒤집혀 날아가는 작은 책상 */
export class FlippedTable implements Prop {
  readonly group = new THREE.Group();
  private pivot = new THREE.Group();
  private t = 0;
  private from: THREE.Vector3;
  private forward: THREE.Vector3;

  /** origin은 책상 가운데 윗면 높이의 한 점, yaw는 아바타가 보는 방향 */
  constructor(origin: THREE.Vector3, yaw: number, private flipS = 0.85) {
    this.forward = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    // 뒤집는 축은 책상의 먼 쪽 가장자리 (깊이 0.4의 절반만큼 앞)
    this.from = origin.clone().addScaledVector(this.forward, 0.2);
    const top = new THREE.Mesh(geo.top, mat.wood);
    const table = new THREE.Group();
    table.position.z = -0.2; // 축에서 뒤쪽(-z)으로 책상 깊이의 절반
    table.add(top);
    for (const [x, z] of [
      [-0.3, -0.15],
      [0.3, -0.15],
      [-0.3, 0.15],
      [0.3, 0.15],
    ]) {
      const leg = new THREE.Mesh(geo.leg, mat.woodDark);
      leg.position.set(x, -0.2, z);
      table.add(leg);
    }
    this.pivot.add(table);
    this.group.add(this.pivot);
    this.group.rotation.y = yaw;
    this.group.position.copy(this.from);
  }

  update(dt: number) {
    this.t += dt;
    const u = Math.min(1, this.t / this.flipS);
    const e = u * u * (3 - 2 * u);
    // 앞으로 날려 보내며(0.45m) 위로 한 번 튀어 올랐다가 바닥(뒤집힌 판이 놓이는 높이)에 내려앉음
    this.group.position.y = this.from.y + (FLOOR_Y + 0.02 - this.from.y) * e + Math.sin(u * PI) * 0.45;
    this.group.position.x = this.from.x + this.forward.x * 0.45 * e;
    this.group.position.z = this.from.z + this.forward.z * 0.45 * e;
    this.pivot.rotation.x = PI * e;
    const rest = this.t - this.flipS;
    if (rest > 0) this.group.scale.setScalar(Math.max(0.001, shrinkAt(rest)));
    return rest < REST_S + SHRINK_S;
  }
}

/** 기절했을 때 머리 둘레를 도는 별 */
export function makeStars(): THREE.Group {
  const g = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * PI * 2;
    const s = new THREE.Mesh(geo.star, mat.star);
    s.position.set(Math.cos(a) * 0.32, 0, Math.sin(a) * 0.32);
    g.add(s);
  }
  return g;
}
