// 욕설·성적인 말·혐오 표현·정치 이야기 거르기
//
// 단어 목록과 비슷한 소리 묶음은 badwords.json 한 곳에만 있어요. 고친 뒤에는 `node scripts/sync-badwords.mjs`로
// supabase/schema.sql을 갱신하고 SQL을 다시 실행해요 (DB도 같은 방식으로 막아요).
//
// 다른 필터들이 쓰는 방식을 참고했어요: 기호·숫자·자모를 지우고 비슷한 소리를 한 묶음으로 보기(인천대 변형 금칙어 논문),
// 숫자·기호 치환, 늘인 글자 줄이기, 비슷하게 생긴 외국 글자, 예외 목록(terlik.js).
//
// 단어 하나를 검사용 글자로 바꾸는 순서
// 1. 전각 영문(ａ)·비슷하게 생긴 키릴 문자(а)를 보통 영문으로, 소문자로
// 2. 영문 단어는 숫자·기호를 비슷한 글자로: "sh1t" → "shit"
// 3. 한글·자모·영문만 남기기: "시1발" → "시발", "섹.스" → "섹스"
// 4. 따로 쓴 자모를 글자로 모으기: "ㅅㅔㄱㅅㅡ" → "섹스" (화면 쪽만. DB는 안 해요)
// 5. 겹받침을 두 글자로 나누기: "섻" → "섹ㅅ"
// 6. 늘인 모음 줄이기: "씨이발" → "씨발", "조온나" → "존나"
// 7. 비슷한 소리로 바꾸기(similar): "쎅쓰" → "섹스". 두 글자 이상 단어를 찾을 때만 써요
//    (한 글자 단어와 exact는 그대로 비교해요. "썅" → "상", "새끼" → "세기"처럼 다른 말과 겹쳐서)
//
// 찾는 방법
// - contains: 단어 안 어디든. 한 글자짜리 단어가 이어지면 붙여서도 봐요("섹 스", "윤 석 열")
// - 세 글자 이상 contains 단어는 띄어쓰기를 무시한 전체 글에서도: "이 재명"
// - initialVariants 묶음의 두 글자 이상 단어는 첫 글자나 끝 글자를 초성만 쓴 것도: "ㅅ발", "섹ㅅ"
// - exact: 단어 전체가 그 말이거나 뒤에 조사만 붙었을 때: "새끼들"은 막고 "새끼손가락"은 통과
// - exactRaw: 숫자까지 그대로: "2찍"
// - allow: 걸리지만 괜찮은 말("시발점", "시바견")은 먼저 빼고 검사
import LIST from './badwords.json';

const CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
const JUNG = 'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ';
const JONG = ' ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ';
const HANGUL_BASE = 0xac00;
const HANGUL_LAST = 0xd7a3;
/** 초성 ㅇ의 자리 (늘인 모음 찾기) */
const CHO_IEUNG = CHO.indexOf('ㅇ');
/** 겹받침 → 앞 받침 + 뒤 자음 */
const COMPOUND_JONG: Record<string, [string, string]> = {
  ㄳ: ['ㄱ', 'ㅅ'], ㄵ: ['ㄴ', 'ㅈ'], ㄶ: ['ㄴ', 'ㅎ'], ㄺ: ['ㄹ', 'ㄱ'], ㄻ: ['ㄹ', 'ㅁ'], ㄼ: ['ㄹ', 'ㅂ'],
  ㄽ: ['ㄹ', 'ㅅ'], ㄾ: ['ㄹ', 'ㅌ'], ㄿ: ['ㄹ', 'ㅍ'], ㅀ: ['ㄹ', 'ㅎ'], ㅄ: ['ㅂ', 'ㅅ'],
};

const LONG_WORD = 3;
/** exact 단어 뒤에 붙어도 같은 말로 보는 조사 */
const JOSA = ['은', '는', '이', '가', '을', '를', '에', '의', '도', '들', '야', '아', '이야', '들아', '들은', '들이', '들도', '들을'];
/** 영문 단어 안의 숫자·기호를 비슷한 글자로 */
const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', $: 's' };
const HOMOGLYPH: Record<string, string> = LIST.homoglyph;
const SIMILAR = LIST.similar as { cho: Record<string, string>; jung: Record<string, string>; jong: Record<string, string> };

type Syllable = { cho: number; jung: number; jong: number };
const isSyllable = (ch: string) => {
  const c = ch.charCodeAt(0);
  return c >= HANGUL_BASE && c <= HANGUL_LAST;
};
const split3 = (ch: string): Syllable => {
  const i = ch.charCodeAt(0) - HANGUL_BASE;
  return { cho: Math.floor(i / 588), jung: Math.floor((i % 588) / 28), jong: i % 28 };
};
const join3 = ({ cho, jung, jong }: Syllable) => String.fromCharCode(HANGUL_BASE + (cho * 21 + jung) * 28 + jong);

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
    out += join3({ cho, jung, jong });
    i += jong > 0 ? 2 : 1;
  }
  return out;
}

