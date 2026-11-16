// 커밋 미로: 미로를 돌며 커밋(잔디 칸)을 다 먹어요. 회의·질문·장애 알림에 붙잡히면 목숨이 하나 줄어요.
// 커피를 마시면 잠깐 동안 그 셋이 잠들어서 거꾸로 잡을 수 있어요. 나는 내 아바타와 같은 색 후드티를 입어요.
import { sound } from '../../audio';
import { C, FloatTexts, TOP_BAR_H, buzz, drawLabel, drawTopBar, isWithin, lifeText, pickOne } from '../draw';
import { drawSprite, type SpriteName } from '../sprites';
import { STAGE_H, STAGE_W, type Direction, type GameModule, type GameRound, type RoundOptions } from '../types';

// # 벽, . 커밋, o 커피, E 방해꾼 출발점, P 내 출발점 (좌우 대칭)
const MAP = [
  '###############',
  '#o...........o#',
  '#.###.###.###.#',
  '#.............#',
  '#.##.#####.##.#',
  '#....#...#....#',
  '####.#.#.#.####',
  '#......E......#',
  '#.##.##.##.##.#',
  '#.............#',
  '#.##.#.#.#.##.#',
  '#....#.#.#....#',
  '####.#...#.####',
  '#......P......#',
  '#.###.###.###.#',
  '#o..#.....#..o#',
  '#......#......#',
  '###############',
] as const;

const COLS = MAP[0].length;
const ROWS = MAP.length;
const TILE = STAGE_W / COLS;
const MAZE_TOP = TOP_BAR_H + 4;

const LIVES = 3;
/** 칸/초 */
const PLAYER_SPEED = 5.2;
const ENEMY_SPEED = 3.9;
const SCARED_SPEED = 2.4;
/** 단계를 깰 때마다 방해꾼이 이만큼씩 빨라지고, MAX배에서 멈춰요 */
const LEVEL_SPEEDUP = 1.08;
const LEVEL_SPEEDUP_MAX = 1.5;

const COFFEE_SEC = 6;
/** 커피가 이만큼 남으면 깜빡여서 곧 깨어난다고 알려요 */
const COFFEE_WARN_SEC = 1.5;
/** 붙잡힌 뒤 다시 시작하기까지, 잡힌 방해꾼이 다시 나오기까지 (초) */
const CAUGHT_PAUSE_SEC = 1.2;
const ENEMY_RESPAWN_SEC = 2.5;
/** 첫 방해꾼이 나오기까지, 그 뒤로 하나씩 나오는 간격 (초) */
const ENEMY_FIRST_RELEASE_SEC = 2;
const ENEMY_RELEASE_GAP_SEC = 2;
/** 이 거리(칸)보다 가까우면 부딪힌 걸로 쳐요 */
const TOUCH_TILES = 0.6;

const WALL_COLOR = '#222a42';
const WALL_EDGE = '#3a4668';
const WALL_EDGE_PX = 2;

const POINTS = { commit: 1, coffee: 5, enemy: 20, level: 50 } as const;

const ENEMIES: readonly { sprite: SpriteName; name: string; chaseRate: number }[] = [
  { sprite: 'meeting', name: '회의', chaseRate: 0.8 },
  { sprite: 'question', name: '질문 있어요', chaseRate: 0.55 },
  { sprite: 'alert', name: '장애 알림', chaseRate: 0.35 },
];
const SPRITE_SIZE = TILE * 1.1;
const CAUGHT_BUZZ_MS = 150;

const STEP: Record<Direction, { dc: number; dr: number }> = {
  up: { dc: 0, dr: -1 },
  down: { dc: 0, dr: 1 },
  left: { dc: -1, dr: 0 },
  right: { dc: 1, dr: 0 },
};
const OPPOSITE: Record<Direction, Direction> = { up: 'down', down: 'up', left: 'right', right: 'left' };
const DIRECTIONS = Object.keys(STEP) as Direction[];

interface Tile {
  c: number;
  r: number;
}

/** 칸 사이를 움직이는 것: 지금 칸(c, r)에서 다음 칸(nc, nr)으로 p(0~1)만큼 갔어요. 멈춰 있으면 다음 칸 = 지금 칸 */
interface Mover extends Tile {
  nc: number;
  nr: number;
  p: number;
  dir: Direction | null;
}

