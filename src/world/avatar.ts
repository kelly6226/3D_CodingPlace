// 귀여운 개발자 아바타 (후드티 + 노트북)
import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { langById, statusById } from '../config';
import type { PeerState } from '../net/types';
import { seatById, type Seat } from './layout';
import { findPath } from './pathfinding';

const SCALE = 1.2;
const HIP = 0.32 * SCALE;
const SPEED = 1.6;

const geo = {
  leg: new THREE.CapsuleGeometry(0.075, 0.17, 4, 10),
  shoe: new THREE.BoxGeometry(0.12, 0.06, 0.17),
  torso: new THREE.CapsuleGeometry(0.2, 0.2, 6, 16),
  hood: new THREE.SphereGeometry(0.17, 16, 10),
  head: new THREE.SphereGeometry(0.24, 24, 18),
  hair: new THREE.SphereGeometry(0.255, 24, 14, 0, Math.PI * 2, 0, Math.PI * 0.56),
  eye: new THREE.SphereGeometry(0.028, 10, 8),
  blush: new THREE.SphereGeometry(0.035, 10, 6),
  lens: new THREE.TorusGeometry(0.055, 0.009, 6, 20),
  bridge: new THREE.CylinderGeometry(0.006, 0.006, 0.06, 6),
  arm: new THREE.CapsuleGeometry(0.06, 0.16, 4, 10),
  hand: new THREE.SphereGeometry(0.065, 12, 10),
  band: new THREE.TorusGeometry(0.265, 0.022, 8, 24, Math.PI),
  cup: new THREE.CylinderGeometry(0.045, 0.038, 0.1, 14),
  string: new THREE.CylinderGeometry(0.008, 0.008, 0.12, 6),
  ear: new THREE.CylinderGeometry(0.075, 0.075, 0.05, 16),
  ring: new THREE.RingGeometry(0.34, 0.42, 40),
  // 노트북
  lapBase: new THREE.BoxGeometry(0.34, 0.016, 0.23),
  lapLid: new THREE.BoxGeometry(0.34, 0.22, 0.012),
  lapScreen: new THREE.PlaneGeometry(0.31, 0.19),
  sticker: new THREE.CircleGeometry(0.035, 20),
  keys: new THREE.PlaneGeometry(0.29, 0.1),
};

const mat = {
  pants: new THREE.MeshStandardMaterial({ color: '#2b2f3a', roughness: 0.9 }),
  shoe: new THREE.MeshStandardMaterial({ color: '#efeae0', roughness: 0.7 }),
  eye: new THREE.MeshBasicMaterial({ color: '#1b1714' }),
  blush: new THREE.MeshBasicMaterial({ color: '#f29b9b', transparent: true, opacity: 0.55 }),
  glasses: new THREE.MeshStandardMaterial({ color: '#1e1e22', roughness: 0.4, metalness: 0.4 }),
  phones: new THREE.MeshStandardMaterial({ color: '#25262c', roughness: 0.5 }),
  cup: new THREE.MeshStandardMaterial({ color: '#f3efe6', roughness: 0.5 }),
  string: new THREE.MeshStandardMaterial({ color: '#f3efe6' }),
  lap: new THREE.MeshStandardMaterial({ color: '#b9bec8', roughness: 0.35, metalness: 0.7 }),
  keys: new THREE.MeshStandardMaterial({ color: '#2a2d35', roughness: 0.8 }),
};

export type AvatarMode = 'idle' | 'walking' | 'seating' | 'seated' | 'unseating';

function shade(hex: string, k: number) {
  const c = new THREE.Color(hex);
  c.multiplyScalar(k);
  return c;
}

export class Avatar {
  readonly id: string;
  readonly root = new THREE.Group();
  readonly isSelf: boolean;
  state: PeerState;
  mode: AvatarMode = 'idle';

  private body = new THREE.Group();
  private legL = new THREE.Group();
  private legR = new THREE.Group();
  private armL = new THREE.Group();
  private armR = new THREE.Group();
  private headG = new THREE.Group();
  private torso: THREE.Mesh;
  private eyes: THREE.Mesh[] = [];
  private glasses = new THREE.Group();
  private phones = new THREE.Group();
  private cup: THREE.Mesh;
  private ring?: THREE.Mesh;
  private hoodieMat: THREE.MeshStandardMaterial;
  private hoodMat: THREE.MeshStandardMaterial;
  private skinMat: THREE.MeshStandardMaterial;
  private hairMat: THREE.MeshStandardMaterial;

