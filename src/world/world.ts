// 렌더러, 카메라, 입력, 아바타 관리. 장소(카페·서버실·원룸·해커톤장)는 setPlace()로 갈아끼워요.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import type { PlaceId, ViewCommand, ViewState } from '../config';
import type { PeerState } from '../net/types';
import { Avatar } from './avatar';
import { ROOM, useLayout } from './layout';
import { buildGrid } from './pathfinding';
import { disposeTree, type InteractData } from './places/kit';
import type { PlaceBuild, PlaceDef, PlaceEnv } from './places/types';
import { ResolutionGovernor } from './quality';
import { codeScreen } from './textures';
import { TraceLayer, type TraceProp } from './traces';

export interface WorldHandlers {
  onFloor(x: number, z: number): void;
  onSeat(id: string): void;
  onInteract(data: InteractData): void;
  onAvatar(id: string, screen: { x: number; y: number }): void;
  /** 처음 시점에서 벗어났는지, 내 캐릭터를 따라가는지가 바뀔 때 (시점 버튼 표시용) */
  onViewState(state: ViewState): void;
}

/** 시점 조작 한도 (각도는 라디안, 길이는 월드 단위) */
const VIEW = {
  /** 거의 바로 위에서 내려다보는 각도 */
  minPolar: 0.12,
  /** 바닥 아래로 내려가지 않게 수평 바로 위까지만 */
  maxPolar: Math.PI / 2 - 0.05,
  minDistance: 2.5,
  /** 처음 시점 거리의 몇 배까지 멀어질 수 있는지. 처음 시점이 방 전체가 화면에 꽉 차는 거리라서 1에 가까울수록 더 못 물러나요 */
  maxDistanceRatio: 1.05,
  /** 화면 중심이 방 가장자리 밖으로 나갈 수 있는 여유 */
  panMargin: 1,
  /** 화면 중심의 높이 한도 */
  panMaxY: 2,
  rotateSpeed: 0.7,
  zoomSpeed: 0.9,
  panSpeed: 0.8,
  dampingFactor: 0.08,
} as const;

/** 처음 시점에서 이만큼 이상 벗어나면 '움직인 것'으로 봄 */
const VIEW_MOVED_DIST = 0.3;
/** 시점 버튼('처음 시점'·'내 캐릭터')을 눌렀을 때 움직이는 데 걸리는 시간 */
const VIEW_HOME_SECONDS = 0.7;
/** '내 캐릭터' 시점: 캐릭터와의 거리, 내려다보는 각도(라디안, 0이 바로 위), 화면 중심으로 삼는 높이(가슴쯤) */
const FOLLOW_DISTANCE = 6.5;
const FOLLOW_POLAR = 1.05;
const FOLLOW_FOCUS_Y = 0.9;
/** 캐릭터가 걸을 때 화면 중심이 따라붙는 빠르기 (클수록 빨리 따라와요) */
const FOLLOW_EASE_PER_SEC = 6;
/**
 * 그림자를 몇 프레임마다 다시 그릴지. 그림자 패스는 그림자를 드리우는 물체를 한 번 더 그려서 비싸요.
 * 조명은 안 움직이고 캐릭터만 천천히 움직여서, 초당 20번(60fps 기준)이면 차이가 거의 안 보여요
 */
const SHADOW_EVERY_FRAMES = 3;
/** 한 번의 클릭으로 보는 최대 이동 거리(px)와 시간(ms) */
const CLICK_MAX_MOVE_PX = 8;
const CLICK_MAX_MS = 600;

export class World {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;
  readonly labels: CSS2DRenderer;
  readonly controls: OrbitControls;
  readonly avatars = new Map<string, Avatar>();
  readonly mobile: boolean;
  /** 자리에 남은 흔적 (식은 커피잔). 장소를 바꾸면 비워요 */
  private traces: TraceLayer;
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
  /** 지금 화면에 닿아 있는 손가락·포인터 수. 둘 이상이면 확대/이동 중이라 클릭으로 안 봄 */
  private pointers = new Set<number>();
  private home = { pos: new THREE.Vector3(), target: new THREE.Vector3() };
  private viewState: ViewState = { moved: false, following: false };
  /** 켜져 있으면 화면 중심이 내 캐릭터를 따라다녀요 (돌리기·확대는 내 캐릭터가 중심) */
  private following = false;
  /** '처음 시점'으로 부드럽게 돌아가는 중일 때만 있음 */
  private flight: { t: number; seconds: number; fromPos: THREE.Vector3; fromTarget: THREE.Vector3; toPos: THREE.Vector3; toTarget: THREE.Vector3 } | null = null;
  private marker: THREE.Mesh;
  private markerT = 0;
  private hemiBase = new THREE.Color('#5a6a9a');
  private hemiAlarm = new THREE.Color('#9a2a2a');
  private leaving: Avatar[] = [];
  private governor: ResolutionGovernor;
  private frame = 0;

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
    // 그림자는 SHADOW_EVERY_FRAMES마다만 다시 그려요 (start()의 loop)
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.shadowMap.needsUpdate = true;
    this.governor = new ResolutionGovernor(this.renderer);
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
    this.controls.dampingFactor = VIEW.dampingFactor;
    // 바닥 평면을 따라 옮기고(screenSpacePanning=false), 휠은 커서가 가리키는 곳으로 확대
    this.controls.enablePan = true;
    this.controls.screenSpacePanning = false;
    this.controls.zoomToCursor = true;
    this.controls.panSpeed = VIEW.panSpeed;
    this.controls.zoomSpeed = VIEW.zoomSpeed;
    this.controls.rotateSpeed = VIEW.rotateSpeed;
    this.controls.minDistance = VIEW.minDistance;
    this.controls.minPolarAngle = VIEW.minPolar;
    this.controls.maxPolarAngle = VIEW.maxPolar;
    // 좌우로는 제한 없이 한 바퀴 다 돌 수 있어요(OrbitControls 기본값). 뒷벽 쪽에서는 벽이 시야를 가리지 않게 places의 wallCutaway가 벽을 숨겨요
    // 사용자가 직접 만지기 시작하면 돌아가는 중이던 동작은 멈춤
    this.controls.addEventListener('start', () => (this.flight = null));
    this.controls.addEventListener('change', () => this.updateViewState());

