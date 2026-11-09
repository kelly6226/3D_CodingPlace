// 귀여운 개발자 아바타 (후드티 + 노트북)
import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { actionById, langById, statusById, type ActionDef, type ActionId } from '../config';
import { sameOutfit, type Outfit } from '../look';
import type { PeerState } from '../net/types';
import { FlippedTable, ThrownLaptop, makeLaptopMesh, makeStars, type Prop } from './actionProps';
import { FLIP_RELEASE_S, THROW_RELEASE_S, applyActionPose, emptyPose, faintStarsAt } from './actions';
import { seatById, type Seat } from './layout';
import { bakeStatic, type Baked } from './bake';
import { HALO_Y, buildBack, buildHair, buildHat, buildNeck, hatCoversHair } from './outfit';
import { findPath } from './pathfinding';

const SCALE = 1.2;
const HIP = 0.32 * SCALE;
const SPEED = 1.6;
/** 이름표와 말풍선을 다는 높이(바닥 기준). 말풍선은 이 위로 쌓여요 */
const LABEL_ANCHOR_Y = 1.62;
/** 서서 노트북을 던질 때 손에서 떠나는 높이 (머리 위) */
const THROW_HAND_Y = 1.45;
/** 서서 책상을 뒤집을 때, 몸에서 책상 가운데까지 거리와 높이 */
const FLIP_TABLE_REACH = 0.7;
const FLIP_TABLE_WAIST_Y = 0.55;
/** 앉아서 뒤집을 때 진짜 책상 윗면과 겹쳐 깜빡이지 않게 띄우는 높이 */
const FLIP_TABLE_LIFT = 0.06;

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
  cup: new THREE.CylinderGeometry(0.045, 0.038, 0.1, 14),
  string: new THREE.CylinderGeometry(0.008, 0.008, 0.12, 6),
  ring: new THREE.RingGeometry(0.34, 0.42, 40),
  // 노트북
  lapBase: new THREE.BoxGeometry(0.34, 0.016, 0.23),
  lapLid: new THREE.BoxGeometry(0.34, 0.22, 0.012),
  lapScreen: new THREE.PlaneGeometry(0.31, 0.19),
  sticker: new THREE.CircleGeometry(0.035, 20),
  keys: new THREE.PlaneGeometry(0.29, 0.1),
};

const mat = {
  eye: new THREE.MeshBasicMaterial({ color: '#1b1714' }),
  blush: new THREE.MeshBasicMaterial({ color: '#f29b9b', transparent: true, opacity: 0.55 }),
  glasses: new THREE.MeshStandardMaterial({ color: '#1e1e22', roughness: 0.4, metalness: 0.4 }),
  cup: new THREE.MeshStandardMaterial({ color: '#f3efe6', roughness: 0.5 }),
  string: new THREE.MeshStandardMaterial({ color: '#f3efe6' }),
  lap: new THREE.MeshStandardMaterial({ color: '#b9bec8', roughness: 0.35, metalness: 0.7 }),
  keys: new THREE.MeshStandardMaterial({ color: '#2a2d35', roughness: 0.8 }),
};

export type AvatarMode = 'idle' | 'walking' | 'seating' | 'seated' | 'unseating';

