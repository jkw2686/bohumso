begin;
do $$declare definition text;begin
 if to_regprocedure('private.is_admin_before_mfa()') is null then
  select pg_get_functiondef('private.is_admin()'::regprocedure) into definition;
  execute replace(definition,'private.is_admin()', 'private.is_admin_before_mfa()');
 end if;
end$$;
create or replace function private.is_admin() returns boolean language sql stable security definer set search_path='' as $$
 select private.is_admin_before_mfa()
 and coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'aal','aal1')='aal2'
 and not exists(select 1 from private.admin_reporting_access where user_id=auth.uid() and scope='statistics')
$$;
create or replace function public.member_admin_access() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('allowed',private.is_admin_before_mfa(),
 'scope',coalesce((select scope from private.admin_reporting_access where user_id=auth.uid()),'support'),
 'mfa',coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'aal','aal1')='aal2')
 where auth.uid() is not null and not exists(select 1 from private.account_lifecycle where user_id=auth.uid() and status<>'ACTIVE')
$$;
revoke all on function private.is_admin_before_mfa(),public.member_admin_access() from public,anon,authenticated;
grant execute on function public.member_admin_access() to authenticated;
-- Other admin RPCs and existing RLS policies that call is_admin now require aal2.
commit;
