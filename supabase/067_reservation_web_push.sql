-- Web reservation notifications: additive, no old notification backfill or policy changes.
begin;
select pg_advisory_xact_lock(hashtextextended('reservation-web-push-v1',67));
create table if not exists private.notification_preferences(
 user_id uuid primary key references auth.users(id) on delete cascade,
 in_app_enabled boolean not null default true,updated_at timestamptz not null default now()
);
create table if not exists private.web_push_subscriptions(
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,
 device_id uuid not null,device_hash text not null,endpoint_hash text not null unique,
 subscription jsonb not null,binding_key uuid not null,active boolean not null default true,
 bound_at timestamptz not null default now(),last_test_at timestamptz,updated_at timestamptz not null default now(),unique(user_id,device_id)
);
create table if not exists private.web_push_deliveries(
 id uuid primary key default gen_random_uuid(),notification_id uuid not null references private.notifications(id) on delete cascade,
 subscription_id uuid not null references private.web_push_subscriptions(id) on delete cascade,
 binding_key uuid not null,state text not null default 'PENDING' check(state in('PENDING','SENDING','SENT','RETRY','FAILED','UNKNOWN','CANCELLED')),
 attempts integer not null default 0,lease uuid,lease_until timestamptz,next_attempt_at timestamptz not null default now(),
 error_code text,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(notification_id,subscription_id,binding_key)
);
alter table private.notification_preferences enable row level security;
alter table private.web_push_subscriptions enable row level security;
alter table private.web_push_deliveries enable row level security;
revoke all on private.notification_preferences,private.web_push_subscriptions,private.web_push_deliveries from public,anon,authenticated;
create index if not exists web_push_due on private.web_push_deliveries(next_attempt_at) where state in('PENDING','RETRY');
create or replace function public.reservation_notification_settings(operation text default 'get',payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();enabled boolean;begin
 if not private.is_active_member() then raise exception 'membership_required';end if;
 if operation='set' then
  if jsonb_typeof(payload->'enabled') is distinct from 'boolean' then raise exception 'invalid_setting';end if;
  enabled:=(payload->>'enabled')::boolean;
  insert into private.notification_preferences(user_id,in_app_enabled) values(actor,enabled) on conflict(user_id) do update set in_app_enabled=excluded.in_app_enabled,updated_at=now();
  if not enabled then
   update private.web_push_subscriptions set active=false,updated_at=now() where user_id=actor;
   update private.web_push_deliveries d set state='CANCELLED',updated_at=now() from private.web_push_subscriptions s where s.id=d.subscription_id and s.user_id=actor and d.state in('PENDING','RETRY');
  end if;
 elsif operation<>'get' then raise exception 'invalid_operation';end if;
 return jsonb_build_object('enabled',coalesce((select in_app_enabled from private.notification_preferences where user_id=actor),true),'saved',true);
end$$;
revoke all on function public.reservation_notification_settings(text,jsonb) from public,anon,authenticated;
grant execute on function public.reservation_notification_settings(text,jsonb) to authenticated;
create or replace function public.reservation_web_push_service(subject uuid,operation text,payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_column
declare s private.web_push_subscriptions;ep text;ep_hash text;dev uuid;cap text;binding uuid;result jsonb;nid uuid;test_key uuid;begin
 if operation in('status','register','unregister','test') then
  if subject is null or not exists(select 1 from public.member_profiles where user_id=subject) or exists(select 1 from private.account_lifecycle where user_id=subject and status<>'ACTIVE') then raise exception 'membership_required';end if;
  dev:=(payload->>'device_id')::uuid;cap:=payload->>'device_hash';
  if dev is null or cap is null or cap!~'^[0-9a-f]{64}$' then raise exception 'invalid_device';end if;
  perform pg_advisory_xact_lock(hashtextextended('web-push-device:'||dev::text,67));
  if operation='status' then
   select * into s from private.web_push_subscriptions where user_id=subject and device_id=dev and device_hash=cap;
   return jsonb_build_object('saved',s.id is not null,'active',coalesce(s.active,false),'binding',s.binding_key,'enabled',coalesce((select in_app_enabled from private.notification_preferences where user_id=subject),true));
  elsif operation='test' then
   select * into s from private.web_push_subscriptions where user_id=subject and device_id=dev and device_hash=cap and active;
   if s.id is null or not coalesce((select in_app_enabled from private.notification_preferences where user_id=subject),true) then raise exception 'device_not_ready';end if;
   test_key:=(payload->>'request_key')::uuid;if test_key is null then raise exception 'invalid_request';end if;
   select id into nid from private.notifications where recipient_user_id=subject and dedupe_key='web-push-test:'||s.id||':'||test_key;
   if nid is not null then return jsonb_build_object('queued',true,'notificationId',nid);end if;
   if s.last_test_at>now()-interval '1 minute' then raise exception 'test_rate_limit';end if;
   insert into private.notifications(recipient_user_id,notification_type,title,body,deep_link,dedupe_key)
    values(subject,'RESERVATION_PUSH_TEST','예약 알림 수신 테스트','이 기기에만 보내는 시험 알림입니다. 실제 예약은 생성되지 않습니다.','/notifications.html','web-push-test:'||s.id||':'||test_key) returning id into nid;
   insert into private.web_push_deliveries(notification_id,subscription_id,binding_key) values(nid,s.id,s.binding_key) on conflict do nothing;
   update private.web_push_subscriptions set last_test_at=now() where id=s.id;
   return jsonb_build_object('queued',true,'notificationId',nid);
  elsif operation='unregister' then
   update private.web_push_subscriptions set active=false,updated_at=now() where device_id=dev and device_hash=cap;
   return jsonb_build_object('saved',true);
  end if;
  if not coalesce((select in_app_enabled from private.notification_preferences where user_id=subject),true) then raise exception 'notifications_disabled';end if;
  ep:=payload->'subscription'->>'endpoint';ep_hash:=encode(sha256(convert_to(ep,'UTF8')),'hex');binding:=(payload->>'binding')::uuid;
  if binding is null or ep is null or ep!~'^https://' or length(ep)>4096 or length(coalesce(payload->'subscription'->'keys'->>'auth','')) not between 20 and 128 or length(coalesce(payload->'subscription'->'keys'->>'p256dh','')) not between 80 and 256 then raise exception 'invalid_subscription';end if;
  perform pg_advisory_xact_lock(hashtextextended(ep_hash,67));
  if exists(select 1 from private.web_push_subscriptions where (endpoint_hash=ep_hash or device_id=dev) and device_hash<>cap) then raise exception 'device_conflict';end if;
  -- A valid device capability can revoke an old account binding, never read its data.
  update private.web_push_subscriptions set active=false,updated_at=now() where device_id=dev and device_hash=cap;
  select * into s from private.web_push_subscriptions where endpoint_hash=ep_hash;
  if s.id is not null then
   update private.web_push_deliveries set state='CANCELLED',updated_at=now() where subscription_id=s.id and state in('PENDING','RETRY');
   -- Remove only an unused duplicate current-user device row before transferring this same endpoint.
   if exists(select 1 from private.web_push_subscriptions where user_id=subject and device_id=dev and id<>s.id) then raise exception 'device_conflict';end if;
   update private.web_push_subscriptions set user_id=subject,device_id=dev,subscription=payload->'subscription',binding_key=binding,active=true,bound_at=now(),updated_at=now() where id=s.id;
  else
   insert into private.web_push_subscriptions(user_id,device_id,device_hash,endpoint_hash,subscription,binding_key) values(subject,dev,cap,ep_hash,payload->'subscription',binding)
   on conflict(user_id,device_id) do update set device_hash=excluded.device_hash,endpoint_hash=excluded.endpoint_hash,subscription=excluded.subscription,binding_key=excluded.binding_key,active=true,bound_at=now(),updated_at=now();
  end if;
  return jsonb_build_object('saved',true,'active',true,'binding',binding);
 elsif operation='claim' then
  insert into private.web_push_deliveries(notification_id,subscription_id,binding_key)
   select n.id,s.id,s.binding_key from private.notifications n join private.web_push_subscriptions s on s.user_id=n.recipient_user_id and s.active
   left join private.notification_preferences p on p.user_id=s.user_id
   where coalesce(p.in_app_enabled,true) and n.created_at>=s.bound_at and n.created_at>now()-interval '1 day'
   and n.notification_type in('RESERVATION_REQUESTED','RESERVATION_CHANGED','RESERVATION_ACCEPTED','RESERVATION_CANCELLED','OFFICE_BOOKING_REQUESTED','OFFICE_BOOKING_CONFIRMED','OFFICE_BOOKING_CANCELLED')
   and not exists(select 1 from private.account_lifecycle a where a.user_id=s.user_id and a.status<>'ACTIVE') on conflict do nothing;
  update private.web_push_deliveries set state='UNKNOWN',error_code='worker_interrupted',updated_at=now() where state='SENDING' and lease_until<now();
  with candidates as(select id from private.web_push_deliveries where state in('PENDING','RETRY') and next_attempt_at<=now() and attempts<3 order by created_at limit 10 for update skip locked),claimed as(update private.web_push_deliveries d set state='SENDING',lease=gen_random_uuid(),lease_until=now()+interval '2 minutes',attempts=attempts+1,updated_at=now() from candidates c where d.id=c.id returning d.id,d.lease)
   select coalesce(jsonb_agg(to_jsonb(c)),'[]') into result from claimed c;return result;
 elsif operation='authorize' then
  select jsonb_build_object('subscription',s.subscription,'binding',s.binding_key,'notificationId',n.id,'reservationId',n.consultation_id,'type',n.notification_type)
   into result from private.web_push_deliveries d join private.web_push_subscriptions s on s.id=d.subscription_id join private.notifications n on n.id=d.notification_id left join private.notification_preferences p on p.user_id=s.user_id
   where d.id=(payload->>'id')::uuid and d.lease=(payload->>'lease')::uuid and d.state='SENDING' and s.active and s.binding_key=d.binding_key and s.user_id=n.recipient_user_id and coalesce(p.in_app_enabled,true)
   and not exists(select 1 from private.account_lifecycle a where a.user_id=s.user_id and a.status<>'ACTIVE');return result;
 elsif operation='finish' then
  if payload->>'state' not in('SENT','FAILED','UNKNOWN','RETRY','CANCELLED') then raise exception 'invalid_state';end if;
  update private.web_push_deliveries set state=payload->>'state',error_code=left(payload->>'errorCode',60),next_attempt_at=now()+interval '5 minutes',updated_at=now() where id=(payload->>'id')::uuid and lease=(payload->>'lease')::uuid and state='SENDING';
  if payload->>'errorCode'='UNREGISTERED' then update private.web_push_subscriptions set active=false,updated_at=now() where id=(select subscription_id from private.web_push_deliveries where id=(payload->>'id')::uuid);end if;
  return jsonb_build_object('saved',true);
 end if;raise exception 'invalid_operation';
end$$;
revoke all on function public.reservation_web_push_service(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.reservation_web_push_service(uuid,text,jsonb) to service_role;
commit;
