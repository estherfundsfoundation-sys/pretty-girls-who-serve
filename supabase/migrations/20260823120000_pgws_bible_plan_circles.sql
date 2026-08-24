begin;

create table if not exists public.pgws_friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users(id) on delete cascade,
  addressee_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','declined')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (requester_id <> addressee_id),
  unique (requester_id, addressee_id)
);
create unique index if not exists pgws_friendships_pair_key
  on public.pgws_friendships (least(requester_id, addressee_id), greatest(requester_id, addressee_id));

create table if not exists public.pgws_social_blocks (
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create table if not exists public.pgws_plan_circles (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  plan_slug text not null,
  name text not null check (char_length(name) between 2 and 60),
  start_date date not null,
  created_at timestamptz not null default now()
);

create table if not exists public.pgws_plan_circle_members (
  circle_id uuid not null references public.pgws_plan_circles(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  invited_by uuid not null references auth.users(id) on delete cascade,
  status text not null default 'invited' check (status in ('invited','accepted','declined')),
  joined_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (circle_id, user_id)
);

create table if not exists public.pgws_plan_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_slug text not null,
  study_day smallint not null check (study_day between 1 and 60),
  completed_at timestamptz not null default now(),
  shared_takeaway text check (char_length(shared_takeaway) <= 500),
  share_with_circles boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, plan_slug, study_day)
);

create table if not exists public.pgws_social_reports (
  id bigint generated always as identity primary key,
  reporter_id uuid not null references auth.users(id) on delete cascade,
  reported_user_id uuid references auth.users(id) on delete set null,
  circle_id uuid references public.pgws_plan_circles(id) on delete set null,
  reason text not null check (char_length(reason) between 3 and 500),
  status text not null default 'open' check (status in ('open','reviewing','resolved','dismissed')),
  created_at timestamptz not null default now()
);

alter table public.pgws_friendships enable row level security;
alter table public.pgws_social_blocks enable row level security;
alter table public.pgws_plan_circles enable row level security;
alter table public.pgws_plan_circle_members enable row level security;
alter table public.pgws_plan_progress enable row level security;
alter table public.pgws_social_reports enable row level security;

create or replace function public.pgws_is_circle_member(target_circle uuid, target_user uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.pgws_plan_circle_members
    where circle_id = target_circle and user_id = target_user and status = 'accepted'
  );
$$;

create or replace function public.pgws_is_circle_participant(target_circle uuid, target_user uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.pgws_plan_circle_members
    where circle_id = target_circle and user_id = target_user
  );
$$;

create or replace function public.pgws_share_circle(first_user uuid, second_user uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.pgws_plan_circle_members a
    join public.pgws_plan_circle_members b on b.circle_id = a.circle_id
    where a.user_id = first_user and b.user_id = second_user
      and a.status = 'accepted' and b.status = 'accepted'
  );
$$;

create policy "Sisters view friendships involving them" on public.pgws_friendships for select to authenticated using (auth.uid() in (requester_id, addressee_id));
create policy "Sisters send their own friend requests" on public.pgws_friendships for insert to authenticated with check (auth.uid() = requester_id);
create policy "Recipients answer friend requests" on public.pgws_friendships for update to authenticated using (auth.uid() = addressee_id) with check (auth.uid() = addressee_id);
create policy "Either sister can remove friendship" on public.pgws_friendships for delete to authenticated using (auth.uid() in (requester_id, addressee_id));

create policy "Sisters manage their own blocks" on public.pgws_social_blocks for all to authenticated using (auth.uid() = blocker_id) with check (auth.uid() = blocker_id);

create policy "Circle participants view circles" on public.pgws_plan_circles for select to authenticated using (owner_id = auth.uid() or public.pgws_is_circle_participant(id, auth.uid()));
create policy "Sisters create their own circles" on public.pgws_plan_circles for insert to authenticated with check (auth.uid() = owner_id);
create policy "Owners update circles" on public.pgws_plan_circles for update to authenticated using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "Owners delete circles" on public.pgws_plan_circles for delete to authenticated using (auth.uid() = owner_id);

create policy "Circle members view circle membership" on public.pgws_plan_circle_members for select to authenticated using (user_id = auth.uid() or public.pgws_is_circle_member(circle_id, auth.uid()) or exists (select 1 from public.pgws_plan_circles c where c.id = circle_id and c.owner_id = auth.uid()));
create policy "Circle owners invite accepted friends" on public.pgws_plan_circle_members for insert to authenticated with check (
  auth.uid() = invited_by and (
    user_id = auth.uid() or exists (
      select 1 from public.pgws_friendships f
      where f.status = 'accepted'
      and ((f.requester_id = auth.uid() and f.addressee_id = user_id) or (f.addressee_id = auth.uid() and f.requester_id = user_id))
    )
  )
);
create policy "Invitees answer circle invitations" on public.pgws_plan_circle_members for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Members leave or owners remove circle members" on public.pgws_plan_circle_members for delete to authenticated using (
  auth.uid() = user_id or exists (select 1 from public.pgws_plan_circles c where c.id = circle_id and c.owner_id = auth.uid())
);

create policy "Sisters view plan progress" on public.pgws_plan_progress for select to authenticated using (
  auth.uid() = user_id or (share_with_circles = true and public.pgws_share_circle(auth.uid(), user_id))
);
create policy "Sisters create their own plan progress" on public.pgws_plan_progress for insert to authenticated with check (auth.uid() = user_id);
create policy "Sisters update their own plan progress" on public.pgws_plan_progress for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Sisters delete their own plan progress" on public.pgws_plan_progress for delete to authenticated using (auth.uid() = user_id);

create policy "Sisters submit their own social reports" on public.pgws_social_reports for insert to authenticated with check (auth.uid() = reporter_id);

grant select, insert, update, delete on public.pgws_friendships, public.pgws_social_blocks, public.pgws_plan_circles, public.pgws_plan_circle_members, public.pgws_plan_progress to authenticated;
grant insert on public.pgws_social_reports to authenticated;
grant usage, select on sequence public.pgws_social_reports_id_seq to authenticated;
grant execute on function public.pgws_is_circle_member(uuid, uuid), public.pgws_is_circle_participant(uuid, uuid), public.pgws_share_circle(uuid, uuid) to authenticated;

commit;
