begin;
-- Fresh databases only. Existing installations require a reviewed migration.
create table private.ad_plans (
 id uuid primary key default gen_random_uuid(),
 code text not null check(code in ('basic','premium','regional_exclusive')),
 name text not null, amount integer check(amount>0),
 period_days integer check(period_days between 1 and 366),
 guaranteed_impressions integer check(guaranteed_impressions>0),
 enabled boolean not null default false, reason text not null,
 created_by uuid, created_at timestamptz not null default now(),
 check(not enabled or (amount is not null and period_days is not null and guaranteed_impressions is not null))
);
insert into private.ad_plans(code,name,reason) values
 ('basic','베이직','조건 미확정'),('premium','프리미엄','조건 미확정'),('regional_exclusive','지역독점','조건 미확정');
create table private.ad_slots (
 id uuid primary key default gen_random_uuid(), code text not null check(code in ('basic','premium','regional_exclusive')),
 region text not null check(length(region) between 2 and 120), enabled boolean not null default false,
 unique(code,region)
);
create table private.ad_subscriptions (
 id uuid primary key default gen_random_uuid(), order_id text not null unique,
 planner_id uuid not null references private.planner_directory(user_id), plan_id uuid not null references private.ad_plans(id),
 slot_id uuid not null references private.ad_slots(id), request_key uuid not null,
 plan_name text not null, amount integer not null check(amount>0),
 period_days integer not null check(period_days between 1 and 366),
 guaranteed_impressions integer not null check(guaranteed_impressions>0),
 state text not null default 'unpaid' check(state in ('unpaid','confirming','active','failed','cancelled','refunding','refund_failed','refunded')),
 payment_key text unique, receipt_url text, refunded_won integer not null default 0 check(refunded_won>=0 and refunded_won<=amount),
 hold_until timestamptz not null default now()+interval '30 minutes',
 starts_at timestamptz, ends_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(planner_id,request_key)
);
create table private.ad_impressions (
 event_id uuid primary key, subscription_id uuid not null references private.ad_subscriptions(id),
 recorded_at timestamptz not null default now()
);
create index ad_impression_subscription on private.ad_impressions(subscription_id);
create table private.ad_audit (
 id bigint generated always as identity primary key, subscription_id uuid references private.ad_subscriptions(id),
 actor uuid, event text not null, reason text not null default '', created_at timestamptz not null default now()
);
revoke all on private.ad_plans,private.ad_slots,private.ad_subscriptions,private.ad_impressions,private.ad_audit from public,anon,authenticated;

create function public.ad_workspace() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not (private.is_admin() or exists(select 1 from public.partner_applications where user_id=auth.uid() and profession='planner')) then raise exception 'request_forbidden';end if;
 return jsonb_build_object(
 'plans',(select coalesce(jsonb_agg(to_jsonb(p)-'created_by' order by p.created_at desc),'[]') from private.ad_plans p),
 'slots',(select coalesce(jsonb_agg(to_jsonb(s) order by s.region),'[]') from private.ad_slots s where enabled or private.is_admin()),
 'subscriptions',(select coalesce(jsonb_agg(to_jsonb(s)-'payment_key'-'request_key' ||
 jsonb_build_object('resume_key',s.request_key,'impressions',(select count(*) from private.ad_impressions i where i.subscription_id=s.id),
 'expired',s.ends_at is not null and s.ends_at<=now(),
 'events',case when private.is_admin() then (select coalesce(jsonb_agg(to_jsonb(a) order by a.id),'[]') from private.ad_audit a where a.subscription_id=s.id) else '[]'::jsonb end) order by s.created_at desc),'[]')
 from private.ad_subscriptions s where s.planner_id=auth.uid() or private.is_admin()));
end $$;

