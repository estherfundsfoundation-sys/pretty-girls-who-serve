-- PGWS Member Portal: public, opt-in directory + signed-in Sister Lounge
create table if not exists public.pgws_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 50),
  city_state text,
  chapter_name text,
  bio text,
  interests text[] not null default '{}',
  directory_visible boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table public.pgws_profiles enable row level security;
create policy "Anyone can see opted-in PGWS profiles" on public.pgws_profiles for select to public using (directory_visible = true);
create policy "Members manage only their own PGWS profile" on public.pgws_profiles for all to authenticated using (auth.uid() = id) with check (auth.uid() = id);

create table if not exists public.pgws_lounge_messages (
  id bigint generated always as identity primary key,
  author_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 50),
  message text not null check (char_length(message) between 1 and 500),
  created_at timestamptz not null default now()
);
alter table public.pgws_lounge_messages enable row level security;
create policy "Anyone can read Sister Lounge messages" on public.pgws_lounge_messages for select to public using (true);
create policy "Signed-in sisters can post Lounge messages" on public.pgws_lounge_messages for insert to authenticated with check (auth.uid() = author_id);