  private tagEl: HTMLDivElement;
  private bubbleEl: HTMLDivElement;
  private tag: CSS2DObject;
  private bubble: CSS2DObject;
  private bubbleTimer = 0;

  private path: [number, number][] = [];
  private onArrive: (() => void) | null = null;
  private targetSeat: Seat | null = null;
  private seat: Seat | null = null;
  private trans = 0;
  private transFrom = new THREE.Vector3();
  private transTo = new THREE.Vector3();
  private yawFrom = 0;
  private yawTo = 0;
  private yaw = 0;
  private t = Math.random() * 100;
  private typing = 0;
  private sipT = 0;
  private pressT = 0;
  private blinkT = 2 + Math.random() * 3;
  private fade = 1;
  private leaving = false;

  laptop: THREE.Group | null = null;
  private screenTex: THREE.Texture | null = null;

  constructor(
    state: PeerState,
    isSelf: boolean,
    private scene: THREE.Scene,
    private codeTex: THREE.Texture,
  ) {
    this.id = state.id;
    this.state = { ...state };
    this.isSelf = isSelf;

    this.hoodieMat = new THREE.MeshStandardMaterial({ color: state.color, roughness: 0.85 });
    this.hoodMat = new THREE.MeshStandardMaterial({ color: shade(state.color, 0.8), roughness: 0.9 });
    this.skinMat = new THREE.MeshStandardMaterial({ color: state.skin, roughness: 0.75 });
    this.hairMat = new THREE.MeshStandardMaterial({ color: state.hair, roughness: 0.8 });

    const casters = new Set<THREE.BufferGeometry>([geo.leg, geo.torso, geo.head, geo.arm]);
    const add = (parent: THREE.Object3D, g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0) => {
      const mesh = new THREE.Mesh(g, m);
      mesh.position.set(x, y, z);
      mesh.castShadow = casters.has(g);
      mesh.userData.avatarId = state.id;
      parent.add(mesh);
      return mesh;
    };

    // 다리
    for (const [leg, x] of [
      [this.legL, -0.085],
      [this.legR, 0.085],
    ] as const) {
      leg.position.set(x, 0.32, 0);
      add(leg, geo.leg, mat.pants, 0, -0.16, 0);
      add(leg, geo.shoe, mat.shoe, 0, -0.3, 0.03);
      this.body.add(leg);
    }

    // 몸통 (후드티)
    this.torso = add(this.body, geo.torso, this.hoodieMat, 0, 0.56, 0);
    this.torso.scale.set(1.05, 1, 0.85);
    const hood = add(this.body, geo.hood, this.hoodMat, 0, 0.84, -0.1);
    hood.scale.set(1.25, 0.7, 1);
    add(this.body, geo.string, mat.string, -0.05, 0.7, 0.165);
    add(this.body, geo.string, mat.string, 0.05, 0.7, 0.165);

    // 팔
    for (const [arm, x] of [
      [this.armL, -0.235],
      [this.armR, 0.235],
    ] as const) {
      arm.position.set(x, 0.78, 0);
      add(arm, geo.arm, this.hoodieMat, 0, -0.14, 0);
      add(arm, geo.hand, this.skinMat, 0, -0.29, 0);
      this.body.add(arm);
    }
    this.cup = add(this.armR, geo.cup, mat.cup, 0, -0.33, 0.06);
    this.cup.visible = false;

    // 머리
    this.headG.position.set(0, 0.84, 0);
    add(this.headG, geo.head, this.skinMat, 0, 0.22, 0);
    const hair = add(this.headG, geo.hair, this.hairMat, 0, 0.24, -0.02);
    hair.rotation.x = -0.32;
    for (const x of [-0.088, 0.088]) {
      const eye = add(this.headG, geo.eye, mat.eye, x, 0.2, 0.215);
      eye.castShadow = false;
      this.eyes.push(eye);
      const b = add(this.headG, geo.blush, mat.blush, x * 1.55, 0.13, 0.19);
      b.scale.set(1.2, 0.6, 0.4);
      b.castShadow = false;
    }
    // 안경
    for (const x of [-0.088, 0.088]) {
      const lens = new THREE.Mesh(geo.lens, mat.glasses);
      lens.position.set(x, 0.2, 0.228);
      this.glasses.add(lens);
    }
    const bridge = new THREE.Mesh(geo.bridge, mat.glasses);
    bridge.rotation.z = Math.PI / 2;
    bridge.position.set(0, 0.205, 0.232);
    this.glasses.add(bridge);
    this.glasses.visible = state.glasses;
    this.headG.add(this.glasses);
    // 헤드폰 (집중 모드)
    const band = new THREE.Mesh(geo.band, mat.phones);
    band.position.set(0, 0.22, 0);
    this.phones.add(band);
    for (const x of [-0.262, 0.262]) {
      const ear = new THREE.Mesh(geo.ear, mat.phones);
      ear.rotation.z = Math.PI / 2;
      ear.position.set(x, 0.2, 0);
      this.phones.add(ear);
    }
    this.phones.visible = false;
    this.headG.add(this.phones);
    this.body.add(this.headG);

    this.body.scale.setScalar(SCALE);
    this.root.add(this.body);

    if (isSelf) {
      this.ring = new THREE.Mesh(
        geo.ring,
        new THREE.MeshBasicMaterial({ color: '#f2b45a', transparent: true, opacity: 0.85, depthWrite: false }),
      );
      this.ring.rotation.x = -Math.PI / 2;
      this.ring.position.y = 0.02;
      this.root.add(this.ring);
    }

    // 이름표
    this.tagEl = document.createElement('div');
    this.tagEl.className = 'av-tag' + (isSelf ? ' self' : '');
    this.tag = new CSS2DObject(this.tagEl);
    this.tag.position.set(0, 1.62, 0);
    this.root.add(this.tag);

    // CSS2DRenderer가 바깥 요소의 transform을 매 프레임 덮어써서, 애니메이션은 안쪽 요소에
    const wrap = document.createElement('div');
    wrap.className = 'av-bubble-wrap';
    this.bubbleEl = document.createElement('div');
    this.bubbleEl.className = 'av-bubble';
    wrap.append(this.bubbleEl);
    this.bubble = new CSS2DObject(wrap);
    this.bubble.position.set(0, 2.2, 0);
    this.bubble.visible = false;
    this.root.add(this.bubble);

    this.root.position.set(state.x, 0, state.z);
    this.root.userData.avatarId = state.id;
    scene.add(this.root);
    this.renderTag();

    // 처음부터 앉아 있던 사람
    const s = seatById(state.seat);
    if (s) this.placeSeated(s);
  }

