// 욕설·성적인 말·혐오 표현·정치 이야기 거르기
//
// 단어 목록은 badwords.json 한 곳에만 있어요. 고친 뒤에는 `node scripts/sync-badwords.mjs`로
// supabase/schema.sql의 같은 목록을 갱신하고 SQL을 다시 실행해요 (DB도 같은 단어로 막아요).
//
// - contains: 글 어디에 있어도 막아요. 띄어쓰기·숫자·기호를 끼워 넣거나("섹 스", "시1발")
//   자모로 풀어 써도("ㅅㅔㄱㅅㅡ") 잡아요.
// - exact: 다른 말 안에 자주 섞이는 짧은 단어("보지 마세요", "새끼손가락")라서, 따로 떨어진 단어일 때만 막아요.
// - allow: contains에 걸리지만 괜찮은 말("시발점")은 먼저 빼고 검사해요.
import LIST from './badwords.json';

const CONTAINS = Object.values(LIST.contains).flat();

const CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
const JUNG = 'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ';
const JONG = ' ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ';
const HANGUL_BASE = 0xac00;

/** 따로 쓴 자모를 글자로 모아요: "ㅅㅔㄱㅅㅡ" → "섹스". 모음이 없는 줄임말("ㅅㅂ")은 그대로 둬요 */
function composeJamo(s: string): string {
  const ch = [...s];
  let out = '';
  for (let i = 0; i < ch.length; i++) {
    const cho = CHO.indexOf(ch[i]);
    const jung = cho >= 0 && i + 1 < ch.length ? JUNG.indexOf(ch[i + 1]) : -1;
    if (cho < 0 || jung < 0) {
      out += ch[i];
      continue;
    }
    // 받침 뒤에 모음이 오면 그 자음은 다음 글자의 첫소리예요
    const jongCandidate = i + 2 < ch.length ? JONG.indexOf(ch[i + 2]) : -1;
    const nextIsVowel = i + 3 < ch.length && JUNG.includes(ch[i + 3]);
    const jong = jongCandidate > 0 && !nextIsVowel ? jongCandidate : 0;
    out += String.fromCharCode(HANGUL_BASE + (cho * 21 + jung) * 28 + jong);
    i += jong > 0 ? 2 : 1;
  }
  return out;
}

/** 전각 영문·숫자(ａｂｃ)를 보통 글자로, 대문자를 소문자로 */
function toPlain(s: string): string {
  return s.replace(/[！-～]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).toLowerCase();
}

/** 한글·자모·영문만 남겨요 (띄어쓰기·숫자·기호·안 보이는 글자를 끼워 넣은 것을 없애요) */
const NOT_LETTER = /[^가-힣ㄱ-ㅣa-z]/g;
/** 단어를 나누는 글자 */
const WORD_SPLIT = /[^가-힣ㄱ-ㅣa-z0-9]+/;

const escape = (w: string) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const CONTAINS_RE = new RegExp(CONTAINS.map(escape).join('|'));
const ALLOW_RE = new RegExp(LIST.allow.map(escape).join('|'), 'g');
const EXACT = new Set(LIST.exact);

/** 막아야 할 말이 들어 있는지 */
export function hasBadWord(s: string): boolean {
  const plain = toPlain(s);
  const squeezed = composeJamo(plain.replace(NOT_LETTER, '')).replace(ALLOW_RE, '');
  if (CONTAINS_RE.test(squeezed)) return true;
  return plain.split(WORD_SPLIT).some((w) => EXACT.has(composeJamo(w.replace(NOT_LETTER, ''))));
}

/** 막았을 때 보여주는 이유. 뒤에 '다른 말로 적어주세요' 같은 안내를 붙여 써요 */
export const BLOCKED_WORDS_REASON = '욕설, 성적인 말, 혐오 표현, 정치 이야기는 쓸 수 없어요.';

/** DB(has_bad_word)가 막아서 저장에 실패했는지. schema.sql의 raise exception 'blocked words'와 같아야 해요 */
export function isBlockedWordsError(e: unknown): boolean {
  return e instanceof Error && e.message.includes('blocked words');
}

/** 막아야 할 말이 있으면 글 전체를 같은 길이의 *로 가려요 (다른 사람이 보낸 이름·글을 화면에 그릴 때) */
export function maskIfBad(s: string): string {
  return hasBadWord(s) ? '*'.repeat([...s].length) : s;
}
