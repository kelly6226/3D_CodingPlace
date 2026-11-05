// 렌더러, 카메라, 입력, 아바타 관리. 장소(카페·서버실·원룸·해커톤장)는 setPlace()로 갈아끼워요.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import type { PlaceId } from '../config';
import type { PeerState } from '../net/types';
import { Avatar } from './avatar';
import { ROOM, useLayout } from './layout';
import { buildGrid } from './pathfinding';
import { disposeTree, type InteractData } from './places/kit';
import type { PlaceBuild, PlaceDef, PlaceEnv } from './places/types';
import { codeScreen } from './textures';

export interface WorldHandlers {
  onFloor(x: number, z: number): void;
  onSeat(id: string): void;
  onInteract(data: InteractData): void;
  onAvatar(id: string, screen: { x: number; y: number }): void;
}

export class World {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;
  readonly labels: CSS2DRenderer;
  readonly controls: OrbitControls;
  readonly avatars = new Map<string, Avatar>();
  readonly mobile: boolean;
  private place!: PlaceBuild;
  private placeId: PlaceId | null = null;
  private codeTex: THREE.Texture;
  private timer = new THREE.Timer();
  private ray = new THREE.Raycaster();
  private ndc = new THREE.Vector2();
  private hemi: THREE.HemisphereLight;
  private sun: THREE.DirectionalLight;
  private handlers: WorldHandlers | null = null;
  private down: { x: number; y: number; t: number } | null = null;
  private marker: THREE.Mesh;
  private markerT = 0;
  private hemiBase = new THREE.Color('#5a6a9a');
  private hemiAlarm = new THREE.Color('#9a2a2a');
  private leaving: Avatar[] = [];

