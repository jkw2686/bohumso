-- Keep responses and consent history. Review any later function changes before running.
begin;
select pg_advisory_xact_lock(650065);
do $$declare backup_row record;begin
 if exists(select 1 from private.meeting_feedback f join private.consultation_reviews r on r.consultation_id=f.meeting_id where f.kind='consultation' and f.respondent_role='consumer') then
  raise exception 'feedback_privacy_rollback_requires_review';
 end if;
 for backup_row in select definition from private.feedback_backup order by signature loop execute backup_row.definition;end loop;
end$$;
revoke all on function public.meeting_feedback(text,jsonb) from public,anon,authenticated;
commit;