create function public.ad_admin_command(operation text,payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
 if not private.is_admin() or coalesce(length(trim(payload->>'reason')),0)<5 then raise exception 'admin_required';end if;
 if operation='plan' then
  -- Plan versions are immutable. Checkout snapshots terms; later versions cannot change an order.
  update private.ad_plans set enabled=false where code=payload->>'code';
  insert into private.ad_plans(code,name,amount,period_days,guaranteed_impressions,enabled,reason,created_by)
  values(payload->>'code',case payload->>'code' when 'basic' then '베이직' when 'premium' then '프리미엄' when 'regional_exclusive' then '지역독점' end,
   (payload->>'amount')::integer,(payload->>'period_days')::integer,(payload->>'guaranteed_impressions')::integer,
   coalesce((payload->>'enabled')::boolean,false),trim(payload->>'reason'),auth.uid()) returning id into result;
 elsif operation='slot' then
  insert into private.ad_slots(code,region,enabled) values(payload->>'code',trim(payload->>'region'),coalesce((payload->>'enabled')::boolean,false))
  on conflict(code,region) do update set enabled=excluded.enabled returning id into result;
 else raise exception 'unknown_operation';end if;
 insert into private.ad_audit(actor,event,reason) values(auth.uid(),'configure_'||operation,trim(payload->>'reason'));
 return jsonb_build_object('id',result);
end $$;

create function public.ad_checkout(plan_id uuid,slot_id uuid,request_key uuid,consent boolean) returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare p private.ad_plans; sl private.ad_slots; s private.ad_subscriptions; sid uuid:=gen_random_uuid();
begin
 if auth.uid() is null or not private.planner_eligible(auth.uid()) then raise exception 'request_forbidden';end if;
 if consent is distinct from true or request_key is null then raise exception 'consent_required';end if;
 -- All order transitions lock the slot before the subscription, including refunds and reconciliation.
 select * into sl from private.ad_slots a where a.id=slot_id for update;
 if sl.id is null then raise exception 'slot_unavailable';end if;
 select * into s from private.ad_subscriptions a where a.planner_id=auth.uid() and a.request_key=request_key;
 if s.id is not null then
  if s.plan_id<>plan_id or s.slot_id<>slot_id then raise exception 'request_key_conflict';end if;
  return (to_jsonb(s)-'payment_key')||jsonb_build_object('id',s.order_id,'customer_key',s.planner_id);
 end if;
 select * into p from private.ad_plans a where a.id=plan_id;
 if p.id is null or not p.enabled or not sl.enabled or sl.code<>p.code then raise exception 'plan_not_available';end if;
 if exists(select 1 from private.ad_subscriptions a where a.slot_id=slot_id
 and (a.planner_id=auth.uid() or sl.code='regional_exclusive')
 and ((a.state='unpaid' and a.hold_until>now()) or a.state in ('confirming','refunding','refund_failed')
 or (a.state='active' and a.ends_at>now()))) then raise exception 'slot_unavailable';end if;
 insert into private.ad_subscriptions(id,order_id,planner_id,plan_id,slot_id,request_key,plan_name,amount,period_days,guaranteed_impressions)
 values(sid,'ad_'||replace(sid::text,'-',''),auth.uid(),p.id,sl.id,request_key,p.name,p.amount,p.period_days,p.guaranteed_impressions) returning * into s;
 insert into private.ad_audit(subscription_id,actor,event,reason) values(s.id,auth.uid(),'checkout','ad-terms-v1; prepaid; manual renewal');
 return (to_jsonb(s)-'payment_key')||jsonb_build_object('id',s.order_id,'customer_key',s.planner_id);
end $$;

create function public.ad_begin_confirm(order_id text,provided_key text,provided_amount integer) returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare s private.ad_subscriptions;
begin
 select * into s from private.ad_subscriptions a where a.order_id=order_id;
 if s.id is null or s.planner_id is distinct from auth.uid() then raise exception 'request_forbidden';end if;
 perform 1 from private.ad_slots where id=s.slot_id for update;
 select * into s from private.ad_subscriptions a where a.order_id=order_id for update;
 if provided_key is null or length(provided_key) not between 1 and 200 or provided_amount is distinct from s.amount then raise exception 'payment_mismatch';end if;
 if s.payment_key is not null and s.payment_key<>provided_key then raise exception 'payment_key_conflict';end if;
 if s.state not in ('unpaid','confirming','active') then raise exception 'invalid_transition';end if;
 if s.state='unpaid' and (s.hold_until<=now() or not private.planner_eligible(auth.uid())) then raise exception 'order_expired';end if;
 if s.state<>'active' then update private.ad_subscriptions set state='confirming',payment_key=provided_key,updated_at=now() where id=s.id;end if;
 return jsonb_build_object('id',s.order_id,'amount',s.amount,'payment_key',provided_key);
end $$;

create function public.ad_order_lookup(order_id text) returns jsonb language sql stable security definer set search_path='' as $$
 select to_jsonb(s)||jsonb_build_object('id',s.order_id) from private.ad_subscriptions s where s.order_id=ad_order_lookup.order_id
$$;
create function public.ad_user_order(order_id text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare s private.ad_subscriptions;
begin
 select * into s from private.ad_subscriptions a where a.order_id=ad_user_order.order_id and (a.planner_id=auth.uid() or private.is_admin());
 if s.id is null then raise exception 'request_forbidden';end if;
 return to_jsonb(s)||jsonb_build_object('id',s.order_id);
end $$;

create function public.ad_reconcile(order_id text,provided_key text,provided_amount integer,provider_status text,receipt text default null,transaction_id text default null) returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare s private.ad_subscriptions;
begin
 select * into s from private.ad_subscriptions a where a.order_id=order_id;
 if s.id is null then raise exception 'payment_mismatch';end if;
 perform 1 from private.ad_slots where id=s.slot_id for update;
 select * into s from private.ad_subscriptions a where a.order_id=order_id for update;
 if provided_key is null or s.payment_key is distinct from provided_key or s.amount is distinct from provided_amount then raise exception 'payment_mismatch';end if;
 if provider_status='DONE' then
  if s.state in ('refunding','refund_failed','refunded','active') then return jsonb_build_object('unchanged',true);end if;
  if s.state<>'confirming' then raise exception 'invalid_transition';end if;
  update private.ad_subscriptions set state='active',starts_at=now(),ends_at=now()+s.period_days*interval '1 day',receipt_url=receipt,updated_at=now() where id=s.id;
 elsif provider_status='CANCELED' then
  if s.state='refunded' then return jsonb_build_object('unchanged',true);end if;
  update private.ad_subscriptions set state='refunded',refunded_won=amount,updated_at=now() where id=s.id;
 elsif provider_status in ('ABORTED','EXPIRED') and s.state='confirming' then
  update private.ad_subscriptions set state='failed',updated_at=now() where id=s.id;
 else return jsonb_build_object('pending',true);end if;
 insert into private.ad_audit(subscription_id,event,reason) values(s.id,'provider_'||provider_status,coalesce(transaction_id,''));
 return jsonb_build_object('saved',true);
end $$;

create function public.ad_refund_request(order_id text,reason text,platform_fault boolean) returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare s private.ad_subscriptions; delivered bigint;
begin
 if not private.is_admin() or platform_fault is distinct from true or coalesce(length(trim(reason)),0)<5 then raise exception 'refund_evidence_required';end if;
 select * into s from private.ad_subscriptions a where a.order_id=order_id;
 if s.id is null then raise exception 'request_forbidden';end if;
 perform 1 from private.ad_slots where id=s.slot_id for update;
 select * into s from private.ad_subscriptions a where a.order_id=order_id for update;
 if s.state='refunded' then return jsonb_build_object('already_refunded',true);end if;
 select count(*) into delivered from private.ad_impressions where subscription_id=s.id;
 if s.state not in ('active','refunding','refund_failed') or s.ends_at is null or s.ends_at>now() or delivered>=s.guaranteed_impressions then raise exception 'refund_not_eligible';end if;
 update private.ad_subscriptions set state='refunding',updated_at=now() where id=s.id;
 insert into private.ad_audit(subscription_id,actor,event,reason) values(s.id,auth.uid(),'refund_platform_shortfall',trim(reason));
 return jsonb_build_object('id',s.order_id,'payment_key',s.payment_key,'amount',s.amount,'reason',reason);
end $$;
create function public.ad_refund_failure(order_id text) returns void language sql security definer set search_path='' as $$
 update private.ad_subscriptions set state='refund_failed',updated_at=now() where order_id=ad_refund_failure.order_id and state='refunding'
$$;

create function public.ad_public_slots(area text) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('subscription_id',s.id,'planner_id',s.planner_id,'name',p.full_name,'region',sl.region,'plan_name',s.plan_name)),'[]')
 from private.ad_subscriptions s join private.ad_slots sl on sl.id=s.slot_id join public.partner_applications p on p.user_id=s.planner_id
 where s.state='active' and s.starts_at<=now() and s.ends_at>now() and sl.enabled and (area='' or sl.region like area||'%') and private.planner_eligible(s.planner_id)
