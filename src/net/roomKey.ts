// 비밀번호 방의 열쇠. 로그인 없이 "비밀번호를 아는 사람끼리만" 모이게 해요.
//
// 비밀번호를 PBKDF2로 늘려서 두 값으로 나눠요 (같은 비밀번호면 어느 브라우저에서나 같은 값이 나와요).
//   check : 서버에 저장하는 확인값. 맞는 비밀번호인지 서버가 대조하고, 방명록을 열 때도 써요
//   topic : 실시간 채널 이름에 붙이는 값. 비밀번호를 모르면 어느 채널에 모였는지 알 수 없어요
// 비밀번호 원문은 서버로 가지 않아요.
//
// 한계(가벼운 잠금): 서버가 틀린 횟수를 세어 막지 않아서, 짧은 비밀번호는 시간을 들이면 맞힐 수 있어요.
//   PBKDF2를 느리게 해서 한 번 찍어 보는 비용을 키워 두었어요.

/** PBKDF2 반복 횟수. 올릴수록 맞히기 어렵지만 입장할 때 걸리는 시간이 늘어요 (휴대폰에서 1초 안쪽을 목표로 잡았어요) */
export const ROOM_KEY_ITERATIONS = 200_000;
const CHECK_BYTES = 32;
const TOPIC_BYTES = 16;

export interface RoomKey {
  /** 서버 확인값 (16진수 64글자) */
  check: string;
  /** 채널 이름에 붙일 값 (base64url) */
  topic: string;
}

const toHex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
const toB64 = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** 방 주소(slug)를 소금으로 써서, 같은 비밀번호라도 방마다 다른 값이 나와요 */
export async function deriveRoomKey(slug: string, password: string): Promise<RoomKey> {
  const enc = new TextEncoder();
  const base = await globalThis.crypto.subtle.importKey('raw', enc.encode(password.normalize('NFC')), 'PBKDF2', false, ['deriveBits']);
  const bits = new Uint8Array(
    await globalThis.crypto.subtle.deriveBits(
      { name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(`mogakco-room/${slug}`), iterations: ROOM_KEY_ITERATIONS },
      base,
      (CHECK_BYTES + TOPIC_BYTES) * 8,
    ),
  );
  return { check: toHex(bits.slice(0, CHECK_BYTES)), topic: toB64(bits.slice(CHECK_BYTES)) };
}
