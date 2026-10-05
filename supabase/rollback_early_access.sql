-- Operational rollback: stop the newly introduced writes without dropping tables,
-- columns, consent history, files, memberships, or reservations.
-- Existing login/profile reads and lifecycle protections remain in place.
-- Restoring an old Netlify deployment is a separate operator step.
begin;
select pg_advisory_xact_lock(hashtextextended('bohumso-early-migration',1));
update private.service_features set stage='CLOSED_BETA',public_signup=false,customer_signup=false,expert_applications=false,invite_only=true,expert_auto_publish=false;
revoke execute on function public.complete_membership(boolean,boolean,boolean,boolean) from public,anon,authenticated;
revoke execute on function public.expert_profile_command(text,jsonb) from public,anon,authenticated;
revoke execute on function public.early_expert_review(text,jsonb) from public,anon,authenticated;
revoke execute on function public.expert_roster_command(text,jsonb) from public,anon,authenticated;
revoke execute on function public.early_document_service(uuid,text,jsonb) from public,anon,authenticated,service_role;
-- Stop new bookings/assignment mutations; retain workspace/profile reads.
revoke execute on function public.consultation_command(text,jsonb) from public,anon,authenticated;
-- Keep private storage policies and rights-request reception enabled.
notify pgrst, 'reload schema';
commit;
