// src/net/badwords.json의 단어 목록을 supabase/schema.sql의 has_bad_word 함수로 옮겨요.
// 쓰는 법: 저장소 맨 위에서 `node scripts/sync-badwords.mjs` → 바뀐 schema.sql을 SQL Editor에서 다시 실행
//
// DB 쪽 검사 방식은 badwords.ts와 같지만, 자모로 풀어 쓴 것("ㅅㅔㄱㅅㅡ")은 화면 쪽만 잡아요.
import { readFileSync, writeFileSync } from 'node:fs';

const LIST_PATH = 'src/net/badwords.json';
const SQL_PATH = 'supabase/schema.sql';
const BEGIN = '-- >>> badwords';
const END = '-- <<< badwords';

const list = JSON.parse(readFileSync(LIST_PATH, 'utf8'));
const contains = Object.values(list.contains).flat();
const all = [...contains, ...list.exact, ...list.allow];
const allRaw = list.exactRaw;

// SQL 안에 그대로 넣으니, 한글·자모·영문 소문자만 받아요 (따옴표나 정규식 기호가 섞이면 멈춰요)
const bad = [...all.filter((w) => !/^[가-힣ㄱ-ㅣa-z]+$/.test(w)), ...allRaw.filter((w) => !/^[가-힣ㄱ-ㅣa-z0-9]+$/.test(w))];
if (bad.length) {
  console.error(`한글·자모·영문 소문자만 쓸 수 있어요: ${bad.join(', ')}`);
  process.exit(1);
}

// 전각 영문·숫자(ａｂｃ)를 보통 글자로 (badwords.ts의 toPlain과 같아요)
const ASCII = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const FULLWIDTH = [...ASCII].map((c) => String.fromCharCode(c.charCodeAt(0) + 0xfee0)).join('');
const sqlArray = (words) => `array[${words.map((w) => `'${w}'`).join(', ')}]::text[]`;
const LONG_WORD = 3; // badwords.ts의 LONG_WORD와 같아요
const JOSA = ['은', '는', '이', '가', '을', '를', '에', '의', '도', '들', '야', '아', '이야', '들아', '들은', '들이', '들도', '들을']; // badwords.ts의 JOSA와 같아요

const block = `${BEGIN} (scripts/sync-badwords.mjs가 ${LIST_PATH}에서 채워요. 여기를 직접 고치지 마세요)
-- 커밋·방 이름에 막아야 할 말(욕설, 성적인 말, 혐오 표현, 정치 이야기)이 있는지. 검사 방식은 src/net/badwords.ts 맨 위 설명과 같아요
-- (자모로 풀어 쓴 것은 화면 쪽만 잡아요)
create or replace function public.has_bad_word(t text)
returns boolean
language plpgsql
immutable
set search_path = public
as $fn$
declare
  contains_words constant text[] := ${sqlArray(contains)};
  long_words constant text[] := ${sqlArray(contains.filter((w) => [...w].length >= LONG_WORD))};
  exact_words constant text[] := ${sqlArray(list.exact)};
  exact_raw constant text[] := ${sqlArray(list.exactRaw)};
  josa constant text[] := ${sqlArray(JOSA)};
  allow_re constant text := '${list.allow.join('|')}';
  w text;
  c text;
  words text[] := '{}';
  units text[] := '{}';
  run text := '';
begin
  -- 1. 띄어쓰기로 나누고, 단어 안의 숫자·기호를 지워요 (영문은 숫자를 비슷한 글자로)
  foreach w in array regexp_split_to_array(lower(translate(coalesce(t, ''), '${FULLWIDTH}', '${ASCII}')), '\\s+') loop
    continue when w = '';
    if regexp_replace(w, '[^가-힣ㄱ-ㅣa-z0-9]', '', 'g') = any (exact_raw) then
      return true;
    end if;
    if w ~ '[a-z]' then
      w := translate(w, '013457@$', 'oieastas');
    end if;
    words := words || regexp_replace(regexp_replace(w, '[^가-힣ㄱ-ㅣa-z]', '', 'g'), allow_re, '', 'g');
  end loop;
  -- 2. 한 글자짜리 단어가 이어지면 붙여요
  foreach c in array words loop
    continue when c = '';
    units := units || c;
    if char_length(c) = 1 then
      run := run || c;
    else
      if run <> '' then units := units || run; end if;
      run := '';
    end if;
  end loop;
  if run <> '' then units := units || run; end if;
  -- 3. contains는 단어 안 어디든, exact는 단어 전체(뒤에 조사만 허용)
  foreach c in array units loop
    if exists (select 1 from unnest(contains_words) as x where strpos(c, x) > 0) then
      return true;
    end if;
    if c = any (exact_words) or exists (
      select 1 from unnest(josa) as j
      where char_length(c) > char_length(j) and right(c, char_length(j)) = j
        and left(c, char_length(c) - char_length(j)) = any (exact_words)
    ) then
      return true;
    end if;
  end loop;
  -- 4. 세 글자 이상 단어는 띄어쓰기를 무시한 전체 글에서도
  c := array_to_string(words, '');
  return exists (select 1 from unnest(long_words) as x where strpos(c, x) > 0);
end;
$fn$;
${END}`;

const sql = readFileSync(SQL_PATH, 'utf8');
const start = sql.indexOf(BEGIN);
const end = sql.indexOf(END);
if (start < 0 || end < start) {
  console.error(`${SQL_PATH}에서 '${BEGIN}' … '${END}' 구간을 찾지 못했어요`);
  process.exit(1);
}
writeFileSync(SQL_PATH, sql.slice(0, start) + block + sql.slice(end + END.length));
console.log(`단어 ${all.length + allRaw.length}개를 ${SQL_PATH}에 옮겼어요. SQL Editor에서 schema.sql을 다시 실행하세요.`);
