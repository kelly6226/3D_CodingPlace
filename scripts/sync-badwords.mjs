// src/net/badwords.json을 supabase/schema.sql의 금칙어 함수(has_bad_word 등)로 옮겨요.
// 쓰는 법: 저장소 맨 위에서 `node scripts/sync-badwords.mjs` → 바뀐 schema.sql을 SQL Editor에서 다시 실행
//
// 검사 순서는 src/net/badwords.ts 맨 위 설명과 같아요. 다른 점은 하나:
// 따로 쓴 자모를 글자로 모으는 것("ㅅㅔㄱㅅㅡ" → "섹스")은 화면 쪽만 해요.
import { readFileSync, writeFileSync } from 'node:fs';

const LIST_PATH = 'src/net/badwords.json';
const SQL_PATH = 'supabase/schema.sql';
const BEGIN = '-- >>> badwords';
const END = '-- <<< badwords';

// badwords.ts와 같아야 해요
const CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
const JUNG = 'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ';
const JONG = ' ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ';
const COMPOUND = { ㄳ: 'ㄱㅅ', ㄵ: 'ㄴㅈ', ㄶ: 'ㄴㅎ', ㄺ: 'ㄹㄱ', ㄻ: 'ㄹㅁ', ㄼ: 'ㄹㅂ', ㄽ: 'ㄹㅅ', ㄾ: 'ㄹㅌ', ㄿ: 'ㄹㅍ', ㅀ: 'ㄹㅎ', ㅄ: 'ㅂㅅ' };
const LONG_WORD = 3;
const JOSA = ['은', '는', '이', '가', '을', '를', '에', '의', '도', '들', '야', '아', '이야', '들아', '들은', '들이', '들도', '들을'];
const LEET_FROM = '013457@$';
const LEET_TO = 'oieastas';

const list = JSON.parse(readFileSync(LIST_PATH, 'utf8'));
const contains = Object.values(list.contains).flat();
const variantSource = list.initialVariants.flatMap((cat) => list.contains[cat]);

// SQL 안에 그대로 넣으니, 한글·자모·영문 소문자(exactRaw는 숫자까지)만 받아요
const WORD = /^[가-힣ㄱ-ㅣa-z]+$/;
const bad = [
  ...[...contains, ...list.exact, ...list.allow].filter((w) => !WORD.test(w)),
  ...list.exactRaw.filter((w) => !/^[가-힣ㄱ-ㅣa-z0-9]+$/.test(w)),
];
if (bad.length) {
  console.error(`한글·자모·영문 소문자만 쓸 수 있어요: ${bad.join(', ')}`);
  process.exit(1);
}

const q = (s) => `'${s.replace(/'/g, "''")}'`;
const arr = (words) => `array[${words.map(q).join(', ')}]::text[]`;
/** 자모 하나 → 비슷한 소리 묶음의 대표 자모 번호 (0부터) */
const indexMap = (chars, map) => `array[${[...chars].map((c) => chars.indexOf(map[c] ?? c)).join(',')}]::int[]`;
const ASCII = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const FULLWIDTH = [...ASCII].map((c) => String.fromCharCode(c.charCodeAt(0) + 0xfee0)).join('');
const glyphFrom = Object.keys(list.homoglyph).join('');
const glyphTo = Object.values(list.homoglyph).join('');
const choFrom = Object.keys(list.similar.cho).filter((k) => !k.startsWith('_')).join('');
const choTo = Object.entries(list.similar.cho).filter(([k]) => !k.startsWith('_')).map(([, v]) => v).join('');

