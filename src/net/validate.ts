// 다른 사람이 보낸 실시간 데이터 검사
//
// Supabase 공개 채널은 publishable 키만 있으면 누구나 들어와서 아무 값이나 보낼 수 있어요.
// 그래서 Presence·Broadcast로 받은 값은 "믿을 수 없는 입력"으로 보고,
// 화면에 그리기 전에 모양·길이·범위를 확인하고 모르는 필드는 버려요.
// (DB에 저장되는 값은 supabase/schema.sql의 제약조건이 서버에서 한 번 더 막아요)
import {
  ACT_RECEIVE_GAP_MS,
  CHAT_MAX_LENGTH,
  CHAT_RECEIVE_GAP_MS,
  EMOTES,
  HEX_RE,
  LANGS,
  STATUSES,
  actionById,
} from '../config';
import { normalizeOutfit } from '../look';
import { ROOM, SPAWN, seatById } from '../world/layout';
import { maskIfBad } from './badwords';
import type { Commit, NetEvent, PeerState } from './types';

const ID_RE = /^[A-Za-z0-9_-]{1,40}$/;
const HASH_RE = /^[0-9a-f]{7}$/;
// 제어문자 (줄바꿈, 탭, 방향 바꾸는 유니코드 등)
// eslint-disable-next-line no-control-regex
const CONTROL_RE = /[\u0000-\u001f\u007f-\u009f\u200b\u200c\u200e\u200f\u202a-\u202e\u2066-\u2069]/g;

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/** 글자: 제어문자 빼고, 앞뒤 공백 자르고, 길이 제한 */
export function text(v: unknown, max: number): string {
  if (typeof v !== 'string') return '';
  return [...v.replace(CONTROL_RE, '').trim()].slice(0, max).join('');
}

const hex = (v: unknown, fallback: string) => (typeof v === 'string' && HEX_RE.test(v) ? v : fallback);
const id = (v: unknown) => (typeof v === 'string' && ID_RE.test(v) ? v : null);

/** 지금 장소에 실제로 있는 자리 id만 */
const seatId = (v: unknown) => (typeof v === 'string' && seatById(v) ? v : null);

/** 지금 장소 바닥 안쪽으로 */
function inRoom(x: unknown, z: unknown): { x: number; z: number } {
  const xx = num(x, NaN);
  const zz = num(z, NaN);
  if (!Number.isFinite(xx) || !Number.isFinite(zz)) return { x: SPAWN.x, z: SPAWN.z };
  return { x: clamp(xx, ROOM.x0 + 0.3, ROOM.x1 - 0.3), z: clamp(zz, ROOM.z0 + 0.3, ROOM.z1 - 0.3) };
}

/**
 * Presence로 받은 사람 정보.
 * key는 Presence 키(접속할 때 정한 id). 다른 사람 id를 사칭하지 못하게 key와 id가 같아야 해요.
 */
export function cleanPeer(raw: unknown, key: string): PeerState | null {
  if (!isObj(raw)) return null;
  const pid = id(raw.id);
  if (!pid || pid !== key) return null;
  const now = Date.now();
  const pos = inRoom(raw.x, raw.z);
  const seat = seatId(raw.seat);
  return {
    id: pid,
    name: maskIfBad(text(raw.name, 20)) || '익명의 개발자',
    color: hex(raw.color, '#3b4a6b'),
    hair: hex(raw.hair, '#1d1a18'),
    skin: hex(raw.skin, '#eac3a3'),
    lang: LANGS.some((l) => l.id === raw.lang) ? (raw.lang as string) : LANGS[0].id,
    glasses: raw.glasses === true,
    outfit: normalizeOutfit(raw.outfit),
    status: STATUSES.some((s) => s.id === raw.status) ? (raw.status as string) : 'coding',
    seat,
    seatAt: clamp(num(raw.seatAt, 0), 0, now + 60e3),
    x: pos.x,
    z: pos.z,
    coffee: clamp(Math.floor(num(raw.coffee, 0)), 0, 99),
    joinedAt: clamp(num(raw.joinedAt, now), 0, now + 60e3),
    studyToday: clamp(Math.floor(num(raw.studyToday, 0)), 0, 24 * 3600e3),
  };
}

