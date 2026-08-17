begin;

alter table public.pgws_chapters
  add column if not exists chapter_type text not null default 'campus'
    check (chapter_type in ('campus','community','virtual')),
  add column if not exists public_listing boolean not null default false,
  add column if not exists university_approval_status text not null default 'not_started'
    check (university_approval_status in ('not_started','preparing','submitted','approved','not_required')),
  add column if not exists nationals_approved_at timestamptz,
  add column if not exists launched_at timestamptz;

create table if not exists public.pgws_chapter_applications (
  id uuid primary key default gen_random_uuid(),
  reference_number text not null unique,
  founder_name text not null,
  founder_email text not null,
  founder_email_key text generated always as (lower(trim(founder_email))) stored,
  founder_phone text not null,
  cofounder_name text,
  cofounder_email text,
  chapter_type text not null check (chapter_type in ('campus','community','virtual')),
  institution text not null,
  city text not null,
  state text not null,
  why_pgws text not null,
  leadership_response text not null,
  ministry_response text not null,
  community_need text not null,
  experience text not null,
  acknowledgement boolean not null default false,
  status text not null default 'submitted'
    check (status in ('submitted','screening','interview_invited','interviewed','second_interview','accepted','declined','withdrawn','converted')),
  reviewer_notes text,
  assigned_to uuid references auth.users(id) on delete set null,
  interview_at timestamptz,
  chapter_id uuid references public.pgws_chapters(id) on delete set null,
  confirmation_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists pgws_chapter_applications_status_idx
  on public.pgws_chapter_applications(status, created_at desc);
create index if not exists pgws_chapter_applications_email_idx
  on public.pgws_chapter_applications(founder_email_key, created_at desc);

alter table public.pgws_chapter_applications enable row level security;
revoke all on table public.pgws_chapter_applications from anon, authenticated;
grant all on table public.pgws_chapter_applications to service_role;

drop policy if exists "Public reads active PGWS chapters" on public.pgws_chapters;
create policy "Public reads listed PGWS chapters"
  on public.pgws_chapters for select
  using (
    (public_listing = true and status in ('forming','active'))
    or public.pgws_is_admin(array['chapter_manager'])
  );

commit;
