// 미니게임 그림: 16×16 도트를 글자 지도로 그려 두고, 처음 쓸 때 작은 캔버스에 한 번 찍어 둔 뒤 늘려서 써요.
// 이미지 파일을 따로 받지 않아서 첫 로딩에 영향이 없고, 색은 PALETTE에서 한 번에 바꿀 수 있어요.

/** 글자 하나 = 색 하나 ('.'은 투명) */
const PALETTE: Record<string, string> = {
  k: '#141826',
  s: '#f2c79b',
  S: '#d49a6a',
  a: '#f2b45a',
  A: '#b9792a',
  m: '#7ee787',
  M: '#2ea043',
  r: '#ff5a52',
  R: '#a8302a',
  w: '#f5f1e8',
  W: '#c9c5bd',
  g: '#a2a6b4',
  G: '#5b6175',
  b: '#58a6ff',
  B: '#2f6fd6',
  h: '#2b2420',
  y: '#ffd866',
  p: '#c792ea',
  P: '#8a5cc2',
  o: '#ff9e3d',
  c: '#9a6a3c',
  C: '#5c3a1a',
  n: '#2a3350',
  N: '#1b2238',
};

const SIZE = 16;

/** 쉬고 있는(잠든) 모습으로 칠할 때 어두운 쪽과 밝은 쪽 색 */
const SLEEP_DARK = [70, 76, 96];
const SLEEP_LIGHT = [176, 180, 196];

