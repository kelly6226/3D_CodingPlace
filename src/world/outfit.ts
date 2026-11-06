// 아바타에 씌우는 모자·머리 모양·등/목 장식의 3D 모델
// 목록과 이름은 src/look.ts에 있고, 여기엔 모양만 있어요. 도형은 모든 아바타가 같이 써서 버리지 않아요.
import * as THREE from 'three';

const PI = Math.PI;

const g = {
  // 모자
  beanie: new THREE.SphereGeometry(0.285, 24, 14, 0, PI * 2, 0, PI * 0.54),
  beanieRim: new THREE.TorusGeometry(0.283, 0.034, 8, 28),
  pom: new THREE.SphereGeometry(0.055, 12, 10),
  capDome: new THREE.SphereGeometry(0.278, 24, 14, 0, PI * 2, 0, PI * 0.5),
  capBrim: new THREE.CylinderGeometry(0.2, 0.2, 0.016, 20, 1, false, -PI / 2, PI),
  capButton: new THREE.SphereGeometry(0.018, 8, 6),
  earBand: new THREE.TorusGeometry(0.262, 0.016, 6, 24, PI),
  catEar: new THREE.ConeGeometry(0.09, 0.13, 4),
  catEarIn: new THREE.ConeGeometry(0.055, 0.085, 4),
  propStem: new THREE.CylinderGeometry(0.012, 0.012, 0.07, 6),
  propBlade: new THREE.BoxGeometry(0.34, 0.008, 0.055),
  crownBase: new THREE.CylinderGeometry(0.19, 0.21, 0.09, 20),
  crownSpike: new THREE.ConeGeometry(0.04, 0.1, 4),
  gem: new THREE.SphereGeometry(0.02, 8, 6),
  duckBody: new THREE.SphereGeometry(0.12, 16, 12),
  duckHead: new THREE.SphereGeometry(0.08, 14, 10),
  duckBeak: new THREE.BoxGeometry(0.07, 0.022, 0.055),
  duckEye: new THREE.SphereGeometry(0.012, 6, 6),
  duckTail: new THREE.ConeGeometry(0.04, 0.07, 6),
  halo: new THREE.TorusGeometry(0.16, 0.015, 8, 28),
  // 머리 모양
  bun: new THREE.SphereGeometry(0.1, 14, 10),
  tie: new THREE.TorusGeometry(0.06, 0.012, 6, 14),
  tail: new THREE.CapsuleGeometry(0.055, 0.2, 4, 8),
  twin: new THREE.CapsuleGeometry(0.06, 0.12, 4, 8),
  longBack: new THREE.CapsuleGeometry(0.17, 0.3, 4, 12),
  spike: new THREE.ConeGeometry(0.06, 0.17, 6),
  afro: new THREE.SphereGeometry(0.3, 24, 16, 0, PI * 2, 0, PI * 0.78),
  // 등
  pack: new THREE.BoxGeometry(0.27, 0.33, 0.1),
  packPocket: new THREE.BoxGeometry(0.2, 0.13, 0.045),
  packStrap: new THREE.BoxGeometry(0.04, 0.3, 0.02),
  cape: new THREE.BoxGeometry(0.4, 0.58, 0.02),
  wing: new THREE.SphereGeometry(1, 12, 8),
  shell: new THREE.SphereGeometry(0.25, 18, 12),
  shellPlate: new THREE.SphereGeometry(0.07, 10, 8),
  // 목
  scarf: new THREE.TorusGeometry(0.165, 0.048, 10, 22),
  scarfTail: new THREE.BoxGeometry(0.075, 0.2, 0.026),
  strap: new THREE.BoxGeometry(0.018, 1, 0.012),
  card: new THREE.BoxGeometry(0.075, 0.1, 0.01),
  cardStripe: new THREE.BoxGeometry(0.075, 0.026, 0.012),
  bowKnot: new THREE.SphereGeometry(0.024, 8, 6),
  bowWing: new THREE.ConeGeometry(0.05, 0.085, 3),
  neckBand: new THREE.TorusGeometry(0.17, 0.016, 8, 24),
  neckCup: new THREE.CylinderGeometry(0.065, 0.065, 0.05, 14),
};

