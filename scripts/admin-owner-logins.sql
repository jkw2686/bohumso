-- Explicit, verified owner login bindings. Never derive admin rights from user metadata.
-- Phone owner bindings are provisioned separately after verifying the intended account.
begin;
select pg_advisory_xact_lock(4040040);
create table if not exists private.admin_owner_logins(
 user_id uuid primary key references auth.users(id),
 kind text not null check(kind in ('email','phone')),
 identifier text not null,
 created_at timestamptz not null default now(),
 unique(kind,identifier)
);
alter table private.admin_owner_logins enable row level security;
revoke all on private.admin_owner_logins from public,anon,authenticated;
insert into private.admin_owner_logins(user_id,kind,identifier)
 select o.user_id,'email',o.email from private.admin_access_owner o join auth.users u on u.id=o.user_id
 where lower(u.email)=o.email and u.email_confirmed_at is not null
 on conflict(user_id) do nothing;
do $$begin
 if not exists(select 1 from private.admin_access_owner o join private.admin_owner_logins b on b.user_id=o.user_id join auth.users u on u.id=o.user_id
  where b.kind='email' and b.identifier=o.email and lower(u.email)=o.email and u.email_confirmed_at is not null
   and exists(select 1 from private.admin_memberships m where m.user_id=o.user_id))
 then raise exception 'verified_existing_owner_required';end if;
end$$;
create or replace function private.admin_owner_identity() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.admin_owner_logins b join auth.users u on u.id=b.user_id
 where b.user_id=auth.uid() and
 ((b.kind='email' and u.email_confirmed_at is not null and lower(u.email)=b.identifier)
 or (b.kind='phone' and u.phone_confirmed_at is not null and regexp_replace(u.phone,'[^0-9]','','g')=b.identifier)))
$$;
revoke all on function private.admin_owner_identity() from public,anon,authenticated;
create or replace function private.is_admin() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.admin_memberships where user_id=auth.uid())
 and not exists(select 1 from private.account_lifecycle where user_id=auth.uid() and status<>'ACTIVE')
 and (private.admin_owner_identity() or exists(
  select 1 from private.admin_access_events e
  where e.subject=auth.uid() and e.action='ADD'
   and exists(select 1 from private.admin_owner_logins b where b.user_id=e.actor)
   and e.id=(select max(last_event.id) from private.admin_access_events last_event
    where last_event.subject=auth.uid() and last_event.action in ('ADD','REMOVE'))))
$$;
create or replace function private.is_owner() returns boolean language sql stable security definer set search_path='' as $$
 select private.is_admin() and private.admin_owner_identity()
$$;
revoke all on function private.is_owner() from public,anon,authenticated;
create or replace function public.admin_access_command(operation text,payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare target uuid;mail text;why text;
begin
 if not private.is_owner() then raise exception 'owner_required';end if;
 perform 1 from private.admin_access_owner for update;
 if operation='list' then
  return (select coalesce(jsonb_agg(jsonb_build_object('user_id',u.id,'email',u.email,
   'owner',exists(select 1 from private.admin_owner_logins b where b.user_id=u.id)) order by u.email),'[]')
   from private.admin_memberships m join auth.users u on u.id=m.user_id);
 end if;
 if operation not in ('add','remove') then raise exception 'invalid_operation';end if;
 mail:=lower(trim(payload->>'email'));why:=trim(payload->>'reason');
 if mail is null or mail!~'^[^ @]+@[^ @]+\.[^ @]+$' then raise exception 'invalid_email';end if;
 if coalesce(length(why),0)<5 or length(why)>1000 then raise exception 'reason_required';end if;
 select u.id into target from auth.users u where lower(u.email)=mail;
 if target is null then raise exception 'registered_account_required';end if;
 if exists(select 1 from private.admin_owner_logins where user_id=target) then raise exception 'owner_protected';end if;
 if operation='add' then
  if not exists(select 1 from auth.users u join public.member_profiles p on p.user_id=u.id where u.id=target and u.email_confirmed_at is not null)
   or exists(select 1 from private.account_lifecycle where user_id=target and status<>'ACTIVE') then raise exception 'verified_active_member_required';end if;
  insert into private.admin_memberships(user_id) values(target) on conflict do nothing;
 else delete from private.admin_memberships where user_id=target;
 end if;
 insert into private.admin_access_events(actor,subject,action,email,reason) values(auth.uid(),target,upper(operation),mail,why);
 return jsonb_build_object('saved',true);
end$$;
revoke all on function public.admin_access_command(text,jsonb) from public,anon,authenticated;
grant execute on function public.admin_access_command(text,jsonb) to authenticated;
commit;
