-- Reuse the existing verified-contact/expiry roster matcher at admin approval.
-- No JWT injection, role grants, document verification or direct publication.
begin;
select pg_advisory_xact_lock(44045);
do $migration$
declare definition text; target regprocedure; anchor text:=$a$if operation='approve' then$a$;
addition text:=$a$if operation='approve' then
 -- Refresh an existing pending profile through the normal roster-match trigger.
 -- Unmatched/expired/unverified contacts still fail the original approval checks.
 update private.expert_profiles set updated_at=updated_at
 where user_id=(payload->>'user_id')::uuid
 and organization_status='NOT_SUBMITTED'
 and status not in ('SUSPENDED','REJECTED','APPROVED');$a$;
begin
 target:=coalesce(to_regprocedure('public.early_expert_review_before_owner_declaration(text,jsonb)'),to_regprocedure('public.early_expert_review(text,jsonb)'));
 definition:=pg_get_functiondef(target);
 if position('Refresh an existing pending profile' in definition)=0 then return;end if;
 if position('if not private.is_admin()' in definition)=0 or position(anchor in definition)=0 then
  raise exception 'unexpected_review_function';
 end if;
 execute replace(definition,addition,anchor);
end $migration$;
commit;
