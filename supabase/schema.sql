-- Called It schema. Run in Supabase SQL Editor. Safe to re-run.
create extension if not exists pgcrypto;

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null default 'The prediction room',
  vibe text not null default 'friendly chaos',
  created_at timestamptz not null default now()
);
create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  nickname text not null check (char_length(nickname) between 1 and 24),
  avatar text not null default '🦊',
  points integer not null default 1000 check (points >= 0),
  created_at timestamptz not null default now(),
  unique(room_id, nickname)
);
create table if not exists public.predictions (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  author_id uuid not null references public.players(id) on delete cascade,
  subject_id uuid not null references public.players(id) on delete cascade,
  question text not null check (char_length(question) between 8 and 220),
  deadline timestamptz not null,
  status text not null default 'open' check (status in ('open','voting','resolved','void')),
  outcome boolean,
  yes_pool integer not null default 0 check (yes_pool >= 0),
  no_pool integer not null default 0 check (no_pool >= 0),
  resolution_note text,
  created_at timestamptz not null default now()
);
create table if not exists public.bets (
  id uuid primary key default gen_random_uuid(),
  prediction_id uuid not null references public.predictions(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  choice boolean not null,
  amount integer not null check (amount > 0),
  created_at timestamptz not null default now(),
  unique(prediction_id, player_id)
);
create table if not exists public.votes (
  id uuid primary key default gen_random_uuid(),
  prediction_id uuid not null references public.predictions(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  outcome boolean not null,
  created_at timestamptz not null default now(),
  unique(prediction_id, player_id)
);
create table if not exists public.activity (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  player_id uuid references public.players(id) on delete set null,
  message text not null,
  created_at timestamptz not null default now()
);

alter table public.rooms enable row level security;
alter table public.players enable row level security;
alter table public.predictions enable row level security;
alter table public.bets enable row level security;
alter table public.votes enable row level security;
alter table public.activity enable row level security;

drop policy if exists "rooms readable" on public.rooms;
drop policy if exists "rooms create" on public.rooms;
drop policy if exists "players readable" on public.players;
drop policy if exists "players create" on public.players;
drop policy if exists "players update own row by id" on public.players;
drop policy if exists "predictions readable" on public.predictions;
drop policy if exists "predictions create" on public.predictions;
drop policy if exists "predictions update" on public.predictions;
drop policy if exists "bets readable" on public.bets;
drop policy if exists "bets create" on public.bets;
drop policy if exists "votes readable" on public.votes;
drop policy if exists "votes create" on public.votes;
drop policy if exists "activity readable" on public.activity;
drop policy if exists "activity create" on public.activity;

create policy "rooms readable" on public.rooms for select using (true);
create policy "rooms create" on public.rooms for insert with check (true);
create policy "players readable" on public.players for select using (true);
create policy "players create" on public.players for insert with check (true);
create policy "players update own row by id" on public.players for update using (true) with check (true);
create policy "predictions readable" on public.predictions for select using (true);
create policy "predictions create" on public.predictions for insert with check (true);
create policy "predictions update" on public.predictions for update using (true) with check (true);
create policy "bets readable" on public.bets for select using (true);
create policy "bets create" on public.bets for insert with check (true);
create policy "votes readable" on public.votes for select using (true);
create policy "votes create" on public.votes for insert with check (true);
create policy "activity readable" on public.activity for select using (true);
create policy "activity create" on public.activity for insert with check (true);

do $$
declare t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  foreach t in array array['players','predictions','bets','votes','activity'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