$$;
create function public.ad_record_impression(subscription_id uuid,event_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare s private.ad_subscriptions;
begin
 select * into s from private.ad_subscriptions where id=subscription_id for update;
 if s.state is distinct from 'active' or s.starts_at>now() or s.ends_at<=now() or not private.planner_eligible(s.planner_id) or not exists(select 1 from private.ad_slots where id=s.slot_id and enabled) then return;end if;
 insert into private.ad_impressions(event_id,subscription_id) values(event_id,s.id) on conflict do nothing;
end $$;

revoke all on function public.ad_workspace(),public.ad_admin_command(text,jsonb),public.ad_checkout(uuid,uuid,uuid,boolean),public.ad_begin_confirm(text,text,integer),public.ad_user_order(text),public.ad_order_lookup(text),public.ad_reconcile(text,text,integer,text,text,text),public.ad_refund_request(text,text,boolean),public.ad_refund_failure(text),public.ad_public_slots(text),public.ad_record_impression(uuid,uuid) from public,anon,authenticated;
grant execute on function public.ad_workspace(),public.ad_admin_command(text,jsonb),public.ad_checkout(uuid,uuid,uuid,boolean),public.ad_begin_confirm(text,text,integer),public.ad_user_order(text),public.ad_refund_request(text,text,boolean) to authenticated;
grant execute on function public.ad_order_lookup(text),public.ad_reconcile(text,text,integer,text,text,text),public.ad_refund_failure(text),public.ad_public_slots(text),public.ad_record_impression(uuid,uuid) to service_role;
commit;
