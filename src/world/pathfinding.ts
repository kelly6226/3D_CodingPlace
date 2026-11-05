// 격자 A* 길찾기. 방이 작아서 0.2m 칸이면 충분해요.
import { OBSTACLES, ROOM } from './layout';

const CELL = 0.2;
const MARGIN = 0.22; // 아바타 반지름
const W = Math.round((ROOM.x1 - ROOM.x0) / CELL);
const H = Math.round((ROOM.z1 - ROOM.z0) / CELL);
const blocked = new Uint8Array(W * H);

const cx = (x: number) => Math.min(W - 1, Math.max(0, Math.floor((x - ROOM.x0) / CELL)));
const cz = (z: number) => Math.min(H - 1, Math.max(0, Math.floor((z - ROOM.z0) / CELL)));
const wx = (i: number) => ROOM.x0 + (i + 0.5) * CELL;
const wz = (j: number) => ROOM.z0 + (j + 0.5) * CELL;

(function build() {
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      const x = wx(i);
      const z = wz(j);
      let b = x < ROOM.x0 + 0.25 || x > ROOM.x1 - 0.25 || z < ROOM.z0 + 0.25 || z > ROOM.z1 - 0.25;
      if (!b) {
        for (const o of OBSTACLES) {
          if (x > o.x0 - MARGIN && x < o.x1 + MARGIN && z > o.z0 - MARGIN && z < o.z1 + MARGIN) {
            b = true;
            break;
          }
        }
      }
      blocked[j * W + i] = b ? 1 : 0;
    }
  }
})();

export function isWalkable(x: number, z: number): boolean {
  if (x < ROOM.x0 || x > ROOM.x1 || z < ROOM.z0 || z > ROOM.z1) return false;
  return !blocked[cz(z) * W + cx(x)];
}

/** 막힌 곳을 눌렀으면 가장 가까운 걸을 수 있는 칸으로 */
export function nearestWalkable(x: number, z: number): [number, number] {
  const i0 = cx(x);
  const j0 = cz(z);
  if (!blocked[j0 * W + i0]) return [x, z];
  for (let r = 1; r < 25; r++) {
    let best: [number, number] | null = null;
    let bestD = Infinity;
    for (let dj = -r; dj <= r; dj++) {
      for (let di = -r; di <= r; di++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
        const i = i0 + di;
        const j = j0 + dj;
        if (i < 0 || j < 0 || i >= W || j >= H || blocked[j * W + i]) continue;
        const d = (wx(i) - x) ** 2 + (wz(j) - z) ** 2;
        if (d < bestD) {
          bestD = d;
          best = [wx(i), wz(j)];
        }
      }
    }
    if (best) return best;
  }
  return [x, z];
}

function lineClear(x0: number, z0: number, x1: number, z1: number): boolean {
  const d = Math.hypot(x1 - x0, z1 - z0);
  const steps = Math.ceil(d / (CELL * 0.5));
  for (let s = 1; s < steps; s++) {
    const t = s / steps;
    if (!isWalkable(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t)) return false;
  }
  return true;
}

/** 시작점에서 목표까지 거쳐 갈 점들 (시작점 제외, 목표 포함) */
export function findPath(sx: number, sz: number, tx: number, tz: number): [number, number][] {
  [tx, tz] = nearestWalkable(tx, tz);
  if (lineClear(sx, sz, tx, tz)) return [[tx, tz]];

  let [ssx, ssz] = [sx, sz];
  if (!isWalkable(sx, sz)) [ssx, ssz] = nearestWalkable(sx, sz);
  const start = cz(ssz) * W + cx(ssx);
  const goal = cz(tz) * W + cx(tx);

  const g = new Float32Array(W * H).fill(Infinity);
  const f = new Float32Array(W * H).fill(Infinity);
  const from = new Int32Array(W * H).fill(-1);
  const closed = new Uint8Array(W * H);
  const open: number[] = [start];
  const gi = goal % W;
  const gj = Math.floor(goal / W);
  const hfn = (n: number) => {
    const di = Math.abs((n % W) - gi);
    const dj = Math.abs(Math.floor(n / W) - gj);
    return Math.max(di, dj) + 0.414 * Math.min(di, dj);
  };
  g[start] = 0;
  f[start] = hfn(start);

  let found = false;
  let guard = 0;
  while (open.length && guard++ < 20000) {
    // 칸이 3500개라 단순 선형 탐색으로도 충분히 빠름
    let bi = 0;
    for (let k = 1; k < open.length; k++) if (f[open[k]] < f[open[bi]]) bi = k;
    const cur = open[bi];
    open[bi] = open[open.length - 1];
    open.pop();
    if (cur === goal) {
      found = true;
      break;
    }
    if (closed[cur]) continue;
    closed[cur] = 1;
    const ci = cur % W;
    const cj = Math.floor(cur / W);
    for (let dj = -1; dj <= 1; dj++) {
      for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const ni = ci + di;
        const nj = cj + dj;
        if (ni < 0 || nj < 0 || ni >= W || nj >= H) continue;
        const n = nj * W + ni;
        if (blocked[n] || closed[n]) continue;
        // 대각선으로 모서리 뚫고 지나가지 않게
        if (di && dj && (blocked[cj * W + ni] || blocked[nj * W + ci])) continue;
        const cost = g[cur] + (di && dj ? 1.414 : 1);
        if (cost < g[n]) {
          g[n] = cost;
          f[n] = cost + hfn(n);
          from[n] = cur;
          open.push(n);
        }
      }
    }
  }
  if (!found) return [[tx, tz]];

  const cells: [number, number][] = [];
  for (let n = goal; n !== -1 && n !== start; n = from[n]) cells.push([wx(n % W), wz(Math.floor(n / W))]);
  cells.reverse();
  cells[cells.length - 1] = [tx, tz];

  // 시야가 트이는 점은 건너뛰어서 매끈하게
  const out: [number, number][] = [];
  let px = sx;
  let pz = sz;
  let k = 0;
  while (k < cells.length) {
    let far = k;
    for (let m = cells.length - 1; m > k; m--) {
      if (lineClear(px, pz, cells[m][0], cells[m][1])) {
        far = m;
        break;
      }
    }
    out.push(cells[far]);
    [px, pz] = cells[far];
    k = far + 1;
  }
  return out;
}