  // ── 외형/상태 ────────────────────────────────────
  apply(next: PeerState) {
    const prev = this.state;
    this.state = { ...next };
    if (prev.color !== next.color) {
      this.hoodieMat.color.set(next.color);
      this.hoodMat.color.copy(shade(next.color, 0.8));
    }
    if (prev.skin !== next.skin) this.skinMat.color.set(next.skin);
    if (prev.hair !== next.hair) this.hairMat.color.set(next.hair);
    this.glasses.visible = next.glasses;
    if (prev.lang !== next.lang && this.laptop) this.paintSticker();
    this.renderTag();
  }

  renderTag() {
    const s = this.state;
    const st = statusById(s.status);
    const lang = langById(s.lang);
    const focusing = !!s.focusUntil && s.focusUntil > Date.now();
    this.phones.visible = focusing;
    const left = focusing ? Math.max(1, Math.ceil((s.focusUntil! - Date.now()) / 60e3)) : 0;
    this.tagEl.innerHTML = '';
    const name = document.createElement('div');
    name.className = 'av-name';
    const dot = document.createElement('i');
    dot.style.background = lang.color;
    name.append(dot, document.createTextNode(`${st.emoji} ${s.name}`));
    this.tagEl.append(name);
    if (focusing) {
      const f = document.createElement('div');
      f.className = 'av-focus';
      f.textContent = `🎧 집중 ${left}분`;
      this.tagEl.append(f);
    }
    this.tagEl.title = `${s.name} · ${st.label} · ${lang.label}`;
  }

  emote(emoji: string, label: string) {
    this.bubbleEl.textContent = '';
    const e = document.createElement('span');
    e.className = 'emoji';
    e.textContent = emoji;
    this.bubbleEl.append(e, document.createTextNode(label));
    this.bubble.visible = true;
    this.bubbleEl.classList.remove('popin');
    void this.bubbleEl.offsetWidth;
    this.bubbleEl.classList.add('popin');
    this.bubbleTimer = 3.2;
  }

