// 이어하기 서버에서 받은 값 확인
// 코드를 아는 사람은 누구나 서버 값을 바꿀 수 있어서, 화면과 저장소에 넣기 전에 모양·범위를 확인해요.
import { HEX_RE, LANGS, ROOM_SLUG_RE, isNoiseId, type NoiseId } from '../config';
import { normalizeOutfit } from '../look';
import { text } from '../net/validate';
import type { Profile } from '../store';

/** 기기끼리 맞추는 프로필. 방에서 쓰는 이용자 번호(id)는 기기마다 따로라 빼요 */
export type SyncedProfile = Omit<Profile, 'id'>;

/** 기기끼리 맞추는 설정 */
export interface SyncedSettings {
  /** 내 모각코 시간 (KST 0~23시) */
  myHour: number | null;
  /** 방마다 고른 배경 소리 */
  noise: Record<string, NoiseId>;
}

export interface Remote {
  profile: SyncedProfile;
  settings: SyncedSettings;
  /** 서버가 마지막으로 프로필·설정을 바꾼 시각 (서버 글자 그대로, 비교에만 써요) */
  updatedAt: string;
}

/** 닉네임 최대 길이 (입장 화면 입력 칸과 같아요) */
const NAME_MAX = 12;
/** 받아들일 배경 소리 설정 수 (store.ts의 MAX_SAVED_NOISES와 같은 크기) */
const NOISE_MAX = 50;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
/** 하루. 한 날짜에 쌓일 수 있는 시간의 상한이에요 (schema.sql의 86400000과 같아요) */
export const DAY_MS = 24 * 3600e3;

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const hex = (v: unknown, fallback: string) => (typeof v === 'string' && HEX_RE.test(v) ? v : fallback);

/** 이상한 칸은 이 기기의 지금 값으로 채워요 */
export function cleanProfile(raw: unknown, fallback: SyncedProfile): SyncedProfile {
  const o = isObj(raw) ? raw : {};
  return {
    name: text(o.name, NAME_MAX) || fallback.name,
    color: hex(o.color, fallback.color),
    lang: LANGS.some((l) => l.id === o.lang) ? (o.lang as string) : fallback.lang,
    hair: hex(o.hair, fallback.hair),
    skin: hex(o.skin, fallback.skin),
    glasses: typeof o.glasses === 'boolean' ? o.glasses : fallback.glasses,
    outfit: isObj(o.outfit) ? normalizeOutfit(o.outfit) : fallback.outfit,
  };
}

export function cleanSettings(raw: unknown): SyncedSettings {
  const o = isObj(raw) ? raw : {};
  const hour = o.myHour;
  const noise: Record<string, NoiseId> = {};
  if (isObj(o.noise)) {
    for (const [slug, id] of Object.entries(o.noise).slice(-NOISE_MAX)) if (ROOM_SLUG_RE.test(slug) && isNoiseId(id)) noise[slug] = id;
  }
  return { myHour: Number.isInteger(hour) && (hour as number) >= 0 && (hour as number) <= 23 ? (hour as number) : null, noise };
}

/** 날짜별 시간(ms). 하루 24시간을 넘는 값과 날짜가 아닌 칸은 버려요 */
export function cleanDays(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!isObj(raw)) return out;
  for (const [day, ms] of Object.entries(raw)) {
    if (DAY_RE.test(day) && typeof ms === 'number' && Number.isFinite(ms)) out[day] = Math.min(DAY_MS, Math.max(0, Math.round(ms)));
  }
  return out;
}

export function cleanRemote(raw: { profile: unknown; settings: unknown; updated_at: unknown }, fallback: SyncedProfile): Remote {
  return {
    profile: cleanProfile(raw.profile, fallback),
    settings: cleanSettings(raw.settings),
    updatedAt: typeof raw.updated_at === 'string' ? raw.updated_at : '',
  };
}
