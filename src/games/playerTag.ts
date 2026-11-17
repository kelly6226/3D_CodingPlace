// 게임만 따로 연 페이지에서 스코어 판에 올릴 이름표 (닉네임·후드티 색).
// 방에 들어간 적이 있으면 그 프로필을 같이 쓰고, 없으면 이 페이지에서만 쓰는 이름표를 이 브라우저에 남겨요.
// 프로필을 여기서 새로 만들지 않는 건, 그러면 방에 처음 들어올 때 보여줄 안내(main.ts firstVisit)를 건너뛰어서예요.
import { DEFAULT_NAMES, HEX_RE, HOODIE_COLORS, NICKNAME_MAX } from '../config';
import { BLOCKED_WORDS_REASON, hasBadWord } from '../net/badwords';
import type { Player } from '../minigames/scoreApi';
import * as store from '../store';

const KEY = 'mogakco:games:player';

export type RenameResult = { ok: true } | { ok: false; reason: string };

const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];

function readOwnTag(): Player | null {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (!parsed || typeof parsed !== 'object') return null;
    const { name, color } = parsed as Record<string, unknown>;
    if (typeof name !== 'string' || !name.trim() || typeof color !== 'string' || !HEX_RE.test(color)) return null;
    return { name: name.slice(0, NICKNAME_MAX), color };
  } catch {
    return null;
  }
}

function saveOwnTag(tag: Player) {
  try {
    localStorage.setItem(KEY, JSON.stringify(tag));
  } catch {
    /* 저장이 막힌 브라우저면 이번 접속 동안만 써요 */
  }
}

/** 지금의 이름표. 처음이면 무작위 닉네임과 색을 정해서 남겨요 (판에 올린 줄 이름이 접속마다 바뀌지 않게) */
export function readOrCreatePlayer(): Player {
  if (store.hasSavedProfile()) {
    const { name, color } = store.getProfile();
    return { name, color };
  }
  const own = readOwnTag();
  if (own) return own;
  const fresh = { name: pick(DEFAULT_NAMES), color: pick(HOODIE_COLORS) };
  saveOwnTag(fresh);
  return fresh;
}

/** 닉네임 바꾸기. 방 프로필이 있으면 그 닉네임도 같이 바뀌어요 (방과 스코어 판에서 같은 사람으로 보이게) */
export function renamePlayer(input: string): RenameResult {
  const name = input.trim();
  if (!name) return { ok: false, reason: '닉네임을 적어 주세요.' };
  if (name.length > NICKNAME_MAX) return { ok: false, reason: `닉네임은 ${NICKNAME_MAX}자까지 쓸 수 있어요.` };
  if (hasBadWord(name)) return { ok: false, reason: `${BLOCKED_WORDS_REASON} 다른 닉네임으로 적어주세요.` };
  if (store.hasSavedProfile()) store.saveProfile({ ...store.getProfile(), name });
  else saveOwnTag({ ...readOrCreatePlayer(), name });
  return { ok: true };
}
