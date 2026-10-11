begin;
-- Keep all saved records; revoke the new entry points and turn off publishing.
revoke execute on function public.growth_command(text,jsonb) from authenticated;
revoke execute on function public.growth_publish_due() from service_role;
update private.growth_settings set publishing_enabled=false;
commit;
