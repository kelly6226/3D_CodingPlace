import type * as THREE from 'three';
import type { PlaceId } from '../../config';
import type { PlaceLayout } from '../layout';
import type { GitLogScreen } from '../textures';

import type { Ambience } from '../../audio';

export type { Ambience };

export interface PlaceEnv {
  background: () => THREE.Color | THREE.Texture;
  fog?: { color: string; near: number; far: number };
  hemi: { sky: string; ground: string; intensity: number };
  /** 그림자를 만드는 주 조명 (창밖 도시 불빛, 천장 조명 등) */
  sun: { color: string; intensity: number; pos: [number, number, number] };
  exposure: number;
}

export interface PlaceBuild {
  root: THREE.Group;
  floor: THREE.Object3D;
  clickables: THREE.Object3D[];
  seatHits: THREE.Object3D[];
  gitlog: GitLogScreen;
  update(dt: number, cam: THREE.Camera): void;
  alarm(sec: number): void;
  /** 오리·고양이 들썩이기 */
  poke(key: string): void;
  readonly alarming: boolean;
}

export interface PlaceDef {
  id: PlaceId;
  layout: PlaceLayout;
  env: PlaceEnv;
  ambience: Ambience;
  /** 캔버스에 그리는 한글 (웹폰트 미리 받기용) */
  canvasText: string;
  build(scene: THREE.Scene, mobile: boolean): PlaceBuild;
}
