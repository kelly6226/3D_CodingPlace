// 렌더러, 카메라, 입력, 아바타 관리
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import type { PeerState } from '../net/types';
import { Avatar } from './avatar';
import { buildRoom, type Interact, type Room } from './room';
import { buildSkyline } from './skyline';
import { codeScreen } from './textures';

export interface WorldHandlers {
  onFloor(x: number, z: number): void;
  onSeat(id: string): void;
  onInteract(kind: Interact): void;
  onAvatar(id: string, screen: { x: number; y: number }): void;
}

export class World {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;
  readonly labels: CSS2DRenderer;
  readonly controls: OrbitControls;
  readonly room: Room;
  readonly avatars = new Map<string, Avatar>();
  private skyline: ReturnType<typeof buildSkyline>;
  private codeTex: THREE.Texture;
  private timer = new THREE.Timer();
  private ray = new THREE.Raycaster();
  private ndc = new THREE.Vector2();
  private hemi: THREE.HemisphereLight;
  private handlers: WorldHandlers | null = null;
  private down: { x: number; y: number; t: number } | null = null;
  private marker: THREE.Mesh;
  private markerT = 0;
  readonly mobile: boolean;
  private hemiBase = new THREE.Color('#5a6a9a');
  private hemiAlarm = new THREE.Color('#9a2a2a');

  constructor(private el: HTMLElement) {
    this.mobile = matchMedia('(pointer: coarse)').matches || innerWidth < 700;

    this.renderer = new THREE.WebGLRenderer({ antialias: !this.mobile || devicePixelRatio < 2, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, this.mobile ? 1.75 : 2));
    this.renderer.setSize(el.clientWidth, el.clientHeight);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    el.appendChild(this.renderer.domElement);

    this.labels = new CSS2DRenderer();
    this.labels.setSize(el.clientWidth, el.clientHeight);
    this.labels.domElement.className = 'labels';
    el.appendChild(this.labels.domElement);

    this.camera = new THREE.PerspectiveCamera(32, el.clientWidth / el.clientHeight, 0.5, 400);
    this.scene.fog = new THREE.Fog('#141a2c', 34, 120);

    // 빛: 창밖 도시 불빛(차가운 색) + 실내 전등(따뜻한 색)
    this.hemi = new THREE.HemisphereLight(this.hemiBase, '#2a1e16', 0.9);
    this.scene.add(this.hemi);
    const city = new THREE.DirectionalLight('#9db2ff', 0.9);
    city.position.set(-5, 13, -15);
    city.target.position.set(0, 0, 0);
    city.castShadow = true;
    const sm = this.mobile ? 1024 : 2048;
    city.shadow.mapSize.set(sm, sm);
    const sc = city.shadow.camera;
    sc.left = -10;
    sc.right = 10;
    sc.top = 9;
    sc.bottom = -9;
    sc.near = 1;
    sc.far = 45;
    city.shadow.bias = -0.0004;
    city.shadow.normalBias = 0.02;
    this.scene.add(city, city.target);

    this.room = buildRoom(this.scene, this.mobile);
    this.skyline = buildSkyline(this.scene);
    this.codeTex = codeScreen();

    // 클릭한 곳 표시
    this.marker = new THREE.Mesh(
      new THREE.RingGeometry(0.12, 0.2, 32),
      new THREE.MeshBasicMaterial({ color: '#f2b45a', transparent: true, opacity: 0, depthWrite: false }),
    );
    this.marker.rotation.x = -Math.PI / 2;
    this.scene.add(this.marker);

    this.controls = new OrbitControls(this.camera, this.labels.domElement);
    this.controls.target.set(0, 0.6, -0.2);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.enablePan = false;
    this.controls.minDistance = 6;
    this.controls.maxDistance = 30;
    this.controls.minPolarAngle = 0.45;
    this.controls.maxPolarAngle = 1.2;
    this.controls.minAzimuthAngle = -1.15;
    this.controls.maxAzimuthAngle = 1.15;
    this.controls.rotateSpeed = 0.6;
    this.resetCamera();

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

  /** 방 전체가 화면에 들어오게 */
  resetCamera() {
    const aspect = this.el.clientWidth / Math.max(1, this.el.clientHeight);
    // 세로 화면에선 화각을 넓혀야 방 전체가 들어옴
    this.camera.fov = aspect < 0.9 ? 44 : 32;
    this.camera.updateProjectionMatrix();
    const vfov = (this.camera.fov * Math.PI) / 180;
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * aspect);
    const fitW = 16 / 2 / Math.tan(hfov / 2);
    const fitH = 11 / 2 / Math.tan(vfov / 2);
    const maxD = aspect < 0.9 ? 40 : 30;
    this.controls.maxDistance = maxD;
    const dist = Math.min(maxD, Math.max(13, Math.max(fitW, fitH) * (aspect < 0.9 ? 0.78 : 0.95)));
    const portrait = aspect < 0.9;
    const polar = portrait ? 0.88 : 0.95;
    // 세로 화면에선 방을 대각선으로 놓아야 폭이 맞음
    const az = portrait ? 0.95 : 0.5;
    const t = this.controls.target;
    this.camera.position.set(
      t.x + dist * Math.sin(polar) * Math.sin(az),
      t.y + dist * Math.cos(polar),
      t.z + dist * Math.sin(polar) * Math.cos(az),
    );
    this.camera.lookAt(t);
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
    const targets: THREE.Object3D[] = [this.room.floor, ...this.room.clickables, ...this.room.seatHits];
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
      this.handlers.onInteract(u.interact as Interact);
      return;
    }
    // 바닥
    while (o && !o.userData.floor) o = o.parent;
    if (o || hit.object === this.room.floor) {
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

  removeAvatar(id: string) {
    const a = this.avatars.get(id);
    if (!a) return;
    this.avatars.delete(id);
    a.leave(() => a.dispose());
    // 떠나는 동안에도 계속 그리려고 별도 목록에 넣어둠
    this.leaving.push(a);
  }
  private leaving: Avatar[] = [];

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
      this.room.update(dt, this.camera);
      this.skyline.update(dt);
      this.codeTex.offset.y -= dt * 0.01;

      this.hemi.color.lerpColors(this.hemiBase, this.hemiAlarm, this.room.alarming ? 0.5 + Math.sin(performance.now() / 120) * 0.5 : 0);

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
