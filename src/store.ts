// 브라우저에만 남는 개인 기록 (프로필, 커피, 소리 설정)
import { DEFAULT_NAMES, HOODIE_COLORS, HAIR_COLORS, SKIN_TONES, LANGS, isNoiseId, type NoiseId } from './config';
import { DEFAULT_OUTFIT, normalizeOutfit, type Outfit } from './look';

const KEY = 'mogakco:v1';

export interface Profile {
  id: string;
  name: string;
  color: string;
  lang: string;
  hair: string;
  skin: string;
  glasses: boolean;
  outfit: Outfit;
}

interface Saved {
  profile?: Profile;
  sound?: boolean;
  /** 방마다 내가 고른 배경 소리 (방 slug → 소리). 방 기본값과 같으면 지워요 */
  noise?: Record<string, string>;
  /** 옷장을 한 번이라도 열어봤는지 (처음엔 버튼이 눈에 띄게 반짝여요) */
  wardrobeOpened?: boolean;
  coffee?: { date: string; count: number };
  demoCommits?: unknown[];
  demoRooms?: unknown[];
  /** 비밀번호를 맞힌 방의 열쇠 (방 주소 → 열쇠). 오래된 것부터 밀려나요 */
  roomKeys?: Record<string, StoredRoomKey>;
}

export interface StoredRoomKey {
  check: string;
  topic: string;
}

/** 열쇠를 기억해 둘 방 수. 넘으면 오래된 것부터 잊어서, 다시 비밀번호를 물어요 */
const ROOM_KEYS_MAX = 30;

let cache: Saved = {};
try {
  cache = JSON.parse(localStorage.getItem(KEY) || '{}') as Saved;
} catch {
  cache = {};
}

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    /* 저장이 막혀 있어도 그냥 진행 */
  }
}

const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];

export function randomId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
  }
}

export function kstDate(d = new Date()): string {
  // en-CA는 YYYY-MM-DD 형식
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(d);
}

export function getProfile(): Profile {
  // 꾸미기 기능이 생기기 전에 저장한 프로필에는 outfit이 없어서 기본 옷을 채워요
  if (cache.profile) return { ...cache.profile, outfit: normalizeOutfit(cache.profile.outfit) };
  return {
    id: randomId(),
    name: pick(DEFAULT_NAMES),
    color: pick(HOODIE_COLORS),
    lang: pick(LANGS).id,
    hair: pick(HAIR_COLORS),
    skin: pick(SKIN_TONES),
    glasses: Math.random() < 0.5,
    outfit: { ...DEFAULT_OUTFIT },
  };
}

export function hasSavedProfile(): boolean {
  return !!cache.profile;
}

export function saveProfile(p: Profile) {
  cache.profile = p;
  persist();
}

export function getSound(): boolean {
  return cache.sound ?? true;
}

export function setSound(on: boolean) {
  cache.sound = on;
  persist();
}

/** 방마다 기억하는 배경 소리는 최근 이만큼만 (오래된 것부터 지움) */
const MAX_SAVED_NOISES = 50;

/** 이 방에서 내가 고른 배경 소리. 고른 적 없으면 null (방 기본값을 써요) */
export function getRoomNoise(slug: string): NoiseId | null {
  const id = cache.noise?.[slug];
  return isNoiseId(id) ? id : null;
}

export function setRoomNoise(slug: string, id: NoiseId) {
  const saved = { ...cache.noise };
  // 지웠다 다시 넣어서 '최근에 고른 방'이 맨 뒤로 가게 해요
  delete saved[slug];
  saved[slug] = id;
  const slugs = Object.keys(saved);
  for (const old of slugs.slice(0, Math.max(0, slugs.length - MAX_SAVED_NOISES))) delete saved[old];
  cache.noise = saved;
  persist();
}

export function clearRoomNoise(slug: string) {
  if (!cache.noise || !(slug in cache.noise)) return;
  const saved = { ...cache.noise };
  delete saved[slug];
  cache.noise = saved;
  persist();
}

export function hasOpenedWardrobe(): boolean {
  return cache.wardrobeOpened === true;
}

export function markWardrobeOpened() {
  if (cache.wardrobeOpened) return;
  cache.wardrobeOpened = true;
  persist();
}

export function getCoffeeToday(): number {
  const d = kstDate();
  return cache.coffee?.date === d ? cache.coffee.count : 0;
}

export function addCoffee(): number {
  const d = kstDate();
  const count = (cache.coffee?.date === d ? cache.coffee.count : 0) + 1;
  cache.coffee = { date: d, count };
  persist();
  return count;
}

export function getDemoCommits<T>(): T[] {
  return (cache.demoCommits as T[] | undefined) ?? [];
}

export function setDemoCommits<T>(list: T[]) {
  cache.demoCommits = list.slice(0, 40);
  persist();
}

export function getDemoRooms<T>(): T[] {
  return (cache.demoRooms as T[] | undefined) ?? [];
}

export function setDemoRooms<T>(list: T[]) {
  cache.demoRooms = list.slice(0, 30);
  persist();
}

export function getRoomKey(slug: string): StoredRoomKey | null {
  const k = cache.roomKeys?.[slug];
  return k && typeof k.check === 'string' && typeof k.topic === 'string' ? k : null;
}

export function setRoomKey(slug: string, key: StoredRoomKey) {
  // 객체는 넣은 순서를 기억하니까, 다시 넣을 땐 빼고 넣어서 맨 뒤(가장 최근)로 보내요
  const { [slug]: _old, ...rest } = cache.roomKeys ?? {};
  cache.roomKeys = Object.fromEntries([...Object.entries(rest), [slug, key]].slice(-ROOM_KEYS_MAX));
  persist();
}
