begin;
do $$declare definition text;begin
 definition:=pg_get_functiondef('public.early_expert_review_before_roster(text,jsonb)'::regprocedure);
 definition:=replace(definition,'if subject=auth.uid() and not private.is_owner() then','if subject=auth.uid() then');
 execute definition;
end$$;
-- Preserve accounts, administrator membership and audit records.
revoke execute on function public.admin_access_command(text,jsonb) from public,anon,authenticated;
commit;
