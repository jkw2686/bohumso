-- Run only on Supabase after migration 011; never a public bucket.
begin;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('expert-documents','expert-documents',false,10485760,array['image/jpeg','image/png','application/pdf'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
-- A restrictive policy keeps this bucket private even if a project already has broad permissive policies.
drop policy if exists expert_documents_endpoint_only on storage.objects;
create policy expert_documents_endpoint_only on storage.objects as restrictive for all to anon,authenticated using(bucket_id <> 'expert-documents') with check(bucket_id <> 'expert-documents');
-- Access to this bucket goes through the authorized server endpoint (service_role only).
commit;