const m = {
  gold: new THREE.MeshStandardMaterial({ color: '#f4c542', roughness: 0.35, metalness: 0.6 }),
  duck: new THREE.MeshStandardMaterial({ color: '#ffd23f', roughness: 0.5 }),
  beak: new THREE.MeshStandardMaterial({ color: '#ff8c1a', roughness: 0.6 }),
  white: new THREE.MeshStandardMaterial({ color: '#f3efe6', roughness: 0.7 }),
  dark: new THREE.MeshStandardMaterial({ color: '#25262c', roughness: 0.55 }),
  pink: new THREE.MeshStandardMaterial({ color: '#ff9bb3', roughness: 0.7 }),
  halo: new THREE.MeshBasicMaterial({ color: '#ffe27a' }),
  plate: new THREE.MeshStandardMaterial({ color: '#000000', roughness: 0.9, transparent: true, opacity: 0.22 }),
};

const mesh = (geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0) => {
  const o = new THREE.Mesh(geo, mat);
  o.position.set(x, y, z);
  return o;
};

/** 천사 고리가 머리 위에 떠 있는 높이 (아래로 살짝 오르내리는 건 Avatar가 해요) */
export const HALO_Y = 0.62;

/** 머리 뒤쪽이 낮아지도록 기울인 모자·머리카락 (기본 머리카락과 같은 각도) */
const HEAD_TILT = -0.32;

type Builder = (accent: THREE.Material) => THREE.Group;

// ── 모자 (머리 좌표: 머리 중심이 (0, 0.22, 0), 반지름 0.24) ──────────────
const hats: Record<string, { covers: boolean; build: Builder }> = {
  beanie: {
    covers: true,
    build: (accent) => {
      const t = new THREE.Group();
      t.position.set(0, 0.235, -0.015);
      t.rotation.x = HEAD_TILT - 0.04;
      t.add(mesh(g.beanie, accent));
      // 모자 아랫단: 반구가 끝나는 높이(반지름 × cos 54%π)에 둘러요
      const rim = mesh(g.beanieRim, accent, 0, 0.285 * Math.cos(PI * 0.54), 0);
      rim.rotation.x = PI / 2;
      t.add(rim, mesh(g.pom, m.white, 0, 0.3, 0));
      return t;
    },
  },
  cap: {
    covers: true,
    build: (accent) => {
      const t = new THREE.Group();
      const dome = new THREE.Group();
      dome.position.set(0, 0.235, -0.015);
      dome.rotation.x = HEAD_TILT;
      dome.add(mesh(g.capDome, accent), mesh(g.capButton, m.white, 0, 0.278, 0));
      const brim = mesh(g.capBrim, accent, 0, 0.29, 0.19);
      brim.rotation.x = 0.35;
      t.add(dome, brim);
      return t;
    },
  },
  catears: {
    covers: false,
    build: (accent) => {
      const t = new THREE.Group();
      t.add(mesh(g.earBand, m.dark, 0, 0.22, 0));
      for (const s of [-1, 1]) {
        const ear = new THREE.Group();
        ear.position.set(s * 0.14, 0.43, -0.01);
        ear.rotation.z = -s * 0.3;
        ear.add(mesh(g.catEar, accent, 0, 0.06, 0), mesh(g.catEarIn, m.pink, 0, 0.05, 0.03));
        ear.rotation.y = PI / 4;
        t.add(ear);
      }
      return t;
    },
  },
  propeller: {
    covers: true,
    build: (accent) => {
      const t = new THREE.Group();
      const dome = new THREE.Group();
      dome.position.set(0, 0.235, -0.015);
      dome.rotation.x = HEAD_TILT;
      dome.add(mesh(g.capDome, accent));
      t.add(dome, mesh(g.propStem, m.dark, 0, 0.53, -0.04));
      const spin = new THREE.Group();
      spin.name = 'spin';
      spin.position.set(0, 0.57, -0.04);
      const a = mesh(g.propBlade, m.white);
      const b = mesh(g.propBlade, m.white);
      b.rotation.y = PI / 2;
      spin.add(a, b);
      t.add(spin);
      return t;
    },
  },
  crown: {
    covers: true,
    build: () => {
      const t = new THREE.Group();
      t.position.set(0, 0.46, -0.02);
      t.rotation.x = HEAD_TILT * 0.5;
      t.add(mesh(g.crownBase, m.gold, 0, 0, 0));
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * PI * 2;
        t.add(mesh(g.crownSpike, m.gold, Math.sin(a) * 0.17, 0.095, Math.cos(a) * 0.17));
      }
      t.add(mesh(g.gem, m.pink, 0, 0.0, 0.205));
      return t;
    },
  },
  duck: {
    covers: true,
    build: () => {
      const t = new THREE.Group();
      t.position.set(0, 0.5, -0.02);
      const body = mesh(g.duckBody, m.duck, 0, 0.06, 0);
      body.scale.set(1, 0.8, 1.25);
      const head = mesh(g.duckHead, m.duck, 0, 0.17, 0.1);
      const beak = mesh(g.duckBeak, m.beak, 0, 0.16, 0.18);
      const tail = mesh(g.duckTail, m.duck, 0, 0.11, -0.15);
      tail.rotation.x = -PI / 2 - 0.5;
      t.add(body, head, beak, tail, mesh(g.duckEye, m.dark, -0.035, 0.195, 0.165), mesh(g.duckEye, m.dark, 0.035, 0.195, 0.165));
      return t;
    },
  },
  halo: {
    covers: false,
    build: () => {
      const t = new THREE.Group();
      const ring = mesh(g.halo, m.halo, 0, HALO_Y, -0.01);
      ring.rotation.x = PI / 2 + 0.35;
      ring.name = 'halo';
      t.add(ring);
      return t;
    },
  },
};

