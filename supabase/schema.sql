-- 온라인 모각코: 방 목록 + 커밋 방명록
-- Supabase 대시보드 > SQL Editor 에 이 파일 내용을 그대로 붙여넣고 Run 하세요.
-- 여러 번 실행해도 괜찮아요. 코드를 업데이트한 뒤엔 한 번 더 실행하면 돼요.
--
-- 보안 원칙
-- - 브라우저에 들어가는 publishable 키(anon 역할)로는 "읽기 + 정해진 모양의 쓰기"만 가능
-- - 수정·삭제는 대시보드(관리자)에서만
-- - 모든 테이블에 RLS, 함수는 search_path 고정
-- (실시간 접속자/이동/이모트는 Realtime 채널만 써서 테이블이 필요 없어요)


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
  using (true);

drop policy if exists "anyone can commit" on public.commits;
create policy "anyone can commit"
  on public.commits for insert
  to anon, authenticated
  with check (char_length(msg) between 1 and 72);

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
  check (noise in ('place', 'off', 'balanced', 'bright', 'dark', 'ocean', 'rain', 'stream', 'night', 'fire'));

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
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select r.slug, r.name, r.tags, r.is_public, r.place, r.noise, r.creator, r.created_at
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
grant select, insert on public.commits, public.rooms to anon, authenticated;

-- 함수: 링크로 방 찾기만 바깥에서 부를 수 있게
revoke all on function public.get_room(text) from public, anon, authenticated;
grant execute on function public.get_room(text) to anon, authenticated;
revoke all on function public.is_builtin_room(text) from public, anon, authenticated;
revoke all on function public.commits_guard() from public, anon, authenticated;
revoke all on function public.rooms_guard() from public, anon, authenticated;
