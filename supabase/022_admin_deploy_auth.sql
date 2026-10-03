begin;
-- Admin JWT authorization replaces dependency on a separate server key for deploy records.
-- Hooks remain server-only. These RPCs only create/update records, never launch a build.
alter function public.admin_deploy_claim(uuid,uuid) rename to admin_deploy_claim_server;
alter function public.admin_deploy_finish(uuid,text) rename to admin_deploy_finish_server;
revoke all on function public.admin_deploy_claim_server(uuid,uuid),public.admin_deploy_finish_server(uuid,text) from public,anon,authenticated;
create function public.admin_deploy_claim(request_id uuid,actor_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or auth.uid() is distinct from actor_id or not private.is_admin() then raise exception 'admin_required';end if;
 return public.admin_deploy_claim_server(request_id,actor_id);
end $$;
create function public.admin_deploy_finish(request_id uuid,result_state text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not private.is_admin() or not exists(select 1 from private.admin_deploy_requests where id=request_id and actor=auth.uid()) then raise exception 'admin_required';end if;
 perform public.admin_deploy_finish_server(request_id,result_state);
end $$;
revoke all on function public.admin_deploy_claim(uuid,uuid),public.admin_deploy_finish(uuid,text) from public,anon;
grant execute on function public.admin_deploy_claim(uuid,uuid),public.admin_deploy_finish(uuid,text) to authenticated;
commit;
