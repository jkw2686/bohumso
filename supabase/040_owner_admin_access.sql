begin;
select pg_advisory_xact_lock(4040040);
create table if not exists private.admin_access_owner (
 id boolean primary key default true check(id), user_id uuid not null unique references auth.users(id),
 email text not null check(email='jkw2686@gmail.com')
);
create table if not exists private.admin_access_events (
 id bigint generated always as identity primary key, actor uuid not null, subject uuid not null,
 action text not null, email text not null, reason text not null, created_at timestamptz not null default now()
);
alter table private.admin_access_owner enable row level security;
alter table private.admin_access_events enable row level security;
revoke all on private.admin_access_owner,private.admin_access_events from public,anon,authenticated;
do $$begin
 if not exists(select 1 from private.admin_access_owner) then
  if (select count(*) from private.admin_memberships)<>1 then raise exception 'review_existing_admins_first';end if;
  insert into private.admin_access_owner(user_id,email)
  select u.id,lower(u.email) from auth.users u join private.admin_memberships m on m.user_id=u.id
  where lower(u.email)='jkw2686@gmail.com' and u.email_confirmed_at is not null;
  if not found then raise exception 'verified_existing_owner_required';end if;
 end if;
end$$;
create or replace function private.is_owner() returns boolean language sql stable security definer set search_path='' as $$
 select private.is_admin() and exists(select 1 from private.admin_access_owner o join auth.users u on u.id=o.user_id where o.user_id=auth.uid() and lower(u.email)=o.email and u.email_confirmed_at is not null)
$$;
revoke all on function private.is_owner() from public,anon,authenticated;
create or replace function public.admin_access_command(operation text,payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare target uuid; mail text;why text;
begin
 if not private.is_owner() then raise exception 'owner_required';end if;
 perform 1 from private.admin_access_owner for update;
 if operation='list' then
  return (select coalesce(jsonb_agg(jsonb_build_object('user_id',u.id,'email',u.email,'owner',u.id=o.user_id) order by u.email),'[]') from private.admin_memberships m join auth.users u on u.id=m.user_id cross join private.admin_access_owner o);
 end if;
 if operation not in ('add','remove') then raise exception 'invalid_operation';end if;
 mail:=lower(trim(payload->>'email'));why:=trim(payload->>'reason');
 if mail is null or mail!~'^[^ @]+@[^ @]+\.[^ @]+$' then raise exception 'invalid_email';end if;
 if coalesce(length(why),0)<5 or length(why)>1000 then raise exception 'reason_required';end if;
 select u.id into target from auth.users u where lower(u.email)=mail;
 if target is null then raise exception 'registered_account_required';end if;
 if exists(select 1 from private.admin_access_owner where user_id=target) then raise exception 'owner_protected';end if;
 if operation='add' then
  if not exists(select 1 from auth.users u join public.member_profiles p on p.user_id=u.id where u.id=target and u.email_confirmed_at is not null) or exists(select 1 from private.account_lifecycle where user_id=target and status<>'ACTIVE') then raise exception 'verified_active_member_required';end if;
  insert into private.admin_memberships(user_id) values(target) on conflict do nothing;
 else
  -- Revoke permission only; preserve the account and its data.
  delete from private.admin_memberships where user_id=target;
 end if;
 insert into private.admin_access_events(actor,subject,action,email,reason) values(auth.uid(),target,upper(operation),mail,why);
 return jsonb_build_object('saved',true);
end$$;
revoke all on function public.admin_access_command(text,jsonb) from public,anon,authenticated;
grant execute on function public.admin_access_command(text,jsonb) to authenticated;
commit;
