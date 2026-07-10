-- Run this once in the same Supabase SQL Editor.
-- It keeps the upload bucket private, while allowing the public site to request approved photos only.
create policy "Everyone can read approved PGWS images"
on storage.objects
for select
to public
using (
  bucket_id = 'pgws-uploads'
  and exists (
    select 1
    from public.pgws_posts
    where pgws_posts.image_path = storage.objects.name
      and pgws_posts.status = 'approved'
  )
);