/** Broadcast로 받은 이벤트 */
export function cleanEvent(raw: unknown): NetEvent | null {
  if (!isObj(raw)) return null;
  switch (raw.type) {
    case 'move': {
      const pid = id(raw.id);
      if (!pid) return null;
      const seat = raw.seat === null ? null : seatId(raw.seat);
      if (raw.seat !== null && !seat) return null;
      const pos = inRoom(raw.x, raw.z);
      return { type: 'move', id: pid, x: pos.x, z: pos.z, seat };
    }
    case 'emote': {
      const pid = id(raw.id);
      if (!pid || !EMOTES.some((e) => e.id === raw.emote)) return null;
      const to = raw.to === undefined ? undefined : id(raw.to) ?? undefined;
      return { type: 'emote', id: pid, emote: raw.emote as string, to };
    }
    case 'deploy': {
      const pid = id(raw.id);
      if (!pid) return null;
      return { type: 'deploy', id: pid, name: maskIfBad(text(raw.name, 20)) || '누군가' };
    }
    case 'chat': {
      const pid = id(raw.id);
      const msg = maskIfBad(text(raw.text, CHAT_MAX_LENGTH));
      const to = raw.to === undefined ? undefined : (id(raw.to) ?? undefined);
      return pid && msg ? { type: 'chat', id: pid, text: msg, to } : null;
    }
    case 'act': {
      const pid = id(raw.id);
      const act = actionById(raw.act);
      return pid && act ? { type: 'act', id: pid, act: act.id } : null;
    }
    case 'commitHidden':
      return typeof raw.hash === 'string' && HASH_RE.test(raw.hash) ? { type: 'commitHidden', hash: raw.hash } : null;
    case 'commit': {
      const c = cleanCommit(raw.commit);
      return c ? { type: 'commit', commit: c } : null;
    }
    case 'typing':
    case 'coffee': {
      const pid = id(raw.id);
      return pid ? { type: raw.type, id: pid } : null;
    }
  }
  return null;
}

export function cleanCommit(raw: unknown): Commit | null {
  if (!isObj(raw) || typeof raw.hash !== 'string' || !HASH_RE.test(raw.hash)) return null;
  const name = text(raw.name, 20);
  const msg = text(raw.msg, 72);
  if (!name || !msg) return null;
  return {
    hash: raw.hash,
    name: maskIfBad(name),
    msg: maskIfBad(msg),
    lang: LANGS.some((l) => l.id === raw.lang) ? (raw.lang as string) : '',
    at: clamp(num(raw.at, Date.now()), 0, Date.now() + 60e3),
  };
}

/**
 * 보낸 사람별 이벤트 속도 제한.
 * 누가 스크립트로 이모트나 배포 경보를 초당 수백 번 보내도 화면이 버티게,
 * 종류마다 "이 간격보다 빨리 오면 버림"을 정해요.
 */
/**
 * 커밋 알림을 받고 DB를 다시 읽는 간격. 알림 하나마다 읽으면 가짜 알림을 퍼붓는 것만으로
 * 방 사람 전원이 DB를 두들기게 돼서, 알림이 몇 개 오든 이 간격에 한 번만 읽어요.
 */
export const COMMIT_REFRESH_GAP_MS = 5000;

const MIN_GAP: Record<Exclude<NetEvent['type'], 'commit' | 'commitHidden'>, number> = {
  move: 120,
  emote: 700,
  chat: CHAT_RECEIVE_GAP_MS,
  act: ACT_RECEIVE_GAP_MS,
  typing: 250,
  coffee: 2000,
  deploy: 20000,
};

export class RateLimiter {
  private last = new Map<string, number>();
  allow(sender: string, type: Exclude<NetEvent['type'], 'commit' | 'commitHidden'>, now = Date.now()): boolean {
    const k = `${sender}:${type}`;
    const prev = this.last.get(k) ?? 0;
    if (now - prev < MIN_GAP[type]) return false;
    this.last.set(k, now);
    if (this.last.size > 2000) this.last.clear(); // 메모리가 끝없이 늘지 않게
    return true;
  }
  clear() {
    this.last.clear();
  }
}
