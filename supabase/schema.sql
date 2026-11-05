-- 온라인 모각코: 커밋 방명록 테이블
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 Run 하세요.
-- (실시간 접속자/이동/이모트는 Realtime 채널만 써서 테이블이 필요 없어요)

create table if not exists public.commits (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  room text not null default 'pangyo' check (char_length(room) <= 32),
  hash text not null check (hash ~ '^[0-9a-f]{7}$'),
  name text not null check (char_length(name) between 1 and 20),
  msg text not null check (char_length(msg) between 1 and 72),
  lang text check (char_length(lang) <= 16)
);

create index if not exists commits_room_created_idx on public.commits (room, created_at desc);

alter table public.commits enable row level security;

-- 누구나 읽기
drop policy if exists "commits are public" on public.commits;
create policy "commits are public"
  on public.commits for select
  to anon, authenticated
  using (true);

-- 누구나 쓰기 (수정·삭제는 불가)
drop policy if exists "anyone can commit" on public.commits;
create policy "anyone can commit"
  on public.commits for insert
  to anon, authenticated
  with check (char_length(msg) between 1 and 72);

-- 도배 방지: 방 하나에 1분 동안 30개까지. 작성 시각은 서버 시간으로 고정.
create or replace function public.commits_guard()
returns trigger
language plpgsql
as $$
begin
  new.created_at := now();
  if (
    select count(*) from public.commits
    where room = new.room and created_at > now() - interval '1 minute'
  ) >= 30 then
    raise exception 'too many commits, slow down';
  end if;
  return new;
end;
$$;

drop trigger if exists commits_guard on public.commits;
create trigger commits_guard
  before insert on public.commits
  for each row execute function public.commits_guard();
