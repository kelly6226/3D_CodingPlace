// 브라우저에만 남는 개인 기록 (프로필, 잔디, 커피, 소리 설정)
import { DEFAULT_NAMES, HOODIE_COLORS, HAIR_COLORS, SKIN_TONES, LANGS } from './config';

const KEY = 'mogakco:v1';

export interface Profile {
  id: string;
  name: string;
  color: string;
  lang: string;
  hair: string;
  skin: string;
  glasses: boolean;
}

interface Saved {
  profile?: Profile;
  sound?: boolean;
  sprintPreset?: string;
  /** 날짜(YYYY-MM-DD, KST) → 완료한 스프린트 수 */
  grass?: Record<string, number>;
  /** 날짜 → 집중한 분 */
  focusMin?: Record<string, number>;
  coffee?: { date: string; count: number };
  demoCommits?: unknown[];
}

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
  if (cache.profile) return cache.profile;
  return {
    id: randomId(),
    name: pick(DEFAULT_NAMES),
    color: pick(HOODIE_COLORS),
    lang: pick(LANGS).id,
    hair: pick(HAIR_COLORS),
    skin: pick(SKIN_TONES),
    glasses: Math.random() < 0.5,
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

export function getSprintPreset(): string {
  return cache.sprintPreset ?? '25';
}

export function setSprintPreset(id: string) {
  cache.sprintPreset = id;
  persist();
}

export function addSprint(minutes: number) {
  const d = kstDate();
  cache.grass = cache.grass ?? {};
  cache.focusMin = cache.focusMin ?? {};
  cache.grass[d] = (cache.grass[d] ?? 0) + 1;
  cache.focusMin[d] = (cache.focusMin[d] ?? 0) + minutes;
  persist();
}

export function getGrass(): Record<string, number> {
  return cache.grass ?? {};
}

export function getFocusMin(): Record<string, number> {
  return cache.focusMin ?? {};
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

/** 연속으로 잔디를 심은 날 수 (오늘 또는 어제부터 거꾸로) */
export function getStreak(): number {
  const g = getGrass();
  let streak = 0;
  const day = new Date();
  // 오늘 아직 안 심었으면 어제부터 센다
  if (!g[kstDate(day)]) day.setDate(day.getDate() - 1);
  while (g[kstDate(day)]) {
    streak++;
    day.setDate(day.getDate() - 1);
  }
  return streak;
}
