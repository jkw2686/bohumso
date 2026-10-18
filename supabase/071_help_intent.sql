-- Proposed only: validate the user's selected help without changing roles or state transitions.
begin;
select pg_advisory_xact_lock(710071);
create or replace function private.check_help_intent(payload jsonb) returns void language plpgsql stable security definer set search_path='' as $$
declare intent text:=nullif(payload->>'help_intent','');job text;begin
 if intent is null then return;end if;
 if intent not in('claim','tax') then raise exception 'invalid_help_intent';end if;
 if intent='tax' and coalesce((payload->>'office_assignment')::boolean,false) then raise exception 'help_profession_mismatch';end if;
 if nullif(payload->>'office_id','') is not null then
  if intent='tax' then raise exception 'help_profession_mismatch';end if;
 elsif nullif(payload->>'planner_id','') is not null then
  job:=private.expert_profession((payload->>'planner_id')::uuid);
  if job is distinct from (case when intent='tax' then 'tax' else 'planner' end) then raise exception 'help_profession_mismatch';end if;
 else raise exception 'select_planner';end if;
 if (intent='tax' and payload->>'purpose' is distinct from 'other') or (intent='claim' and coalesce(payload->>'purpose','') not in('claim','coverage','management','death','illness','medical','accident')) then raise exception 'help_purpose_mismatch';end if;
end$$;
revoke all on function private.check_help_intent(jsonb) from public,anon,authenticated;
do $$begin
 if to_regprocedure('public.consultation_command_before_help_intent(text,jsonb)') is null then alter function public.consultation_command(text,jsonb) rename to consultation_command_before_help_intent;end if;
 if to_regprocedure('public.urgent_command_before_help_intent(text,jsonb)') is null then alter function public.urgent_command(text,jsonb) rename to urgent_command_before_help_intent;end if;
end$$;
revoke all on function public.consultation_command_before_help_intent(text,jsonb),public.urgent_command_before_help_intent(text,jsonb) from public,anon,authenticated;
create or replace function public.consultation_command(operation text,payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$begin
 if operation='request' then
  if not private.is_active_member() then raise exception 'membership_required';end if;
  perform private.check_help_intent(payload);
 end if;
 return public.consultation_command_before_help_intent(operation,payload);
end$$;
create or replace function public.urgent_command(operation text,payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$begin
 if operation='request' then
  if not private.is_active_member() then raise exception 'membership_required';end if;
  perform private.check_help_intent(payload);
 end if;
 return public.urgent_command_before_help_intent(operation,payload);
end$$;
revoke all on function public.consultation_command(text,jsonb),public.urgent_command(text,jsonb) from public,anon,authenticated;
grant execute on function public.consultation_command(text,jsonb),public.urgent_command(text,jsonb) to authenticated;
commit;
