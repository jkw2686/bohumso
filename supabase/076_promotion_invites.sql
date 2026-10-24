begin;
select pg_advisory_xact_lock(760076);
-- Benefits never approve an expert, alter billing, or publish a region.
create table if not exists private.promotion_invites(
 id uuid primary key default gen_random_uuid(), token uuid not null unique default gen_random_uuid(),
 free_days integer not null check(free_days between 1 and 3660), capacity integer check(capacity between 1 and 1000000),
 deadline timestamptz not null, stopped_at timestamptz, created_by uuid not null references auth.users(id), created_at timestamptz not null default now());
create table if not exists private.promotion_redemptions(
 promotion_id uuid not null references private.promotion_invites(id),user_id uuid not null references auth.users(id),
 started_at timestamptz not null,ends_at timestamptz not null check(ends_at>started_at),primary key(promotion_id,user_id));
create table if not exists private.promotion_benefits(
 user_id uuid primary key references auth.users(id),promotion_id uuid not null references private.promotion_invites(id),
 started_at timestamptz not null,ends_at timestamptz not null check(ends_at>started_at));
create table if not exists private.recruitment_milestones(
 area_id text primary key references private.service_areas(id),reached_at timestamptz not null default now(),participants integer not null check(participants>=10),seen_at timestamptz);
alter table private.promotion_invites enable row level security;
alter table private.promotion_redemptions enable row level security;
alter table private.promotion_benefits enable row level security;
alter table private.recruitment_milestones enable row level security;
revoke all on private.promotion_invites,private.promotion_redemptions,private.promotion_benefits,private.recruitment_milestones from public,anon,authenticated;

create or replace function public.promotion_preview(invite_token uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('free_days',p.free_days,'capacity',p.capacity,'deadline',p.deadline,
 'used',(select count(*) from private.promotion_redemptions r where r.promotion_id=p.id),
 'status',case when p.stopped_at is not null then 'STOPPED' when p.deadline<=now() then 'CLOSED'
 when p.capacity is not null and (select count(*) from private.promotion_redemptions r where r.promotion_id=p.id)>=p.capacity then 'FULL' else 'ACTIVE' end)
 from private.promotion_invites p where p.token=invite_token
$$;
create or replace function public.promotion_command(operation text,payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare p private.promotion_invites;r private.promotion_redemptions;b private.promotion_benefits;n bigint;started timestamptz;ending timestamptz;
begin
 if not private.is_active_member() then raise exception 'membership_required';end if;
 if operation='benefit' then return (select jsonb_build_object('started_at',started_at,'ends_at',ends_at,'active',ends_at>now()) from private.promotion_benefits where user_id=auth.uid());end if;
 if operation='redeem' then
  -- Same user across links and same link across users are both serialized.
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,76));
  select * into p from private.promotion_invites where token=(payload->>'token')::uuid for update;
  if p.id is null then raise exception 'promotion_not_found';end if;
  select * into r from private.promotion_redemptions where promotion_id=p.id and user_id=auth.uid();
  if r.user_id is not null then return jsonb_build_object('applied',true,'already_applied',true,'started_at',r.started_at,'ends_at',r.ends_at);end if;
  if p.stopped_at is not null then raise exception 'promotion_stopped';end if;
  if p.deadline<=clock_timestamp() then raise exception 'promotion_closed';end if;
  select count(*) into n from private.promotion_redemptions where promotion_id=p.id;
  if p.capacity is not null and n>=p.capacity then raise exception 'promotion_full';end if;
  select * into b from private.promotion_benefits where user_id=auth.uid();
  if b.ends_at>now() then raise exception 'existing_free_benefit';end if;
  if exists(select 1 from private.ad_subscriptions where planner_id=auth.uid() and (state in('confirming','refunding','refund_failed') or state='active' and (ends_at is null or ends_at>now()))) then raise exception 'paid_subscription_preserved';end if;
  started:=clock_timestamp();ending:=started+make_interval(days=>p.free_days);
  insert into private.promotion_redemptions values(p.id,auth.uid(),started,ending);
  insert into private.promotion_benefits values(auth.uid(),p.id,started,ending) on conflict(user_id) do update set promotion_id=excluded.promotion_id,started_at=excluded.started_at,ends_at=excluded.ends_at;
  return jsonb_build_object('applied',true,'started_at',started,'ends_at',ending);
 end if;
 if not private.is_admin() then raise exception 'admin_required';end if;
 if operation='create' then
  if (payload->>'deadline')::timestamptz<=clock_timestamp() or payload->>'deadline' is null then raise exception 'invalid_deadline';end if;
  insert into private.promotion_invites(free_days,capacity,deadline,created_by) values((payload->>'free_days')::integer,(payload->>'capacity')::integer,(payload->>'deadline')::timestamptz,auth.uid()) returning * into p;
  return jsonb_build_object('id',p.id,'token',p.token);
 elsif operation='stop' then
  update private.promotion_invites set stopped_at=coalesce(stopped_at,now()) where id=(payload->>'id')::uuid;
  if not found then raise exception 'promotion_not_found';end if;return jsonb_build_object('saved',true);
 elsif operation='list' then
  return (select coalesce(jsonb_agg(to_jsonb(x) order by created_at desc),'[]') from (select inv.id,inv.token,inv.created_at,public.promotion_preview(inv.token) as conditions from private.promotion_invites inv) x);
 elsif operation='regions_seen' then
  update private.recruitment_milestones set seen_at=coalesce(seen_at,now()) where area_id in(select jsonb_array_elements_text(payload->'areas'));return jsonb_build_object('saved',true);
 elsif operation='members' then
  return (select coalesce(jsonb_agg(jsonb_build_object('user_id',rr.user_id,'started_at',rr.started_at,'ends_at',rr.ends_at) order by rr.started_at desc),'[]') from private.promotion_redemptions rr where rr.promotion_id=(payload->>'id')::uuid);
 end if;
 raise exception 'invalid_operation';
