// 욕설·성적인 말·혐오 표현·정치 이야기 거르기
//
// 단어 목록은 badwords.json 한 곳에만 있어요. 고친 뒤에는 `node scripts/sync-badwords.mjs`로
// supabase/schema.sql의 같은 목록을 갱신하고 SQL을 다시 실행해요 (DB도 같은 방식으로 막아요).
//
// 검사 방식 (띄어쓰기를 다 지우면 "3시 발표"가 "시발"로 걸려서, 단어 단위로 봐요)
// 1. 띄어쓰기로 단어를 나누고, 단어 안의 숫자·기호는 지워요: "시1발" → "시발", "섹.스" → "섹스"
// 2. 한 글자짜리 단어가 이어지면 붙여요: "섹 스" → "섹스", "윤 석 열" → "윤석열" ("3시 발표"는 안 붙여요)
// 3. contains의 단어가 1·2의 어느 단어 안에 들어 있으면 막아요
// 4. 세 글자 이상 단어는 띄어쓰기를 무시한 전체 글에서도 찾아요: "이 재명" → "이재명"
// 5. exact는 단어 전체가 그 말이거나 뒤에 조사만 붙었을 때 막아요: "새끼들"은 막고 "새끼손가락"은 통과
// 6. exactRaw는 숫자까지 그대로 비교해요: "2찍"
// - 영문 단어는 숫자를 비슷한 글자로 바꿔 봐요: "sh1t" → "shit", "5ex" → "sex"
// - 따로 쓴 자모는 글자로 모아요: "ㅅㅔㄱㅅㅡ" → "섹스" (화면 쪽만. DB는 안 해요)
// - allow의 말("시발점")은 먼저 빼고 검사해요
import LIST from './badwords.json';

const CONTAINS = Object.values(LIST.contains).flat();
/** 띄어쓰기를 무시하고 찾아도 다른 말과 잘 안 겹치는 길이 */
const LONG_WORD = 3;
const LONG = CONTAINS.filter((w) => [...w].length >= LONG_WORD);
const EXACT = new Set(LIST.exact);
const EXACT_RAW = new Set(LIST.exactRaw);
/** exact 단어 뒤에 붙어도 같은 말로 보는 조사 */
const JOSA = ['은', '는', '이', '가', '을', '를', '에', '의', '도', '들', '야', '아', '이야', '들아', '들은', '들이', '들도', '들을'];
/** 영문 단어 안의 숫자·기호를 비슷한 글자로 */
const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', $: 's' };

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

const NOT_LETTER = /[^가-힣ㄱ-ㅣa-z]/g;
const escape = (w: string) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const ALLOW_RE = new RegExp(LIST.allow.map(escape).join('|'), 'g');

/** 단어 하나를 검사용 글자로: 영문이 있으면 숫자를 글자로 바꾸고, 숫자·기호를 지우고, 자모를 모아요 */
function cleanWord(raw: string): string {
  const leet = /[a-z]/.test(raw) ? raw.replace(/[013457@$]/g, (c) => LEET[c]) : raw;
  return composeJamo(leet.replace(NOT_LETTER, '')).replace(ALLOW_RE, '');
}

/** 한 글자짜리 단어가 이어지면 붙여요. 숫자·기호만 있던 단어(빈 글자)는 건너뛰어요 */
function joinSingles(words: string[]): string[] {
  const out: string[] = [];
  let run = '';
  for (const w of words) {
    if (w === '') continue;
    if ([...w].length === 1) {
      run += w;
      continue;
    }
    if (run) out.push(run);
    run = '';
    out.push(w);
  }
  if (run) out.push(run);
  return out;
}

const isExact = (w: string) => EXACT.has(w) || JOSA.some((j) => w.endsWith(j) && EXACT.has(w.slice(0, -j.length)));

/** 막아야 할 말이 들어 있는지 */
export function hasBadWord(s: string): boolean {
  const rawWords = toPlain(s).split(/\s+/).filter(Boolean);
  if (rawWords.some((w) => EXACT_RAW.has(w.replace(/[^가-힣ㄱ-ㅣa-z0-9]/g, '')))) return true;
  const words = rawWords.map(cleanWord);
  const units = [...words.filter(Boolean), ...joinSingles(words)];
  if (units.some((u) => CONTAINS.some((w) => u.includes(w)) || isExact(u))) return true;
  const whole = words.join('');
  return LONG.some((w) => whole.includes(w));
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
