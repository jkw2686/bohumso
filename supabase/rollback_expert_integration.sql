-- Preserve all records, schema additions, consent history and content drafts.
-- Review and approve before any operational use.
begin;
select pg_advisory_xact_lock(620062);
select pg_advisory_xact_lock(630063);
select pg_advisory_xact_lock(640064);
do $$declare r record;restore_signature text;begin
 if exists(select 1 from private.consultations where integration_details is not null and state not in ('completed','cancelled','unmatched')) then
  raise exception 'active_integration_bookings_require_review';
 end if;
 update private.expert_integration_settings set tax_enabled=false,unified_booking=false;
 foreach restore_signature in array array[
  'public.expert_profile_command(text,jsonb)','public.expert_submit(jsonb,integer)',
  'public.early_expert_review(text,jsonb)','private.planner_eligible(uuid)','private.urgent_eligible(uuid)',
  'public.expert_optional_profile(text,jsonb)','public.early_document_service(uuid,text,jsonb)',
  'public.expert_photo_service(uuid,text,jsonb)','public.planner_catalog(text,text)',
  'public.consultation_command(text,jsonb)','public.consultation_workspace(text)',
  'private.check_reservation_slot(uuid,text,timestamp with time zone,uuid,text)',
  'private.growth_checks(jsonb)','private.growth_content_view(private.growth_contents)'
 ] loop
  select b.* into r from private.expert_integration_backup b where to_regprocedure(b.signature)=to_regprocedure(restore_signature);
  if found then execute r.definition;end if;
 end loop;
end$$;
revoke all on function public.growth_first_draft(),public.expert_integration_capabilities(),public.expert_consultation_settings(text,jsonb),public.integration_slots(uuid,text,text,date) from public,anon,authenticated;
commit;