/** outfit 객체까지 복사해서 둠. 바깥에서 outfit을 고쳐도 "이전 옷"이 같이 바뀌어 변화를 못 알아보는 일이 없게 */
function copyState(s: PeerState): PeerState {
  return { ...s, outfit: { ...s.outfit } };
}

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
  private cup: THREE.Mesh;
  private ring?: THREE.Mesh;
  private hoodieMat: THREE.MeshStandardMaterial;
  private hoodMat: THREE.MeshStandardMaterial;
  private skinMat: THREE.MeshStandardMaterial;
  private hairMat: THREE.MeshStandardMaterial;
  // 바지·신발·포인트 색은 사람마다 달라서 아바타마다 하나씩 가져요
  private pantsMat = new THREE.MeshStandardMaterial({ roughness: 0.9 });
  private shoeMat = new THREE.MeshStandardMaterial({ roughness: 0.7 });
  private accentMat = new THREE.MeshStandardMaterial({ roughness: 0.6 });
  // 꾸미기 장식이 놓이는 자리 (모양은 world/outfit.ts)
  private hatSlot = new THREE.Group();
  private hairSlot = new THREE.Group();
  private backSlot = new THREE.Group();
  private neckSlot = new THREE.Group();
  private propeller: THREE.Object3D | null = null;
  private halo: THREE.Object3D | null = null;
  private cape: THREE.Object3D | null = null;
  private wings: THREE.Object3D[] = [];

  // 큰 동작 (춤, 던지기, 뒤집기, 기절)
  private act: { def: ActionDef; start: number; released: boolean } | null = null;
  private props: Prop[] = [];
  private stars: THREE.Group | null = null;
  private heldLaptop: THREE.Group | null = null;
  /** 이 시각(this.t 기준)까지는 책상 위 노트북을 숨김 (던지거나 뒤집는 중) */
  private laptopHiddenUntil = 0;

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
  /** 몸·팔다리·머리마다 합쳐 둔 메시 (색·옷이 바뀌면 다시 합쳐요) */
  private baked: Baked[] = [];
  private laptopBaked: Baked | null = null;

  constructor(
    state: PeerState,
    isSelf: boolean,
    private scene: THREE.Scene,
    private codeTex: THREE.Texture,
  ) {
    this.id = state.id;
    this.state = copyState(state);
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
      add(leg, geo.leg, this.pantsMat, 0, -0.16, 0);
      add(leg, geo.shoe, this.shoeMat, 0, -0.3, 0.03);
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
    this.headG.add(this.hatSlot, this.hairSlot);
    this.body.add(this.headG, this.backSlot, this.neckSlot);
    this.applyOutfit(state.outfit);

    this.body.scale.setScalar(SCALE);
    this.root.add(this.body);
    this.rebake();

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
    this.tag.position.set(0, LABEL_ANCHOR_Y, 0);
    this.root.add(this.tag);

    // CSS2DRenderer가 바깥 요소의 transform을 매 프레임 덮어써서, 애니메이션은 안쪽 요소에
    const wrap = document.createElement('div');
    wrap.className = 'av-bubble-wrap';
    this.bubbleEl = document.createElement('div');
    this.bubbleEl.className = 'av-bubble';
    wrap.append(this.bubbleEl);
    this.bubble = new CSS2DObject(wrap);
    // 이름표와 같은 높이에서, 말풍선 아랫변이 이름표 바로 위에 오게 (간격은 style.css .av-bubble-wrap).
    // 가운데 기준으로 두면 줄이 많은 채팅이 이름표를 덮어서, 아랫변 기준으로 위로 커지게 해요
    this.bubble.center.set(0.5, 1);
    this.bubble.position.set(0, LABEL_ANCHOR_Y, 0);
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
    this.state = copyState(next);
    if (prev.color !== next.color) {
      this.hoodieMat.color.set(next.color);
      this.hoodMat.color.copy(shade(next.color, 0.8));
    }
    if (prev.skin !== next.skin) this.skinMat.color.set(next.skin);
    if (prev.hair !== next.hair) this.hairMat.color.set(next.hair);
    if (!sameOutfit(prev.outfit, next.outfit)) this.applyOutfit(next.outfit);
    this.glasses.visible = next.glasses;
    if (prev.lang !== next.lang && this.laptop) this.paintSticker();
    // 위치·자리·상태만 바뀌는 일이 훨씬 잦아서, 겉모습이 바뀔 때만 다시 합쳐요
    const looksChanged =
      prev.color !== next.color || prev.skin !== next.skin || prev.hair !== next.hair || prev.glasses !== next.glasses || !sameOutfit(prev.outfit, next.outfit);
    if (looksChanged) this.rebake();
    this.renderTag();
  }

  /**
   * 같이 움직이는 부품끼리 합쳐요 (그리기 호출 줄이기, bake.ts).
   * 따로 움직이거나 깜빡이는 것(팔다리·머리 묶음, 숨쉬는 몸통, 컵, 눈, 프로펠러·고리·망토·날개)은 합치지 않아요.
   */
  private rebake() {
    for (const b of this.baked) b.undo();
    const moving = new Set<THREE.Object3D>([
      this.legL, this.legR, this.armL, this.armR, this.headG, this.torso, this.cup, ...this.eyes,
      ...[this.propeller, this.halo, this.cape, ...this.wings].filter((o): o is THREE.Object3D => !!o),
    ]);
    const stop = (o: THREE.Object3D) => moving.has(o);
    const tag = { avatarId: this.id };
    this.baked = [this.body, this.legL, this.legR, this.armL, this.armR, this.headG].map((g) => bakeStatic(g, stop, tag));
  }

  /** 바지·신발 색을 바꾸고 모자·머리 모양·등/목 장식을 새로 입힘 */
  private applyOutfit(o: Outfit) {
    this.pantsMat.color.set(o.pants);
    this.shoeMat.color.set(o.shoes);
    this.accentMat.color.set(o.accent);
    const dress = (slot: THREE.Group, item: THREE.Group | null) => {
      slot.clear();
      if (item) slot.add(item);
    };
    dress(this.hatSlot, buildHat(o.hat, this.accentMat));
    dress(this.hairSlot, buildHair(o.hairStyle, this.hairMat, this.accentMat, hatCoversHair(o.hat)));
    dress(this.backSlot, buildBack(o.back, this.accentMat));
    dress(this.neckSlot, buildNeck(o.neck, this.accentMat));
    // 매 프레임 움직이는 장식은 이름으로 찾아 둠
    this.propeller = this.hatSlot.getObjectByName('spin') ?? null;
    this.halo = this.hatSlot.getObjectByName('halo') ?? null;
    this.cape = this.backSlot.getObjectByName('cape') ?? null;
    this.wings = ['wingL', 'wingR'].flatMap((n) => this.backSlot.getObjectByName(n) ?? []);
  }

  /** 큰 동작을 시작함. 머리 위에 말풍선(이모지+한마디)도 같이 띄우고, 하는 동안은 걷지 않고 제자리에 있어요 */
  perform(id: ActionId) {
    const def = actionById(id);
    if (!def) return;
    this.endAct();
    this.act = { def, start: this.t, released: false };
    this.emote(def.emoji, def.line);
    // 서 있는 채로 노트북을 던질 때는 손에 노트북을 듦
    if (id === 'throw' && !this.laptop) {
      this.heldLaptop = makeLaptopMesh();
      this.heldLaptop.position.set(0, -0.36, 0.05);
      this.armR.add(this.heldLaptop);
    }
    if (id === 'faint') {
      this.stars = makeStars();
      this.stars.position.set(0, 0.62, 0);
      this.stars.visible = false;
      this.headG.add(this.stars);
    }
  }

  get acting() {
    return this.act !== null;
  }

  /** 보는 방향을 바꿈 (옷장 미리보기에서 돌려 볼 때) */
  face(yaw: number) {
    this.yaw = yaw;
  }

  private endAct() {
    this.act = null;
    if (this.heldLaptop) {
      this.armR.remove(this.heldLaptop);
      this.heldLaptop = null;
    }
    if (this.stars) {
      this.headG.remove(this.stars);
      this.stars = null;
    }
  }

  /** 동작 도중 한 번만 일어나는 일: 노트북을 놓는 순간, 책상을 뒤집는 순간, 별이 도는 구간 */
  private stepAct(elapsed: number) {
    const act = this.act;
    if (!act) return;
    if (act.def.id === 'throw' && !act.released && elapsed >= THROW_RELEASE_S) {
      act.released = true;
      this.throwLaptop(act.def.seconds - elapsed);
    }
    if (act.def.id === 'flip' && !act.released && elapsed >= FLIP_RELEASE_S) {
      act.released = true;
      this.flipTable(act.def.seconds - elapsed);
    }
    if (this.stars) this.stars.visible = faintStarsAt(elapsed, act.def.seconds);
  }

  private addProp(p: Prop) {
    this.props.push(p);
    this.scene.add(p.group);
  }

  private throwLaptop(hideFor: number) {
    const p = this.root.position;
    const yaw = this.yaw + (Math.random() - 0.5) * 0.8;
    const start = new THREE.Vector3();
    let distance = 2 + Math.random();
    if (this.laptop) {
      // 책상 위 노트북이 날아감
      this.laptop.getWorldPosition(start);
      distance = 1.6 + Math.random() * 0.6;
      this.laptopHiddenUntil = this.t + hideFor;
    } else {
      start.set(p.x + Math.sin(this.yaw) * 0.25, p.y + THROW_HAND_Y, p.z + Math.cos(this.yaw) * 0.25);
      if (this.heldLaptop) {
        this.armR.remove(this.heldLaptop);
        this.heldLaptop = null;
      }
    }
    this.addProp(new ThrownLaptop(start, yaw, distance));
  }

  private flipTable(hideFor: number) {
    const p = this.root.position;
    const origin = new THREE.Vector3();
    if (this.seat) {
      // 책상 위에서 뒤집힘 (진짜 책상은 그대로 있고, 노트북은 잠깐 사라졌다가 돌아와요)
      origin.set(this.seat.lx, this.seat.ly + FLIP_TABLE_LIFT, this.seat.lz);
      this.laptopHiddenUntil = this.t + hideFor;
    } else {
      origin.set(p.x + Math.sin(this.yaw) * FLIP_TABLE_REACH, FLIP_TABLE_WAIST_Y, p.z + Math.cos(this.yaw) * FLIP_TABLE_REACH);
    }
    this.addProp(new FlippedTable(origin, this.yaw));
  }

  renderTag() {
    const s = this.state;
    const st = statusById(s.status);
    const lang = langById(s.lang);
    this.tagEl.innerHTML = '';
    const name = document.createElement('div');
    name.className = 'av-name';
    const dot = document.createElement('i');
    dot.style.background = lang.color;
    name.append(dot, document.createTextNode(`${st.emoji} ${s.name}`));
    this.tagEl.append(name);
    this.tagEl.title = `${s.name} · ${st.label} · ${lang.label}`;
  }

  emote(emoji: string, label: string) {
    this.bubbleEl.classList.remove('multi');
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
    // 채팅처럼 긴 글은 한 줄로 늘어나지 않고 줄바꿈 (style.css .av-bubble.multi)
    this.bubbleEl.classList.add('multi');
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
    this.root.position.set(s.x, seatY(s), s.z);
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
    this.transTo.set(s.x, seatY(s), s.z);
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

  /** 노트북 스티커를 주력 언어 색으로 칠하고, 노트북 부품을 다시 합쳐요 */
  private paintSticker() {
    const laptop = this.laptop;
    if (!laptop) return;
    this.laptopBaked?.undo();
    const st = laptop.getObjectByName('sticker') as THREE.Mesh | undefined;
    if (st) (st.material as THREE.MeshBasicMaterial).color.set(langById(this.state.lang).color);
    this.laptopBaked = bakeStatic(laptop, () => false, { avatarId: this.id });
  }

  private removeLaptop() {
    if (!this.laptop) return;
    this.laptopBaked?.undo();
    this.laptopBaked = null;
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
    for (const b of this.baked) b.undo();
    this.baked = [];
    for (const p of this.props) this.scene.remove(p.group);
    this.props = [];
    this.scene.remove(this.root);
    this.tag.element.remove();
    this.bubble.element.remove();
    this.hoodieMat.dispose();
    this.hoodMat.dispose();
    this.skinMat.dispose();
    this.hairMat.dispose();
    this.pantsMat.dispose();
    this.shoeMat.dispose();
    this.accentMat.dispose();
  }

  // ── 매 프레임 ───────────────────────────────────
  update(dt: number) {
    this.t += dt;
    const p = this.root.position;

    // 동작 중에는 걸음을 잠깐 멈춰요 (동작이 끝나면 하던 길을 이어서 가요)
    if (this.mode === 'walking' && !this.act) {
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

    this.props = this.props.filter((prop) => {
      const alive = prop.update(dt);
      if (!alive) this.scene.remove(prop.group);
      return alive;
    });
    if (this.laptop) this.laptop.visible = this.t >= this.laptopHiddenUntil;

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
    const walking = this.mode === 'walking' && !this.act;
    const away = s.status === 'away' || s.status === 'meal';
    const stretching = !walking && !away && seated && Math.sin(t * 0.23) > 0.985;

    // 기본 타자 세기: 앉아 있으면 조금씩 계속 침
    const baseTyping = seated && !away ? 0.35 : 0;
    this.typing = Math.max(baseTyping, this.typing - dt * 0.6);

    const pose = emptyPose();
    // 팔을 벌리는 정도: 왼팔은 음수가 바깥, 오른팔은 양수가 바깥이라 부호만 반대
    const setArmSpread = (spread: number) => {
      pose.armLZ = -spread;
      pose.armRZ = spread;
    };
    setArmSpread(0.08);
    pose.headY = Math.sin(t * 0.4) * 0.15;

    if (walking) {
      const w = Math.sin(t * 11);
      pose.legL = w * 0.55;
      pose.legR = -w * 0.55;
      pose.armLX = -w * 0.5;
      pose.armRX = w * 0.5;
      pose.bob = Math.abs(Math.cos(t * 11)) * 0.035;
      pose.headY = 0;
    } else if (seated) {
      const sitLegs = standingDesk ? 0 : -Math.PI / 2 + (this.seat?.kind === 'beanbag' ? 0.25 : 0);
      pose.legL = pose.legR = this.mode === 'seating' ? sitLegs * easeInOut(this.trans) : sitLegs;
      if (away) {
        pose.armLX = pose.armRX = -0.4;
        pose.headX = 0.55;
        pose.headY = 0;
      } else {
        const k = this.typing;
        pose.armLX = -1.15 + Math.sin(t * 15) * 0.07 * k;
        pose.armRX = -1.15 + Math.sin(t * 15 + 1.7) * 0.07 * k;
        setArmSpread(-0.12);
        pose.headX = 0.16 + Math.sin(t * 0.7) * 0.03;
        pose.headY = Math.sin(t * 0.3) * 0.08;
      }
      if (stretching) {
        pose.armLX = pose.armRX = -2.9;
        setArmSpread(0.05);
        pose.headX = -0.25;
      }
    } else {
      // 서서 숨쉬기
      pose.bob = Math.sin(t * 2) * 0.006;
    }

    if (this.sipT > 0) {
      this.sipT -= dt;
      this.cup.visible = true;
      pose.armRX = -2.1;
      pose.headX = -0.12;
      if (this.sipT <= 0) this.cup.visible = false;
    }
    if (this.pressT > 0) {
      this.pressT -= dt;
      pose.armRX = -1.4 - Math.sin((1 - this.pressT / 0.8) * Math.PI) * 0.5;
    }

    // 큰 동작은 바탕 자세 위에 덧씌움
    let fainted = false;
    if (this.act) {
      const elapsed = t - this.act.start;
      if (elapsed >= this.act.def.seconds) {
        this.endAct();
      } else {
        this.stepAct(elapsed);
        applyActionPose(this.act.def.id, elapsed, this.act.def.seconds, seated, pose);
        fainted = this.act.def.id === 'faint' && faintStarsAt(elapsed, this.act.def.seconds);
      }
    }

    const lerp = Math.min(1, dt * 12);
    const follow = (obj: THREE.Object3D, axis: 'x' | 'y' | 'z', to: number) => {
      obj.rotation[axis] += (to - obj.rotation[axis]) * lerp;
    };
    follow(this.legL, 'x', pose.legL);
    follow(this.legR, 'x', pose.legR);
    follow(this.armL, 'x', pose.armLX);
    follow(this.armR, 'x', pose.armRX);
    follow(this.armL, 'z', pose.armLZ);
    follow(this.armR, 'z', pose.armRZ);
    follow(this.headG, 'x', pose.headX);
    follow(this.headG, 'y', pose.headY);
    follow(this.headG, 'z', pose.headZ);
    this.body.position.set(pose.sway, pose.bob, 0);
    follow(this.body, 'x', pose.pitch);
    follow(this.body, 'z', pose.roll);
    this.body.rotation.y = pose.spin;
    this.torso.scale.y = 1 + Math.sin(t * 2.2) * 0.012;

    this.animateAccessories(dt, walking);

    // 눈 깜빡
    this.blinkT -= dt;
    const blink = this.blinkT < 0.12 ? 0.15 : 1;
    if (this.blinkT < 0) this.blinkT = 2 + Math.random() * 4;
    const closed = (seated && away) || fainted;
    for (const e of this.eyes) e.scale.y = closed ? 0.2 : blink;
  }

  /** 프로펠러, 천사 고리, 망토, 날개처럼 스스로 움직이는 장식 */
  private animateAccessories(dt: number, walking: boolean) {
    const t = this.t;
    const dancing = this.act?.def.id === 'dance';
    if (this.propeller) this.propeller.rotation.y += dt * (walking || dancing ? 26 : 9);
    if (this.halo) this.halo.position.y = HALO_Y + Math.sin(t * 2.5) * 0.012;
    if (this.cape) {
      const billow = walking ? 0.22 + Math.sin(t * 11) * 0.1 : 0.06 + Math.sin(t * 1.5) * 0.03;
      this.cape.rotation.x = billow;
    }
    const flap = walking || dancing ? 12 : 2;
    const open = 0.45 + Math.sin(t * flap) * 0.2;
    // 왼쪽 날개는 음수, 오른쪽은 양수로 돌려야 둘 다 뒤로 접힘
    this.wings.forEach((w, i) => (w.rotation.y = (i === 0 ? -1 : 1) * open));
  }
}

/** 앉았을 때 아바타 발밑 높이. 바닥·침대는 엉덩이 높이에 맞춰 몸을 내림 */
function seatY(s: Seat) {
  if (s.kind === 'floor' || s.kind === 'bed') return s.h - HIP;
  return Math.max(0, s.h - HIP);
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
