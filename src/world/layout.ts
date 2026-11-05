// 지금 열려 있는 장소의 배치도 (단위: m)
// 장소가 바뀌면 useLayout()으로 통째로 갈아끼워요. ES 모듈 live binding이라
// SEATS, SPOTS 등을 import한 쪽에서도 바뀐 값이 그대로 보여요.

export type SeatKind = 'stool' | 'chair' | 'beanbag' | 'stand' | 'floor' | 'bed';

export interface Seat {
  id: string;
  kind: SeatKind;
  label: string;
  /** 앉는 위치 */
  x: number;
  z: number;
  /** 바라보는 방향 (rotation.y) */
  yaw: number;
  /** 엉덩이 높이 (서서 쓰는 자리는 0) */
  h: number;
  /** 자리까지 걸어가는 지점 */
  ax: number;
  az: number;
  /** 노트북 위치와 방향 */
  lx: number;
  ly: number;
  lz: number;
  lyaw: number;
}

export interface Box {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

export interface Spot {
  x: number;
  z: number;
  yaw?: number;
}

export interface RoomBounds {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  wallH: number;
}

export interface PlaceLayout {
  room: RoomBounds;
  spawn: Spot;
  seats: Seat[];
  obstacles: Box[];
  spots: {
    /** 커피·컵라면·피자 같은 걸 먹으러 가는 곳 */
    use: Spot;
    /** 배포 버튼 앞 */
    deploy: Spot;
    /** 오리나 고양이 옆 (봇이 상담하러 감) */
    pet: Spot;
    /** 자리가 다 찼을 때 서 있을 곳 */
    idle: Spot;
  };
}

export let ROOM: RoomBounds = { x0: -7, x1: 7, z0: -5, z1: 5, wallH: 3.2 };
export let SPAWN: Spot = { x: 0, z: 0 };
export let SEATS: Seat[] = [];
export let OBSTACLES: Box[] = [];
export let SPOTS: PlaceLayout['spots'] = {
  use: { x: 0, z: 0 },
  deploy: { x: 0, z: 0 },
  pet: { x: 0, z: 0 },
  idle: { x: 0, z: 0 },
};

export function useLayout(l: PlaceLayout) {
  ROOM = l.room;
  SPAWN = l.spawn;
  SEATS = l.seats;
  OBSTACLES = l.obstacles;
  SPOTS = l.spots;
}

export const seatById = (id: string | null | undefined) => (id ? SEATS.find((s) => s.id === id) : undefined);

// ── 배치도를 쓰기 편하게 해주는 도우미 ─────────────────

/** 자리 한 개. 노트북은 바라보는 쪽으로 dist만큼 앞에 놓임 */
export function seat(
  id: string,
  kind: SeatKind,
  label: string,
  x: number,
  z: number,
  yaw: number,
  opts: { h?: number; back?: number; dist?: number; ly?: number; ax?: number; az?: number } = {},
): Seat {
  const h = opts.h ?? (kind === 'chair' ? 0.45 : kind === 'stool' ? 0.72 : kind === 'beanbag' ? 0.3 : kind === 'floor' ? 0.1 : kind === 'bed' ? 0.52 : 0);
  const fx = Math.sin(yaw);
  const fz = Math.cos(yaw);
  const back = opts.back ?? 0.6;
  const dist = opts.dist ?? 0.5;
  return {
    id,
    kind,
    label,
    x,
    z,
    yaw,
    h,
    ax: opts.ax ?? x - fx * back,
    az: opts.az ?? z - fz * back,
    lx: x + fx * dist,
    ly: opts.ly ?? 0.75,
    lz: z + fz * dist,
    lyaw: yaw + Math.PI,
  };
}

export const FACE = { N: Math.PI, S: 0, E: Math.PI / 2, W: -Math.PI / 2 } as const;

/** 앉는 가구(의자·빈백 등)를 걸을 수 없는 곳으로 */
export function seatObstacles(seats: Seat[]): Box[] {
  return seats
    .filter((s) => s.kind !== 'stand')
    .map((s) => {
      const r = s.kind === 'beanbag' ? 0.38 : s.kind === 'bed' ? 0 : 0.22;
      return { x0: s.x - r, x1: s.x + r, z0: s.z - r, z1: s.z + r };
    })
    .filter((b) => b.x1 > b.x0);
}

export const boxAt = (x: number, z: number, w: number, d: number): Box => ({ x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2 });