  say(text: string) {
    this.bubbleEl.textContent = text;
    this.bubble.visible = true;
    this.bubbleEl.classList.remove('popin');
    void this.bubbleEl.offsetWidth;
    this.bubbleEl.classList.add('popin');
    this.bubbleTimer = 4;
  }

  sip() {
    this.sipT = 1.8;
  }

  press() {
    this.pressT = 0.8;
  }

  typeBurst() {
    this.typing = Math.min(1.6, this.typing + 0.5);
  }

  get seatId() {
    return this.seat?.id ?? this.targetSeat?.id ?? null;
  }

  get position() {
    return this.root.position;
  }

  get seated() {
    return this.mode === 'seated';
  }

  // ── 이동 ────────────────────────────────────────
  /** 바닥의 한 점이나 자리로 걸어감 */
  goTo(x: number, z: number, seatId: string | null = null, onArrive?: () => void) {
    const seat = seatById(seatId) ?? null;
    const tx = seat ? seat.ax : x;
    const tz = seat ? seat.az : z;
    this.targetSeat = seat;
    this.onArrive = onArrive ?? null;

    if (this.mode === 'unseating') {
      this.afterUnseat = () => this.planPath(tx, tz);
      return;
    }
    if (this.mode === 'seated' || this.mode === 'seating') {
      if (seat && this.seat && seat.id === this.seat.id) return;
      this.unseat(() => this.planPath(tx, tz));
      return;
    }
    this.planPath(tx, tz);
  }

  private planPath(tx: number, tz: number) {
    const p = this.root.position;
    this.path = findPath(p.x, p.z, tx, tz);
    this.mode = 'walking';
  }

  /** 접속해 있던 위치로 바로 옮김 (늦게 들어온 사람 화면용) */
  teleport(x: number, z: number, seatId: string | null) {
    this.clearSeat();
    const s = seatById(seatId);
    if (s) {
      this.placeSeated(s);
    } else {
      this.root.position.set(x, 0, z);
      this.mode = 'idle';
    }
  }

  private placeSeated(s: Seat) {
    this.seat = s;
    this.targetSeat = null;
    this.root.position.set(s.x, Math.max(0, s.h - HIP), s.z);
    this.yaw = s.yaw;
    this.root.rotation.y = s.yaw;
    this.mode = 'seated';
    this.spawnLaptop();
  }

  private sitDown(s: Seat) {
    this.seat = s;
    this.targetSeat = null;
    this.mode = 'seating';
    this.trans = 0;
    this.transFrom.copy(this.root.position);
    this.transTo.set(s.x, Math.max(0, s.h - HIP), s.z);
    this.yawFrom = this.yaw;
    this.yawTo = s.yaw;
    this.spawnLaptop();
  }

  private unseat(then: () => void) {
    const s = this.seat;
    if (!s) {
      then();
      return;
    }
    this.mode = 'unseating';
    this.trans = 0;
    this.transFrom.copy(this.root.position);
    this.transTo.set(s.ax, 0, s.az);
    this.yawFrom = this.yaw;
    this.yawTo = Math.atan2(s.ax - s.x, s.az - s.z);
    this.afterUnseat = then;
    this.removeLaptop();
    this.seat = null;
  }
  private afterUnseat: (() => void) | null = null;

  private clearSeat() {
    this.removeLaptop();
    this.seat = null;
    this.targetSeat = null;
    this.path = [];
  }

