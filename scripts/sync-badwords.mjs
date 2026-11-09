// src/net/badwords.json의 단어 목록을 supabase/schema.sql의 has_bad_word 함수로 옮겨요.
// 쓰는 법: 저장소 맨 위에서 `node scripts/sync-badwords.mjs` → 바뀐 schema.sql을 SQL Editor에서 다시 실행
//
// DB 쪽은 띄어쓰기·숫자·기호를 끼워 넣은 것과 따로 떨어진 짧은 단어(exact)까지는 잡지만,
// 자모로 풀어 쓴 것("ㅅㅔㄱㅅㅡ")을 다시 모으지는 않아요. 그건 화면 쪽(badwords.ts)만 잡아요.
import { readFileSync, writeFileSync } from 'node:fs';

const LIST_PATH = 'src/net/badwords.json';
const SQL_PATH = 'supabase/schema.sql';
const BEGIN = '-- >>> badwords';
const END = '-- <<< badwords';

const list = JSON.parse(readFileSync(LIST_PATH, 'utf8'));
const contains = Object.values(list.contains).flat();
const all = [...contains, ...list.exact, ...list.allow];

// SQL 안에 그대로 넣으니, 한글·자모·영문 소문자만 받아요 (따옴표나 정규식 기호가 섞이면 멈춰요)
const bad = all.filter((w) => !/^[가-힣ㄱ-ㅣa-z]+$/.test(w));
if (bad.length) {
  console.error(`한글·자모·영문 소문자만 쓸 수 있어요: ${bad.join(', ')}`);
  process.exit(1);
}

const block = `${BEGIN} (scripts/sync-badwords.mjs가 ${LIST_PATH}에서 채워요. 여기를 직접 고치지 마세요)
-- 커밋·방 이름에 막아야 할 말(욕설, 성적인 말, 혐오 표현, 정치 이야기)이 있는지
create or replace function public.has_bad_word(t text)
returns boolean
language sql
immutable
set search_path = public
as $fn$
  with p as (
    select lower(coalesce(t, '')) as plain
  ), s as (
    select plain,
      regexp_replace(regexp_replace(plain, '[^가-힣ㄱ-ㅣa-z]', '', 'g'), '${list.allow.join('|')}', '', 'g') as squeezed
    from p
  )
  select squeezed ~ '${contains.join('|')}'
    or exists (
      select 1 from regexp_split_to_table(plain, '[^가-힣ㄱ-ㅣa-z0-9]+') as w
      where regexp_replace(w, '[^가-힣ㄱ-ㅣa-z]', '', 'g') = any (array[${list.exact.map((w) => `'${w}'`).join(', ')}])
    )
  from s;
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
console.log(`단어 ${all.length}개를 ${SQL_PATH}에 옮겼어요. SQL Editor에서 schema.sql을 다시 실행하세요.`);