end$$;

-- Aggregate only verified planners providing claim help. Visibility and visit toggles are intentionally absent.
create or replace function private.recruitment_district(area text) returns text language sql immutable set search_path='' as $$select case when area in('경기 판교','경기 성남시 분당구') then '경기 분당' when area='경기 용인시 수지구' then '경기 수지' else area end$$;
create or replace function private.recruitment_counts() returns table(area_id text,participants bigint) language sql stable security definer set search_path='' as $$
 select private.recruitment_district(a.id),count(distinct p.user_id) from private.service_areas a
 left join private.expert_service_areas s on a.id=s.primary_area or a.id=any(s.secondary_areas)
 left join private.expert_profiles p on p.user_id=s.user_id and p.profession='planner' and p.status='APPROVED'
 and (p.registration_status='VERIFIED' or p.organization_status='VERIFIED')
 and p.specialties && array['claim','death','critical','surgery','medical','accident']
 and not exists(select 1 from private.account_lifecycle l where l.user_id=p.user_id and l.status<>'ACTIVE')
 group by private.recruitment_district(a.id)
$$;
create or replace function private.recruitment_check() returns trigger language plpgsql security definer set search_path='' as $$begin
 -- Serialize threshold detection so simultaneous ninth/tenth registrations are not missed.
 perform pg_advisory_xact_lock(760077);
 insert into private.recruitment_milestones(area_id,participants) select area_id,participants from private.recruitment_counts() where participants>=10 on conflict do nothing;
 return null;
end$$;
drop trigger if exists recruitment_profile_change on private.expert_profiles;
create trigger recruitment_profile_change after insert or update or delete on private.expert_profiles for each statement execute function private.recruitment_check();
drop trigger if exists recruitment_area_change on private.expert_service_areas;
create trigger recruitment_area_change after insert or update or delete on private.expert_service_areas for each statement execute function private.recruitment_check();
drop trigger if exists recruitment_lifecycle_change on private.account_lifecycle;
create trigger recruitment_lifecycle_change after insert or update or delete on private.account_lifecycle for each statement execute function private.recruitment_check();
create or replace function public.recruitment_regions() returns jsonb language plpgsql security definer set search_path='' as $$begin
 if not private.is_active_member() or not private.is_admin() then raise exception 'admin_required';end if;
 perform pg_advisory_xact_lock(760077);
 insert into private.recruitment_milestones(area_id,participants) select area_id,participants from private.recruitment_counts() where participants>=10 on conflict do nothing;
 return (select coalesce(jsonb_agg(jsonb_build_object('area_id',a.id,'region',case when a.id='경기 분당' then '경기 성남시 분당구' when a.id='경기 수지' then '경기 용인시 수지구' else a.region||' '||a.name end,'participants',c.participants,'status',case when c.participants>=10 then '오픈 준비' else '모집 중' end,'reached_at',m.reached_at,'seen_at',m.seen_at) order by c.participants desc,a.region,a.name),'[]') from private.recruitment_counts() c join private.service_areas a on a.id=c.area_id left join private.recruitment_milestones m on m.area_id=a.id);
end$$;
revoke all on function private.recruitment_district(text),private.recruitment_counts(),private.recruitment_check(),public.promotion_preview(uuid),public.promotion_command(text,jsonb),public.recruitment_regions() from public,anon,authenticated;
grant execute on function public.promotion_preview(uuid) to anon,authenticated;
grant execute on function public.promotion_command(text,jsonb),public.recruitment_regions() to authenticated;
notify pgrst,'reload schema';
commit;
