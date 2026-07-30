create extension if not exists pgcrypto;

create or replace function public.pgws_touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.pgws_membership_plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  public_name text not null,
  description text not null,
  amount_cents integer not null check (amount_cents >= 0),
  currency text not null default 'usd' check (char_length(currency) = 3),
  billing_type text not null default 'one_time' check (billing_type in ('one_time')),
  stripe_price_id text unique,
  active boolean not null default true,
  benefits jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.pgws_membership_plans
  (code, public_name, description, amount_cents, currency, billing_type, benefits)
values
  (
    'lifetime-2026',
    'PGWS Lifetime Membership',
    'One-time lifetime membership in Pretty Girls Who Serve with P31 Portal access and included EFF national membership.',
    2000,
    'usd',
    'one_time',
    '["P31 Portal","PGWS digital membership card","Sisterhood community","Faith and academy resources","Chapter and service opportunities","Included EFF national membership"]'::jsonb
  )
on conflict (code) do update set
  public_name = excluded.public_name,
  description = excluded.description,
  amount_cents = excluded.amount_cents,
  benefits = excluded.benefits,
  updated_at = now();

create table if not exists public.pgws_memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete restrict,
  membership_id text not null unique,
  plan_code text not null references public.pgws_membership_plans(code),
  status text not null default 'pending'
    check (status in ('pending','active','suspended','revoked','archived')),
  payment_status text not null default 'pending'
    check (payment_status in ('not_required','pending','paid','failed','refunded','disputed')),
  source text not null
    check (source in ('stripe','legacy_joinit','complimentary','administrative_reconciliation')),
  joined_at timestamptz,
  activated_at timestamptz,
  suspended_at timestamptz,
  ended_at timestamptz,
  stripe_customer_id text,
  stripe_checkout_session_id text unique,
  stripe_payment_intent_id text unique,
  legacy_member_id text,
  complimentary_reason text,
  access_review_required boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists pgws_memberships_status_idx
  on public.pgws_memberships(status, payment_status);
create index if not exists pgws_memberships_email_source_idx
  on public.pgws_memberships(source, legacy_member_id);

create table if not exists public.pgws_checkout_intents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_code text not null references public.pgws_membership_plans(code),
  status text not null default 'created'
    check (status in ('created','checkout_open','completed','expired','failed','cancelled')),
  stripe_checkout_session_id text unique,
  stripe_checkout_url text,
  expires_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists pgws_one_open_checkout_per_user_idx
  on public.pgws_checkout_intents(user_id)
  where status in ('created','checkout_open');

