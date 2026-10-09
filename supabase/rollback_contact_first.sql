-- Stop new traffic and restore the previous frontend before running this file.
-- New consent-protected requests must keep their privacy checks: fix forward instead.
begin;
select pg_advisory_xact_lock(49009);
do $$declare item jsonb;begin
 if exists(select 1 from private.consultations where contact_flow=2) or exists(select 1 from private.urgent_requests where contact_flow=2) or exists(select 1 from private.contact_permissions) then raise exception 'contact_flow_records_exist_keep_privacy_checks_and_fix_forward';end if;
 for item in select * from jsonb_array_elements((select snapshot->'functions' from private.contact_flow_backup where name='049-v1')) loop
 if regexp_replace(split_part(item->>'signature','(',1),'^(public|private)\.','') in ('consultation_command','consultation_workspace','urgent_command','office_catalog','planner_catalog','reservation_slots','visit_available','reservation_notification','urgent_notification','notification_inbox') then execute item->>'definition';end if;
 end loop;
 if not found then raise exception 'contact_backup_missing';end if;
end$$;
alter table private.consultations alter column contact_flow set default 0;
alter table private.urgent_requests alter column contact_flow set default 0;
revoke all on function public.consultation_availability(text,jsonb) from authenticated;
-- Extra columns and immutable evidence remain private; no records are removed.
commit;
