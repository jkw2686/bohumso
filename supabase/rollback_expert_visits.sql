begin;
select pg_advisory_xact_lock(460046);
-- Keep additive columns and all request/consent data. Do not reveal newer requests
-- through the old workspace, which disclosed addresses immediately on acceptance.
do $$declare saved private.expert_visit_migration_backup;begin
 if exists(select 1 from private.urgent_requests where meeting_kind is not null) then raise exception 'visit_requests_exist_keep_privacy_wrapper_and_fix_forward';end if;
 select * into strict saved from private.expert_visit_migration_backup where id=true;
 execute saved.urgent_definition;
 execute saved.planner_definition;
 execute saved.slot_definition;
end $$;
revoke all on function public.visit_catalog(jsonb) from public,anon,authenticated;
commit;
