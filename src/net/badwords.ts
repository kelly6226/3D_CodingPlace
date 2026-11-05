// 욕설 가리기
//
// 방명록·닉네임·방 이름은 누구나 쓸 수 있어서, 화면에 그리기 전에 아래 단어를 ***로 가려요.
// API로 직접 저장하면 DB에는 그대로 들어가니, 지워야 할 글은 Supabase Table Editor에서 지워요.
// 글자 사이에 공백·숫자·기호를 끼워 넣어도("시 발", "시1발") 잡도록 사이에 끼는 글자를 허용해요.
// 단어를 더하거나 빼려면 BAD_WORDS만 고치면 돼요.

const BAD_WORDS = ['시발', '씨발', '씨바', 'ㅅㅂ', 'ㅆㅂ', '병신', '좆', '개새끼', '개새기', '지랄', '미친놈', '미친년', 'fuck', 'shit', 'bitch'];

/** 단어 글자 사이에 끼워 넣어도 같은 단어로 보는 글자 (공백, 숫자, 기호) */
const FILLER = '[\\s\\d_.*~!@#$%^&+=-]*';
const escape = (ch: string) => ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const BAD_RE = new RegExp(BAD_WORDS.map((w) => [...w].map(escape).join(FILLER)).join('|'), 'gi');

/** 욕설이 들어 있는지 */
export function hasBadWord(s: string): boolean {
  BAD_RE.lastIndex = 0;
  return BAD_RE.test(s);
}

/** 욕설 부분을 같은 길이의 *로 바꾼 글자 */
export function maskBadWords(s: string): string {
  return s.replace(BAD_RE, (m) => '*'.repeat([...m].length));
}
