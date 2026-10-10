-- Disable the new editor without re-exposing profiles the owner hid.
-- Restore the previous application build separately. Preserve columns and guards.
begin;
select pg_advisory_xact_lock(580058);
revoke execute on function public.expert_settings(text,jsonb) from public,anon,authenticated,service_role;
commit;
