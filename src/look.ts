// 캐릭터 꾸미기 목록 (옷장 화면, 저장된 프로필, 실시간으로 받은 값 검사가 모두 이 목록을 써요)
// 3D 모델은 src/world/outfit.ts에 있고, 여기엔 이름표와 고를 수 있는 값만 있어요.
import { HAIR_COLORS, HEX_RE, HOODIE_COLORS, SKIN_TONES } from './config';

export interface LookOption {
  id: string;
  emoji: string;
  label: string;
}

export const HATS: LookOption[] = [
  { id: 'none', emoji: '🚫', label: '없음' },
  { id: 'beanie', emoji: '🧶', label: '비니' },
  { id: 'cap', emoji: '🧢', label: '볼캡' },
  { id: 'catears', emoji: '🐱', label: '고양이 귀' },
  { id: 'propeller', emoji: '🚁', label: '프로펠러' },
  { id: 'crown', emoji: '👑', label: '왕관' },
  { id: 'duck', emoji: '🦆', label: '러버덕' },
  { id: 'halo', emoji: '😇', label: '천사 고리' },
];

export const HAIR_STYLES: LookOption[] = [
  { id: 'short', emoji: '✂️', label: '단정' },
  { id: 'bun', emoji: '🍡', label: '똥머리' },
  { id: 'ponytail', emoji: '🐎', label: '포니테일' },
  { id: 'twin', emoji: '🎀', label: '양갈래' },
  { id: 'long', emoji: '💁', label: '긴 머리' },
  { id: 'spiky', emoji: '🦔', label: '뾰족' },
  { id: 'afro', emoji: '☁️', label: '아프로' },
];

export const BACKS: LookOption[] = [
  { id: 'none', emoji: '🚫', label: '없음' },
  { id: 'backpack', emoji: '🎒', label: '백팩' },
  { id: 'cape', emoji: '🦸', label: '망토' },
  { id: 'wings', emoji: '🪽', label: '날개' },
  { id: 'shell', emoji: '🐢', label: '거북 등딱지' },
];

export const NECKS: LookOption[] = [
  { id: 'none', emoji: '🚫', label: '없음' },
  { id: 'scarf', emoji: '🧣', label: '목도리' },
  { id: 'lanyard', emoji: '🪪', label: '사원증' },
  { id: 'bowtie', emoji: '🤵', label: '나비넥타이' },
  { id: 'headphones', emoji: '🎧', label: '목 헤드폰' },
];

/** 모자·등·목 장식에 같이 쓰는 포인트 색 */
export const ACCENT_COLORS = ['#e5484d', '#f2b45a', '#4cc38a', '#4a9eff', '#a78bfa', '#ff8fb1', '#f3efe6', '#2a2d35'];
export const PANTS_COLORS = ['#2b2f3a', '#3b4a6b', '#5a4a3a', '#8a8f98', '#d9d3c7', '#6b7a52', '#7a3b3b', '#1b1b20'];
export const SHOE_COLORS = ['#efeae0', '#2f2f35', '#e5484d', '#4a9eff', '#f2b45a', '#4cc38a', '#ff8fb1'];

/** 후드티 외에 갈아입을 수 있는 것들 */
export interface Outfit {
  hat: string;
  hairStyle: string;
  back: string;
  neck: string;
  accent: string;
  pants: string;
  shoes: string;
}

/** 꾸미기 기능이 생기기 전 아바타와 똑같은 모습 */
export const DEFAULT_OUTFIT: Outfit = {
  hat: 'none',
  hairStyle: 'short',
  back: 'none',
  neck: 'none',
  accent: ACCENT_COLORS[0],
  pants: PANTS_COLORS[0],
  shoes: SHOE_COLORS[0],
};

/** 옷장 화면이 한 번에 다루는 겉모습 (후드티·머리색·피부색은 예전부터 따로 있던 값) */
export interface Look {
  color: string;
  hair: string;
  skin: string;
  glasses: boolean;
  outfit: Outfit;
}

const idOr = (list: LookOption[], v: unknown, fallback: string) => (list.some((o) => o.id === v) ? (v as string) : fallback);
const hexOr = (v: unknown, fallback: string) => (typeof v === 'string' && HEX_RE.test(v) ? v : fallback);

/**
 * 저장돼 있던 값이나 다른 사람이 보낸 값을 안전한 Outfit으로.
 * 목록에 없는 id, 색이 아닌 글자, 아예 없는 값은 기본 옷으로 바꿔요 (예전에 저장한 프로필에는 outfit이 없어요).
 */
export function normalizeOutfit(raw: unknown): Outfit {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_OUTFIT;
  return {
    hat: idOr(HATS, o.hat, d.hat),
    hairStyle: idOr(HAIR_STYLES, o.hairStyle, d.hairStyle),
    back: idOr(BACKS, o.back, d.back),
    neck: idOr(NECKS, o.neck, d.neck),
    accent: hexOr(o.accent, d.accent),
    pants: hexOr(o.pants, d.pants),
    shoes: hexOr(o.shoes, d.shoes),
  };
}

export function sameOutfit(a: Outfit, b: Outfit): boolean {
  return (
    a.hat === b.hat &&
    a.hairStyle === b.hairStyle &&
    a.back === b.back &&
    a.neck === b.neck &&
    a.accent === b.accent &&
    a.pants === b.pants &&
    a.shoes === b.shoes
  );
}

const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];

export function randomOutfit(): Outfit {
  return {
    hat: pick(HATS).id,
    hairStyle: pick(HAIR_STYLES).id,
    back: pick(BACKS).id,
    neck: pick(NECKS).id,
    accent: pick(ACCENT_COLORS),
    pants: pick(PANTS_COLORS),
    shoes: pick(SHOE_COLORS),
  };
}

/** 🎲 랜덤으로 안경을 쓰게 될 확률 */
const RANDOM_GLASSES_RATE = 0.4;

export function randomLook(): Look {
  return { color: pick(HOODIE_COLORS), hair: pick(HAIR_COLORS), skin: pick(SKIN_TONES), glasses: Math.random() < RANDOM_GLASSES_RATE, outfit: randomOutfit() };
}
