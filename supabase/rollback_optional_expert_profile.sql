begin;
do $$declare item record;begin for item in select definition from private.optional_profile_backup loop execute item.definition;end loop;end$$;
revoke all on function public.expert_optional_profile(text,jsonb),public.expert_photo_service(uuid,text,jsonb) from public,anon,authenticated,service_role;
-- Keep saved options, photographs and operator references; no user records are removed.
-- Restore the earlier frontend separately. The photograph bucket remains private.
commit;
