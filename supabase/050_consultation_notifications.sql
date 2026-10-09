begin;
select pg_advisory_xact_lock(49009);
-- The production table already exists. These definitions also support clean installs.
create table if not exists private.office_staff(office_id text not null references private.office_locations(id),user_id uuid not null references auth.users(id),primary key(office_id,user_id));
create table if not exists private.notifications(
 id uuid primary key default gen_random_uuid(),recipient_user_id uuid not null references auth.users(id),notification_type text not null,
 title text not null,body text not null,consultation_id uuid references private.consultations(id),insurance_office_id text,deep_link text not null,dedupe_key text not null,
 delivery_status text not null default 'IN_APP_CREATED',read_at timestamptz,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(recipient_user_id,dedupe_key));
alter table private.notifications enable row level security;
alter table private.office_staff enable row level security;
revoke all on private.notifications,private.office_staff from public,anon,authenticated;
create or replace function public.notification_inbox(operation text default 'list',notification_id uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not private.is_active_member() then raise exception 'membership_required';end if;
 if operation='read' then update private.notifications set read_at=coalesce(read_at,now()),delivery_status='READ',updated_at=now() where id=notification_id and recipient_user_id=auth.uid();
 elsif operation='read_all' then update private.notifications set read_at=now(),delivery_status='READ',updated_at=now() where recipient_user_id=auth.uid() and read_at is null;
 elsif operation<>'list' then raise exception 'invalid_operation';end if;
 return jsonb_build_object('unread',(select count(*) from private.notifications where recipient_user_id=auth.uid() and read_at is null),'items',(select coalesce(jsonb_agg(to_jsonb(n) order by created_at desc),'[]') from (select id,notification_type,title,body,deep_link,read_at,created_at from private.notifications where recipient_user_id=auth.uid() order by created_at desc limit 100) n));
end$$;
create or replace function private.reservation_notification() returns trigger language plpgsql security definer set search_path='' as $$
declare heading text;event_key text;receiver uuid;receivers uuid[];
begin
 if tg_op='INSERT' then heading:='상담 요청이 접수됐어요.';event_key:='requested';
 elsif new.state is not distinct from old.state and new.preferred_at is not distinct from old.preferred_at and new.planner_id is not distinct from old.planner_id and new.journey_state is not distinct from old.journey_state and new.planner_ok is not distinct from old.planner_ok then return new;
 else
 event_key:=new.state||':'||coalesce(new.journey_state,'')||':'||new.revision::text||':'||new.preferred_at::text||':'||coalesce(new.planner_id::text,'')||':'||new.planner_ok::text;
 heading:=case
 when new.journey_state is distinct from old.journey_state and new.journey_state='departed' then '전문가가 출발했어요.'
 when new.journey_state is distinct from old.journey_state and new.journey_state='arrived' then '전문가가 도착했어요.'
 when new.state='cancelled' then '예약이 취소됐어요.'
 when new.state='completed' then '상담이 완료됐어요.'
 when new.state='awaiting_completion' then '상담 완료를 확인해 주세요.'
 when new.state in ('confirmed','scheduled') and old.state not in ('confirmed','scheduled') then '예약이 확정됐어요.'
 when new.state='unmatched' then '다른 전문가나 일정을 선택해 주세요.'
 when new.preferred_at is distinct from old.preferred_at then '새 희망시간을 확인해 주세요.'
 when new.planner_id is distinct from old.planner_id then '상담 담당자가 배정됐어요.'
 when new.planner_ok and not old.planner_ok then '요청을 수락했어요. 연락 후 확정해 주세요.'
 else '예약 진행상황이 변경됐어요.' end;
 end if;
 receivers:=array[new.customer_id,new.planner_id];
 if new.planner_id is null then receivers:=receivers||coalesce((select array_agg(user_id) from private.office_staff where office_id=new.office_id),(select array_agg(user_id) from private.admin_memberships),array[]::uuid[]);end if;
 foreach receiver in array receivers loop
 if receiver is null then continue;end if;
 insert into private.notifications(recipient_user_id,notification_type,title,body,consultation_id,insurance_office_id,deep_link,dedupe_key)
 values(receiver,'RESERVATION_CHANGED',heading,'예약 화면에서 다음 단계를 확인해 주세요.',new.id,new.office_id,case when receiver=new.customer_id then '/requests.html' when receiver=new.planner_id then '/partner-work.html' else '/admin-requests.html' end||'?request='||new.id::text,'reservation-v2:'||new.id::text||':'||event_key) on conflict do nothing;
 end loop;return new;
end$$;
create or replace function private.urgent_notification() returns trigger language plpgsql security definer set search_path='' as $$
declare customer uuid;
begin
 if tg_table_name='urgent_offers' then select customer_id into customer from private.urgent_requests where id=new.request_id;perform private.flow_notify('visit',new.request_id,'requested','방문상담 요청이 접수됐어요.',customer,new.planner_id);return new;end if;
 if new.state is not distinct from old.state then return new;end if;
 perform private.flow_notify('visit',new.id,new.state,case new.state
 when 'ACCEPTED' then '요청을 수락했어요. 연락 후 확정해 주세요.' when 'DEPARTED' then '전문가가 출발했어요.' when 'ARRIVED' then '전문가가 도착했어요.' when 'COMPLETED' then '상담이 완료됐어요.' when 'CANCELLED' then '요청이 취소됐어요.' when 'EXPIRED' then '요청이 종료됐어요.' else '방문 진행상황이 변경됐어요.' end,new.customer_id,coalesce(new.planner_id,(select planner_id from private.urgent_offers where request_id=new.id order by rank limit 1)));
 return new;
end$$;
do $$begin
 if not exists(select 1 from pg_trigger where tgname='reservation_notification' and tgrelid='private.consultations'::regclass) then create constraint trigger reservation_notification after insert or update on private.consultations deferrable initially deferred for each row execute function private.reservation_notification();end if;
 if not exists(select 1 from pg_trigger where tgname='urgent_notification' and tgrelid='private.urgent_requests'::regclass) then create trigger urgent_notification after update on private.urgent_requests for each row execute function private.urgent_notification();end if;
 if not exists(select 1 from pg_trigger where tgname='urgent_offer_notification' and tgrelid='private.urgent_offers'::regclass) then create trigger urgent_offer_notification after insert on private.urgent_offers for each row execute function private.urgent_notification();end if;
end$$;
revoke all on function private.reservation_notification(),private.urgent_notification(),public.notification_inbox(text,uuid) from public,anon,authenticated;
grant execute on function public.notification_inbox(text,uuid) to authenticated;
commit;
