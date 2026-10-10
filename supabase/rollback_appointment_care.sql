-- Preserve all evidence and member data. Resolve active cases/changes before restoring old behavior.
begin;
do $$declare r record;begin
 if exists(select 1 from private.appointment_changes where state='pending') or exists(select 1 from private.appointment_cases where outcome is null or appeal_pending)
 or exists(select 1 from private.appointment_measures where status='restricted' and (ends_at>now() or resume_required and resumed_at is null))
 then raise exception 'appointment_care_requires_resolution_before_rollback';end if;
 for r in select definition from private.appointment_care_backup loop execute r.definition;end loop;
end$$;
create or replace function public.appointment_care(operation text,payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not private.is_active_member() then raise exception 'membership_required';end if;
 if operation='status' then return '{"enabled":false}'::jsonb;end if;
 raise exception 'appointment_care_disabled';
end$$;
revoke all on function public.appointment_care(text,jsonb) from public,anon,authenticated;
grant execute on function public.appointment_care(text,jsonb) to authenticated;
update private.appointment_policy set enforcement_enabled=false;
update private.appointment_reminders set state='cancelled' where state='pending';
commit;