/** 겹받침 나누기("섻" → "섹ㅅ")와 늘인 모음 줄이기("씨이발" → "씨발", "조온나" → "존나") */
function splitAndShrink(s: string): string {
  const out: string[] = [];
  const pushSyllable = (syl: Syllable) => {
    const pair = COMPOUND_JONG[JONG[syl.jong]];
    if (!pair) {
      out.push(join3(syl));
      return;
    }
    out.push(join3({ ...syl, jong: JONG.indexOf(pair[0]) }), pair[1]);
  };
  for (const ch of s) {
    if (!isSyllable(ch)) {
      out.push(ch);
      continue;
    }
    const cur = split3(ch);
    const prevCh = out[out.length - 1];
    const prev = prevCh && isSyllable(prevCh) ? split3(prevCh) : null;
    // 앞 글자와 같은 모음을 'ㅇ'으로 한 번 더 낸 글자면, 앞 글자에 합쳐요 (받침은 앞 글자로 옮겨요)
    if (prev && prev.jong === 0 && cur.cho === CHO_IEUNG && cur.jung === prev.jung) {
      out.pop();
      pushSyllable({ ...prev, jong: cur.jong });
      continue;
    }
    pushSyllable(cur);
  }
  return out.join('');
}

/** 비슷한 소리를 한 묶음으로: "쎅쓰" → "섹스", "씨빨" → "시발" */
function similar(s: string): string {
  return [...s]
    .map((ch) => {
      if (!isSyllable(ch)) return SIMILAR.cho[ch] ?? ch;
      const { cho, jung, jong } = split3(ch);
      return join3({
        cho: CHO.indexOf(SIMILAR.cho[CHO[cho]] ?? CHO[cho]),
        jung: JUNG.indexOf(SIMILAR.jung[JUNG[jung]] ?? JUNG[jung]),
        jong: JONG.indexOf(SIMILAR.jong[JONG[jong]] ?? JONG[jong]),
      });
    })
    .join('');
}

/** 1. 전각·키릴 문자를 보통 영문으로, 소문자로 */
function toPlain(s: string): string {
  return [...s.replace(/[！-～]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).toLowerCase()]
    .map((c) => HOMOGLYPH[c] ?? c)
    .join('');
}

const NOT_LETTER = /[^가-힣ㄱ-ㅣa-z]/g;
const NOT_LETTER_OR_DIGIT = /[^가-힣ㄱ-ㅣa-z0-9]/g;

/** 2~6: 단어 하나를 검사용 글자로 (비슷한 소리는 아직 안 바꿔요) */
function baseForm(word: string): string {
  const leet = /[a-z]/.test(word) ? word.replace(/[013457@$]/g, (c) => LEET[c]) : word;
  return splitAndShrink(composeJamo(leet.replace(NOT_LETTER, '')));
}

const escape = (w: string) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const anyOf = (words: string[]) => new RegExp(words.map(escape).join('|'), 'g');
const sylCount = (w: string) => [...w].length;

const ALL_CONTAINS = Object.values(LIST.contains).flat();
/** 첫 글자나 끝 글자를 초성만 쓴 것: "시발" → "ㅅ발", "시ㅂ" */
const initialVariants = (w: string) => {
  const ch = [...w];
  if (ch.length < 2 || !ch.every(isSyllable)) return [];
  const first = CHO[split3(ch[0]).cho];
  const last = CHO[split3(ch[ch.length - 1]).cho];
  return [first + ch.slice(1).join(''), ch.slice(0, -1).join('') + last];
};
const VARIANTS = (LIST.initialVariants as (keyof typeof LIST.contains)[]).flatMap((cat) => LIST.contains[cat].flatMap(initialVariants));

/** 한 글자 단어: 비슷한 소리로 바꾸지 않고 그대로 찾아요 */
const SHORT = ALL_CONTAINS.filter((w) => sylCount(w) === 1);
/** 두 글자 이상 단어: 비슷한 소리로 바꾼 글에서 찾아요 */
const MULTI = [...new Set([...ALL_CONTAINS.filter((w) => sylCount(w) >= 2), ...VARIANTS].map((w) => similar(splitAndShrink(w))))];
const LONG = MULTI.filter((w) => sylCount(w) >= LONG_WORD);
const EXACT = new Set(LIST.exact);
const EXACT_RAW = new Set(LIST.exactRaw);
const ALLOW_RE = anyOf(LIST.allow.map(splitAndShrink));
const ALLOW_SIMILAR_RE = anyOf(LIST.allow.map((w) => similar(splitAndShrink(w))));

/** 한 글자짜리 단어가 이어지면 붙여요. 숫자·기호만 있던 단어(빈 글자)는 건너뛰어요 */
function joinSingles(words: string[]): string[] {
  const out: string[] = [];
  let run = '';
  for (const w of words) {
    if (w === '') continue;
    if (sylCount(w) === 1) {
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
const units = (words: string[]) => [...words.filter(Boolean), ...joinSingles(words)];

/** 막아야 할 말이 들어 있는지 */
export function hasBadWord(s: string): boolean {
  const rawWords = toPlain(s).split(/\s+/).filter(Boolean);
  if (rawWords.some((w) => EXACT_RAW.has(w.replace(NOT_LETTER_OR_DIGIT, '')))) return true;
  const base = rawWords.map(baseForm).map((w) => w.replace(ALLOW_RE, ''));
  if (units(base).some((u) => isExact(u) || SHORT.some((w) => u.includes(w)))) return true;
  const near = base.map((w) => similar(w).replace(ALLOW_SIMILAR_RE, ''));
  if (units(near).some((u) => MULTI.some((w) => u.includes(w)))) return true;
  const whole = near.join('');
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
