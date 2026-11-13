// 자리에 남은 흔적: 누가 오래 앉았다 간 자리 책상 위에 식은 커피잔과 노란 메모지를 놓아요.
// 누르면 언제 얼마나 있다 갔는지 토스트로 보여줘요 (main.ts가 문구를 정해 넘겨요).
// 지금 누가 앉아 있는 자리는 숨겨요.
import * as THREE from 'three';
import { hitMat, tagInteract } from './places/kit';
import type { Seat } from './layout';
import { glowSprite } from './textures';

export interface TraceProp {
  seat: Seat;
  /** 눌렀을 때 보여줄 문구 */
  line: string;
}

/** 컵을 노트북 자리에서 옆으로 비켜 놓는 거리 (m) */
const SIDE_OFFSET = 0.16;
/** 방 전체를 내려다보는 시점에서도 보이게 실제 머그잔보다 크게 (배율) */
const MUG_SCALE = 1.7;
/** 어두운 장면에서 눈에 띄게 컵 아래 깔아 두는 은은한 불빛 */
const GLOW = { color: 'rgb(255,214,150)', size: 0.55, opacity: 0.35 };

const mugMat = new THREE.MeshStandardMaterial({ color: '#efe6d8', roughness: 0.55 });
const coffeeMat = new THREE.MeshStandardMaterial({ color: '#3a2416', roughness: 0.3 });
const noteMat = new THREE.MeshStandardMaterial({ color: '#f2c94c', roughness: 0.9, side: THREE.DoubleSide });
let glowMat: THREE.SpriteMaterial | null = null;
/** 불빛 재질은 캔버스를 그려야 해서 처음 쓸 때 만들어요 (모든 컵이 같이 써요) */
function getGlowMat() {
  glowMat ??= new THREE.SpriteMaterial({ map: glowSprite(GLOW.color), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: GLOW.opacity });
  return glowMat;
}

function buildMug(): THREE.Group {
  const outer = new THREE.Group();
  const g = new THREE.Group();
  g.scale.setScalar(MUG_SCALE);
  outer.add(g);
  const glow = new THREE.Sprite(getGlowMat());
  glow.position.y = 0.08;
  glow.scale.setScalar(GLOW.size);
  outer.add(glow);
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.04, 0.09, 16), mugMat);
  body.position.y = 0.045;
  body.castShadow = true;
  const coffee = new THREE.Mesh(new THREE.CircleGeometry(0.04, 16), coffeeMat);
  coffee.rotation.x = -Math.PI / 2;
  coffee.position.y = 0.075;
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.025, 0.008, 6, 12, Math.PI), mugMat);
  handle.rotation.z = -Math.PI / 2;
  handle.position.set(0.045, 0.045, 0);
  // 노란 메모지: 컵에 기대 세워 둔 한 장
  const note = new THREE.Mesh(new THREE.PlaneGeometry(0.07, 0.07), noteMat);
  note.position.set(-0.07, 0.035, 0.02);
  note.rotation.set(-0.35, 0.4, 0);
  // 컵이 작아서 잘 눌리게 보이지 않는 판정 상자를 크게 둬요
  const hit = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), hitMat);
  hit.position.y = 0.12;
  g.add(body, coffee, handle, note, hit);
  return outer;
}

export class TraceLayer {
  readonly root = new THREE.Group();
  private bySeat = new Map<string, THREE.Group>();

  constructor(scene: THREE.Scene) {
    this.root.name = 'seat-traces';
    scene.add(this.root);
  }

  /** 흔적을 통째로 바꿔요. 같은 자리면 문구만 바꿔요 */
  set(props: TraceProp[]) {
    const keep = new Set(props.map((p) => p.seat.id));
    for (const [id, g] of this.bySeat) if (!keep.has(id)) this.remove(id, g);
    for (const p of props) {
      let g = this.bySeat.get(p.seat.id);
      if (!g) {
        g = buildMug();
        const s = p.seat;
        // 노트북이 놓이는 자리에서 옆으로 살짝 비켜서, 책상(또는 바닥) 높이에 놓아요
        const side = s.lyaw + Math.PI / 2;
        g.position.set(s.lx + Math.sin(side) * SIDE_OFFSET, s.ly, s.lz + Math.cos(side) * SIDE_OFFSET);
        g.rotation.y = s.lyaw;
        this.root.add(g);
        this.bySeat.set(s.id, g);
      }
      tagInteract(g, { interact: 'note', lines: [p.line] });
    }
  }

  /** 지금 누가 앉아 있는 자리의 흔적은 숨겨요 */
  hideSeats(taken: ReadonlySet<string>) {
    for (const [id, g] of this.bySeat) g.visible = !taken.has(id);
  }

  clear() {
    for (const [id, g] of this.bySeat) this.remove(id, g);
  }

  private remove(id: string, g: THREE.Group) {
    this.root.remove(g);
    // 재질은 모든 컵이 같이 써서(hitMat은 장소들도 써요) 도형만 정리해요. 불빛(Sprite)의 도형은 three가 같이 쓰는 거라 두어요
    g.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry.dispose();
    });
    this.bySeat.delete(id);
  }
}
