begin;
select pg_advisory_xact_lock(39001);
alter table private.push_subscriptions add column if not exists token_hash text;
alter table private.push_subscriptions add column if not exists binding_key uuid;
create unique index if not exists push_token_owner on private.push_subscriptions(token_hash) where token_hash is not null;
create table if not exists private.push_deliveries(id uuid primary key default gen_random_uuid(),notification_id uuid not null references private.notifications(id),subscription_id uuid not null references private.push_subscriptions(id),binding_key uuid not null,state text not null default 'PENDING',attempts integer not null default 0,lease uuid,lease_until timestamptz,provider_id text,error_code text,next_attempt_at timestamptz not null default now(),created_at timestamptz not null default now(),unique(notification_id,subscription_id));
alter table private.push_deliveries enable row level security;
revoke all on private.push_deliveries from public,anon,authenticated;
-- Only the server can accept FCM tokens; ownership derives from verified Auth, never request user IDs.
create or replace function public.push_service(subject uuid,operation text,payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare p private.push_subscriptions;token text;binding uuid;result jsonb;
begin
 if operation in ('register','unregister') then
  if subject is null or not exists(select 1 from public.member_profiles where user_id=subject) or exists(select 1 from private.account_lifecycle where user_id=subject and status<>'ACTIVE') then raise exception 'membership_required';end if;
  perform pg_advisory_xact_lock(hashtextextended('push-device:'||(payload->>'device_id'),39));
  if operation='unregister' then update private.push_subscriptions set active=false,updated_at=now() where user_id=subject and device_id=(payload->>'device_id')::uuid;return jsonb_build_object('saved',true);end if;
  token:=payload->>'token';binding:=(payload->>'binding')::uuid;
  if token is null or length(token) not between 20 and 4096 or token!~'^[A-Za-z0-9_:\-]+$' or binding is null then raise exception 'invalid_token';end if;
  perform pg_advisory_xact_lock(hashtextextended(token,39));
  -- Revoke previous ownership before binding the same device/token to the current member.
  update private.push_subscriptions set active=false,token_hash=null,subscription='{}',updated_at=now() where token_hash=encode(sha256(convert_to(token,'UTF8')),'hex') or device_id=(payload->>'device_id')::uuid;
  insert into private.push_subscriptions(user_id,device_id,subscription,token_hash,binding_key,active,last_seen_at) values(subject,(payload->>'device_id')::uuid,jsonb_build_object('token',token),encode(sha256(convert_to(token,'UTF8')),'hex'),binding,true,now()) on conflict(user_id,device_id) do update set subscription=excluded.subscription,token_hash=excluded.token_hash,binding_key=excluded.binding_key,active=true,last_seen_at=now(),created_at=now(),updated_at=now();return jsonb_build_object('saved',true);
 elsif operation='claim' then
  -- Never replay old notifications to a newly registered device.
  insert into private.push_deliveries(notification_id,subscription_id,binding_key) select n.id,s.id,s.binding_key from private.notifications n join private.push_subscriptions s on s.user_id=n.recipient_user_id and s.active and s.binding_key is not null and n.created_at>=s.created_at where n.created_at>now()-interval '1 day' and n.read_at is null and not exists(select 1 from private.account_lifecycle a where a.user_id=s.user_id and a.status<>'ACTIVE') on conflict do nothing;
  -- Unknown transport outcomes are not retried automatically, preventing duplicate delivery.
  update private.push_deliveries set state='UNKNOWN',error_code='worker_interrupted' where state='SENDING' and lease_until<now();
  with candidates as (select id from private.push_deliveries where state in ('PENDING','RETRY') and next_attempt_at<=now() and attempts<3 order by created_at limit 20 for update skip locked), claimed as (update private.push_deliveries d set state='SENDING',lease=gen_random_uuid(),lease_until=now()+interval '2 minutes',attempts=attempts+1 from candidates c where d.id=c.id returning d.*) select coalesce(jsonb_agg(to_jsonb(c)),'[]') into result from claimed c;return result;
 elsif operation='authorize' then
  select jsonb_build_object('token',s.subscription->>'token','binding',s.binding_key,'notificationId',n.id,'deepLink',n.deep_link,'title',n.title) into result from private.push_deliveries d join private.push_subscriptions s on s.id=d.subscription_id join private.notifications n on n.id=d.notification_id where d.id=(payload->>'id')::uuid and d.lease=(payload->>'lease')::uuid and d.state='SENDING' and s.active and s.binding_key=d.binding_key and s.user_id=n.recipient_user_id and not exists(select 1 from private.account_lifecycle a where a.user_id=s.user_id and a.status<>'ACTIVE');return result;
 elsif operation='finish' then
  if payload->>'state' not in ('SENT','FAILED','UNKNOWN','RETRY','CANCELLED') then raise exception 'invalid_state';end if;
  update private.push_deliveries set state=payload->>'state',provider_id=left(payload->>'providerId',200),error_code=left(payload->>'errorCode',60),next_attempt_at=now()+interval '5 minutes' where id=(payload->>'id')::uuid and lease=(payload->>'lease')::uuid and state='SENDING';
  if payload->>'errorCode'='UNREGISTERED' then update private.push_subscriptions set active=false where id=(select subscription_id from private.push_deliveries where id=(payload->>'id')::uuid);end if;
  return jsonb_build_object('saved',true);
 end if;raise exception 'invalid_operation';
end$$;
revoke all on function public.push_service(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.push_service(uuid,text,jsonb) to service_role;
-- Notification trigger sees the final transaction state, not intermediate wrapper transitions.
drop trigger if exists reservation_notification on private.consultations;
create constraint trigger reservation_notification after insert or update on private.consultations deferrable initially deferred for each row execute function private.reservation_notification();
do $outer$declare source text;begin
 source:=pg_get_functiondef('private.reservation_notification()'::regprocedure);
 if position('select * into new from private.consultations' in source)=0 then source:=regexp_replace(source,E'begin[\r\n]+','begin'||chr(10)||' select * into new from private.consultations where id=new.id;'||chr(10),'i');execute source;end if;
end$outer$;
commit;