const ART = {
  hand: [
    "....kk.kk.......",
    "...kssksskk.....",
    "...kssksskskk...",
    "...kssksskssk...",
    ".kkkssksskssk...",
    "kssksssssssskk..",
    "ksssssssssssssk.",
    ".ksssssssssssk..",
    "..kssssssssssk..",
    "..ksssssssssk...",
    "...kssssssssk...",
    "...kssssssssk...",
    "....kSSSSSSk....",
    "....kaaaaaak....",
    "....kaaaaaak....",
    "....kkkkkkkk....",
  ],
  bug0: [
    "................",
    ".....G....G.....",
    "......G..G......",
    ".....kkkkkk.....",
    "....kmmmmmmk....",
    ".G.kmMmmmmMmk.G.",
    "..GGmmmmmmmmGG..",
    "....kMmmmmmMk...",
    ".GGGmmmmmmmmGGG.",
    "....kmMmmmMmk...",
    "..GGmmmmmmmmGG..",
    ".G..kmmmmmmk..G.",
    ".....kkkkkk.....",
    "................",
    "................",
    "................",
  ],
  bug1: [
    "................",
    ".....G....G.....",
    "......G..G......",
    ".....kkkkkk.....",
    ".G..kmmmmmmk..G.",
    "..GGmMmmmmMmGG..",
    "....kmmmmmmmk...",
    ".GGGGMmmmmmMGGG.",
    "....kmmmmmmmk...",
    "..GGmmMmmmMmGG..",
    ".G..kmmmmmmmk.G.",
    "....kmmmmmmk....",
    ".....kkkkkk.....",
    "................",
    "................",
    "................",
  ],
  prodBug0: [
    "....G......G....",
    ".....G....G.....",
    ".....kkkkkk.....",
    "....kwkrrkwk....",
    "...krrrrrrrrk...",
    ".G.kRrrrrrrRk.G.",
    "..GGrrrRRrrrGG..",
    "....krrrrrrrk...",
    ".GGGRrrrrrrRGGG.",
    "....krrRRrrrk...",
    "..GGrrrrrrrrGG..",
    ".G..kRrrrrrRk.G.",
    ".....kkkkkk.....",
    "................",
    "................",
    "................",
  ],
  prodBug1: [
    "....G......G....",
    ".....G....G.....",
    ".....kkkkkk.....",
    "....kwkrrkwk....",
    ".G.krrrrrrrrk.G.",
    "..GGRrrrrrrRGG..",
    "....krrRRrrrk...",
    ".GGGrrrrrrrrGGG.",
    "....RrrrrrrRk...",
    "..GGrrRRRrrrGG..",
    ".G..krrrrrrrk.G.",
    ".....kkkkkk.....",
    "................",
    "................",
    "................",
    "................",
  ],
  feature0: [
    "................",
    "..kkk......kkk..",
    ".kpbbk....kbbpk.",
    "kbbybbk..kbbybbk",
    "kbbbbbbkkbbbbbbk",
    "kbbbbbbkhkbbbbbk",
    ".kbbbbbkhkbbbbk.",
    "..kkkbbkhkbbkk..",
    "..kppppkhkppppk.",
    "..kpppkkhkkpppk.",
    "...kkk.khk.kkk..",
    ".......kk.......",
    "................",
    "................",
    "................",
    "................",
  ],
  feature1: [
    "................",
    "................",
    "................",
    "...kkk.kk.kkk...",
    "..kbybk.k.kbybk.",
    "..kbbbbkhkbbbbk.",
    "...kbbbkhkbbbk..",
    "...kppkkhkkppk..",
    "....kk.khk.kk...",
    ".......khk......",
    ".......kk.......",
    "................",
    "................",
    "................",
    "................",
    "................",
  ],
  run0: [
    ".....kkkkk......",
    "....khhhhhk.....",
    "....khhhhhhk....",
    "....kskkskhk....",
    "....ksssssk.....",
    ".....kssSk......",
    "....kaaaaak.....",
    "...kaaaaaaak....",
    "..kakaaaaakak...",
    "..ksk.aaaa.ksk..",
    ".....knnnk......",
    "....knnknnk.....",
    "...knnk.knnk....",
    "..kkkk...kk.....",
    ".........kkk....",
    "................",
  ],
  run1: [
    ".....kkkkk......",
    "....khhhhhk.....",
    "....khhhhhhk....",
    "....kskkskhk....",
    "....ksssssk.....",
    ".....kssSk......",
    "....kaaaaak.....",
    "...kaaaaaaaak...",
    "...ksaaaaaksk...",
    ".....kaaaak.....",
    ".....knnnk......",
    ".....knnnk......",
    ".....knknk......",
    "....kkk.kk......",
    "........kkk.....",
    "................",
  ],
  jump: [
    ".....kkkkk......",
    "....khhhhhk.....",
    "....khhhhhhk....",
    "..k.kskkskhk.k..",
    ".ksk.ksssssk.ksk",
    "..kak.kssSk.kak.",
    "...kaakaaakaak..",
    "....kaaaaaaak...",
    ".....kaaaaak....",
    ".....knnnnnk....",
    "....knnk.knnk...",
    "...knnk...knnk..",
    "...kkk.....kkk..",
    "................",
    "................",
    "................",
  ],
  knockedOut: [
    ".....kkkkk......",
    "....khhhhhk.....",
    "....khhhhhhk....",
    "....kkskkskk....",
    "....ksssssk.....",
    ".....ksoSk......",
    "....kaaaaak.....",
    "...kaaaaaaak....",
    "..kakaaaaakak...",
    "..ksk.aaaa.ksk..",
    ".....knnnk......",
    "....knnknnk.....",
    "...knnk.knnk....",
    "...kkk...kkk....",
    "................",
    "................",
  ],
  meeting: [
    "................",
    "...k..k..k..k...",
    "..krkrrkrrkrk...",
    "..krrrrrrrrrk...",
    "..kkkkkkkkkkk...",
    "..kwwwwwwwwwk...",
    "..kwGwGwGwGwk...",
    "..kwwwwwwwwwk...",
    "..kwGwGwrrrwk...",
    "..kwwwwwrrrwk...",
    "..kwGwGwGwGwk...",
    "..kwwwwwwwwwk...",
    "..kkkkkkkkkkk...",
    "................",
    "................",
    "................",
  ],
  mention: [
    "................",
    "..kkkkkkkkkkk...",
    ".kbbbbbbbbbbbk..",
    ".kbbbbbbbbbbbk..",
    ".kbbbbbbbbbbbk..",
    ".kbbwwbwwbwwbk..",
    ".kbbwwbwwbwwbk..",
    ".kbbbbbbbbbbbk..",
    ".kbbbbbbbbbbbk..",
    "..kkbbkkkkkkk...",
    "....kbk.........",
    "....kk..........",
    "................",
    "................",
    "................",
    "................",
  ],
  hotfix: [
    ".......k........",
    "......kok.......",
    "......kook......",
    ".....kooyok.....",
    "....kkoyyook....",
    "...koookyyok.k..",
    "...kooykyyookok.",
    "..koyyyyyyyyook.",
    "..koyyywwyyyook.",
    "..kooyywwwyyok..",
    "...koyywwwyyok..",
    "....kooyyyook...",
    ".....kkkkkkk....",
    "................",
    "................",
    "................",
  ],
  coffee: [
    ".....G..G.......",
    "....G..G........",
    ".....G..G.......",
    "................",
    "..kkkkkkkkk.....",
    "..kwwwwwwwkkk...",
    "..kcccccccwk.k..",
    "..kwwwwwwwwk.k..",
    "..kwwwwwwwwkkk..",
    "..kwwaawwwwk....",
    "...kwwwwwwk.....",
    "....kkkkkk......",
    "..kkkkkkkkkkk...",
    "................",
    "................",
    "................",
  ],
  alert: [
    "................",
    ".......kk.......",
    ".....kkrrkk.....",
    "....krrwwrrk....",
    "...krrwwrrrrk...",
    "...krwwrrrrrk...",
    "...krrrrrrrrk...",
    "...krrrrrrrrk...",
    "..kkkkkkkkkkkk..",
    "..kGGGGGGGGGGk..",
    "..kkkkkkkkkkkk..",
    "................",
    "................",
    "................",
    "................",
    "................",
  ],
  question: [
    ".........kk.....",
    "........kssk....",
    ".....kkkkssk....",
    "....khhhhksk....",
    "....khhhhhsk....",
    "....kskkskak....",
    "....ksssssak....",
    ".....kssSkak....",
    "....kpppppkk....",
    "...kpppppppk....",
    "...kpkpppkpk....",
    "...ksk.ppp.k....",
    ".....kpppk......",
    ".....kk.kk......",
    "................",
    "................",
  ],
  me: [
    "................",
    "....kkkkkkkk....",
    "...khhhhhhhhk...",
    "..kakhhhhhhkak..",
    "..kaksssssskak..",
    "..kaksGssGskak..",
    "...kksssssskk...",
    "....ksssSssk....",
    ".....kssssk.....",
    "....kaaaaaak....",
    "...kaaaaaaaak...",
    "..kaaakkkkaaak..",
    "..kkkGbbbbGkkk..",
    "....kkkkkkkk....",
    "................",
    "................",
  ],
  qaStamp: [
    "................",
    "................",
    ".....kkkkkk.....",
    "....kmmmmmmk....",
    "...kmmmmmmwmk...",
    "...kmmmmmwwmk...",
    "...kmwmmwwmmk...",
    "...kmwwwwmmmk...",
    "...kmmwwmmmmk...",
    "....kmmmmmmk....",
    ".....kkkkkk.....",
    "................",
    "................",
    "................",
    "................",
    "................",
  ],
} satisfies Record<string, readonly string[]>;