interface Enemy {
  kind: (typeof ENEMIES)[number];
  body: Mover;
  /** 아직 출발 전이거나 잡혀서 쉬는 시간 (초) */
  waitSec: number;
  /** 이번 커피에 잠든 상태인지 (잡혀서 다시 나오면 깨어 있어요) */
  asleep: boolean;
}

function findTile(ch: string): Tile {
  const r = MAP.findIndex((row) => row.includes(ch));
  return { c: MAP[r].indexOf(ch), r };
}

const PLAYER_HOME = findTile('P');
const ENEMY_HOME = findTile('E');

const isOpen = (c: number, r: number) => 0 <= r && r < ROWS && 0 <= c && c < COLS && MAP[r][c] !== '#';
const canGo = (t: Tile, dir: Direction) => isOpen(t.c + STEP[dir].dc, t.r + STEP[dir].dr);
const key = (c: number, r: number) => r * COLS + c;

function moverAt(t: Tile): Mover {
  return { c: t.c, r: t.r, nc: t.c, nr: t.r, p: 0, dir: null };
}

const isMoving = (m: Mover) => m.nc !== m.c || m.nr !== m.r;

function startToward(m: Mover, dir: Direction) {
  m.dir = dir;
  m.nc = m.c + STEP[dir].dc;
  m.nr = m.r + STEP[dir].dr;
  m.p = 0;
}

function stop(m: Mover) {
  m.nc = m.c;
  m.nr = m.r;
  m.p = 0;
}

/** 화면 좌표 (칸 가운데) */
function pixelOf(m: Mover) {
  const c = m.c + (m.nc - m.c) * m.p;
  const r = m.r + (m.nr - m.r) * m.p;
  return { x: (c + 0.5) * TILE, y: MAZE_TOP + (r + 0.5) * TILE };
}

/** 칸 수만큼 움직이고, 새 칸에 닿을 때마다 onArrive가 다음 방향을 정해요 (null이면 멈춤) */
function advance(m: Mover, tiles: number, onArrive: (m: Mover) => Direction | null) {
  if (!isMoving(m)) return;
  m.p += tiles;
  while (m.p >= 1) {
    const rest = m.p - 1;
    m.c = m.nc;
    m.r = m.nr;
    const next = onArrive(m);
    if (!next) {
      stop(m);
      return;
    }
    startToward(m, next);
    m.p = rest;
  }
}

function freshCommits(): Map<number, 'commit' | 'coffee'> {
  const items = new Map<number, 'commit' | 'coffee'>();
  MAP.forEach((row, r) =>
    [...row].forEach((ch, c) => {
      if (ch === '.') items.set(key(c, r), 'commit');
      if (ch === 'o') items.set(key(c, r), 'coffee');
    }),
  );
  return items;
}

