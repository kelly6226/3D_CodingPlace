// 카페 배치도 (단위: m). 3D 코드가 없어서 봇 시뮬레이션에서도 그대로 씀.
// 방: x -7~7, z -5~5. 뒤쪽(z=-5)이 판교 야경이 보이는 통창.

export type SeatKind = 'stool' | 'chair' | 'beanbag' | 'stand';

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

export const ROOM = { x0: -7, x1: 7, z0: -5, z1: 5, wallH: 3.2 };

export const SPAWN = { x: 6.3, z: 0.3 };

const seats: Seat[] = [];

// 1) 통창 바 자리: 창밖 판교를 보면서
[-4.4, -2.2, 0, 2.2, 4.4].forEach((x, i) => {
  seats.push({
    id: `bar-${i + 1}`,
    kind: 'stool',
    label: '창가 바 자리',
    x,
    z: -3.95,
    yaw: Math.PI,
    h: 0.72,
    ax: x,
    az: -3.35,
    lx: x,
    ly: 1.05,
    lz: -4.42,
    lyaw: 0,
  });
});

// 2) 가운데 긴 테이블 (모각코 메인)
const TABLE = { x0: -3.2, x1: 3.2, z0: -1.9, z1: -0.9, h: 0.75 };
[-2.4, -0.8, 0.8, 2.4].forEach((x, i) => {
  seats.push({
    id: `table-n${i + 1}`,
    kind: 'chair',
    label: '긴 테이블',
    x,
    z: -2.25,
    yaw: 0,
    h: 0.45,
    ax: x,
    az: -2.85,
    lx: x,
    ly: TABLE.h,
    lz: -1.72,
    lyaw: Math.PI,
  });
  seats.push({
    id: `table-s${i + 1}`,
    kind: 'chair',
    label: '긴 테이블',
    x,
    z: -0.55,
    yaw: Math.PI,
    h: 0.45,
    ax: x,
    az: 0.05,
    lx: x,
    ly: TABLE.h,
    lz: -1.08,
    lyaw: 0,
  });
});

// 3) 빈백 소파 코너 (git log TV 앞)
export const LOW_TABLE = { x: -4.9, z: 2.9, r: 0.5, h: 0.42 };
[
  [-5.9, 3.3],
  [-4.05, 3.65],
  [-4.9, 1.85],
].forEach(([x, z], i) => {
  const dx = x - LOW_TABLE.x;
  const dz = z - LOW_TABLE.z;
  const len = Math.hypot(dx, dz);
  const ux = dx / len;
  const uz = dz / len;
  const yaw = Math.atan2(-ux, -uz);
  seats.push({
    id: `beanbag-${i + 1}`,
    kind: 'beanbag',
    label: '빈백 소파',
    x,
    z,
    yaw,
    h: 0.3,
    ax: x + ux * 0.72,
    az: z + uz * 0.72,
    lx: LOW_TABLE.x + ux * 0.24,
    ly: LOW_TABLE.h,
    lz: LOW_TABLE.z + uz * 0.24,
    lyaw: yaw + Math.PI,
  });
});

// 4) 스탠딩 데스크 (허리 디스크 예방)
export const STAND_DESKS = [2.1, 3.7];
STAND_DESKS.forEach((z, i) => {
  seats.push({
    id: `stand-${i + 1}`,
    kind: 'stand',
    label: '스탠딩 데스크',
    x: 5.72,
    z,
    yaw: Math.PI / 2,
    h: 0,
    ax: 5.55,
    az: z,
    lx: 6.3,
    ly: 0.72,
    lz: z,
    lyaw: -Math.PI / 2,
  });
});

export const SEATS = seats;
export const seatById = (id: string | null | undefined) => (id ? SEATS.find((s) => s.id === id) : undefined);

export const SPOTS = {
  coffee: { x: -5.7, z: -1.0, yaw: -Math.PI / 2 },
  deploy: { x: 3.3, z: 2.75, yaw: 0 },
  duck: { x: -1.8, z: 3.7 },
  deployButton: { x: 3.3, z: 3.4 },
  rack: { x: 6.55, z: -4.5 },
  whiteboard: { x: 5.65, z: -1.6, yaw: -0.2 },
};

export { TABLE };

/** 걸어 다닐 수 없는 곳 (가구) */
export const OBSTACLES: Box[] = [
  // 바 카운터
  { x0: -5.6, x1: 5.6, z0: -4.75, z1: -4.2 },
  // 긴 테이블
  { x0: TABLE.x0, x1: TABLE.x1, z0: TABLE.z0, z1: TABLE.z1 },
  // 커피 카운터
  { x0: -7, x1: -6.15, z0: -2.7, z1: 0.7 },
  // 책장
  { x0: -7, x1: -6.55, z0: -4.9, z1: -3.3 },
  // 빈백 테이블
  { x0: LOW_TABLE.x - 0.45, x1: LOW_TABLE.x + 0.45, z0: LOW_TABLE.z - 0.45, z1: LOW_TABLE.z + 0.45 },
  // 스탠딩 데스크
  ...STAND_DESKS.map((z) => ({ x0: 6.2, x1: 6.95, z0: z - 0.5, z1: z + 0.5 })),
  // 화이트보드
  { x0: 4.6, x1: 6.7, z0: -1.95, z1: -1.25 },
  // 서버랙
  { x0: 6.15, x1: 6.95, z0: -4.95, z1: -4.05 },
  // 배포 버튼
  { x0: 2.95, x1: 3.65, z0: 3.05, z1: 3.75 },
  // 거대 오리
  { x0: -2.3, x1: -1.3, z0: 3.2, z1: 4.2 },
  // 화분들
  ...[
    [6.5, -3.5],
    [-6.5, 4.5],
    [6.5, 4.6],
    [0.7, 4.55],
  ].map(([x, z]) => ({ x0: x - 0.3, x1: x + 0.3, z0: z - 0.3, z1: z + 0.3 })),
  // 스탠드 조명
  { x0: -6.55, x1: -6.05, z0: 1.45, z1: 1.95 },
  // 의자·스툴·빈백 (앉을 땐 걸어가는 지점에서 미끄러지듯 앉음)
  ...seats
    .filter((s) => s.kind !== 'stand')
    .map((s) => {
      const r = s.kind === 'beanbag' ? 0.38 : 0.22;
      return { x0: s.x - r, x1: s.x + r, z0: s.z - r, z1: s.z + r };
    }),
];
