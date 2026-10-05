begin;
select pg_advisory_xact_lock(38001);
create table if not exists private.office_staff(office_id text not null references private.office_locations(id),user_id uuid not null references auth.users(id),primary key(office_id,user_id));
create table if not exists private.notifications(id uuid primary key default gen_random_uuid(),recipient_user_id uuid not null references auth.users(id),notification_type text not null,title text not null,body text not null,consultation_id uuid references private.consultations(id),insurance_office_id text,deep_link text not null,dedupe_key text not null,delivery_status text not null default 'IN_APP_CREATED',read_at timestamptz,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(recipient_user_id,dedupe_key));
create index if not exists notifications_recipient on private.notifications(recipient_user_id,created_at desc);
create table if not exists private.push_subscriptions(id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id),device_id uuid not null,platform text not null default 'web',subscription jsonb not null default '{}',active boolean not null default false,last_seen_at timestamptz not null default now(),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(user_id,device_id));
alter table private.office_staff enable row level security;
alter table private.notifications enable row level security;
alter table private.push_subscriptions enable row level security;
revoke all on private.office_staff,private.notifications,private.push_subscriptions from public,anon,authenticated;
create or replace function public.notification_inbox(operation text default 'list',notification_id uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not private.is_active_member() then raise exception 'membership_required';end if;
 if operation='read' then update private.notifications set read_at=coalesce(read_at,now()),delivery_status='READ',updated_at=now() where id=notification_id and recipient_user_id=auth.uid();
 elsif operation='read_all' then update private.notifications set read_at=now(),delivery_status='READ',updated_at=now() where recipient_user_id=auth.uid() and read_at is null;
 elsif operation<>'list' then raise exception 'invalid_operation';end if;
 return jsonb_build_object('unread',(select count(*) from private.notifications where recipient_user_id=auth.uid() and read_at is null),'items',(select coalesce(jsonb_agg(to_jsonb(n) order by created_at desc),'[]') from (select id,notification_type,title,body,deep_link,read_at,created_at from private.notifications where recipient_user_id=auth.uid() order by created_at desc limit 100) n));
end$$;
create or replace function private.reservation_notification() returns trigger language plpgsql security definer set search_path='' as $$
declare event_type text;heading text;description text:='약속한 일정을 확인해주세요.';recipient uuid;receivers uuid[];target text;
begin
 if tg_op='INSERT' then
  event_type:=case when new.office_id is not null then 'OFFICE_BOOKING_REQUESTED' else 'RESERVATION_REQUESTED' end;heading:=case when new.office_id is not null then '새 방문예약 요청이 도착했어요.' else '새 상담 요청이 도착했어요.' end;description:='가능한 일정인지 확인해주세요.';
  if new.planner_id is not null then receivers:=array[new.planner_id];else select array_agg(user_id) into receivers from private.office_staff where office_id=new.office_id;if receivers is null then select array_agg(user_id) into receivers from private.admin_memberships;end if;end if;
 else
  if new.state is not distinct from old.state and new.preferred_at is not distinct from old.preferred_at and new.planner_id is not distinct from old.planner_id and new.journey_state is not distinct from old.journey_state and new.planner_ok is not distinct from old.planner_ok then return new;end if;
  receivers:=array[new.customer_id,new.planner_id];
  if new.journey_state is distinct from old.journey_state and new.journey_state in ('departed','arrived') then event_type:=case when new.journey_state='departed' then 'EXPERT_DEPARTED' else 'EXPERT_ARRIVED' end;heading:=case when new.journey_state='departed' then '전문가가 출발했어요.' else '전문가가 도착했어요.' end;receivers:=array[new.customer_id];
  elsif new.state='cancelled' then event_type:=case when new.office_id is not null then 'OFFICE_BOOKING_CANCELLED' else 'RESERVATION_CANCELLED' end;heading:='예약이 취소됐어요.';
  elsif new.state='completed' then event_type:='RESERVATION_COMPLETED';heading:='상담이 완료됐어요.';
  elsif new.state in ('confirmed','scheduled') and old.state not in ('confirmed','scheduled') then event_type:=case when new.office_id is not null then 'OFFICE_BOOKING_CONFIRMED' else 'RESERVATION_ACCEPTED' end;heading:=case when new.office_id is not null then '보험소 방문예약이 확정됐어요.' else '예약이 확정됐어요.' end;
  elsif new.state='unmatched' then event_type:='RESERVATION_REJECTED';heading:='해당 일정으로 예약이 어려워요.';description:='다른 전문가나 시간을 확인해주세요.';
  elsif new.preferred_at is distinct from old.preferred_at then event_type:='RESERVATION_CHANGED';heading:='예약시간이 변경됐어요.';
  elsif new.planner_id is distinct from old.planner_id then event_type:='RESERVATION_REQUESTED';heading:='담당 예약이 배정됐어요.';receivers:=array[new.planner_id];
  elsif new.planner_ok and not old.planner_ok then event_type:='RESERVATION_ACCEPTED';heading:='전문가가 요청을 확인했어요.';description:='내 예약에서 최종 일정을 확인해주세요.';receivers:=array[new.customer_id];
  else event_type:='RESERVATION_CHANGED';heading:='예약 진행상황이 변경됐어요.';end if;
  if new.office_id is not null then receivers:=receivers||coalesce((select array_agg(user_id) from private.office_staff where office_id=new.office_id),array[]::uuid[]);end if;
 end if;
 foreach recipient in array coalesce(receivers,array[]::uuid[]) loop
  if recipient is null or recipient=auth.uid() then continue;end if;
  target:=case when recipient=new.customer_id then '/requests.html' when exists(select 1 from private.admin_memberships where user_id=recipient) then '/admin-requests.html' else '/partner-work.html' end;
  insert into private.notifications(recipient_user_id,notification_type,title,body,consultation_id,insurance_office_id,deep_link,dedupe_key) values(recipient,event_type,heading,description,new.id,new.office_id,'/notifications.html?reservation='||new.id::text,'reservation:'||new.id::text||':'||event_type||':'||new.revision::text) on conflict do nothing;
 end loop;
 return new;
end$$;
do $$begin if not exists(select 1 from pg_trigger where tgname='reservation_notification' and tgrelid='private.consultations'::regclass) then create trigger reservation_notification after insert or update on private.consultations for each row execute function private.reservation_notification();end if;end$$;
create or replace function public.push_device(operation text,device_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'membership_required';end if;
 if operation not in ('unregister','disable') then return jsonb_build_object('enabled',false,'reason','provider_not_configured');end if;
 update private.push_subscriptions p set active=false,updated_at=now() where p.user_id=auth.uid() and p.device_id=push_device.device_id;
 return jsonb_build_object('saved',true);
end$$;
create or replace function public.notification_reservation(reservation_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if not private.is_active_member() then raise exception 'membership_required';end if;
 select jsonb_build_object('id',c.id,'state',c.state,'preferred_at',c.preferred_at,'office_name',o.name,'journey_state',c.journey_state,'workspace',case when c.customer_id=auth.uid() then '/requests.html' when c.planner_id=auth.uid() then '/partner-work.html' when private.is_admin() then '/admin-requests.html' else null end)
 into result from private.consultations c left join private.office_locations o on o.id=c.office_id
 where c.id=reservation_id and (c.customer_id=auth.uid() or c.planner_id=auth.uid() or private.is_admin() or exists(select 1 from private.office_staff s where s.office_id=c.office_id and s.user_id=auth.uid()));
 if result is null then raise exception 'reservation_not_found';end if;return result;
end$$;
revoke all on function public.notification_reservation(uuid) from public,anon,authenticated;
grant execute on function public.notification_reservation(uuid) to authenticated;
revoke all on function private.reservation_notification(),public.notification_inbox(text,uuid),public.push_device(text,uuid) from public,anon,authenticated;
grant execute on function public.notification_inbox(text,uuid),public.push_device(text,uuid) to authenticated;

create or replace function private.urgent_notification() returns trigger language plpgsql security definer set search_path='' as $$
declare recipient uuid;heading text;kind text;
begin
 if tg_table_name='urgent_offers' then
  insert into private.notifications(recipient_user_id,notification_type,title,body,deep_link,dedupe_key) values(new.planner_id,'RESERVATION_REQUESTED','새 상담 요청이 도착했어요.','가능한 일정인지 확인해주세요.','/urgent.html?request='||new.request_id::text,'urgent:'||new.request_id::text||':offer') on conflict do nothing;return new;
 end if;
 if new.state is not distinct from old.state then return new;end if;
 kind:=case new.state when 'DEPARTED' then 'EXPERT_DEPARTED' when 'ARRIVED' then 'EXPERT_ARRIVED' when 'COMPLETED' then 'RESERVATION_COMPLETED' when 'CANCELLED' then 'RESERVATION_CANCELLED' when 'ACCEPTED' then 'RESERVATION_ACCEPTED' else 'RESERVATION_CHANGED' end;
 heading:=case new.state when 'DEPARTED' then '전문가가 출발했어요.' when 'ARRIVED' then '전문가가 도착했어요.' when 'COMPLETED' then '상담이 완료됐어요.' when 'CANCELLED' then '요청이 취소됐어요.' when 'ACCEPTED' then '전문가가 요청을 수락했어요.' when 'EXPIRED' then '요청 시간이 종료됐어요.' else '상담 진행상황이 변경됐어요.' end;
 foreach recipient in array array[new.customer_id,new.planner_id] loop
  if recipient is null or recipient=auth.uid() then continue;end if;
  insert into private.notifications(recipient_user_id,notification_type,title,body,deep_link,dedupe_key) values(recipient,kind,heading,'앱에서 진행상황을 확인해주세요.','/urgent.html?request='||new.id::text,'urgent:'||new.id::text||':'||new.state) on conflict do nothing;
 end loop;return new;
end$$;
revoke all on function private.urgent_notification() from public,anon,authenticated;
do $$begin
 if not exists(select 1 from pg_trigger where tgname='urgent_notification' and tgrelid='private.urgent_requests'::regclass) then create trigger urgent_notification after update on private.urgent_requests for each row execute function private.urgent_notification();end if;
 if not exists(select 1 from pg_trigger where tgname='urgent_offer_notification' and tgrelid='private.urgent_offers'::regclass) then create trigger urgent_offer_notification after insert on private.urgent_offers for each row execute function private.urgent_notification();end if;
end$$;
commit;
