-- 온라인 모각코: 방 목록 + 커밋 방명록 (+ 비밀번호 방)
-- Supabase 대시보드 > SQL Editor 에 이 파일 내용을 그대로 붙여넣고 Run 하세요.
-- 여러 번 실행해도 괜찮아요. 코드를 업데이트한 뒤엔 한 번 더 실행하면 돼요.
--
-- 보안 원칙
-- - 브라우저에 들어가는 publishable 키(anon 역할)로는 "읽기 + 정해진 모양의 쓰기"만 가능
-- - 수정·삭제는 대시보드(관리자)에서만
-- - 모든 테이블에 RLS, 함수는 search_path 고정
-- (실시간 접속자/이동/이모트는 Realtime 채널만 써서 테이블이 필요 없어요)


-- 비밀번호 방인지 (정책에서 쓰려고 맨 앞에 둬요. rooms 표는 아래 2번에서 만들고, 함수는 부를 때 표를 찾아요)
create or replace function public.room_is_locked(p_slug text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return exists (select 1 from public.rooms where slug = p_slug and pw_check is not null);
exception when undefined_table or undefined_column then
  return false;
end;
$$;

-- >>> badwords (scripts/sync-badwords.mjs가 src/net/badwords.json에서 채워요. 여기를 직접 고치지 마세요)
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
  jong_chars constant text := ' ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ';
  compound_from constant text := 'ㄳㄵㄶㄺㄻㄼㄽㄾㄿㅀㅄ';
  compound_first constant text := 'ㄱㄴㄴㄹㄹㄹㄹㄹㄹㄹㅂ';
  compound_second constant text := 'ㅅㅈㅎㄱㅁㅂㅅㅌㅍㅎㅅ';
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
         and (code - 44032) / 588 = 11
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
  cho_map constant int[] := array[0,0,2,3,3,5,6,7,7,9,9,11,12,12,14,15,16,17,18]::int[];
  jung_map constant int[] := array[0,5,2,5,4,5,6,5,8,9,15,15,12,13,14,15,16,17,18,19,20]::int[];
  jong_map constant int[] := array[0,1,1,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,19,21,22,23,1,25,26,27]::int[];
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
      out_chars := out_chars || translate(ch, 'ㄲㄸㅃㅆㅉ', 'ㄱㄷㅂㅅㅈ');
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
  cho_chars constant text := 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
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
  contains_words constant text[] := array['시발', '씨발', '씨빨', '씨팔', '시팔', '씨바', '씨벌', '시벌', '쓰벌', '십팔', '십새', '씹새', '씹창', '씹년', '씹놈', '씹할', '좆', '좇같', '존나', '존내', '졸라게', '개새끼', '개새기', '개색기', '개색히', '개섀끼', '개세끼', '느금마', '니애미', '니애비', '니엄마', '느개비', '엠창', '애미뒤', '애비뒤', '병신', '븅신', '빙신', '병싄', '지랄', '염병', '미친놈', '미친년', '썅년', '쌍년', '쌍놈', '개놈', '걸레년', 'ㅅㅂ', 'ㅆㅂ', 'ㅂㅅ', 'ㅄ', 'ㅈㄹ', 'ㅈㄴ', 'ㅅㅍ', 'ㄴㄱㅁ', 'fuck', 'shit', 'bitch', 'asshole', 'motherf', 'cunt', 'bastard', '씨이발', '시이발', '개새', '개쉐', '개새꺄', '새꺄', 'fvck', 'phuck', '시바', '씨부랄', '시부랄', '좆까', 'ㅈ까', '좆같', '개같은', '호로새끼', '썅', '섹스', '섹수', '쎅스', '섹쓰', '쎅쓰', '야동', '보지털', '자지털', '보짓', '보빨', '딸딸이', '펠라', '사까시', '질싸', '노콘', '강간', '윤간', '몰카', '꼴리', 'sex', 'porn', 'pussy', 'blowjob', 'hentai', 'nude', '섻', 'ㅅㅅ', '애널', '오나홀', '풀발', '불알', '젖꼭지', '야짤', '빨갱이', '전라디언', '경상디언', '개쌍도', '멍청도', '깽깽이', '토착왜구', '짱깨', '쪽바리', '깜둥이', '한남충', '김치녀', '된장녀', '메갈', '워마드', '일베', '틀딱', '급식충', '맘충', '똥꼬충', '장애새끼', '정신병자', 'nigger', 'nigga', 'faggot', 'retard', '윤석열', '이재명', '문재인', '박근혜', '이명박', '노무현', '김대중', '박정희', '전두환', '한동훈', '김건희', '이준석', '홍준표', '안철수', '김문수', '조국혁신', '찢재명', '찢명', '이죄명', '문재앙', '문죄인', '닭근혜', '쥐박이', '윤두창', '굥', '쥴리', '노알라', '민주당', '국민의힘', '국힘', '새누리', '한나라당', '자유한국당', '개혁신당', '대통령', '탄핵', '계엄', '좌파', '우파', '좌빨', '수꼴', '대깨문', '개딸', '종북', '친일파', '부정선거', '대선', '총선', '윤통', '국짐', '재명이', '대깨', '더불어민주']::text[];
  variant_source constant text[] := array['시발', '씨발', '씨빨', '씨팔', '시팔', '씨바', '씨벌', '시벌', '쓰벌', '십팔', '십새', '씹새', '씹창', '씹년', '씹놈', '씹할', '좆', '좇같', '존나', '존내', '졸라게', '개새끼', '개새기', '개색기', '개색히', '개섀끼', '개세끼', '느금마', '니애미', '니애비', '니엄마', '느개비', '엠창', '애미뒤', '애비뒤', '병신', '븅신', '빙신', '병싄', '지랄', '염병', '미친놈', '미친년', '썅년', '쌍년', '쌍놈', '개놈', '걸레년', 'ㅅㅂ', 'ㅆㅂ', 'ㅂㅅ', 'ㅄ', 'ㅈㄹ', 'ㅈㄴ', 'ㅅㅍ', 'ㄴㄱㅁ', 'fuck', 'shit', 'bitch', 'asshole', 'motherf', 'cunt', 'bastard', '씨이발', '시이발', '개새', '개쉐', '개새꺄', '새꺄', 'fvck', 'phuck', '시바', '씨부랄', '시부랄', '좆까', 'ㅈ까', '좆같', '개같은', '호로새끼', '썅', '섹스', '섹수', '쎅스', '섹쓰', '쎅쓰', '야동', '보지털', '자지털', '보짓', '보빨', '딸딸이', '펠라', '사까시', '질싸', '노콘', '강간', '윤간', '몰카', '꼴리', 'sex', 'porn', 'pussy', 'blowjob', 'hentai', 'nude', '섻', 'ㅅㅅ', '애널', '오나홀', '풀발', '불알', '젖꼭지', '야짤']::text[];
  exact_words constant text[] := array['새끼', '씹', '애자', '니미', '한남', '홍어', '조국', 'cum', 'dick', 'cock', 'fag', 'ass', '자위', '정권', '진보당', 'ㅗ', 'ㅗㅗ', 'ㅗㅗㅗ', '호로', '쌔끼', '쌔기', '새기']::text[];
  exact_raw constant text[] := array['2찍', '1찍']::text[];
  allow_words constant text[] := array['시발점', '시발역', 'essex', 'sussex', '운지법', '메갈로', '대선배', '대통령배', '시바견', '시바이누', '상년도']::text[];
  josa constant text[] := array['은', '는', '이', '가', '을', '를', '에', '의', '도', '들', '야', '아', '이야', '들아', '들은', '들이', '들도', '들을']::text[];
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
    translate(lower(translate(coalesce(t, ''), 'ａｂｃｄｅｆｇｈｉｊｋｌｍｎｏｐｑｒｓｔｕｖｗｘｙｚＡＢＣＤＥＦＧＨＩＪＫＬＭＮＯＰＱＲＳＴＵＶＷＸＹＺ０１２３４５６７８９', 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789')), 'аеорсхуіѕ', 'aeopcxyis'),
    '\s+'
  ) loop
    continue when w = '';
    if regexp_replace(w, '[^가-힣ㄱ-ㅣa-z0-9]', '', 'g') = any (exact_raw) then
      return true;
    end if;
    if w ~ '[a-z]' then
      w := translate(w, '013457@$', 'oieastas');
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
  return exists (select 1 from unnest(multi_words) as x where char_length(x) >= 3 and strpos(c, x) > 0);
end;
$fn$;
-- <<< badwords

-- ── 1. 커밋 방명록 (방마다 따로) ─────────────────────
create table if not exists public.commits (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  room text not null default 'pangyo' check (char_length(room) <= 32),
  hash text not null check (hash ~ '^[0-9a-f]{7}$'),
  name text not null check (char_length(name) between 1 and 20),
  msg text not null check (char_length(msg) between 1 and 72),
  lang text check (char_length(lang) <= 16)
);

-- 빈칸만 있거나 줄바꿈·제어문자가 섞인 글은 막기
alter table public.commits drop constraint if exists commits_text_clean;
alter table public.commits add constraint commits_text_clean check (
  btrim(name) <> '' and btrim(msg) <> ''
  and name !~ '[[:cntrl:]]' and msg !~ '[[:cntrl:]]'
  and room ~ '^[a-z0-9-]{3,32}$'
);

create index if not exists commits_room_created_idx on public.commits (room, created_at desc);

-- 신고가 쌓여 숨긴 커밋 (아래 5번 report_commit이 켜요). 다시 보이게 하려면 Table Editor에서 false로
alter table public.commits add column if not exists hidden boolean not null default false;

alter table public.commits enable row level security;

drop policy if exists "commits are public" on public.commits;
create policy "commits are public"
  on public.commits for select
  to anon, authenticated
  using (not hidden and not public.room_is_locked(room));

drop policy if exists "anyone can commit" on public.commits;
create policy "anyone can commit"
  on public.commits for insert
  to anon, authenticated
  with check (char_length(msg) between 1 and 72 and not public.room_is_locked(room));

-- 코드에 들어 있는 기본 방 주소. 방 목록(rooms)에는 없어서 여기서 따로 알려줘요.
-- 기본 방을 늘리거나 줄이면 src/config.ts와 이 목록을 같이 고쳐야 해요.
create or replace function public.is_builtin_room(p_slug text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select p_slug in ('pangyo', 'frontend', 'backend', 'algo', 'side');
$$;

-- 커밋이 쌓이는 한도 (넘으면 막거나 오래된 것부터 지움)
--   방 하나: 1분에 30개 / 서비스 전체: 1분에 120개 / 방마다 최근 200개만 남김
-- 서비스 전체 한도는 이용자가 늘면 올려 주세요. 방 하나 한도만으로는
-- 방을 여러 개 돌려 가며 채우는 걸 못 막아서 따로 둬요.
-- 방 목록에 없는 방(기본 방도 아님)에는 쓸 수 없어요.
-- 비공개 방까지 확인하고 지워야 해서 security definer예요.
create or replace function public.commits_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.created_at := now();
  if not (public.is_builtin_room(new.room) or exists (select 1 from public.rooms where slug = new.room)) then
    raise exception 'unknown room';
  end if;
  -- 욕설·성적인 말·혐오 표현·정치 이야기는 화면을 거치지 않고 API로 넣어도 막아요
  if public.has_bad_word(new.msg) or public.has_bad_word(new.name) then
    raise exception 'blocked words';
  end if;
  if (
    select count(*) from public.commits
    where room = new.room and created_at > now() - interval '1 minute'
  ) >= 30 then
    raise exception 'too many commits, slow down';
  end if;
  if (select count(*) from public.commits where created_at > now() - interval '1 minute') >= 120 then
    raise exception 'too many commits, slow down';
  end if;
  -- 매번 세면 비싸서, 가끔(약 5%) 이 방의 오래된 커밋을 지워 200개 안팎으로 맞춰요
  if random() < 0.05 then
    delete from public.commits
    where room = new.room
      and id in (
        select id from public.commits
        where room = new.room
        order by created_at desc, id desc
        offset 200
      );
  end if;
  return new;
end;
$$;

drop trigger if exists commits_guard on public.commits;
create trigger commits_guard
  before insert on public.commits
  for each row execute function public.commits_guard();


-- ── 2. 사람들이 만든 방 ─────────────────────────────
-- 기본 방(pangyo, frontend, backend, algo, side)은 코드에 들어 있어서 여기 없어요.
create table if not exists public.rooms (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{3,32}$'),
  name text not null check (char_length(name) between 1 and 24),
  tags text[] not null default '{}' check (
    cardinality(tags) <= 3
    and tags <@ array['free','frontend','backend','mobile','ai','algo','job','side','study']::text[]
  ),
  is_public boolean not null default true,
  creator text check (char_length(creator) <= 20)
);

-- 방마다 장소 (판교 새벽 카페, 서버실, 새벽 2시 원룸, 해커톤장)
alter table public.rooms add column if not exists place text not null default 'cafe';
alter table public.rooms drop constraint if exists rooms_place_check;
alter table public.rooms add constraint rooms_place_check
  check (place in ('cafe', 'serverroom', 'studio', 'hackathon'));

-- 방마다 기본 배경 소리 (src/config.ts의 NOISES와 같아야 해요). 들어온 사람은 각자 바꿀 수 있어요
-- 'place'는 장소마다 원래 있던 소리라서, 이미 만든 방은 지금과 똑같이 들려요
alter table public.rooms add column if not exists noise text not null default 'place';
alter table public.rooms drop constraint if exists rooms_noise_check;
alter table public.rooms add constraint rooms_noise_check
  check (noise in (
    'place', 'off', 'balanced', 'bright', 'dark',
    'fire', 'fireplace', 'rain', 'ocean', 'stream', 'forest', 'night',
    'cafe', 'library', 'typing', 'clock'
  ));

-- 비밀번호 방 (가벼운 잠금).
-- 비밀번호는 브라우저에서 PBKDF2로 늘려서 두 값으로 나눠요: 확인값(pw_check)과 채널 이름.
-- 서버에는 확인값만 저장하고 밖으로 내보내지 않아요 (아래 3번에서 이 컬럼의 읽기 권한을 막아요).
-- 실시간 채널은 비밀번호에서 나온 이름으로 열려서, 비밀번호를 아는 사람들만 같은 채널에 모여요.
alter table public.rooms add column if not exists pw_check text;
alter table public.rooms drop constraint if exists rooms_pw_check_format;
alter table public.rooms add constraint rooms_pw_check_format
  check (pw_check is null or pw_check ~ '^[0-9a-f]{64}$');
-- 화면에 🔒를 보여주려고 밖으로 내보내는 건 "있는지 없는지"뿐이에요
alter table public.rooms add column if not exists has_password boolean
  generated always as (pw_check is not null) stored;

alter table public.rooms drop constraint if exists rooms_text_clean;
alter table public.rooms add constraint rooms_text_clean check (
  btrim(name) <> '' and name !~ '[[:cntrl:]]'
  and (creator is null or creator !~ '[[:cntrl:]]')
);

create index if not exists rooms_public_created_idx on public.rooms (is_public, created_at desc);

alter table public.rooms enable row level security;

-- 목록에는 공개 방만
drop policy if exists "public rooms are listed" on public.rooms;
create policy "public rooms are listed"
  on public.rooms for select
  to anon, authenticated
  using (is_public);

-- 누구나 방을 만들 수 있음
drop policy if exists "anyone can open a room" on public.rooms;
create policy "anyone can open a room"
  on public.rooms for insert
  to anon, authenticated
  with check (char_length(name) between 1 and 24);

-- 비공개 방은 목록엔 안 보이고, 링크(slug)를 아는 사람만 찾을 수 있음.
-- slug는 32글자에서 8자리를 무작위로 뽑아서(약 1조 가지) 찍어서 맞히기 어려워요.
drop function if exists public.get_room(text);
create function public.get_room(p_slug text)
returns table (
  slug text,
  name text,
  tags text[],
  is_public boolean,
  place text,
  noise text,
  creator text,
  created_at timestamptz,
  has_password boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select r.slug, r.name, r.tags, r.is_public, r.place, r.noise, r.creator, r.created_at, r.has_password
  from public.rooms r
  where r.slug = p_slug
  limit 1;
$$;

-- 도배 방지: 전체 1분에 10개까지, 방은 전체 2000개까지, 기본 방 주소는 못 씀, 만든 시각은 서버 시간
-- (비공개 방까지 세야 해서 security definer)
-- 2000개는 방 목록이 한없이 불어나는 걸 막는 상한이에요. 이용자가 늘면 올려 주세요.
create or replace function public.rooms_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.created_at := now();
  if public.is_builtin_room(new.slug) or new.slug = 'lobby' then
    raise exception 'reserved room slug';
  end if;
  if public.has_bad_word(new.name) or public.has_bad_word(new.creator) then
    raise exception 'blocked words';
  end if;
  if (select count(*) from public.rooms where created_at > now() - interval '1 minute') >= 10 then
    raise exception 'too many rooms, slow down';
  end if;
  if (select count(*) from public.rooms) >= 2000 then
    raise exception 'room limit reached';
  end if;
  return new;
end;
$$;

drop trigger if exists rooms_guard on public.rooms;
create trigger rooms_guard
  before insert on public.rooms
  for each row execute function public.rooms_guard();


-- ── 3. 권한 잠그기 ──────────────────────────────────
-- Supabase는 새 테이블에 anon/authenticated 권한을 넓게 주기 때문에,
-- RLS와 별개로 "읽기 + 추가"만 남기고 나머지는 회수해요 (이중 잠금).
revoke all on public.commits, public.rooms from anon, authenticated;
grant select on public.commits to anon, authenticated;
-- hidden은 직접 못 쓰게 컬럼을 정해서 (숨기는 건 신고 함수만)
grant insert (room, hash, name, msg, lang) on public.commits to anon, authenticated;
-- rooms 는 컬럼별로: pw_check 는 쓰기만 되고 읽을 수 없어요 (select * 도 막혀서 컬럼을 하나하나 적어요)
grant select (id, created_at, slug, name, tags, is_public, creator, place, noise, has_password) on public.rooms to anon, authenticated;
grant insert (slug, name, tags, is_public, creator, place, noise, pw_check) on public.rooms to anon, authenticated;

-- 함수: 링크로 방 찾기만 바깥에서 부를 수 있게
revoke all on function public.get_room(text) from public, anon, authenticated;
grant execute on function public.get_room(text) to anon, authenticated;
revoke all on function public.is_builtin_room(text) from public, anon, authenticated;
revoke all on function public.has_bad_word(text) from public, anon, authenticated;
revoke all on function public.ko_shrink(text) from public, anon, authenticated;
revoke all on function public.ko_similar(text) from public, anon, authenticated;
revoke all on function public.ko_initial_variants(text) from public, anon, authenticated;
revoke all on function public.commits_guard() from public, anon, authenticated;
revoke all on function public.rooms_guard() from public, anon, authenticated;

-- ── 4. 비밀번호 방의 확인 · 방명록 ────────────────────
-- 로그인이 없어서 서버는 "누가 맞혔는지" 기억하지 않아요. 대신 부를 때마다 확인값을 같이 받아서 맞는지 봐요.
-- 한계: 틀린 횟수를 세어 막지는 않아요 (세려면 사람을 알아봐야 하고, 방 단위로 막으면 일부러 방을 잠글 수 있어요).
--       그래서 짧은 비밀번호는 시간을 들이면 맞힐 수 있어요. 가벼운 잠금 용도예요.
create or replace function public.room_key_ok(p_slug text, p_check text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.rooms
    where slug = p_slug and pw_check is not null and pw_check = p_check
  );
$$;

-- 비밀번호 방의 방명록 읽기 (표를 직접 읽는 건 위 정책이 막아요). 확인값이 틀리면 빈 목록
create or replace function public.locked_commits(p_slug text, p_check text)
returns table (hash text, name text, msg text, lang text, created_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select c.hash, c.name, c.msg, c.lang, c.created_at
  from public.commits c
  where c.room = p_slug and not c.hidden and public.room_key_ok(p_slug, p_check)
  order by c.created_at desc, c.id desc
  limit 30;
$$;

-- 비밀번호 방의 방명록 쓰기. 길이·도배 제한은 표의 제약조건과 commits_guard 가 똑같이 막아요
create or replace function public.locked_commit(p_slug text, p_check text, p_hash text, p_name text, p_msg text, p_lang text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.room_key_ok(p_slug, p_check) then
    raise exception 'wrong key';
  end if;
  insert into public.commits (room, hash, name, msg, lang) values (p_slug, p_hash, p_name, p_msg, p_lang);
end;
$$;

revoke all on function public.room_is_locked(text) from public, anon, authenticated;
grant execute on function public.room_is_locked(text) to anon, authenticated;
revoke all on function public.room_key_ok(text, text) from public, anon, authenticated;
grant execute on function public.room_key_ok(text, text) to anon, authenticated;
revoke all on function public.locked_commits(text, text) from public, anon, authenticated;
grant execute on function public.locked_commits(text, text) to anon, authenticated;
revoke all on function public.locked_commit(text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.locked_commit(text, text, text, text, text, text) to anon, authenticated;


-- ── 5. 커밋 신고 ───────────────────────────────────
-- 서로 다른 사람(브라우저 id) 2명이 신고하면 그 커밋을 숨겨요 (src/config.ts REPORTS_TO_HIDE와 같아야 해요).
-- 로그인이 없어서 한 사람이 id를 바꿔 가며 신고할 수도 있어요. 그래서 숨기기만 하고 지우지는 않아요.
-- 잘못 숨겨진 커밋은 Table Editor에서 commits.hidden을 false로 바꾸면 돌아와요. 신고 내역은 commit_reports에 있어요.
create table if not exists public.commit_reports (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  commit_id bigint not null references public.commits (id) on delete cascade,
  reporter text not null check (reporter ~ '^[0-9a-z-]{8,64}$'),
  unique (commit_id, reporter)
);

alter table public.commit_reports enable row level security;
revoke all on public.commit_reports from anon, authenticated;

-- 신고하기. 숨겨졌으면 true. 비밀번호 방은 확인값(p_check)이 맞아야 해요
create or replace function public.report_commit(p_room text, p_hash text, p_reporter text, p_check text default null)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  reports_to_hide constant int := 2;
  target bigint;
  is_hidden boolean;
begin
  if p_reporter is null or p_reporter !~ '^[0-9a-z-]{8,64}$' then
    raise exception 'bad reporter';
  end if;
  if public.room_is_locked(p_room) and not public.room_key_ok(p_room, p_check) then
    raise exception 'wrong key';
  end if;
  -- 도배 방지: 한 사람 1분에 5번, 전체 1분에 60번
  if (select count(*) from public.commit_reports where reporter = p_reporter and created_at > now() - interval '1 minute') >= 5
     or (select count(*) from public.commit_reports where created_at > now() - interval '1 minute') >= 60 then
    raise exception 'too many reports, slow down';
  end if;
  select id into target from public.commits
  where room = p_room and hash = p_hash and not hidden
  order by created_at desc, id desc
  limit 1;
  if target is null then
    return false;
  end if;
  insert into public.commit_reports (commit_id, reporter) values (target, p_reporter)
  on conflict (commit_id, reporter) do nothing;
  update public.commits set hidden = true
  where id = target and (select count(*) from public.commit_reports where commit_id = target) >= reports_to_hide
  returning hidden into is_hidden;
  return coalesce(is_hidden, false);
end;
$$;

create index if not exists commit_reports_created_idx on public.commit_reports (created_at desc);

revoke all on function public.report_commit(text, text, text, text) from public, anon, authenticated;
grant execute on function public.report_commit(text, text, text, text) to anon, authenticated;


-- ── 6. 같이 하는 시간: 방마다 시간대별 모각코 기록 ─────────
-- "오늘 이 카페에서 23명이 41시간 모각코했어요"와 "이 방은 보통 밤 10시에 붐벼요"에 써요.
-- 누가 했는지는 남기지 않아요. 방 · 날짜 · 시각(KST)별 합계만 있어요.
-- 로그인이 없어서 숫자를 부풀리는 걸 완전히 막을 수는 없어요. 그래서
--   한 번에 더할 수 있는 시간(5분), 서비스 전체 호출 수(1분에 600번), 한 방 한 시간 합계(60명 × 60분)에 상한을 둬요.
-- 보여주기용 숫자라 이 정도로 막아요. 30일 지난 기록은 지워요.
create table if not exists public.room_hours (
  room text not null check (room ~ '^[a-z0-9-]{3,32}$'),
  day date not null,
  hour smallint not null check (hour between 0 and 23),
  minutes int not null default 0 check (minutes between 0 and 3600),
  visits int not null default 0 check (visits between 0 and 300),
  primary key (room, day, hour)
);

alter table public.room_hours enable row level security;
revoke all on public.room_hours from anon, authenticated;

-- 같이 하는 시간 함수들의 호출 수 (1분 단위, 서비스 전체). 사람을 알아보는 값은 없어요
create table if not exists public.together_calls (
  minute timestamptz primary key,
  calls int not null default 0 check (calls >= 0)
);

alter table public.together_calls enable row level security;
revoke all on public.together_calls from anon, authenticated;

-- 이번 1분 동안의 호출 수를 하나 늘리고, 한도 안이면 true
create or replace function public.together_call_ok()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  calls_per_minute constant int := 600;
  v_calls int;
begin
  insert into public.together_calls as t (minute, calls) values (date_trunc('minute', now()), 1)
  on conflict (minute) do update set calls = t.calls + 1
  returning t.calls into v_calls;
  return v_calls <= calls_per_minute;
end;
$$;

-- 방에 있던 시간 더하기 (브라우저가 5분마다, 그 방에 오늘 처음 들어왔을 때 p_visit = true로 불러요)
-- 비밀번호 방은 확인값(p_check)이 맞아야 해요
create or replace function public.add_room_time(p_room text, p_minutes int, p_visit boolean, p_check text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  kst timestamp := now() at time zone 'Asia/Seoul';
begin
  if p_room is null or p_room !~ '^[a-z0-9-]{3,32}$' then
    raise exception 'bad room';
  end if;
  if p_minutes is null or p_minutes not between 0 and 5 then
    raise exception 'bad minutes';
  end if;
  if p_minutes = 0 and not coalesce(p_visit, false) then
    return;
  end if;
  if not (public.is_builtin_room(p_room) or exists (select 1 from public.rooms where slug = p_room)) then
    raise exception 'unknown room';
  end if;
  if public.room_is_locked(p_room) and not public.room_key_ok(p_room, p_check) then
    raise exception 'wrong key';
  end if;
  if not public.together_call_ok() then
    raise exception 'too many calls, slow down';
  end if;
  insert into public.room_hours as r (room, day, hour, minutes, visits)
  values (p_room, kst::date, extract(hour from kst)::smallint, p_minutes, case when p_visit then 1 else 0 end)
  on conflict (room, day, hour) do update
    set minutes = least(r.minutes + excluded.minutes, 3600),
        visits = least(r.visits + excluded.visits, 300);
  -- 가끔(약 2%) 오래된 기록과 지난 호출 수를 정리해요
  if random() < 0.02 then
    delete from public.room_hours where day < kst::date - 30;
    delete from public.together_calls where minute < now() - interval '10 minutes';
  end if;
end;
$$;

-- 오늘(KST) 한 방의 합계. 비밀번호 방도 합계는 보여줘요 (방 목록에 이름과 인원이 보이는 것과 같은 수준)
create or replace function public.room_today(p_room text)
returns json
language sql
stable
security definer
set search_path = public
as $$
  select json_build_object('minutes', coalesce(sum(minutes), 0), 'visits', coalesce(sum(visits), 0))
  from public.room_hours
  where room = p_room and day = (now() at time zone 'Asia/Seoul')::date;
$$;

-- 오늘(KST) 방 목록에 보이는 방들의 합계 (기본 방 + 공개 방). 링크로만 들어오는 방은 주소가 드러나지 않게 빼요
create or replace function public.rooms_today()
returns table (room text, minutes int, visits int)
language sql
stable
security definer
set search_path = public
as $$
  select h.room, sum(h.minutes)::int, sum(h.visits)::int
  from public.room_hours h
  where h.day = (now() at time zone 'Asia/Seoul')::date
    and (public.is_builtin_room(h.room) or exists (select 1 from public.rooms r where r.slug = h.room and r.is_public))
  group by h.room
  order by 2 desc
  limit 200;
$$;

revoke all on function public.together_call_ok() from public, anon, authenticated;
revoke all on function public.add_room_time(text, int, boolean, text) from public, anon, authenticated;
grant execute on function public.add_room_time(text, int, boolean, text) to anon, authenticated;
revoke all on function public.room_today(text) from public, anon, authenticated;
grant execute on function public.room_today(text) to anon, authenticated;
revoke all on function public.rooms_today() from public, anon, authenticated;
grant execute on function public.rooms_today() to anon, authenticated;