    this.traces = new TraceLayer(this.scene);
    this.setPlace(first);

    // 창 크기 이벤트만으론 못 알아채는 변화도 잡으려고 그리는 영역 자체를 지켜봐요 (아이폰 Safari는 처음에 높이가 0일 때가 있어요)
    new ResizeObserver(() => this.resize()).observe(el);
    const dom = this.labels.domElement;
    dom.addEventListener('pointerdown', (e) => {
      this.pointers.add(e.pointerId);
      // 두 번째 손가락이 닿으면 확대/이동이라 클릭 후보에서 뺌
      this.down = this.pointers.size === 1 ? { x: e.clientX, y: e.clientY, t: performance.now() } : null;
    });
    const release = (e: PointerEvent) => this.pointers.delete(e.pointerId);
    dom.addEventListener('pointerup', (e) => {
      release(e);
      const d = this.down;
      this.down = null;
      // 오른쪽·가운데 버튼은 이동·확대용이라 걷기·앉기로 보지 않음
      if (!d || e.button !== 0) return;
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > CLICK_MAX_MOVE_PX || performance.now() - d.t > CLICK_MAX_MS) return;
      this.pick(e.clientX, e.clientY);
    });
    dom.addEventListener('pointercancel', (e) => {
      release(e);
      this.down = null;
    });
    // 오른쪽 버튼 드래그로 옮길 때 메뉴가 뜨지 않게
    dom.addEventListener('contextmenu', (e) => e.preventDefault());
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
    // 흔적은 자리 위치에 붙어 있어서 배치도가 바뀌면 지워요 (main.ts가 새 방 흔적을 다시 넣어요)
    this.traces.clear();
    useLayout(def.layout);
    buildGrid(def.layout.room, def.layout.obstacles);
    this.applyEnv(def.env);
    this.place = def.build(this.scene, this.mobile);
    this.placeId = def.id;
    this.renderer.shadowMap.needsUpdate = true;
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
    this.following = false;
    this.controls.enablePan = true;
    this.controls.zoomToCursor = true;
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
    this.controls.maxDistance = dist * VIEW.maxDistanceRatio;
    place(dist);
    this.flight = null;
    this.controls.update();
    this.home.pos.copy(this.camera.position);
    this.home.target.copy(this.controls.target);
    this.updateViewState();
  }

  /** 오른쪽 위 시점 버튼 */
  viewCommand(cmd: ViewCommand) {
    switch (cmd) {
      case 'home':
        this.setFollowing(false);
        this.flyTo(this.home.pos, this.home.target, VIEW_HOME_SECONDS);
        break;
      case 'follow':
        this.startFollow();
        break;
    }
  }

  private flyTo(pos: THREE.Vector3, target: THREE.Vector3, seconds: number) {
    this.flight = { t: 0, seconds, fromPos: this.camera.position.clone(), fromTarget: this.controls.target.clone(), toPos: pos.clone(), toTarget: target.clone() };
  }

  /** 버튼을 연달아 눌러도 쌓이도록, 움직이는 중이면 가는 곳을 기준으로 삼아요 */
  private viewBase() {
    return { pos: this.flight?.toPos ?? this.camera.position, target: this.flight?.toTarget ?? this.controls.target };
  }

  /** 내 캐릭터가 화면 중심이 되게 가까이 가서, 이후 걸어도 계속 따라가요. 좌우 보는 방향은 그대로예요 */
  private startFollow() {
    const me = this.selfAvatar();
    if (!me) return;
    this.setFollowing(true);
    const focus = this.followFocus(me);
    const { pos, target } = this.viewBase();
    const azimuth = Math.atan2(pos.x - target.x, pos.z - target.z);
    const reach = THREE.MathUtils.clamp(FOLLOW_DISTANCE, this.controls.minDistance, this.controls.maxDistance);
    const offset = new THREE.Vector3(
      reach * Math.sin(FOLLOW_POLAR) * Math.sin(azimuth),
      reach * Math.cos(FOLLOW_POLAR),
      reach * Math.sin(FOLLOW_POLAR) * Math.cos(azimuth),
    );
    this.flyTo(focus.clone().add(offset), focus, VIEW_HOME_SECONDS);
  }

  /** 따라가는 동안엔 손으로 화면을 옮기거나 커서 쪽으로 확대하면 따라가기와 부딪혀서 막아요 */
  private setFollowing(on: boolean) {
    this.following = on;
    this.controls.enablePan = !on;
    this.controls.zoomToCursor = !on;
    this.updateViewState();
  }

  private selfAvatar() {
    for (const a of this.avatars.values()) if (a.isSelf) return a;
    return null;
  }

  private followFocus(a: Avatar) {
    return new THREE.Vector3(a.root.position.x, FOLLOW_FOCUS_Y, a.root.position.z);
  }

  /** 카메라와 화면 중심을 같이 밀어서, 사용자가 돌려 둔 각도와 거리는 그대로 두고 캐릭터만 따라가요 */
  private stepFollow(dt: number) {
    if (!this.following || this.flight) return;
    const me = this.selfAvatar();
    if (!me) return;
    const t = this.controls.target;
    const shift = this.followFocus(me).sub(t).multiplyScalar(1 - Math.exp(-dt * FOLLOW_EASE_PER_SEC));
    t.add(shift);
    this.camera.position.add(shift);
  }

  /** 처음 시점에서 벗어났는지, 따라가는 중인지가 바뀌었을 때만 알림 */
  private updateViewState() {
    const moved = this.camera.position.distanceTo(this.home.pos) > VIEW_MOVED_DIST || this.controls.target.distanceTo(this.home.target) > VIEW_MOVED_DIST;
    const { moved: wasMoved, following: wasFollowing } = this.viewState;
    if (moved === wasMoved && this.following === wasFollowing) return;
    this.viewState = { moved, following: this.following };
    this.handlers?.onViewState(this.viewState);
  }

  /** 화면 중심이 방 밖으로 너무 멀리 나가지 않게 (카메라도 같이 밀어서 보는 각도는 그대로) */
  private keepTargetInRoom() {
    const t = this.controls.target;
    const m = VIEW.panMargin;
    const x = THREE.MathUtils.clamp(t.x, ROOM.x0 - m, ROOM.x1 + m);
    const y = THREE.MathUtils.clamp(t.y, 0, VIEW.panMaxY);
    const z = THREE.MathUtils.clamp(t.z, ROOM.z0 - m, ROOM.z1 + m);
    if (x === t.x && y === t.y && z === t.z) return;
    this.camera.position.add(new THREE.Vector3(x - t.x, y - t.y, z - t.z));
    t.set(x, y, z);
  }

  private stepFlight(dt: number) {
    const f = this.flight;
    if (!f) return;
    f.t = Math.min(1, f.t + dt / f.seconds);
    const k = THREE.MathUtils.smootherstep(f.t, 0, 1);
    this.controls.target.lerpVectors(f.fromTarget, f.toTarget, k);
    // 한 바퀴 다 돌 수 있어서, 위치를 직선으로 섞으면 뒤쪽에서 출발할 때 방 한가운데를 가로질러요.
    // 화면 중심 둘레를 도는 각도(짧은 쪽)로 섞어요
    const from = new THREE.Spherical().setFromVector3(f.fromPos.clone().sub(f.fromTarget));
    const to = new THREE.Spherical().setFromVector3(f.toPos.clone().sub(f.toTarget));
    const turn = Math.atan2(Math.sin(to.theta - from.theta), Math.cos(to.theta - from.theta));
    const now = new THREE.Spherical(
      THREE.MathUtils.lerp(from.radius, to.radius, k),
      THREE.MathUtils.lerp(from.phi, to.phi, k),
      from.theta + turn * k,
    );
    this.camera.position.copy(this.controls.target).add(new THREE.Vector3().setFromSpherical(now));
    if (f.t >= 1) this.flight = null;
  }

  /** 자리에 남은 흔적을 바꿔요 */
  setTraces(props: TraceProp[]) {
    this.traces.set(props);
    this.renderer.shadowMap.needsUpdate = true;
  }

  /** 지금 누가 앉아 있는 자리의 흔적은 숨겨요 */
  hideTraceSeats(taken: ReadonlySet<string>) {
    this.traces.hideSeats(taken);
  }

  setHandlers(h: WorldHandlers) {
    this.handlers = h;
  }

  private resize() {
    const w = this.el.clientWidth;
    const h = this.el.clientHeight;
    // 영역이 아직 0이면 그릴 곳이 없어요. 크기가 잡히면 지켜보던 쪽이 다시 불러줘요
    if (w === 0 || h === 0) return;
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
    const targets: THREE.Object3D[] = [this.place.floor, ...this.place.clickables, ...this.place.seatHits, this.traces.root];
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
      this.stepFlight(dt);
      this.stepFollow(dt);
      this.controls.update();
      this.keepTargetInRoom();
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
      if (++this.frame % SHADOW_EVERY_FRAMES === 0) this.renderer.shadowMap.needsUpdate = true;
      this.governor.tick();
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
