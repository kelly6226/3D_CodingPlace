// 옷장 화면 안에 작게 그리는 내 아바타.
// 방 장면과는 따로 만든 작은 3D 장면이라서, 방 카메라가 멀어도 옷을 자세히 볼 수 있어요.
import * as THREE from 'three';
import type { ActionId } from '../config';
import type { Look } from '../look';
import type { PeerState } from '../net/types';
import { Avatar } from './avatar';

const WIDTH = 200;
const HEIGHT = 240;
/** 아바타가 저절로 도는 속도 (rad/s). 드래그하면 멈춰요 */
const AUTO_TURN = 0.6;
/** 가로로 1px 끌 때 도는 각도 */
const DRAG_TURN = 0.012;
/** 처음 보여줄 방향: 살짝 비스듬히 */
const START_YAW = 0.45;

export class LookPreview {
  readonly canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(30, WIDTH / HEIGHT, 0.5, 50);
  private avatar: Avatar;
  private timer = new THREE.Timer();
  private yaw = START_YAW;
  private dragging = false;
  private lastX = 0;

  constructor(private base: PeerState) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    // 화면에 보이는 크기는 style.css(.look-canvas)가 정해서, 캔버스 style은 건드리지 않아요
    this.renderer.setSize(WIDTH, HEIGHT, false);
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.canvas = this.renderer.domElement;
    this.canvas.className = 'look-canvas';

    this.scene.add(new THREE.HemisphereLight('#dfe6ff', '#4a3a30', 1.5));
    const key = new THREE.DirectionalLight('#fff4e0', 2.2);
    key.position.set(2, 3.5, 3);
    this.scene.add(key);

    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(1.1, 40),
      new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.08 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0.005;
    this.scene.add(floor);

    this.camera.position.set(0, 1.05, 4.6);
    this.camera.lookAt(0, 0.95, 0);

    // 앉지 않는 미리보기라서 노트북 화면 그림은 필요 없어요
    this.avatar = new Avatar({ ...base, seat: null, x: 0, z: 0 }, false, this.scene, new THREE.Texture());
    this.avatar.face(this.yaw);

    this.canvas.addEventListener('pointerdown', (e) => {
      this.dragging = true;
      this.lastX = e.clientX;
      this.canvas.setPointerCapture(e.pointerId);
    });
    this.canvas.addEventListener('pointermove', (e) => {
      if (!this.dragging) return;
      this.yaw += (e.clientX - this.lastX) * DRAG_TURN;
      this.lastX = e.clientX;
    });
    const stop = () => (this.dragging = false);
    this.canvas.addEventListener('pointerup', stop);
    this.canvas.addEventListener('pointercancel', stop);

    this.renderer.setAnimationLoop(() => {
      this.timer.update();
      const dt = Math.min(0.05, this.timer.getDelta());
      if (!this.dragging) this.yaw += dt * AUTO_TURN;
      this.avatar.face(this.yaw);
      this.avatar.update(dt);
      this.renderer.render(this.scene, this.camera);
    });
  }

  /** 고른 옷으로 갈아입힘 */
  set(look: Look) {
    this.avatar.apply({ ...this.base, ...look });
  }

  perform(id: ActionId) {
    this.avatar.perform(id);
  }

  dispose() {
    this.renderer.setAnimationLoop(null);
    this.avatar.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.canvas.remove();
  }
}