export type SpriteName = keyof typeof ART;

export interface SpriteStyle {
  /** 좌우 뒤집기 */
  flipX?: boolean;
  /** 돌리기(라디안). 그림의 위쪽이 이 방향을 봐요 */
  rotate?: number;
  /** 팔레트 글자의 색을 바꿔요 (예: a를 내 후드티 색으로) */
  recolor?: Partial<Record<string, string>>;
  /** 회색으로 (커밋 미로에서 잠든 방해꾼) */
  asleep?: boolean;
}

function hexToRgb(hex: string): number[] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function sleepyColor(hex: string): string {
  const [r, g, b] = hexToRgb(hex);
  const light = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  const mix = SLEEP_DARK.map((d, i) => Math.round(d + (SLEEP_LIGHT[i] - d) * light));
  return `rgb(${mix.join(',')})`;
}

const cache = new Map<string, HTMLCanvasElement>();

function bake(name: SpriteName, style: SpriteStyle): HTMLCanvasElement {
  const key = `${name}|${JSON.stringify(style.recolor ?? {})}|${style.asleep ? 1 : 0}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const g = canvas.getContext('2d')!;
  ART[name].forEach((row, y) =>
    [...row].forEach((ch, x) => {
      if (ch === '.') return;
      const base = style.recolor?.[ch] ?? PALETTE[ch];
      g.fillStyle = style.asleep ? sleepyColor(base) : base;
      g.fillRect(x, y, 1, 1);
    }),
  );
  cache.set(key, canvas);
  return canvas;
}

/** (cx, cy)를 가운데로 size 크기만큼 그려요 */
export function drawSprite(g: CanvasRenderingContext2D, name: SpriteName, cx: number, cy: number, size: number, style: SpriteStyle = {}) {
  const sprite = bake(name, style);
  g.imageSmoothingEnabled = false;
  if (!style.flipX && !style.rotate) {
    g.drawImage(sprite, cx - size / 2, cy - size / 2, size, size);
    return;
  }
  g.save();
  g.translate(cx, cy);
  if (style.rotate) g.rotate(style.rotate);
  if (style.flipX) g.scale(-1, 1);
  g.drawImage(sprite, -size / 2, -size / 2, size, size);
  g.restore();
}

/** 목록 카드에 넣을 작은 그림 (화면 밀도에 맞춰 선명하게) */
export function spriteIcon(name: SpriteName, cssSize: number, label?: string): HTMLCanvasElement {
  const ratio = Math.min(2, window.devicePixelRatio || 1);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(cssSize * ratio);
  canvas.height = canvas.width;
  canvas.style.width = `${cssSize}px`;
  canvas.style.height = `${cssSize}px`;
  if (label) {
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', label);
  } else {
    canvas.setAttribute('aria-hidden', 'true');
  }
  const g = canvas.getContext('2d')!;
  drawSprite(g, name, canvas.width / 2, canvas.height / 2, canvas.width);
  return canvas;
}
