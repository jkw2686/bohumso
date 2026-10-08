-- Hide owner self-declared entries; retain declaration and audit history.
begin;
update private.expert_profiles set map_visible=false,status='PROFILE_COMPLETE_VERIFICATION_REQUIRED'
where user_id in(select user_id from private.owner_publication_declarations)
and registration_status<>'VERIFIED' and organization_status<>'VERIFIED';
create or replace function private.planner_eligible(subject uuid) returns boolean language sql stable security definer set search_path='' as $$select private.planner_eligible_before_owner_declaration(subject)$$;
create or replace function public.early_expert_review(operation text,payload jsonb default '{}') returns jsonb language sql security definer set search_path='' as $$select public.early_expert_review_before_owner_declaration(operation,payload)$$;
commit;