  // ── 노트북 ──────────────────────────────────────
  private spawnLaptop() {
    const s = this.seat;
    if (!s || this.laptop) return;
    const g = new THREE.Group();
    const base = new THREE.Mesh(geo.lapBase, mat.lap);
    base.position.y = 0.008;
    base.castShadow = true;
    g.add(base);
    const keys = new THREE.Mesh(geo.keys, mat.keys);
    keys.rotation.x = -Math.PI / 2;
    keys.position.set(0, 0.017, 0.02);
    g.add(keys);
    const hinge = new THREE.Group();
    hinge.position.set(0, 0.016, -0.11);
    hinge.rotation.x = -0.28;
    const lid = new THREE.Mesh(geo.lapLid, mat.lap);
    lid.position.set(0, 0.11, -0.006);
    lid.castShadow = true;
    hinge.add(lid);
    this.screenTex = this.codeTex.clone();
    this.screenTex.offset.y = Math.random();
    const screen = new THREE.Mesh(
      geo.lapScreen,
      new THREE.MeshBasicMaterial({ map: this.screenTex, color: '#cfd8ff' }),
    );
    screen.position.set(0, 0.11, 0.001);
    hinge.add(screen);
    const sticker = new THREE.Mesh(geo.sticker, new THREE.MeshBasicMaterial({ color: '#fff' }));
    sticker.name = 'sticker';
    sticker.rotation.y = Math.PI;
    sticker.position.set(0.06, 0.12, -0.0135);
    hinge.add(sticker);
    const sticker2 = new THREE.Mesh(geo.sticker, new THREE.MeshBasicMaterial({ color: '#ffd84a' }));
    sticker2.rotation.y = Math.PI;
    sticker2.scale.setScalar(0.7);
    sticker2.position.set(-0.08, 0.06, -0.0135);
    hinge.add(sticker2);
    g.add(hinge);
    g.position.set(s.lx, s.ly, s.lz);
    g.rotation.y = s.lyaw;
    g.userData.avatarId = this.id;
    this.laptop = g;
    this.paintSticker();
    this.scene.add(g);
  }

  private paintSticker() {
    const st = this.laptop?.getObjectByName('sticker') as THREE.Mesh | undefined;
    if (st) (st.material as THREE.MeshBasicMaterial).color.set(langById(this.state.lang).color);
  }