  constructor(
    private el: HTMLElement,
    first: PlaceDef,
  ) {
    this.mobile = matchMedia('(pointer: coarse)').matches || innerWidth < 700;

    this.renderer = new THREE.WebGLRenderer({ antialias: !this.mobile || devicePixelRatio < 2, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, this.mobile ? 1.75 : 2));
    this.renderer.setSize(el.clientWidth, el.clientHeight);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    el.appendChild(this.renderer.domElement);

    this.labels = new CSS2DRenderer();
    this.labels.setSize(el.clientWidth, el.clientHeight);
    this.labels.domElement.className = 'labels';
    el.appendChild(this.labels.domElement);

    this.camera = new THREE.PerspectiveCamera(32, el.clientWidth / el.clientHeight, 0.5, 400);

    // 장소마다 색과 세기만 바뀌는 빛 두 개: 하늘빛(전체) + 그림자를 만드는 주 조명
    this.hemi = new THREE.HemisphereLight(this.hemiBase, '#2a1e16', 0.9);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight('#9db2ff', 0.9);
    this.sun.castShadow = true;
    const sm = this.mobile ? 1024 : 2048;
    this.sun.shadow.mapSize.set(sm, sm);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.02;
    this.scene.add(this.sun, this.sun.target);

    this.codeTex = codeScreen();

    // 클릭한 곳 표시
    this.marker = new THREE.Mesh(
      new THREE.RingGeometry(0.12, 0.2, 32),
      new THREE.MeshBasicMaterial({ color: '#f2b45a', transparent: true, opacity: 0, depthWrite: false }),
    );
    this.marker.rotation.x = -Math.PI / 2;
    this.scene.add(this.marker);

    this.controls = new OrbitControls(this.camera, this.labels.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.enablePan = false;
    this.controls.minDistance = 5;
    this.controls.minPolarAngle = 0.45;
    this.controls.maxPolarAngle = 1.2;
    this.controls.minAzimuthAngle = -1.15;
    this.controls.maxAzimuthAngle = 1.15;
    this.controls.rotateSpeed = 0.6;

    this.setPlace(first);

    addEventListener('resize', () => this.resize());
    const dom = this.labels.domElement;
    dom.addEventListener('pointerdown', (e) => {
      this.down = { x: e.clientX, y: e.clientY, t: performance.now() };
    });
    dom.addEventListener('pointerup', (e) => {
      const d = this.down;
      this.down = null;
      if (!d) return;
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 8 || performance.now() - d.t > 600) return;
      this.pick(e.clientX, e.clientY);
    });
    dom.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse' || this.down) return;
      const hit = this.hitTest(e.clientX, e.clientY);
      dom.style.cursor = hit && Object.keys(tagged(hit.object)).length ? 'pointer' : '';
    });
  }

  /** 지금 장소 (git log 화면, 경보 등) */
  get room(): PlaceBuild {
    return this.place;
  }

  get currentPlace() {
    return this.placeId;
  }

  /** 장소 바꾸기. 같은 장소면 아무것도 안 함. 바뀌었으면 true */
  setPlace(def: PlaceDef): boolean {
    if (this.placeId === def.id) return false;
    if (this.place) {
      this.scene.remove(this.place.root);
      disposeTree(this.place.root);
    }
    useLayout(def.layout);
    buildGrid(def.layout.room, def.layout.obstacles);
    this.applyEnv(def.env);
    this.place = def.build(this.scene, this.mobile);
    this.placeId = def.id;
    this.resetCamera();
    return true;
  }

  private applyEnv(env: PlaceEnv) {
    const old = this.scene.background;
    if (old instanceof THREE.Texture) old.dispose();
    this.scene.background = env.background();
    this.scene.fog = env.fog ? new THREE.Fog(env.fog.color, env.fog.near, env.fog.far) : null;
    this.hemiBase.set(env.hemi.sky);
    this.hemi.color.copy(this.hemiBase);
    this.hemi.groundColor.set(env.hemi.ground);
    this.hemi.intensity = env.hemi.intensity;
    this.renderer.toneMappingExposure = env.exposure;

    // 그림자 범위를 방 크기에 맞춤
    const cx = (ROOM.x0 + ROOM.x1) / 2;
    const cz = (ROOM.z0 + ROOM.z1) / 2;
    const half = Math.hypot(ROOM.x1 - ROOM.x0, ROOM.z1 - ROOM.z0) / 2 + 1;
    this.sun.color.set(env.sun.color);
    this.sun.intensity = env.sun.intensity;
    this.sun.position.set(cx + env.sun.pos[0], env.sun.pos[1], cz + env.sun.pos[2]);
    this.sun.target.position.set(cx, 0, cz);
    const sc = this.sun.shadow.camera;
    sc.left = -half;
    sc.right = half;
    sc.top = half;
    sc.bottom = -half;
    sc.near = 1;
    sc.far = this.sun.position.distanceTo(this.sun.target.position) + half * 2;
    sc.updateProjectionMatrix();
  }

  /** 방 전체가 화면에 들어오게 */
  resetCamera() {
    const aspect = this.el.clientWidth / Math.max(1, this.el.clientHeight);
    const portrait = aspect < 0.9;
    // 세로 화면에선 화각을 넓혀야 방 전체가 들어옴
    this.camera.fov = portrait ? 44 : 32;
    this.camera.updateProjectionMatrix();
    const polar = portrait ? 0.88 : 0.95;
    // 세로 화면에선 방을 대각선으로 놓아야 폭이 맞음
    const az = portrait ? 0.95 : 0.5;
    const t = this.controls.target;
    t.set((ROOM.x0 + ROOM.x1) / 2, 0.6, (ROOM.z0 + ROOM.z1) / 2 - 0.2);
    const place = (dist: number) => {
      this.camera.position.set(
        t.x + dist * Math.sin(polar) * Math.sin(az),
        t.y + dist * Math.cos(polar),
        t.z + dist * Math.sin(polar) * Math.cos(az),
      );
      this.camera.lookAt(t);
      this.camera.updateMatrixWorld();
    };
    // 바닥 네 모서리와 뒤 벽 위쪽이 화면(위 HUD, 아래 버튼 줄 제외) 안에 들어오는 가장 가까운 거리를 찾음.
    // 세로 화면은 양옆이 조금 잘려도 크게 보이는 쪽이 나아서 가로로 더 넉넉하게 봐줌
    const corners = [
      [ROOM.x0, 0, ROOM.z0],
      [ROOM.x1, 0, ROOM.z0],
      [ROOM.x0, 0, ROOM.z1],
      [ROOM.x1, 0, ROOM.z1],
      [ROOM.x0, ROOM.wallH * 0.75, ROOM.z0],
      [ROOM.x1, ROOM.wallH * 0.75, ROOM.z0],
    ].map(([x, y, z]) => new THREE.Vector3(x, y, z));
    // 앞쪽 바닥 모서리는 아래 버튼 줄 밑으로 살짝 들어가도 괜찮음 (거기엔 보통 아무것도 없어요)
    const maxX = portrait ? 1.35 : 1.1;
    const v = new THREE.Vector3();
    const fits = (dist: number) => {
      place(dist);
      return corners.every((c) => {
        v.copy(c).project(this.camera);
        return Math.abs(v.x) <= maxX && v.y >= -1.08 && v.y <= 0.95;
      });
    };
    let lo = 5;
    let hi = 80;
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      if (fits(mid)) hi = mid;
      else lo = mid;
    }
    // 가로 화면은 조금 당겨서 사람이 잘 보이게 (모서리가 살짝 잘려도 됨)
    const dist = hi * (portrait ? 1 : 0.9);
    this.controls.maxDistance = Math.max(16, dist * 1.35);
    this.controls.minDistance = Math.min(6, dist * 0.6);
    place(dist);
    this.controls.update();
  }

  setHandlers(h: WorldHandlers) {
    this.handlers = h;
  }

  private resize() {
    const w = this.el.clientWidth;
    const h = this.el.clientHeight;
    const wasPortrait = this.camera.aspect < 0.9;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.labels.setSize(w, h);
    if (wasPortrait !== this.camera.aspect < 0.9) this.resetCamera();
  }

  private hitTest(cx: number, cy: number) {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(this.ndc, this.camera);
    const targets: THREE.Object3D[] = [this.place.floor, ...this.place.clickables, ...this.place.seatHits];
    for (const a of this.avatars.values()) {
      targets.push(a.root);
      if (a.laptop) targets.push(a.laptop);
    }
    const hits = this.ray.intersectObjects(targets, true);
    return hits.find((h) => shown(h.object)) ?? null;
  }

  private pick(cx: number, cy: number) {
    const hit = this.hitTest(cx, cy);
    if (!hit || !this.handlers) return;
    let o: THREE.Object3D | null = hit.object;
    const u = tagged(o);
    if (u.avatarId) {
      this.handlers.onAvatar(u.avatarId as string, { x: cx, y: cy });
      return;
    }
    if (u.seatId) {
      this.handlers.onSeat(u.seatId as string);
      return;
    }
    if (u.interact) {
      const { interact, lines, sound, key } = u as unknown as InteractData;
      this.handlers.onInteract({ interact, lines, sound, key });
      return;
    }
    // 바닥
    while (o && !o.userData.floor) o = o.parent;
    if (o || hit.object === this.place.floor) {
      const p = hit.point;
      this.showMarker(p.x, p.z);
      this.handlers.onFloor(p.x, p.z);
    }
  }

  showMarker(x: number, z: number) {
    this.marker.position.set(x, 0.015, z);
    this.markerT = 1;
  }

  // ── 아바타 ─────────────────────────────────────
  addAvatar(state: PeerState, isSelf: boolean) {
    const a = new Avatar(state, isSelf, this.scene, this.codeTex);
    this.avatars.set(state.id, a);
    return a;
  }

  /** quiet: 장소를 옮길 때처럼 바로 지움 (사라지는 애니메이션 없이) */
  removeAvatar(id: string, quiet = false) {
    const a = this.avatars.get(id);
    if (!a) return;
    this.avatars.delete(id);
    if (quiet) {
      a.dispose();
      return;
    }
    a.leave(() => a.dispose());
    // 떠나는 동안에도 계속 그리려고 별도 목록에 넣어둠
    this.leaving.push(a);
  }

  /** 화면 좌표 (말풍선 팝오버 위치용) */
  toScreen(v: THREE.Vector3) {
    const p = v.clone().project(this.camera);
    const r = this.renderer.domElement.getBoundingClientRect();
    return { x: r.left + ((p.x + 1) / 2) * r.width, y: r.top + ((1 - p.y) / 2) * r.height };
  }

  start(onFrame?: (dt: number) => void) {
    const loop = () => {
      this.timer.update();
      const dt = Math.min(0.05, this.timer.getDelta());
      this.controls.update();
      for (const a of this.avatars.values()) a.update(dt);
      for (const a of this.leaving) a.update(dt);
      this.leaving = this.leaving.filter((a) => a.root.parent);
      this.place.update(dt, this.camera);
      this.codeTex.offset.y -= dt * 0.01;

      this.hemi.color.lerpColors(this.hemiBase, this.hemiAlarm, this.place.alarming ? 0.5 + Math.sin(performance.now() / 120) * 0.5 : 0);

      if (this.markerT > 0) {
        this.markerT = Math.max(0, this.markerT - dt * 1.4);
        const m = this.marker.material as THREE.MeshBasicMaterial;
        m.opacity = this.markerT * 0.9;
        this.marker.scale.setScalar(1 + (1 - this.markerT) * 1.2);
      }
      onFrame?.(dt);
      this.renderer.render(this.scene, this.camera);
      this.labels.render(this.scene, this.camera);
    };
    this.renderer.setAnimationLoop(loop);
  }
}

function shown(o: THREE.Object3D | null) {
  for (; o; o = o.parent) if (!o.visible) return false;
  return true;
}

/** 맞은 물체나 그 부모에 붙은 클릭 정보 */
function tagged(o: THREE.Object3D | null): Record<string, unknown> {
  for (; o; o = o.parent) {
    const u = o.userData;
    if (u.avatarId || u.seatId || u.interact) return u;
    if (u.floor) return {};
  }
  return {};
}
