begin;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('expert-profile-photos','expert-profile-photos',false,131072,array['image/jpeg']) on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists expert_profile_photos_endpoint_only on storage.objects;
create policy expert_profile_photos_endpoint_only on storage.objects as restrictive for all to anon,authenticated using(bucket_id<>'expert-profile-photos') with check(bucket_id<>'expert-profile-photos');
commit;
