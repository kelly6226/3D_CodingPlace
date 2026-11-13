// 이어하기 코드: 로그인 대신 "같은 사람"을 알아보는 무작위 값
// Crockford Base32(헷갈리는 I, L, O, U를 뺀 32글자)로 20글자 = 100비트라 찍어서 맞힐 수 없어요.
// 형식은 supabase/schema.sql 8번의 sync_code_hash와 같아야 해요.

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const CODE_LENGTH = 20;
/** 화면에 보여줄 때 몇 글자씩 끊는지 (ABCD-EFGH-…) */
const GROUP_SIZE = 4;
const CODE_RE = /^[0-9A-HJKMNP-TV-Z]{20}$/;

/** 새 코드 (글자마다 무작위 5비트) */
export function newSyncCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(CODE_LENGTH));
  // 256은 32로 나누어떨어져서 아래 5비트만 쓰면 글자마다 확률이 같아요
  return Array.from(bytes, (b) => ALPHABET[b & 31]).join('');
}

/**
 * 사람이 옮겨 적은 코드를 서버 형식으로. 대소문자, 띄어쓰기, 하이픈은 상관없고
 * 헷갈리기 쉬운 O는 0으로, I·L은 1로 읽어요. 링크나 안내 글을 통째로 붙여 넣어도 링크 속 코드를 찾아요.
 * 형식이 맞지 않으면 null
 */
export function parseSyncCode(input: string): string | null {
  const code = (codeInLink(input) ?? input)
    .toUpperCase()
    .replace(/[\s-]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
  return CODE_RE.test(code) ? code : null;
}

/** 화면에 보여줄 모양: ABCD-EFGH-JKMN-PQRS-TVWX */
export function formatSyncCode(code: string): string {
  return code.match(new RegExp(`.{1,${GROUP_SIZE}}`, 'g'))?.join('-') ?? code;
}

// 주소의 # 뒤에 담아요. # 뒤는 서버로 가지 않아서 접속 기록이나 Referer에 남지 않아요
const LINK_KEY = 'sync';

/** 다른 기기에서 열면 이 코드로 이어하기를 물어보는 링크 */
export function syncLink(code: string): string {
  return `${location.origin}/#${LINK_KEY}=${formatSyncCode(code)}`;
}

/**
 * '#sync=' 바로 뒤의 코드 20글자(4글자씩 하이픈은 있어도 없어도). 없으면 null.
 * 메신저가 링크 뒤에 붙은 글자까지 링크로 묶어도(…CMQM온라인) 코드 뒤는 버려요
 */
function codeInLink(text: string): string | null {
  const m = safeDecode(text).match(new RegExp(`#${LINK_KEY}=([0-9A-Za-z]{4}(?:-?[0-9A-Za-z]{4}){4})`));
  return m ? m[1] : null;
}

/** 링크 속 한글이 %EC%98… 처럼 바뀌어 와도 읽을 수 있게. 잘못된 % 글자가 있으면 그대로 */
function safeDecode(text: string): string {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

/** 지금 주소에 이어하기 코드가 있으면 꺼내고, 주소에서는 지워요 (방문 기록에 남지 않게) */
export function takeSyncCodeFromUrl(): string | null {
  const hash = location.hash;
  if (!hash.startsWith(`#${LINK_KEY}=`)) return null;
  history.replaceState(null, '', location.pathname + location.search);
  const code = codeInLink(hash);
  return code ? parseSyncCode(code) : null;
}
