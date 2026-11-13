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
  /** 내가 신고한 커밋 (방 slug → 해시들). 신고한 사람에게는 바로 안 보여요 */
  reported?: Record<string, string[]>;
  /** 방마다 내가 고른 배경 소리 (방 slug → 소리). 방 기본값과 같으면 지워요 */
  noise?: Record<string, string>;
  coffee?: { date: string; count: number };
  /** 날짜(KST)별 모각코한 총 시간(ms). 잔디 그래프에 써요. 오래된 날짜는 자동으로 정리돼요 */
  studyHistory?: Record<string, number>;
  demoCommits?: unknown[];
  demoRooms?: unknown[];
  /** 비밀번호를 맞힌 방의 열쇠 (방 주소 → 열쇠). 오래된 것부터 밀려나요 */
  roomKeys?: Record<string, StoredRoomKey>;
  /** 전에 만난 적 있는 사람들 (peer id → 몇 번 만났는지, 마지막으로 만난 시각). 오래된 것부터 밀려나요 */
  knownPeers?: Record<string, KnownPeer>;
  /** 오늘(KST) 끝낸 정각 세션 수 */
  sessions?: { date: string; count: number };
  /** '🎯 같이 하는 시간' 시트를 열어 본 적 있는지 (처음엔 버튼에 점을 찍어 알려요) */
  togetherSeen?: boolean;
  /** 내 모각코 시간 (KST 0~23시). 정하지 않았으면 없어요 */
  myHour?: number;
  /** '내 시간을 정해 보세요' 안내를 마지막으로 보여준 날 (하루 한 번만) */
  myHourNudged?: string;
  /** 오늘(KST) 들어가 본 방들. 방마다 하루 한 번만 '다녀감'으로 세려고 기억해요 */
  visited?: { date: string; rooms: string[] };
}

export interface KnownPeer {
  count: number;
  last: number;
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

/** 방마다 기억하는 신고한 커밋 수 (오래된 것부터 지움) */
const MAX_REPORTED_PER_ROOM = 50;

export function getReportedCommits(slug: string): Set<string> {
  return new Set(cache.reported?.[slug] ?? []);
}

export function addReportedCommit(slug: string, hash: string) {
  const list = (cache.reported?.[slug] ?? []).filter((h) => h !== hash);
  list.push(hash);
  cache.reported = { ...cache.reported, [slug]: list.slice(-MAX_REPORTED_PER_ROOM) };
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

/** 잔디 그래프에 보여줄 기간 (대략 53주) */
const STUDY_HISTORY_DAYS = 371;

export function getStudyMsToday(): number {
  return cache.studyHistory?.[kstDate()] ?? 0;
}

/** 날짜별 누적 시간 그대로 (잔디 그래프용) */
export function getStudyHistory(): Record<string, number> {
  return { ...cache.studyHistory };
}

/** 오늘 누적 시간에 더해요 (새로고침하거나 방을 나가도 자정까진 안 지워져요) */
export function addStudyMs(ms: number): number {
  const d = kstDate();
  const hist = { ...cache.studyHistory };
  hist[d] = (hist[d] ?? 0) + ms;
  cache.studyHistory = pruneByCutoff(hist, STUDY_HISTORY_DAYS);
  persist();
  return cache.studyHistory[d];
}

/** 기준일보다 오래된 날짜(YYYY-MM-DD라 문자열 비교로 충분해요)는 지워요 */
function pruneByCutoff(hist: Record<string, number>, days: number): Record<string, number> {
  const cutoff = kstDate(new Date(Date.now() - days * 86400e3));
  const out: Record<string, number> = {};
  for (const [d, ms] of Object.entries(hist)) if (d >= cutoff) out[d] = ms;
  return out;
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

/** 기억해 둘 '만난 적 있는 사람' 수. 넘으면 오래 전에 만난 사람부터 잊어요 */
const KNOWN_PEERS_MAX = 300;

/** 이 사람을 몇 번 만났는지 (한 번도 없으면 0) */
export function getPeerMeetCount(id: string): number {
  return cache.knownPeers?.[id]?.count ?? 0;
}

/** 방문(접속) 한 번에 한 번씩만 불러요. 처음 보는 사람이면 1, 그 다음부턴 늘어나요 */
export function markPeerMet(id: string) {
  const known: Record<string, KnownPeer> = { ...cache.knownPeers };
  known[id] = { count: (known[id]?.count ?? 0) + 1, last: Date.now() };
  const ids = Object.keys(known).sort((a, b) => known[a].last - known[b].last);
  for (const old of ids.slice(0, Math.max(0, ids.length - KNOWN_PEERS_MAX))) delete known[old];
  cache.knownPeers = known;
  persist();
}

export function getSessionsToday(): number {
  const d = kstDate();
  return cache.sessions?.date === d ? cache.sessions.count : 0;
}

/** 정각 세션을 하나 끝냈어요. 오늘 몇 번째인지 돌려줘요 */
export function addSessionDone(): number {
  const count = getSessionsToday() + 1;
  cache.sessions = { date: kstDate(), count };
  persist();
  return count;
}

export function hasSeenTogether(): boolean {
  return cache.togetherSeen === true;
}

export function markTogetherSeen() {
  if (cache.togetherSeen) return;
  cache.togetherSeen = true;
  persist();
}

/** 하루에 기억해 둘 '들어가 본 방' 수 */
const VISITED_ROOMS_MAX = 50;

/** 오늘 이 방에 처음 들어온 거면 true (기억해 두고, 같은 날 다시 들어오면 false) */
export function markRoomVisit(slug: string): boolean {
  const d = kstDate();
  const rooms = cache.visited?.date === d ? cache.visited.rooms : [];
  if (rooms.includes(slug)) return false;
  cache.visited = { date: d, rooms: [...rooms, slug].slice(-VISITED_ROOMS_MAX) };
  persist();
  return true;
}

/** 내 모각코 시간 (KST 0~23시). 없으면 null */
export function getMyHour(): number | null {
  const h = cache.myHour;
  return Number.isInteger(h) && (h as number) >= 0 && (h as number) <= 23 ? (h as number) : null;
}

export function setMyHour(hour: number | null) {
  if (hour === null) delete cache.myHour;
  else cache.myHour = hour;
  persist();
}

/** 오늘 아직 '내 시간 정하기' 안내를 안 했으면 true를 돌려주고 했다고 기억해요 */
export function takeMyHourNudge(): boolean {
  const d = kstDate();
  if (cache.myHourNudged === d) return false;
  cache.myHourNudged = d;
  persist();
  return true;
}