const block = `${BEGIN} (scripts/sync-badwords.mjs가 ${LIST_PATH}에서 채워요. 여기를 직접 고치지 마세요)
-- 금칙어(욕설, 성적인 말, 혐오 표현, 정치 이야기) 검사. 순서는 src/net/badwords.ts 맨 위 설명과 같아요
-- (따로 쓴 자모를 글자로 모으는 것만 화면 쪽에서 해요)

-- 겹받침 나누기("섻" → "섹ㅅ")와 늘인 모음 줄이기("씨이발" → "씨발", "조온나" → "존나")
create or replace function public.ko_shrink(t text)
returns text
language plpgsql
immutable
set search_path = public
as $fn$
declare
  jong_chars constant text := ${q(JONG)};
  compound_from constant text := ${q(Object.keys(COMPOUND).join(''))};
  compound_first constant text := ${q(Object.values(COMPOUND).map((p) => p[0]).join(''))};
  compound_second constant text := ${q(Object.values(COMPOUND).map((p) => p[1]).join(''))};
  out_chars text[] := '{}';
  ch text;
  code int;
  prev int;
  jong int;
  k int;
begin
  if coalesce(t, '') = '' then
    return '';
  end if;
  foreach ch in array regexp_split_to_array(t, '') loop
    code := ascii(ch);
    if code not between 44032 and 55203 then
      out_chars := out_chars || ch;
      continue;
    end if;
    -- 앞 글자와 같은 모음을 'ㅇ'으로 한 번 더 낸 글자면 앞 글자에 합쳐요 (받침은 앞 글자로)
    if cardinality(out_chars) > 0 then
      prev := ascii(out_chars[cardinality(out_chars)]);
      if prev between 44032 and 55203 and (prev - 44032) % 28 = 0
         and (code - 44032) / 588 = ${CHO.indexOf('ㅇ')}
         and ((code - 44032) % 588) / 28 = ((prev - 44032) % 588) / 28 then
        out_chars := out_chars[1:cardinality(out_chars) - 1];
        code := prev + (code - 44032) % 28;
      end if;
    end if;
    jong := (code - 44032) % 28;
    k := strpos(compound_from, substr(jong_chars, jong + 1, 1));
    if jong > 0 and k > 0 then
      out_chars := out_chars
        || chr(code - jong + strpos(jong_chars, substr(compound_first, k, 1)) - 1)
        || substr(compound_second, k, 1);
    else
      out_chars := out_chars || chr(code);
    end if;
  end loop;
  return array_to_string(out_chars, '');
end;
$fn$;

-- 비슷한 소리를 한 묶음으로("쎅쓰" → "섹스")
create or replace function public.ko_similar(t text)
returns text
language plpgsql
immutable
set search_path = public
as $fn$
declare
  cho_map constant int[] := ${indexMap(CHO, list.similar.cho)};
  jung_map constant int[] := ${indexMap(JUNG, list.similar.jung)};
  jong_map constant int[] := ${indexMap(JONG, list.similar.jong)};
  out_chars text[] := '{}';
  ch text;
  i int;
begin
  if coalesce(t, '') = '' then
    return '';
  end if;
  foreach ch in array regexp_split_to_array(t, '') loop
    i := ascii(ch) - 44032;
    if i between 0 and 11171 then
      out_chars := out_chars || chr(44032 + (cho_map[i / 588 + 1] * 21 + jung_map[(i % 588) / 28 + 1]) * 28 + jong_map[i % 28 + 1]);
    else
      out_chars := out_chars || translate(ch, ${q(choFrom)}, ${q(choTo)});
    end if;
  end loop;
  return array_to_string(out_chars, '');
end;
$fn$;

-- 첫 글자나 끝 글자를 초성만 쓴 것: "시발" → "ㅅ발", "시ㅂ"
create or replace function public.ko_initial_variants(w text)
returns text[]
language plpgsql
immutable
set search_path = public
as $fn$
declare
  cho_chars constant text := ${q(CHO)};
  n int := char_length(coalesce(w, ''));
begin
  if n < 2 or w !~ '^[가-힣]+$' then
    return '{}';
  end if;
  return array[
    substr(cho_chars, (ascii(left(w, 1)) - 44032) / 588 + 1, 1) || substr(w, 2),
    left(w, n - 1) || substr(cho_chars, (ascii(right(w, 1)) - 44032) / 588 + 1, 1)
  ];
end;
$fn$;

create or replace function public.has_bad_word(t text)
returns boolean
language plpgsql
immutable
set search_path = public
as $fn$
declare
  contains_words constant text[] := ${arr(contains)};
  variant_source constant text[] := ${arr(variantSource)};
  exact_words constant text[] := ${arr(list.exact)};
  exact_raw constant text[] := ${arr(list.exactRaw)};
  allow_words constant text[] := ${arr(list.allow)};
  josa constant text[] := ${arr(JOSA)};
  short_words text[];
  multi_words text[];
  allow_re text;
  allow_similar_re text;
  w text;
  c text;
  base text[] := '{}';
  near text[] := '{}';
  units text[];
  run text;
  pass int;
begin
  -- 찾을 단어 준비: 한 글자는 그대로, 두 글자 이상은 비슷한 소리로 바꿔서 (초성 변형 포함)
  short_words := array(select x from unnest(contains_words) as x where char_length(x) = 1);
  multi_words := array(
    select distinct public.ko_similar(public.ko_shrink(src.x))
    from (
      select x from unnest(contains_words) as x where char_length(x) >= 2
      union all
      select v from unnest(variant_source) as s, unnest(public.ko_initial_variants(s)) as v
    ) as src(x)
  );
  allow_re := (select string_agg(public.ko_shrink(a), '|') from unnest(allow_words) as a);
  allow_similar_re := (select string_agg(public.ko_similar(public.ko_shrink(a)), '|') from unnest(allow_words) as a);

  -- 1~6. 띄어쓰기로 나눈 단어마다: 전각·키릴 → 영문, 숫자 단어(exactRaw), 영문 숫자 치환, 기호 지우기, 겹받침·늘인 모음
  foreach w in array regexp_split_to_array(
    translate(lower(translate(coalesce(t, ''), ${q(FULLWIDTH)}, ${q(ASCII)})), ${q(glyphFrom)}, ${q(glyphTo)}),
    '\\s+'
  ) loop
    continue when w = '';
    if regexp_replace(w, '[^가-힣ㄱ-ㅣa-z0-9]', '', 'g') = any (exact_raw) then
      return true;
    end if;
    if w ~ '[a-z]' then
      w := translate(w, ${q(LEET_FROM)}, ${q(LEET_TO)});
    end if;
    c := regexp_replace(public.ko_shrink(regexp_replace(w, '[^가-힣ㄱ-ㅣa-z]', '', 'g')), allow_re, '', 'g');
    base := base || c;
    -- 7. 비슷한 소리
    near := near || regexp_replace(public.ko_similar(c), allow_similar_re, '', 'g');
  end loop;

  -- 단어 + 한 글자짜리 단어를 이어 붙인 것. pass 1은 그대로(exact, 한 글자 단어), pass 2는 비슷한 소리(두 글자 이상)
  for pass in 1..2 loop
    units := '{}';
    run := '';
    foreach c in array case when pass = 1 then base else near end loop
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

    foreach c in array units loop
      if pass = 1 then
        if c = any (exact_words) or exists (
          select 1 from unnest(josa) as j
          where char_length(c) > char_length(j) and right(c, char_length(j)) = j
            and left(c, char_length(c) - char_length(j)) = any (exact_words)
        ) or exists (select 1 from unnest(short_words) as x where strpos(c, x) > 0) then
          return true;
        end if;
      elsif exists (select 1 from unnest(multi_words) as x where strpos(c, x) > 0) then
        return true;
      end if;
    end loop;
  end loop;

  -- 세 글자 이상 단어는 띄어쓰기를 무시한 전체 글에서도
  c := array_to_string(near, '');
  return exists (select 1 from unnest(multi_words) as x where char_length(x) >= ${LONG_WORD} and strpos(c, x) > 0);
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
console.log(`단어 ${contains.length + list.exact.length + list.exactRaw.length + list.allow.length}개를 ${SQL_PATH}에 옮겼어요. SQL Editor에서 schema.sql을 다시 실행하세요.`);