function createCommitMaze({ playerColor }: RoundOptions): GameRound {
  const outfit = { a: playerColor };
  const floats = new FloatTexts();
  let items = freshCommits();
  let player = moverAt(PLAYER_HOME);
  let want: Direction | null = null;
  let enemies: Enemy[] = [];
  let score = 0;
  let lives = LIVES;
  let level = 1;
  let coffeeLeft = 0;
  /** 이번 커피로 잡은 수 (잡을수록 점수가 커져요) */
  let coffeeCatches = 0;
  let pauseSec = 0;
  let clock = 0;

  function resetPositions() {
    player = moverAt(PLAYER_HOME);
    want = null;
    coffeeLeft = 0;
    enemies = ENEMIES.map((kind, i) => ({ kind, body: moverAt(ENEMY_HOME), waitSec: ENEMY_FIRST_RELEASE_SEC + i * ENEMY_RELEASE_GAP_SEC, asleep: false }));
  }
  resetPositions();

  /** 커피 효과가 남아 있는 동안, 이번 커피에 잠든 방해꾼만 잡을 수 있어요 */
  const isScared = (enemy: Enemy) => enemy.asleep && coffeeLeft > 0;
  const enemySpeed = () => ENEMY_SPEED * Math.min(LEVEL_SPEEDUP_MAX, LEVEL_SPEEDUP ** (level - 1));

  function eatAt(t: Tile) {
    const item = items.get(key(t.c, t.r));
    if (!item) return;
    items.delete(key(t.c, t.r));
    score += POINTS[item];
    if (item === 'coffee') {
      coffeeLeft = COFFEE_SEC;
      coffeeCatches = 0;
      for (const e of enemies) e.asleep = true;
      sound.pop();
    }
    if (items.size === 0) clearLevel();
  }

  function clearLevel() {
    level += 1;
    score += POINTS.level;
    floats.add(`+${POINTS.level} 레벨 ${level}`, STAGE_W / 2, MAZE_TOP + 7.5 * TILE, C.mint);
    sound.chime();
    items = freshCommits();
    resetPositions();
    pauseSec = CAUGHT_PAUSE_SEC;
  }

  /** 내가 칸에 닿았을 때: 먹고, 누른 방향으로 꺾을 수 있으면 꺾고, 아니면 가던 대로 */
  function playerNext(m: Mover): Direction | null {
    eatAt(m);
    if (want && canGo(m, want)) return want;
    if (m.dir && canGo(m, m.dir)) return m.dir;
    return null;
  }

  function steer(dir: Direction) {
    want = dir;
    if (!isMoving(player)) {
      if (canGo(player, dir)) startToward(player, dir);
      return;
    }
    // 가던 길을 되돌아가는 건 칸 가운데까지 기다리지 않고 바로
    if (player.dir && dir === OPPOSITE[player.dir]) {
      [player.c, player.nc] = [player.nc, player.c];
      [player.r, player.nr] = [player.nr, player.r];
      player.p = 1 - player.p;
      player.dir = dir;
    }
  }

  function enemyNext(enemy: Enemy): (m: Mover) => Direction | null {
    return (m) => {
      const options = DIRECTIONS.filter((d) => canGo(m, d) && (!m.dir || d !== OPPOSITE[m.dir]));
      const choices = options.length > 0 ? options : DIRECTIONS.filter((d) => canGo(m, d));
      if (Math.random() >= enemy.kind.chaseRate) return pickOne(choices);
      const scared = isScared(enemy);
      const distAfter = (d: Direction) => Math.hypot(m.c + STEP[d].dc - player.c, m.r + STEP[d].dr - player.r);
      const sorted = [...choices].sort((a, b) => distAfter(a) - distAfter(b));
      return scared ? sorted[sorted.length - 1] : sorted[0];
    };
  }

  function updateEnemy(enemy: Enemy, dt: number) {
    if (enemy.waitSec > 0) {
      enemy.waitSec -= dt;
      return;
    }
    const choose = enemyNext(enemy);
    if (!isMoving(enemy.body)) {
      const first = choose(enemy.body);
      if (first) startToward(enemy.body, first);
    }
    const scared = isScared(enemy);
    advance(enemy.body, (scared ? SCARED_SPEED : enemySpeed()) * dt, choose);
  }

  function checkTouch() {
    const me = pixelOf(player);
    for (const enemy of enemies) {
      if (enemy.waitSec > 0) continue;
      const at = pixelOf(enemy.body);
      if (!isWithin(me.x, me.y, at.x, at.y, TILE * TOUCH_TILES)) continue;
      if (isScared(enemy)) {
        coffeeCatches += 1;
        const points = POINTS.enemy * coffeeCatches;
        score += points;
        floats.add(`+${points} ${enemy.kind.name} 취소`, at.x, at.y - 16, C.amber);
        sound.pop();
        enemy.body = moverAt(ENEMY_HOME);
        enemy.waitSec = ENEMY_RESPAWN_SEC;
        enemy.asleep = false;
        continue;
      }
      lives -= 1;
      floats.add(`${enemy.kind.name}에 붙잡힘`, me.x, me.y - 16, C.danger);
      sound.quack();
      buzz(CAUGHT_BUZZ_MS);
      pauseSec = CAUGHT_PAUSE_SEC;
      if (lives > 0) resetPositions();
      return;
    }
  }

  function drawMaze(g: CanvasRenderingContext2D) {
    MAP.forEach((row, r) =>
      [...row].forEach((ch, c) => {
        if (ch !== '#') return;
        const x = c * TILE;
        const y = MAZE_TOP + r * TILE;
        g.fillStyle = WALL_COLOR;
        g.fillRect(x, y, TILE, TILE);
        // 통로와 맞닿은 쪽에 밝은 선을 그어 벽 모양이 보이게
        g.fillStyle = WALL_EDGE;
        if (isOpen(c, r - 1)) g.fillRect(x, y, TILE, WALL_EDGE_PX);
        if (isOpen(c, r + 1)) g.fillRect(x, y + TILE - WALL_EDGE_PX, TILE, WALL_EDGE_PX);
        if (isOpen(c - 1, r)) g.fillRect(x, y, WALL_EDGE_PX, TILE);
        if (isOpen(c + 1, r)) g.fillRect(x + TILE - WALL_EDGE_PX, y, WALL_EDGE_PX, TILE);
      }),
    );
    const commitSize = TILE * 0.22;
    for (const [k, item] of items) {
      const x = ((k % COLS) + 0.5) * TILE;
      const y = MAZE_TOP + (Math.floor(k / COLS) + 0.5) * TILE;
      if (item === 'coffee') {
        drawSprite(g, 'coffee', x, y, TILE * (0.95 + Math.sin(clock * 6) * 0.08));
        continue;
      }
      g.fillStyle = C.grass;
      g.fillRect(x - commitSize / 2, y - commitSize / 2, commitSize, commitSize);
    }
  }

  function drawEnemy(g: CanvasRenderingContext2D, enemy: Enemy) {
    const at = pixelOf(enemy.body);
    const scared = isScared(enemy);
    const blink = scared && coffeeLeft < COFFEE_WARN_SEC && Math.floor(clock * 8) % 2 === 0;
    g.globalAlpha = enemy.waitSec > 0 ? 0.35 : 1;
    drawSprite(g, enemy.kind.sprite, at.x, at.y, SPRITE_SIZE, { asleep: scared && !blink });
    if (scared) drawLabel(g, 'z', at.x + TILE * 0.45, at.y - TILE * 0.45, { size: 11, color: C.fg, weight: 800, mono: true });
    g.globalAlpha = 1;
  }

  return {
    update(dt) {
      clock += dt;
      floats.update(dt);
      if (pauseSec > 0) {
        pauseSec -= dt;
        return;
      }
      coffeeLeft = Math.max(0, coffeeLeft - dt);
      if (!isMoving(player) && want && canGo(player, want)) startToward(player, want);
      advance(player, PLAYER_SPEED * dt, playerNext);
      for (const enemy of enemies) updateEnemy(enemy, dt);
      checkTouch();
    },

    draw(g) {
      g.fillStyle = C.bg;
      g.fillRect(0, 0, STAGE_W, STAGE_H);
      drawMaze(g);
      for (const enemy of enemies) drawEnemy(g, enemy);
      const me = pixelOf(player);
      drawSprite(g, 'me', me.x, me.y, SPRITE_SIZE, { recolor: outfit, flipX: player.dir === 'left' });
      floats.draw(g);
      drawTopBar(g, `Lv.${level}  ${score}점`, { text: lifeText(lives, LIVES), color: C.danger });
    },

    /** 누른 곳이 내 캐릭터에서 어느 쪽인지로 방향을 정해요 */
    tap(x, y) {
      const me = pixelOf(player);
      const dx = x - me.x;
      const dy = y - me.y;
      if (Math.abs(dx) > Math.abs(dy)) steer(dx > 0 ? 'right' : 'left');
      else steer(dy > 0 ? 'down' : 'up');
    },

    press() {
      /* 방향만 받는 게임이에요 */
    },

    steer,

    result() {
      return lives <= 0 && pauseSec <= 0 ? score : null;
    },
  };
}

export const commitMaze: GameModule = {
  intro: {
    title: '커밋 미로',
    rules: [
      { icon: 'me', text: '초록 커밋을 다 모으면 다음 레벨' },
      { icon: 'alert', text: '회의·질문·장애 알림에 닿으면 ♥ −1' },
      { icon: 'coffee', text: `커피를 마시면 ${COFFEE_SEC}초 동안 거꾸로 잡아요` },
    ],
    controls: { touch: '가고 싶은 쪽을 누르거나 쓸어요', keys: '방향키나 WASD' },
  },
  create: createCommitMaze,
};
