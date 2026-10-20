-- Waggly database setup
-- Paste this whole file into Supabase: SQL Editor -> New query -> Run.
-- Safe to run more than once.

-- ---------- Profiles (one per person) ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9_.]{3,20}$'),
  display_name text not null check (char_length(display_name) between 1 and 40),
  dog_name text not null default '' check (char_length(dog_name) <= 40),
  dog_breed text not null default '' check (char_length(dog_breed) <= 40),
  city text not null default '' check (char_length(city) <= 40),
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

drop policy if exists "profiles are visible to signed-in users" on public.profiles;
create policy "profiles are visible to signed-in users" on public.profiles
  for select to authenticated using (true);
drop policy if exists "people create their own profile" on public.profiles;
create policy "people create their own profile" on public.profiles
  for insert to authenticated with check (id = auth.uid());
drop policy if exists "people edit their own profile" on public.profiles;
create policy "people edit their own profile" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- ---------- Friendships (one row per pair, smaller id first) ----------
create table if not exists public.friendships (
  user_a uuid not null references public.profiles (id) on delete cascade,
  user_b uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_a, user_b),
  check (user_a < user_b)
);
alter table public.friendships enable row level security;

drop policy if exists "see your own friendships" on public.friendships;
create policy "see your own friendships" on public.friendships
  for select to authenticated using (auth.uid() in (user_a, user_b));
drop policy if exists "add a friendship you are part of" on public.friendships;
create policy "add a friendship you are part of" on public.friendships
  for insert to authenticated with check (auth.uid() in (user_a, user_b));
drop policy if exists "remove a friendship you are part of" on public.friendships;
create policy "remove a friendship you are part of" on public.friendships
  for delete to authenticated using (auth.uid() in (user_a, user_b));

create or replace function public.is_friend(other uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.friendships f
    where (f.user_a = auth.uid() and f.user_b = other)
       or (f.user_b = auth.uid() and f.user_a = other)
  );
$$;

-- ---------- Walks ----------
create table if not exists public.walks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  title text not null default '' check (char_length(title) <= 60),
  dog_name text not null default '' check (char_length(dog_name) <= 40),
  status text not null default 'live' check (status in ('live', 'done')),
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  ended_at timestamptz,
  distance_m double precision not null default 0 check (distance_m >= 0),
  duration_s integer not null default 0 check (duration_s >= 0),
  route jsonb not null default '[]'::jsonb
);
create index if not exists walks_user_started on public.walks (user_id, started_at desc);
alter table public.walks enable row level security;

-- Walks (including routes) are visible only to you and your friends.
drop policy if exists "see your walks and your friends' walks" on public.walks;
create policy "see your walks and your friends' walks" on public.walks
  for select to authenticated using (user_id = auth.uid() or public.is_friend(user_id));
drop policy if exists "record your own walks" on public.walks;
create policy "record your own walks" on public.walks
  for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "edit your own walks" on public.walks;
create policy "edit your own walks" on public.walks
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "delete your own walks" on public.walks;
create policy "delete your own walks" on public.walks
  for delete to authenticated using (user_id = auth.uid());

-- ---------- Cheers (messages sent to someone during a walk) ----------
create table if not exists public.cheers (
  id uuid primary key default gen_random_uuid(),
  walk_id uuid not null references public.walks (id) on delete cascade,
  from_user uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  message text not null check (char_length(message) between 1 and 80),
  created_at timestamptz not null default now()
);
create index if not exists cheers_walk on public.cheers (walk_id, created_at);
alter table public.cheers enable row level security;

drop policy if exists "see cheers you sent or received" on public.cheers;
create policy "see cheers you sent or received" on public.cheers
  for select to authenticated using (
    from_user = auth.uid()
    or exists (select 1 from public.walks w where w.id = walk_id and w.user_id = auth.uid())
  );
drop policy if exists "cheer on walks you can see" on public.cheers;
create policy "cheer on walks you can see" on public.cheers
  for insert to authenticated with check (
    from_user = auth.uid()
    and exists (select 1 from public.walks w where w.id = walk_id)
  );

-- ---------- Paws (likes on a walk) ----------
create table if not exists public.paws (
  walk_id uuid not null references public.walks (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (walk_id, user_id)
);
alter table public.paws enable row level security;

drop policy if exists "see paws on walks you can see" on public.paws;
create policy "see paws on walks you can see" on public.paws
  for select to authenticated using (exists (select 1 from public.walks w where w.id = walk_id));
drop policy if exists "give a paw on walks you can see" on public.paws;
create policy "give a paw on walks you can see" on public.paws
  for insert to authenticated with check (
    user_id = auth.uid() and exists (select 1 from public.walks w where w.id = walk_id)
  );
drop policy if exists "take back your own paw" on public.paws;
create policy "take back your own paw" on public.paws
  for delete to authenticated using (user_id = auth.uid());
