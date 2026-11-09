// 1:1 채팅 암호화. 로그인 없이 둘만 아는 비밀값을 만들어요.
//
//   1) 둘이 각자 임시 키 쌍(ECDH P-256)을 만들고, 공개 키만 방 채널로 주고받아요
//   2) 공개 키 둘과 내 비밀 키로 똑같은 비밀값이 나와요. 공개 키만 본 사람은 이걸 만들 수 없어요
//   3) 비밀값에서 (채널 이름, 암호 키, 확인 코드)를 뽑아요 (HKDF)
//   4) 대화는 그 이름의 채널에서 AES-GCM으로 암호화해서 주고받아요. 서버는 암호문만 봐요
//
// 한계: 방 이벤트는 인증이 없어서, 공개 키를 가로채 상대인 척하는 사람이 끼어들 수 있어요.
//       그래서 두 사람 화면에 같은 "확인 코드"가 뜨는지 비교할 수 있게 해요.
// 키 쌍은 대화마다 새로 만들고 메모리에만 둬요 (저장 안 함).
//
// 이 파일은 브라우저와 Node 모두에서 도는 WebCrypto(crypto.subtle)만 써요.

import type { DmCipher } from '../net/types';

const ECDH = { name: 'ECDH', namedCurve: 'P-256' } as const;
const KEY_BYTES = 32;
const IV_BYTES = 12;
const TOPIC_BYTES = 16;
const CODE_DIGITS = 6;
const TEXT_ENCODER = new TextEncoder();
const TEXT_DECODER = new TextDecoder();

export interface DmKeyPair {
  privateKey: CryptoKey;
  /** 상대에게 보내는 공개 키 (base64url) */
  publicKey: string;
}

export interface DmSession {
  /** 대화 채널 이름. 비밀값에서 나와서 두 사람만 알아요 */
  topic: string;
  /** 두 화면에 똑같이 떠야 하는 숫자. 다르면 누가 끼어든 거예요 */
  code: string;
  encrypt(text: string, at: number): Promise<DmCipher>;
  /** 못 푸는 건(깨졌거나 다른 키로 만든 것) null */
  decrypt(c: DmCipher): Promise<{ text: string; at: number } | null>;
}

const subtle = () => globalThis.crypto.subtle;

export function toB64(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromB64(s: string): Uint8Array<ArrayBuffer> {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(new ArrayBuffer(b.length));
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
  return out;
}

export async function newKeyPair(): Promise<DmKeyPair> {
  const pair = await subtle().generateKey(ECDH, false, ['deriveBits']);
  const raw = new Uint8Array(await subtle().exportKey('raw', pair.publicKey));
  return { privateKey: pair.privateKey, publicKey: toB64(raw) };
}

/** 내 키 쌍과 상대 공개 키로 대화 하나를 열 준비를 해요. 상대 키가 이상하면 null */
export async function openSession(mine: DmKeyPair, peerPublicKey: string): Promise<DmSession | null> {
  if (peerPublicKey === mine.publicKey) return null; // 내 키를 되돌려 보낸 경우
  try {
    const peer = await subtle().importKey('raw', fromB64(peerPublicKey), ECDH, false, []);
    const shared = await subtle().deriveBits({ name: 'ECDH', public: peer }, mine.privateKey, KEY_BYTES * 8);
    // 어느 쪽에서 계산해도 같아지게, 두 공개 키를 정렬해서 소금(salt)으로 써요
    const [a, b] = [mine.publicKey, peerPublicKey].sort();
    const salt = new Uint8Array(await subtle().digest('SHA-256', TEXT_ENCODER.encode(`${a}.${b}`)));
    const hkdf = await subtle().importKey('raw', shared, 'HKDF', false, ['deriveBits', 'deriveKey']);
    const info = (label: string) => TEXT_ENCODER.encode(`mogakco-dm/${label}`);
    const topicBits = new Uint8Array(await subtle().deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info: info('topic') }, hkdf, TOPIC_BYTES * 8));
    const codeBits = new Uint8Array(await subtle().deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info: info('code') }, hkdf, 32));
    const key = await subtle().deriveKey({ name: 'HKDF', hash: 'SHA-256', salt, info: info('key') }, hkdf, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    return {
      topic: `dm:${toB64(topicBits)}`,
      code: codeFrom(codeBits),
      encrypt: (text, at) => encrypt(key, text, at),
      decrypt: (c) => decrypt(key, c),
    };
  } catch {
    return null;
  }
}

/** 4바이트를 6자리 숫자로 (3자리씩 끊어 보여줘요) */
function codeFrom(bits: Uint8Array): string {
  const n = new DataView(bits.buffer, bits.byteOffset, bits.byteLength).getUint32(0) % 10 ** CODE_DIGITS;
  const s = String(n).padStart(CODE_DIGITS, '0');
  return `${s.slice(0, 3)}-${s.slice(3)}`;
}

async function encrypt(key: CryptoKey, text: string, at: number): Promise<DmCipher> {
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(new ArrayBuffer(IV_BYTES)));
  const plain = TEXT_ENCODER.encode(JSON.stringify({ t: text, a: at }));
  const ct = new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv }, key, plain));
  return { iv: toB64(iv), ct: toB64(ct) };
}

async function decrypt(key: CryptoKey, c: DmCipher): Promise<{ text: string; at: number } | null> {
  try {
    const plain = await subtle().decrypt({ name: 'AES-GCM', iv: fromB64(c.iv) }, key, fromB64(c.ct));
    const m: unknown = JSON.parse(TEXT_DECODER.decode(plain));
    if (typeof m !== 'object' || m === null) return null;
    const { t, a } = m as { t?: unknown; a?: unknown };
    if (typeof t !== 'string' || typeof a !== 'number') return null;
    return { text: t, at: a };
  } catch {
    return null;
  }
}