  private removeLaptop() {
    if (!this.laptop) return;
    this.scene.remove(this.laptop);
    this.laptop.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | undefined;
      if (m && !Object.values(mat).includes(m as THREE.MeshStandardMaterial)) m.dispose();
    });
    this.screenTex?.dispose();
    this.screenTex = null;
    this.laptop = null;
  }

  leave(done: () => void) {
    this.leaving = true;
    this.onLeft = done;
  }
  private onLeft: (() => void) | null = null;

  dispose() {
    this.removeLaptop();
    this.scene.remove(this.root);
    this.tag.element.remove();
    this.bubble.element.remove();
    this.hoodieMat.dispose();
    this.hoodMat.dispose();
    this.skinMat.dispose();
    this.hairMat.dispose();
  }

  // ── 매 프레임 ───────────────────────────────────
  update(dt: number) {
    this.t += dt;
    const p = this.root.position;

    if (this.mode === 'walking') {
      const next = this.path[0];
      if (!next) {
        this.mode = 'idle';
        if (this.targetSeat) this.sitDown(this.targetSeat);
        const cb = this.onArrive;
        this.onArrive = null;
        cb?.();
      } else {
        const dx = next[0] - p.x;
        const dz = next[1] - p.z;
        const d = Math.hypot(dx, dz);
        const step = SPEED * dt;
        if (d <= step) {
          p.x = next[0];
          p.z = next[1];
          this.path.shift();
        } else {
          p.x += (dx / d) * step;
          p.z += (dz / d) * step;
        }
        if (d > 0.01) this.yaw = lerpAngle(this.yaw, Math.atan2(dx, dz), Math.min(1, dt * 10));
      }
    } else if (this.mode === 'seating' || this.mode === 'unseating') {
      this.trans = Math.min(1, this.trans + dt / 0.45);
      const e = easeInOut(this.trans);
      p.lerpVectors(this.transFrom, this.transTo, e);
      // 앉을 때 살짝 점프
      p.y += Math.sin(e * Math.PI) * 0.08;
      this.yaw = lerpAngle(this.yawFrom, this.yawTo, e);
      if (this.trans >= 1) {
        if (this.mode === 'seating') {
          this.mode = 'seated';
          const cb = this.onArrive;
          this.onArrive = null;
          cb?.();
        } else {
          this.mode = 'idle';
          const cb = this.afterUnseat;
          this.afterUnseat = null;
          cb?.();
        }
      }
    }
    this.root.rotation.y = this.yaw;

    this.animate(dt);

    if (this.bubbleTimer > 0) {
      this.bubbleTimer -= dt;
      if (this.bubbleTimer <= 0) this.bubble.visible = false;
    }

    if (this.ring) {
      const m = this.ring.material as THREE.MeshBasicMaterial;
      m.opacity = 0.55 + Math.sin(this.t * 3) * 0.25;
      this.ring.visible = this.mode !== 'seated';
    }

    if (this.screenTex && this.seat) {
      const speed = 0.006 + this.typing * 0.03;
      this.screenTex.offset.y -= speed * dt;
    }

    if (this.leaving) {
      this.fade -= dt * 1.6;
      this.root.scale.setScalar(Math.max(0.001, this.fade));
      if (this.fade <= 0) {
        this.leaving = false;
        this.onLeft?.();
      }
    }
  }

  private animate(dt: number) {
    const t = this.t;
    const s = this.state;
    const seated = this.mode === 'seated' || this.mode === 'seating';
    const standingDesk = this.seat?.kind === 'stand';
    const walking = this.mode === 'walking';
    const away = s.status === 'away' || s.status === 'meal';
    const stretching = !walking && !away && seated && s.focusUntil === null && Math.sin(t * 0.23) > 0.985;

    // 기본 타자 세기: 앉아 있으면 조금씩 계속 침
    const baseTyping = seated && !away ? 0.35 : 0;
    this.typing = Math.max(baseTyping, this.typing - dt * 0.6);

    let legX = 0;
    let armLX = 0;
    let armRX = 0;
    let armZ = 0.08;
    let bob = 0;
    let headX = 0;
    let headY = Math.sin(t * 0.4) * 0.15;

    if (walking) {
      const w = Math.sin(t * 11);
      legX = w * 0.55;
      armLX = -w * 0.5;
      armRX = w * 0.5;
      bob = Math.abs(Math.cos(t * 11)) * 0.035;
      headY = 0;
    } else if (seated) {
      const sitLegs = standingDesk ? 0 : -Math.PI / 2 + (this.seat?.kind === 'beanbag' ? 0.25 : 0);
      legX = this.mode === 'seating' ? sitLegs * easeInOut(this.trans) : sitLegs;
      if (away) {
        armLX = armRX = -0.4;
        headX = 0.55;
        headY = 0;
      } else {
        const k = this.typing;
        armLX = -1.15 + Math.sin(t * 15) * 0.07 * k;
        armRX = -1.15 + Math.sin(t * 15 + 1.7) * 0.07 * k;
        armZ = -0.12;
        headX = 0.16 + Math.sin(t * 0.7) * 0.03;
        headY = Math.sin(t * 0.3) * 0.08;
      }
      if (stretching) {
        armLX = armRX = -2.9;
        armZ = 0.05;
        headX = -0.25;
      }
    } else {
      // 서서 숨쉬기
      bob = Math.sin(t * 2) * 0.006;
    }

    if (this.sipT > 0) {
      this.sipT -= dt;
      this.cup.visible = true;
      armRX = -2.1;
      headX = -0.12;
      if (this.sipT <= 0) this.cup.visible = false;
    }
    if (this.pressT > 0) {
      this.pressT -= dt;
      armRX = -1.4 - Math.sin((1 - this.pressT / 0.8) * Math.PI) * 0.5;
    }

    const lerp = Math.min(1, dt * 12);
    this.legL.rotation.x += (legX - this.legL.rotation.x) * lerp;
    this.legR.rotation.x += ((walking ? -legX : legX) - this.legR.rotation.x) * lerp;
    this.armL.rotation.x += (armLX - this.armL.rotation.x) * lerp;
    this.armR.rotation.x += (armRX - this.armR.rotation.x) * lerp;
    this.armL.rotation.z = -armZ;
    this.armR.rotation.z = armZ;
    this.headG.rotation.x += (headX - this.headG.rotation.x) * lerp;
    this.headG.rotation.y += (headY - this.headG.rotation.y) * lerp;
    this.body.position.y = bob;
    this.torso.scale.y = 1 + Math.sin(t * 2.2) * 0.012;

    // 눈 깜빡
    this.blinkT -= dt;
    const blink = this.blinkT < 0.12 ? 0.15 : 1;
    if (this.blinkT < 0) this.blinkT = 2 + Math.random() * 4;
    const sleepy = seated && away ? 0.2 : blink;
    for (const e of this.eyes) e.scale.y = sleepy;
  }
}

function lerpAngle(a: number, b: number, t: number) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

function easeInOut(x: number) {
  return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
}
