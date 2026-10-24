begin;
select pg_advisory_xact_lock(770077);
-- Supersedes 074's same-time shortcut. No existing reservation/contact/event is rewritten.
-- Reuse the complete pre-shortcut command chain (permissions, availability, revisions,
-- proposals, customer consent, contact disclosure and deferred notifications).
create or replace function public.consultation_command(operation text,payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$begin
 if operation in('confirm','office_confirm') then
  perform 1 from private.consultations where id=(payload->>'id')::uuid and customer_id=auth.uid() for update;
  if found and exists(select 1 from private.consultation_schedule_proposals where consultation_id=(payload->>'id')::uuid and state='pending') then raise exception 'schedule_pending';end if;
 end if;
 return public.consultation_command_before_same_time(operation,payload);
end$$;
create or replace function public.consultation_workspace(workspace text) returns jsonb language plpgsql stable security definer set search_path='' as $$begin
 return public.consultation_workspace_before_same_time(workspace)||jsonb_build_object('sameTimeConfirmationEnabled',false,'customerFinalConfirmationRequired',true,'optionalReviewEnabled',true);
end$$;
create or replace function public.booking_flow_capabilities() returns jsonb language sql stable set search_path='' as $$select jsonb_build_object('sameTimeConfirmationEnabled',false,'customerFinalConfirmationRequired',true)$$;
-- Update only future notice wording, retaining the installed recipient/dedupe/push policy.
do $migration$declare definition text;begin
 if to_regprocedure('private.booking_notice(private.consultations,text,text,uuid,uuid)') is not null then
  definition:=pg_get_functiondef('private.booking_notice(private.consultations,text,text,uuid,uuid)'::regprocedure);
  definition:=replace(definition,$copy$when 'REQUESTED' then case when customer then '상담 요청 접수' else '새 예약 요청' end$copy$,$copy$when 'REQUESTED' then case when customer then '상담 요청 중' else '새 상담 요청' end$copy$);
  definition:=replace(definition,$copy$when 'ACCEPTED' then case when customer then '전문가 요청 확인' else '수락 처리 완료' end$copy$,$copy$when 'ACCEPTED' then '일정 조율 중'$copy$);
  definition:=replace(definition,$copy$when 'PROPOSED' then '예약시간 변경 제안'$copy$,$copy$when 'PROPOSED' then case when c.state in('scheduled','confirmed') then '예약시간 변경 제안' else '일정 조율 중' end$copy$);
  execute definition;
 end if;
end$migration$;
revoke all on function public.consultation_command(text,jsonb),public.consultation_workspace(text),public.booking_flow_capabilities() from public,anon,authenticated;
grant execute on function public.consultation_command(text,jsonb),public.consultation_workspace(text),public.booking_flow_capabilities() to authenticated;
notify pgrst,'reload schema';
commit;