/** 모자를 쓰면 위로 솟는 머리 모양(똥머리, 뾰족, 아프로)은 숨겨야 해서 알려줘요 */
export const hatCoversHair = (id: string) => hats[id]?.covers ?? false;

export function buildHat(id: string, accent: THREE.Material): THREE.Group | null {
  return hats[id]?.build(accent) ?? null;
}

// ── 머리 모양 (기본 단정 머리 위에 더해지는 부분. 머리 좌표) ─────────────
const hairStyles: Record<string, (hair: THREE.Material, accent: THREE.Material) => THREE.Object3D[]> = {
  short: () => [],
  bun: (hair, accent) => {
    const bun = mesh(g.bun, hair, 0, 0.5, -0.07);
    bun.userData.top = true;
    const tie = mesh(g.tie, accent, 0, 0.44, -0.07);
    tie.rotation.x = PI / 2;
    tie.userData.top = true;
    return [bun, tie];
  },
  ponytail: (hair, accent) => {
    const tail = mesh(g.tail, hair, 0, 0.12, -0.31);
    tail.rotation.x = -0.35;
    const tie = mesh(g.tie, accent, 0, 0.27, -0.255);
    tie.rotation.x = PI / 2 - 0.5;
    tie.scale.setScalar(0.8);
    return [tail, tie];
  },
  twin: (hair, accent) => {
    const out: THREE.Object3D[] = [];
    for (const s of [-1, 1]) {
      const t = mesh(g.twin, hair, s * 0.245, 0.08, -0.08);
      t.rotation.z = s * 0.25;
      const tie = mesh(g.tie, accent, s * 0.23, 0.2, -0.08);
      tie.rotation.y = PI / 2;
      tie.scale.setScalar(0.8);
      out.push(t, tie);
    }
    return out;
  },
  long: (hair) => {
    const back = mesh(g.longBack, hair, 0, -0.04, -0.215);
    back.scale.set(1.25, 1, 0.5);
    return [back];
  },
  spiky: (hair) => {
    const out: THREE.Object3D[] = [];
    const spots: [number, number, number, number, number][] = [
      [0, 0.5, -0.02, 0, 0],
      [-0.12, 0.46, 0.0, 0, 0.45],
      [0.12, 0.46, 0.0, 0, -0.45],
      [-0.07, 0.46, -0.13, -0.35, 0.3],
      [0.07, 0.46, -0.13, -0.35, -0.3],
      [0, 0.47, 0.1, 0.4, 0],
    ];
    for (const [x, y, z, rx, rz] of spots) {
      const s = mesh(g.spike, hair, x, y, z);
      s.rotation.set(rx, 0, rz);
      s.userData.top = true;
      out.push(s);
    }
    return out;
  },
  afro: (hair) => {
    const a = mesh(g.afro, hair, 0, 0.31, -0.07);
    a.userData.top = true;
    return [a];
  },
};

export function buildHair(style: string, hair: THREE.Material, accent: THREE.Material, hasHat: boolean): THREE.Group {
  const t = new THREE.Group();
  for (const part of (hairStyles[style] ?? hairStyles.short)(hair, accent)) {
    if (hasHat && part.userData.top) continue;
    t.add(part);
  }
  return t;
}

