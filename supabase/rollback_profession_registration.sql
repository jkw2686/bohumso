-- Apply with the previous frontend release. Additive data and evidence remain private.
-- Existing appointments and consent history are not removed or edited.
begin;
select pg_advisory_xact_lock(hashtextextended('profession-registration',66));
do $$begin
 if not exists(select 1 from private.profession_release_backup) then raise exception 'profession_backup_required';end if;
end$$;
insert into private.profession_release_snapshot(name,payload)
 select 'office_states_before_rollback',coalesce(jsonb_agg(jsonb_build_object('id',o.id,'status',o.status)),'[]') from private.office_locations o join private.office_operator_applications a on a.office_id=o.id
 on conflict(name) do nothing;
update private.office_locations set status='planned' where id in (select office_id from private.office_operator_applications);
do $$declare r record;value text;begin
 for r in select definition from private.profession_release_backup order by name loop execute r.definition;end loop;
 select payload#>>'{}' into value from private.profession_release_snapshot where name='office_last_start_default';
 if value is not null then execute 'alter table private.office_locations alter column last_start_hour set default '||value;end if;
end$$;
drop trigger if exists profession_intake_guard on public.partner_applications;
do $$begin if to_regclass('private.expert_applications') is not null then
 drop trigger if exists profession_intake_guard on private.expert_applications;
end if;end$$;
revoke all on function public.profession_catalog() from public,anon,authenticated;
revoke all on private.profession_definitions,private.profession_documents,private.office_operator_applications,private.profession_release_backup,private.profession_release_snapshot from public,anon,authenticated;
-- Widened constraints remain to preserve newly saved optional values and tax visit records.
-- Reapplying 066 restores the new code; office reopening needs an explicit review.
commit;
