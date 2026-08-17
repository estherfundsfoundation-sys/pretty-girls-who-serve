alter table public.pgws_chapter_applications
  add column if not exists national_notification_sent_at timestamptz;

comment on column public.pgws_chapter_applications.national_notification_sent_at is
  'Time PGWS Nationals received the internal new-submission notification.';
