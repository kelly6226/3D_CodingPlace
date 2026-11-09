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
      regexp_replace(regexp_replace(plain, '[^가-힣ㄱ-ㅣa-z]', '', 'g'), '시발점|시발역|essex|sussex|운지법|메갈로|대선배', '', 'g') as squeezed
    from p
  )
  select squeezed ~ '시발|씨발|씨빨|씨팔|시팔|씨바|씨벌|시벌|쓰벌|십팔|십새|씹새|씹창|씹년|씹놈|씹할|좆|좇같|존나|존내|졸라게|개새끼|개새기|개색기|개색히|개섀끼|개세끼|새끼야|느금마|니애미|니애비|니엄마|느개비|엠창|애미뒤|애비뒤|병신|븅신|빙신|병싄|지랄|염병|미친놈|미친년|썅년|쌍년|쌍놈|개놈|걸레년|ㅅㅂ|ㅆㅂ|ㅂㅅ|ㅄ|ㅈㄹ|ㅈㄴ|ㅅㅍ|ㄴㄱㅁ|fuck|shit|bitch|asshole|motherf|cunt|bastard|섹스|섹수|쎅스|섹쓰|쎅쓰|야동|보지털|자지털|보짓|보빨|딸딸이|펠라|사까시|질싸|노콘|강간|윤간|몰카|꼴리|sex|porn|pussy|blowjob|hentai|nude|빨갱이|전라디언|경상디언|개쌍도|멍청도|깽깽이|토착왜구|짱깨|쪽바리|깜둥이|한남충|김치녀|된장녀|메갈|워마드|일베|틀딱|급식충|맘충|똥꼬충|장애새끼|정신병자|nigger|nigga|faggot|retard|윤석열|이재명|문재인|박근혜|이명박|노무현|김대중|박정희|전두환|한동훈|김건희|이준석|홍준표|안철수|김문수|조국혁신|찢재명|찢명|이죄명|문재앙|문죄인|닭근혜|쥐박이|윤두창|굥|쥴리|운지|노알라|민주당|국민의힘|국힘|새누리|한나라당|자유한국당|개혁신당|진보당|대통령|탄핵|계엄|좌파|우파|좌빨|수꼴|대깨문|개딸|종북|친일파|부정선거|대선|총선|정권'
    or exists (
      select 1 from regexp_split_to_table(plain, '[^가-힣ㄱ-ㅣa-z0-9]+') as w
      where regexp_replace(w, '[^가-힣ㄱ-ㅣa-z]', '', 'g') = any (array['새끼', '씹', '애자', '니미', '한남', '홍어', '조국', 'cum', 'dick', 'cock', 'fag', 'ass', '자위'])
    )
  from s;
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

alter table public.commits enable row level security;

drop policy if exists "commits are public" on public.commits;
create policy "commits are public"
  on public.commits for select
  to anon, authenticated
  using (not public.room_is_locked(room));

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
grant select, insert on public.commits to anon, authenticated;
-- rooms 는 컬럼별로: pw_check 는 쓰기만 되고 읽을 수 없어요 (select * 도 막혀서 컬럼을 하나하나 적어요)
grant select (id, created_at, slug, name, tags, is_public, creator, place, noise, has_password) on public.rooms to anon, authenticated;
grant insert (slug, name, tags, is_public, creator, place, noise, pw_check) on public.rooms to anon, authenticated;

-- 함수: 링크로 방 찾기만 바깥에서 부를 수 있게
revoke all on function public.get_room(text) from public, anon, authenticated;
grant execute on function public.get_room(text) to anon, authenticated;
revoke all on function public.is_builtin_room(text) from public, anon, authenticated;
revoke all on function public.has_bad_word(text) from public, anon, authenticated;
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
  where c.room = p_slug and public.room_key_ok(p_slug, p_check)
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