create table if not exists public.pgws_payment_transactions (
  id uuid primary key default gen_random_uuid(),
  membership_id uuid references public.pgws_memberships(id) on delete set null,
  user_id uuid not null references auth.users(id) on delete restrict,
  transaction_type text not null
    check (transaction_type in ('payment','refund','dispute','adjustment')),
  status text not null,
  amount_cents integer not null,
  currency text not null default 'usd',
  stripe_customer_id text,
  stripe_checkout_session_id text,
  stripe_payment_intent_id text,
  stripe_charge_id text,
  stripe_refund_id text,
  stripe_dispute_id text,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists pgws_unique_payment_intent_transaction_idx
  on public.pgws_payment_transactions(stripe_payment_intent_id, transaction_type)
  where stripe_payment_intent_id is not null and transaction_type = 'payment';

create table if not exists public.pgws_stripe_events (
  event_id text primary key,
  event_type text not null,
  livemode boolean not null,
  object_id text,
  processing_status text not null default 'received'
    check (processing_status in ('received','processed','ignored','failed','needs_review')),
  error_message text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  payload_digest text not null
);

create table if not exists public.pgws_legacy_members (
  id uuid primary key default gen_random_uuid(),
  import_batch_id uuid not null,
  source_system text not null default 'Join It',
  source_member_id text,
  first_name text not null,
  last_name text not null,
  email text not null,
  email_key text generated always as (lower(trim(email))) stored,
  paid_status text not null default 'paid'
    check (paid_status in ('paid','complimentary','unknown','unpaid')),
  membership_type text,
  joined_at timestamptz,
  expiration_at timestamptz,
  chapter_name text,
  raw_record jsonb not null default '{}'::jsonb,
  validation_status text not null default 'pending'
    check (validation_status in ('pending','valid','duplicate','ambiguous','invalid','claimed')),
  validation_notes text,
  claimed_by uuid references auth.users(id) on delete set null,
  claimed_at timestamptz,
  created_at timestamptz not null default now(),
  unique(import_batch_id, email_key, source_member_id)
);

create index if not exists pgws_legacy_members_email_key_idx
  on public.pgws_legacy_members(email_key);

create table if not exists public.pgws_myeff_connections (
  id uuid primary key default gen_random_uuid(),
  pgws_user_id uuid not null unique references auth.users(id) on delete cascade,
  pgws_membership_id uuid not null unique references public.pgws_memberships(id) on delete cascade,
  status text not null default 'not_started'
    check (status in ('not_started','activation_ready','linked','retrying','needs_review')),
  myeff_member_id text,
  myeff_user_id uuid,
  activation_token_digest text,
  activation_expires_at timestamptz,
  last_attempt_at timestamptz,
  linked_at timestamptz,
  attempt_count integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pgws_admin_roles (
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null
    check (role in ('super_admin','membership_manager','finance_manager','chapter_manager','community_moderator','ministry_manager','academy_manager','service_manager','events_manager','communications_manager','support_manager','reports_viewer')),
  active boolean not null default true,
  granted_by uuid references auth.users(id) on delete set null,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  primary key(user_id, role)
);

create or replace function public.pgws_is_admin(required_roles text[] default null)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.pgws_admin_roles r
    where r.user_id = auth.uid()
      and r.active
      and (required_roles is null or r.role = any(required_roles) or r.role = 'super_admin')
  );
$$;

create or replace function public.pgws_is_active_member(member_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.pgws_memberships m
    where m.user_id = member_user_id
      and m.status = 'active'
      and m.payment_status in ('paid','not_required')
  );
$$;

create table if not exists public.pgws_chapters (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique,
  institution text,
  city text,
  state text,
  status text not null default 'forming'
    check (status in ('forming','active','probation','inactive','archived')),
  public_description text,
  contact_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pgws_chapter_memberships (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid not null references public.pgws_chapters(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending','active','inactive','alumni','removed')),
  role_title text,
  joined_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(chapter_id, user_id)
);

create table if not exists public.pgws_events (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid references public.pgws_chapters(id) on delete set null,
  title text not null,
  description text not null,
  starts_at timestamptz not null,
  ends_at timestamptz,
  timezone text not null default 'America/New_York',
  location_type text not null default 'virtual'
    check (location_type in ('virtual','in_person','hybrid')),
  location_label text,
  access_url text,
  audience text not null default 'members'
    check (audience in ('public','members','chapter','leaders')),
  status text not null default 'draft'
    check (status in ('draft','published','cancelled','completed')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pgws_event_rsvps (
  event_id uuid not null references public.pgws_events(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  response text not null default 'going'
    check (response in ('going','maybe','not_going','attended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(event_id, user_id)
);

create table if not exists public.pgws_service_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  organization_name text not null,
  service_date date not null,
  hours numeric(7,2) not null check (hours > 0 and hours <= 500),
  description text not null,
  verification_contact_name text,
  verification_contact_email text,
  documentation_path text,
  status text not null default 'submitted'
    check (status in ('draft','submitted','approved','returned','rejected')),
  reviewer_id uuid references auth.users(id) on delete set null,
  reviewer_notes text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pgws_member_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  document_type text not null,
  storage_path text not null unique,
  original_filename text not null,
  mime_type text not null,
  file_size integer not null check (file_size > 0 and file_size <= 10485760),
  status text not null default 'available'
    check (status in ('available','under_review','accepted','returned','deleted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pgws_announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  category text not null default 'general',
  audience text not null default 'all_members',
  href text,
  published_at timestamptz,
  expires_at timestamptz,
  requires_acknowledgement boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pgws_announcement_receipts (
  announcement_id uuid not null references public.pgws_announcements(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  seen_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  primary key(announcement_id, user_id)
);

create table if not exists public.pgws_resources (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null,
  category text not null,
  href text not null,
  audience text not null default 'members',
  active boolean not null default true,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pgws_opportunities (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null,
  opportunity_type text not null,
  href text,
  opens_at timestamptz,
  closes_at timestamptz,
  audience text not null default 'all_members',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pgws_support_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null,
  subject text not null,
  message text not null,
  status text not null default 'open'
    check (status in ('open','in_progress','waiting_on_member','resolved','closed')),
  priority text not null default 'normal'
    check (priority in ('low','normal','high','urgent')),
  assigned_to uuid references auth.users(id) on delete set null,
  resolution_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table if not exists public.pgws_member_progress (
  user_id uuid primary key references auth.users(id) on delete cascade,
  onboarding_status text not null default 'not_started'
    check (onboarding_status in ('not_started','in_progress','complete')),
  onboarding_steps jsonb not null default '[]'::jsonb,
  academy_progress jsonb not null default '{}'::jsonb,
  becoming_focus text,
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.pgws_prayer_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  request_text text not null,
  visibility text not null default 'private'
    check (visibility in ('private','ministry_team','anonymous_community')),
  consent_to_ministry_review boolean not null default false,
  status text not null default 'received'
    check (status in ('received','praying','follow_up','closed')),
  assigned_to uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pgws_email_deliveries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  membership_id uuid references public.pgws_memberships(id) on delete set null,
  template_key text not null,
  recipient_email text not null,
  provider_message_id text,
  status text not null default 'queued'
    check (status in ('queued','sent','failed','suppressed')),
  error_message text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique(membership_id, template_key, recipient_email)
);

create table if not exists public.pgws_audit_log (
  id bigint generated always as identity primary key,
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_type text not null default 'user'
    check (actor_type in ('user','admin','stripe','system','migration')),
  action text not null,
  entity_type text not null,
  entity_id text,
  before_state jsonb,
  after_state jsonb,
  request_id text,
  created_at timestamptz not null default now()
);

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'pgws_membership_plans','pgws_memberships','pgws_checkout_intents',
    'pgws_myeff_connections','pgws_chapters','pgws_chapter_memberships',
    'pgws_events','pgws_event_rsvps','pgws_service_entries','pgws_member_documents',
    'pgws_announcements','pgws_resources','pgws_opportunities','pgws_support_requests',
    'pgws_member_progress','pgws_prayer_requests'
  ]
  loop
    execute format('drop trigger if exists %I_touch_updated_at on public.%I', table_name, table_name);
    execute format(
      'create trigger %I_touch_updated_at before update on public.%I for each row execute function public.pgws_touch_updated_at()',
      table_name,
      table_name
    );
  end loop;
end;
$$;

alter table public.pgws_membership_plans enable row level security;
alter table public.pgws_memberships enable row level security;
alter table public.pgws_checkout_intents enable row level security;
alter table public.pgws_payment_transactions enable row level security;
alter table public.pgws_stripe_events enable row level security;
alter table public.pgws_legacy_members enable row level security;
alter table public.pgws_myeff_connections enable row level security;
alter table public.pgws_admin_roles enable row level security;
alter table public.pgws_chapters enable row level security;
alter table public.pgws_chapter_memberships enable row level security;
alter table public.pgws_events enable row level security;
alter table public.pgws_event_rsvps enable row level security;
alter table public.pgws_service_entries enable row level security;
alter table public.pgws_member_documents enable row level security;
alter table public.pgws_announcements enable row level security;
alter table public.pgws_announcement_receipts enable row level security;
alter table public.pgws_resources enable row level security;
alter table public.pgws_opportunities enable row level security;
alter table public.pgws_support_requests enable row level security;
alter table public.pgws_member_progress enable row level security;
alter table public.pgws_prayer_requests enable row level security;
alter table public.pgws_email_deliveries enable row level security;
alter table public.pgws_audit_log enable row level security;

create policy "Public reads active PGWS membership plan"
  on public.pgws_membership_plans for select
  using (active);

create policy "Members read their PGWS membership"
  on public.pgws_memberships for select to authenticated
  using (user_id = auth.uid() or public.pgws_is_admin(null));

create policy "Members read their checkout intents"
  on public.pgws_checkout_intents for select to authenticated
  using (user_id = auth.uid() or public.pgws_is_admin(array['finance_manager','membership_manager']));

create policy "Members read their payment transactions"
  on public.pgws_payment_transactions for select to authenticated
  using (user_id = auth.uid() or public.pgws_is_admin(array['finance_manager','membership_manager']));

create policy "Administrators read Stripe event status"
  on public.pgws_stripe_events for select to authenticated
  using (public.pgws_is_admin(array['finance_manager']));

create policy "Administrators manage legacy member migration"
  on public.pgws_legacy_members for all to authenticated
  using (public.pgws_is_admin(array['membership_manager']))
  with check (public.pgws_is_admin(array['membership_manager']));

create policy "Members read their MyEFF connection"
  on public.pgws_myeff_connections for select to authenticated
  using (pgws_user_id = auth.uid() or public.pgws_is_admin(array['membership_manager','support_manager']));

create policy "Administrators read their role"
  on public.pgws_admin_roles for select to authenticated
  using (user_id = auth.uid() or public.pgws_is_admin(array['super_admin']));

create policy "Public reads active PGWS chapters"
  on public.pgws_chapters for select
  using (status in ('forming','active') or public.pgws_is_admin(array['chapter_manager']));

create policy "Members read their chapter memberships"
  on public.pgws_chapter_memberships for select to authenticated
  using (user_id = auth.uid() or public.pgws_is_admin(array['chapter_manager']));

create policy "Active members read published events"
  on public.pgws_events for select to authenticated
  using (
    public.pgws_is_active_member()
    and status in ('published','completed')
    or public.pgws_is_admin(array['events_manager','chapter_manager'])
  );

create policy "Members manage their event RSVPs"
  on public.pgws_event_rsvps for all to authenticated
  using (user_id = auth.uid() or public.pgws_is_admin(array['events_manager']))
  with check (user_id = auth.uid() or public.pgws_is_admin(array['events_manager']));

create policy "Members manage their service submissions"
  on public.pgws_service_entries for all to authenticated
  using (user_id = auth.uid() or public.pgws_is_admin(array['service_manager']))
  with check (
    (user_id = auth.uid() and status in ('draft','submitted'))
    or public.pgws_is_admin(array['service_manager'])
  );

create policy "Members read their documents"
  on public.pgws_member_documents for select to authenticated
  using (user_id = auth.uid() or public.pgws_is_admin(array['membership_manager','service_manager','support_manager']));

create policy "Members create their document records"
  on public.pgws_member_documents for insert to authenticated
  with check (user_id = auth.uid() and public.pgws_is_active_member());

create policy "Active members read current announcements"
  on public.pgws_announcements for select to authenticated
  using (
    public.pgws_is_active_member()
    and published_at is not null
    and published_at <= now()
    and (expires_at is null or expires_at > now())
    or public.pgws_is_admin(array['communications_manager'])
  );

create policy "Members manage their announcement receipts"
  on public.pgws_announcement_receipts for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "Active members read PGWS resources"
  on public.pgws_resources for select to authenticated
  using (public.pgws_is_active_member() and active or public.pgws_is_admin(null));

create policy "Active members read PGWS opportunities"
  on public.pgws_opportunities for select to authenticated
  using (public.pgws_is_active_member() and active or public.pgws_is_admin(null));

create policy "Members create private support requests"
  on public.pgws_support_requests for insert to authenticated
  with check (user_id = auth.uid() and public.pgws_is_active_member());

create policy "Members and support administrators read support requests"
  on public.pgws_support_requests for select to authenticated
  using (user_id = auth.uid() or public.pgws_is_admin(array['support_manager']));

create policy "Support administrators update support requests"
  on public.pgws_support_requests for update to authenticated
  using (public.pgws_is_admin(array['support_manager']))
  with check (public.pgws_is_admin(array['support_manager']));

create policy "Members manage their progress"
  on public.pgws_member_progress for all to authenticated
  using (user_id = auth.uid() or public.pgws_is_admin(array['academy_manager']))
  with check (user_id = auth.uid() or public.pgws_is_admin(array['academy_manager']));

create policy "Members create private prayer requests"
  on public.pgws_prayer_requests for insert to authenticated
  with check (user_id = auth.uid() and public.pgws_is_active_member());

create policy "Members read their prayer requests"
  on public.pgws_prayer_requests for select to authenticated
  using (
    user_id = auth.uid()
    or (
      visibility = 'ministry_team'
      and consent_to_ministry_review
      and public.pgws_is_admin(array['ministry_manager'])
    )
  );

create policy "Ministry managers update consented prayer requests"
  on public.pgws_prayer_requests for update to authenticated
  using (
    visibility = 'ministry_team'
    and consent_to_ministry_review
    and public.pgws_is_admin(array['ministry_manager'])
  )
  with check (
    visibility = 'ministry_team'
    and consent_to_ministry_review
    and public.pgws_is_admin(array['ministry_manager'])
  );

create policy "Administrators read delivery status"
  on public.pgws_email_deliveries for select to authenticated
  using (public.pgws_is_admin(array['communications_manager','membership_manager','support_manager']));

create policy "Administrators read audit history"
  on public.pgws_audit_log for select to authenticated
  using (public.pgws_is_admin(array['reports_viewer']));

revoke all on public.pgws_memberships,
  public.pgws_checkout_intents,
  public.pgws_payment_transactions,
  public.pgws_stripe_events,
  public.pgws_legacy_members,
  public.pgws_myeff_connections,
  public.pgws_admin_roles,
  public.pgws_email_deliveries,
  public.pgws_audit_log
from anon, authenticated;

grant select on public.pgws_membership_plans to anon, authenticated;
grant select on public.pgws_memberships,
  public.pgws_checkout_intents,
  public.pgws_payment_transactions,
  public.pgws_myeff_connections,
  public.pgws_admin_roles
to authenticated;
grant select, insert, update, delete on public.pgws_event_rsvps,
  public.pgws_service_entries,
  public.pgws_announcement_receipts,
  public.pgws_member_progress
to authenticated;
grant select on public.pgws_chapters,
  public.pgws_chapter_memberships,
  public.pgws_events,
  public.pgws_announcements,
  public.pgws_resources,
  public.pgws_opportunities
to authenticated;
grant select, insert on public.pgws_member_documents,
  public.pgws_support_requests,
  public.pgws_prayer_requests
to authenticated;
grant update on public.pgws_support_requests,
  public.pgws_prayer_requests
to authenticated;
grant select on public.pgws_legacy_members,
  public.pgws_stripe_events,
  public.pgws_email_deliveries,
  public.pgws_audit_log
to authenticated;

insert into public.pgws_resources (title,description,category,href,audience,sort_order)
values
  ('Her Return','A private 45-day Bible-study and encrypted journal experience.','Faith','/#herJournal','members',10),
  ('HER Bible','Read the full World English Bible and save chapters on your device.','Faith','/#herBible','members',20),
  ('PGWS Chapter Resources','Governance, operations, programs, branding, training, compliance, recruitment, and service tools.','Leadership','/#chapterResources','members',30),
  ('EFF Student Help Center','Scholarships, FAFSA guidance, emergency resources, and student advocacy.','Student support','https://portal.estherfundsfoundation.org/resources','members',40),
  ('MyEFF','Your included free EFF national membership and connected national community.','EFF access','https://my.estherfundsfoundation.org','members',50)
on conflict do nothing;

