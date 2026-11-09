// 같이 움직이는 작은 부품들을 한 덩어리로 합쳐서 그리기 횟수를 줄여요.
//
// 캐릭터 하나가 다리·신발·후드끈·머리카락처럼 작은 메시 30여 개라서, 8명이면 그리기 호출이 300번 가까이 돼요.
// 같은 묶음(예: 다리 + 신발) 안에서 움직이지 않는 메시들을 재질 종류별로 하나로 합치고,
// 색은 꼭짓점 색으로 옮겨서 겉모습은 그대로 둬요. 원본은 숨겨 두고(raycast·되돌리기용) 합친 것만 그려요.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** 금속감 없는 불투명 재질은 색만 꼭짓점으로 옮기고 이 재질 하나로 그려요 (거칠기는 캐릭터 재질들의 가운데 값) */
const PLAIN_LIT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 });
/** 빛을 안 받는 불투명 단색 재질 */
const PLAIN_FLAT = new THREE.MeshBasicMaterial({ vertexColors: true });

export interface Baked {
  /** 합친 메시를 빼고 원본을 다시 보이게 해요 (색·옷이 바뀌어 다시 합칠 때) */
  undo(): void;
}

/** 원본 재질을 어느 묶음으로 합칠지. 금속·투명·텍스처가 있는 재질은 그 재질 그대로 같은 것끼리만 */
function bucketOf(m: THREE.Material): { key: string; material: THREE.Material; vertexColor: boolean } {
  if (m instanceof THREE.MeshStandardMaterial && m.metalness === 0 && !m.transparent && !m.map && !m.emissiveMap) {
    return { key: 'lit', material: PLAIN_LIT, vertexColor: true };
  }
  if (m instanceof THREE.MeshBasicMaterial && !m.transparent && !m.map) {
    return { key: 'flat', material: PLAIN_FLAT, vertexColor: true };
  }
  return { key: m.uuid, material: m, vertexColor: false };
}

/** 위치·법선만 남긴 비색인 지오메트리로 (서로 다른 모양을 합칠 수 있게) */
function plainGeometry(src: THREE.BufferGeometry, matrix: THREE.Matrix4, color: THREE.Color | null) {
  const g = src.index ? src.toNonIndexed() : src.clone();
  for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
  g.applyMatrix4(matrix);
  if (color) {
    const n = g.attributes.position.count;
    const rgb = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) rgb.set([color.r, color.g, color.b], i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(rgb, 3));
  }
  return g;
}

/**
 * root 아래에서 보이는 메시를 재질 묶음별로 합쳐 root에 붙여요.
 * stop(o)가 true인 곳(따로 움직이는 부품, 깜빡이는 눈 등)은 그 아래로 내려가지 않고 그대로 둬요.
 * 같은 묶음에 메시가 하나뿐이면 합칠 이유가 없어서 그대로 둬요.
 */
export function bakeStatic(root: THREE.Object3D, stop: (o: THREE.Object3D) => boolean, userData: Record<string, unknown> = {}): Baked {
  root.updateMatrixWorld(true);
  const toRoot = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const groups = new Map<string, { material: THREE.Material; vertexColor: boolean; meshes: THREE.Mesh[] }>();

  const visit = (o: THREE.Object3D) => {
    for (const child of o.children) {
      if (!child.visible || stop(child)) continue;
      const mesh = child as THREE.Mesh;
      if (mesh.isMesh && !Array.isArray(mesh.material)) {
        const b = bucketOf(mesh.material);
        const g = groups.get(b.key) ?? { material: b.material, vertexColor: b.vertexColor, meshes: [] };
        g.meshes.push(mesh);
        groups.set(b.key, g);
      }
      visit(child);
    }
  };
  visit(root);

  const made: THREE.Mesh[] = [];
  const hidden: THREE.Mesh[] = [];
  for (const { material, vertexColor, meshes } of groups.values()) {
    if (meshes.length < 2) continue;
    const parts = meshes.map((m) => {
      const matrix = new THREE.Matrix4().multiplyMatrices(toRoot, m.matrixWorld);
      const color = vertexColor ? (m.material as THREE.MeshStandardMaterial | THREE.MeshBasicMaterial).color : null;
      return plainGeometry(m.geometry, matrix, color);
    });
    const merged = mergeGeometries(parts);
    for (const p of parts) p.dispose();
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, material);
    mesh.castShadow = meshes.some((m) => m.castShadow);
    mesh.receiveShadow = meshes.some((m) => m.receiveShadow);
    mesh.userData = { ...userData, baked: true };
    root.add(mesh);
    made.push(mesh);
    for (const m of meshes) {
      m.visible = false;
      hidden.push(m);
    }
  }

  return {
    undo() {
      for (const m of made) {
        m.removeFromParent();
        m.geometry.dispose();
      }
      for (const m of hidden) m.visible = true;
    },
  };
}