// ── 등 (몸 좌표: 등판은 z -0.17 근처, 어깨 높이 0.78) ───────────────────
const backs: Record<string, Builder> = {
  backpack: (accent) => {
    const t = new THREE.Group();
    t.add(mesh(g.pack, accent, 0, 0.58, -0.235), mesh(g.packPocket, m.dark, 0, 0.5, -0.3));
    for (const s of [-1, 1]) t.add(mesh(g.packStrap, accent, s * 0.1, 0.62, 0.175));
    return t;
  },
  cape: (accent) => {
    const t = new THREE.Group();
    t.name = 'cape';
    t.position.set(0, 0.8, -0.16);
    const body = mesh(g.cape, accent, 0, -0.29, -0.01);
    t.add(body);
    return t;
  },
  wings: (accent) => {
    const t = new THREE.Group();
    for (const s of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.name = s < 0 ? 'wingL' : 'wingR';
      pivot.position.set(s * 0.07, 0.7, -0.19);
      const w = mesh(g.wing, accent, s * 0.13, 0.13, 0);
      w.scale.set(0.1, 0.27, 0.025);
      w.rotation.z = -s * 0.45;
      pivot.add(w);
      t.add(pivot);
    }
    return t;
  },
  shell: (accent) => {
    const t = new THREE.Group();
    const shell = mesh(g.shell, accent, 0, 0.58, -0.25);
    shell.scale.set(1, 0.95, 0.55);
    t.add(shell);
    for (const [x, y] of [
      [0, 0.62],
      [-0.1, 0.52],
      [0.1, 0.52],
    ]) {
      const p = mesh(g.shellPlate, m.plate, x, y, -0.355);
      p.scale.set(1, 1, 0.3);
      t.add(p);
    }
    return t;
  },
};

export const buildBack = (id: string, accent: THREE.Material): THREE.Group | null => backs[id]?.(accent) ?? null;

// ── 목 ─────────────────────────────────────────────────────────────
/** 두 점을 잇는 얇은 끈 */
function strap(a: THREE.Vector3, b: THREE.Vector3, mat: THREE.Material) {
  const dir = b.clone().sub(a);
  const s = mesh(g.strap, mat);
  s.scale.y = dir.length();
  s.position.copy(a).add(b).multiplyScalar(0.5);
  s.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  return s;
}

const necks: Record<string, Builder> = {
  scarf: (accent) => {
    const t = new THREE.Group();
    const ring = new THREE.Group();
    ring.position.set(0, 0.79, 0);
    ring.scale.set(1.1, 1, 0.92);
    const torus = mesh(g.scarf, accent);
    torus.rotation.x = PI / 2;
    ring.add(torus);
    const tail1 = mesh(g.scarfTail, accent, 0.1, 0.68, 0.16);
    tail1.rotation.z = 0.12;
    const tail2 = mesh(g.scarfTail, accent, 0.045, 0.66, 0.175);
    tail2.scale.y = 0.8;
    tail2.rotation.z = -0.08;
    t.add(ring, tail1, tail2);
    return t;
  },
  lanyard: (accent) => {
    const t = new THREE.Group();
    // 가슴 표면(z 약 0.17)보다 살짝 앞으로 띄워서 후드티에 묻히지 않게
    const bottom = new THREE.Vector3(0, 0.5, 0.19);
    for (const s of [-1, 1]) {
      const mid = new THREE.Vector3(s * 0.065, 0.66, 0.185);
      t.add(strap(new THREE.Vector3(s * 0.1, 0.79, 0.14), mid, accent), strap(mid, bottom, accent));
    }
    t.add(mesh(g.card, m.white, 0, 0.45, 0.195), mesh(g.cardStripe, accent, 0, 0.485, 0.2));
    return t;
  },
  bowtie: (accent) => {
    const t = new THREE.Group();
    t.position.set(0, 0.765, 0.158);
    t.scale.setScalar(1.4);
    t.add(mesh(g.bowKnot, accent));
    for (const s of [-1, 1]) {
      const wing = mesh(g.bowWing, accent, s * 0.05, 0, 0);
      wing.rotation.z = -s * (PI / 2);
      t.add(wing);
    }
    return t;
  },
  headphones: (accent) => {
    const t = new THREE.Group();
    const ring = new THREE.Group();
    ring.position.set(0, 0.79, 0);
    ring.scale.set(1.1, 1, 0.92);
    const band = mesh(g.neckBand, m.dark);
    band.rotation.x = PI / 2;
    ring.add(band);
    t.add(ring);
    // 귀 덮개는 가슴 앞에 늘어져 있음 (원통 축이 앞을 향하게)
    for (const s of [-1, 1]) {
      const cup = mesh(g.neckCup, accent, s * 0.115, 0.68, 0.17);
      cup.rotation.x = PI / 2;
      t.add(cup);
    }
    return t;
  },
};

export const buildNeck = (id: string, accent: THREE.Material): THREE.Group | null => necks[id]?.(accent) ?? null;
