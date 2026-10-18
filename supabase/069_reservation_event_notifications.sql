-- REVIEW REQUIRED. Do not apply automatically. Existing rows are never replayed.
begin;
select pg_advisory_xact_lock(hashtextextended('reservation-event-notifications-v1',69));
do $$begin
 if to_regprocedure('public.reservation_web_push_service(uuid,text,jsonb)') is null
 or not exists(select 1 from pg_trigger where tgrelid='private.consultations'::regclass and tgname='reservation_notification' and not tgisinternal and tgdeferrable and tginitdeferred)
 or not exists(select 1 from information_schema.columns where table_schema='private' and table_name='notifications' and column_name='insurance_office_id')
 or to_regclass('private.office_staff') is null then raise exception 'operational_notification_baseline_review_required';end if;
end$$;

-- One existing notification store, recipient-scoped dedupe, no new outbound channel.
create or replace function private.booking_notice(c private.consultations,event_name text,event_version text,only_recipient uuid default null,previous_expert uuid default null)
returns void language plpgsql security definer set search_path='' as $$
declare recipients uuid[];uid uuid;heading text;message text;customer boolean;schedule text;begin
 recipients:=array[c.customer_id,coalesce(c.planner_id,previous_expert)];
 if c.planner_id is null and previous_expert is null and c.office_id is not null then
  recipients:=recipients||coalesce((select array_agg(user_id) from private.office_staff where office_id=c.office_id),
   (select array_agg(user_id) from private.admin_memberships),array[]::uuid[]);
 end if;
 schedule:=coalesce(to_char(c.preferred_at at time zone 'Asia/Seoul','YYYY-MM-DD HH24:MI'),'일정 확인 필요')||' · '||case c.method when 'phone' then '전화상담' when 'visit' then '방문 상담' else '대면 상담' end;
 if c.office_id is not null then schedule:=schedule||' · '||coalesce((select name from private.office_locations where id=c.office_id),'보험소');end if;
 for uid in select distinct x from unnest(recipients) x where x is not null loop
  if only_recipient is not null and uid<>only_recipient then continue;end if;
  if not coalesce((select in_app_enabled from private.notification_preferences where user_id=uid),true) then continue;end if;
  customer:=uid=c.customer_id;
  heading:=case event_name
   when 'REQUESTED' then case when customer then '상담 요청 접수' else '새 예약 요청' end
   when 'ACCEPTED' then case when customer then '전문가 요청 확인' else '수락 처리 완료' end
   when 'PROPOSED' then '예약시간 변경 제안'
   when 'CHANGED' then '예약시간 변경'
   when 'CHANGE_DECLINED' then '일정 변경 제안 종료'
   when 'CONFIRMED' then '예약 확정'
   when 'REJECTED' then '예약 요청 종료'
   when 'CANCELLED' then '예약 취소'
   when 'COMPLETION_REQUESTED' then '상담 완료 확인 요청'
   when 'COMPLETED' then '상담 완료'
   when 'DEPARTED' then '전문가 출발'
   when 'ARRIVED' then '전문가 도착'
   when 'REMINDER' then '예약시간 안내'
   when 'LATE' then '상담 지각 안내'
   when 'ASSIGNED' then '예약 담당 확인' else null end;
  if heading is null then continue;end if;
  message:=case event_name
   when 'REQUESTED' then case when customer then '요청이 접수됐습니다. 아직 확정 전입니다. 희망 '||schedule else '새 요청의 희망 일정을 확인하고 수락 여부를 알려주세요. 희망 '||schedule end
   when 'ACCEPTED' then case when customer then '전문가가 요청을 확인했습니다. 내 예약에서 최종 일정과 동의를 확인해 주세요.' else '수락했습니다. 고객의 최종 일정 확인을 기다려 주세요.' end
   when 'PROPOSED' then case when uid=auth.uid() then '변경 제안이 접수됐습니다. 상대방 수락 전까지 기존 일정이 유지됩니다.' else '변경 제안이 있습니다. 내 예약에서 제안 내용을 확인해 주세요. 수락 전까지 기존 일정이 유지됩니다.' end
   when 'CHANGED' then '변경된 일정: '||schedule||case when c.state in('scheduled','confirmed') then '. 내 예약에서 장소를 확인해 주세요.' else '. 아직 확정 전입니다. 남은 확인 절차를 진행해 주세요.' end
   when 'CHANGE_DECLINED' then '변경 제안이 종료됐습니다. 기존 일정을 확인해 주세요.'
   when 'CONFIRMED' then schedule||'. 예약이 확정됐습니다. 내 예약에서 장소와 준비사항을 확인해 주세요.'
   when 'REJECTED' then case when customer then '요청이 종료됐습니다. 다른 전문가나 일정을 직접 선택할 수 있습니다.' else '요청 종료 처리가 완료됐습니다.' end
   when 'CANCELLED' then '예약이 취소됐습니다. 내 예약에서 취소 결과를 확인할 수 있습니다.'
   when 'COMPLETION_REQUESTED' then case when customer then '상담이 완료됐는지 내 예약에서 확인해 주세요.' else '완료 확인 요청이 접수됐습니다. 고객의 확인을 기다려 주세요.' end
   when 'COMPLETED' then '양쪽의 상담 완료 확인이 반영됐습니다.'
   when 'DEPARTED' then '전문가가 출발했습니다. 내 예약에서 진행 상황을 확인해 주세요.'
   when 'ARRIVED' then '전문가가 도착했습니다. 내 예약을 확인해 주세요.'
   when 'REMINDER' then '곧 예약 시간입니다. '||schedule||'. 참석이 어렵다면 내 예약에서 알려주세요.'
   when 'LATE' then '지각 안내가 등록됐습니다. 내 예약에서 확인해 주세요.'
   else '담당자가 정해졌습니다. 내 예약에서 다음 절차를 확인해 주세요.' end;
  begin
   insert into private.notifications(recipient_user_id,notification_type,title,body,consultation_id,insurance_office_id,deep_link,dedupe_key)
   values(uid,'BOOKING_'||event_name,heading,message,c.id,c.office_id,'/notifications.html?reservation='||c.id,
    'booking-v2:'||c.id||':'||event_name||':'||event_version)
   on conflict(recipient_user_id,dedupe_key) do nothing;
  exception when others then
   -- A failed recipient must not undo a saved reservation or the other recipient.
   -- No customer content or subscription secret is logged.
   raise log 'booking_notice_failed reservation=% event=% recipient=% sqlstate=%',c.id,event_name,uid,sqlstate;
  end;
 end loop;
end$$;
revoke all on function private.booking_notice(private.consultations,text,text,uuid,uuid) from public,anon,authenticated;

create or replace function private.reservation_notification() returns trigger language plpgsql security definer set search_path='' as $$
declare c private.consultations;event_name text;recipient uuid;previous_expert uuid;begin
 select * into c from private.consultations where id=new.id;
 if tg_op='INSERT' then event_name:='REQUESTED';
 else
  previous_expert:=old.planner_id;
  if c.state is distinct from old.state and c.state='cancelled' then event_name:='CANCELLED';
  elsif c.state is distinct from old.state and c.state='unmatched' then event_name:='REJECTED';
  elsif c.state is distinct from old.state and c.state='completed' then event_name:='COMPLETED';
  elsif c.state is distinct from old.state and c.state='awaiting_completion' then event_name:='COMPLETION_REQUESTED';
  elsif c.state in('scheduled','confirmed') and old.state not in('scheduled','confirmed') then event_name:='CONFIRMED';
  elsif c.journey_state is distinct from old.journey_state and c.journey_state in('departed','arrived') then event_name:=upper(c.journey_state);recipient:=c.customer_id;
  elsif c.preferred_at is distinct from old.preferred_at or c.method is distinct from old.method then event_name:='CHANGED';
  elsif c.planner_id is distinct from old.planner_id and c.planner_id is not null then event_name:='ASSIGNED';
  elsif c.planner_ok and not coalesce(old.planner_ok,false) then event_name:='ACCEPTED';
  else return new;end if;
 end if;
 perform private.booking_notice(c,event_name,c.revision::text,recipient,previous_expert);
 return new;
exception when others then
 raise log 'booking_event_notification_failed reservation=% sqlstate=%',new.id,sqlstate;
 return new;
end$$;

-- Production SELECT 2026-10-18 confirmed the trigger is already deferred.
-- Preserve it; the baseline guard rejects other trigger timing.
revoke all on function private.reservation_notification() from public,anon,authenticated;

create or replace function private.booking_push_current(n private.notifications) returns boolean language sql stable security definer set search_path='' as $$
 select n.notification_type<>'BOOKING_REMINDER' or exists(select 1 from private.consultations c
 where c.id=n.consultation_id and c.state in('confirmed','scheduled') and c.preferred_at>now()
 and c.preferred_at=substring(n.dedupe_key from ':REMINDER:reminder:(.*)$')::timestamptz)
$$;
revoke all on function private.booking_push_current(private.notifications) from public,anon,authenticated;

-- Optional adapter: do not install or activate the no-show subsystem.
do $optional$ begin
 if to_regclass('private.appointment_care') is null then return;end if;
 if to_regprocedure('private.appointment_notify_before_booking_v2(private.appointment_care,text,text,text,uuid)') is null then
  alter function private.appointment_notify(private.appointment_care,text,text,text,uuid) rename to appointment_notify_before_booking_v2;
 end if;
 execute $ddl$
 create or replace function private.appointment_notify(a private.appointment_care,event_key text,heading text,body_text text,recipient uuid default null)
 returns void language plpgsql security definer set search_path='' as $$
 declare c private.consultations;ev text;event_name text;begin
  if a.kind<>'consultation' then perform private.appointment_notify_before_booking_v2(a,event_key,heading,body_text,recipient);return;end if;
  select * into c from private.consultations where id=a.id;if c.id is null then return;end if;
  if event_key like 'reminder:%' then event_name:='REMINDER';
  elsif event_key ~ '^[0-9]+$' then
   select event into ev from private.appointment_events where id=event_key::bigint and kind=a.kind and appointment_id=a.id;
   event_name:=case ev when 'propose' then 'PROPOSED' when 'change_decline' then 'CHANGE_DECLINED' when 'late' then 'LATE' end;
  end if;
  if event_name is not null then perform private.booking_notice(c,event_name,event_key,recipient);
  elsif event_key not like 'source:%' then perform private.appointment_notify_before_booking_v2(a,event_key,heading,body_text,recipient);end if;
 end$$;
 $ddl$;
 execute 'revoke all on function private.appointment_notify(private.appointment_care,text,text,text,uuid) from public,anon,authenticated';
end $optional$;

create or replace function private.booking_flush_existing_reminders() returns void language plpgsql security definer set search_path='' as $$
begin
 if to_regprocedure('private.flush_appointment_reminders(uuid)') is not null then execute 'select private.flush_appointment_reminders(null::uuid)';end if;
exception when others then raise log 'booking_reminder_flush_failed sqlstate=%',sqlstate;
end$$;
revoke all on function private.booking_flush_existing_reminders() from public,anon,authenticated;

create or replace function private.booking_proposal_notice() returns trigger language plpgsql security definer set search_path='' as $$
declare c private.consultations;begin
 if new.event not in('propose','schedule_decline') then return new;end if;
 select * into c from private.consultations where id=new.consultation_id;
 perform private.booking_notice(c,case new.event when 'propose' then 'PROPOSED' else 'CHANGE_DECLINED' end,'event:'||new.id);
 return new;
exception when others then
 raise log 'booking_proposal_notification_failed event=% sqlstate=%',new.id,sqlstate;
 return new;
end$$;
drop trigger if exists booking_proposal_notice on private.consultation_events;
create trigger booking_proposal_notice after insert on private.consultation_events for each row execute function private.booking_proposal_notice();
revoke all on function private.booking_proposal_notice() from public,anon,authenticated;

-- Modify only known queue fragments, preserving subscription/auth/lease behavior.
do $$declare definition text;needle text;replacement text;begin
 definition:=pg_get_functiondef('public.reservation_web_push_service(uuid,text,jsonb)'::regprocedure);
 if position('BOOKING_COMPLETED' in definition)=0 then
  needle:='''OFFICE_BOOKING_CANCELLED'')';
  replacement:='''OFFICE_BOOKING_CANCELLED'',''BOOKING_REQUESTED'',''BOOKING_ACCEPTED'',''BOOKING_PROPOSED'',''BOOKING_CHANGED'',''BOOKING_CHANGE_DECLINED'',''BOOKING_CONFIRMED'',''BOOKING_REJECTED'',''BOOKING_CANCELLED'',''BOOKING_COMPLETION_REQUESTED'',''BOOKING_COMPLETED'',''BOOKING_DEPARTED'',''BOOKING_ARRIVED'',''BOOKING_REMINDER'',''BOOKING_LATE'',''BOOKING_ASSIGNED'')';
  if position(needle in definition)=0 or position('elsif operation=''claim'' then' in definition)=0 then raise exception 'push_definition_review_required';end if;
  definition:=replace(definition,needle,replacement);
  definition:=replace(definition,'elsif operation=''claim'' then','elsif operation=''claim'' then
  perform private.booking_flush_existing_reminders();
  update private.web_push_deliveries set state=''FAILED'',error_code=''RETRY_EXHAUSTED'',updated_at=now() where state=''RETRY'' and attempts>=3;
  update private.web_push_deliveries d set state=''CANCELLED'',error_code=''STALE_REMINDER'',updated_at=now() from private.notifications n where n.id=d.notification_id and d.state in(''PENDING'',''RETRY'') and not private.booking_push_current(n);');
  definition:=replace(definition,'and not exists(select 1 from private.account_lifecycle','and private.booking_push_current(n) and not exists(select 1 from private.account_lifecycle');
  execute definition;
 end if;
end$$;
-- List/read is not an event. Only the scheduled worker flushes existing reminders.
do $$declare definition text;begin
 if to_regprocedure('public.appointment_care(text,jsonb)') is null then return;end if;
 definition:=pg_get_functiondef('public.appointment_care(text,jsonb)'::regprocedure);
 definition:=replace(definition,'perform private.flush_appointment_reminders(actor);','null; -- reminders belong to worker');
 execute definition;
end$$;

-- Expert-to-customer visits use a separate existing request table. Never write
-- these IDs into notifications.consultation_id (a different reservation kind).
create or replace function private.urgent_notification() returns trigger language plpgsql security definer set search_path='' as $$
declare q private.urgent_requests;recipients uuid[];uid uuid;ev text;heading text;message text;begin
 if tg_table_name='urgent_offers' then
  select * into q from private.urgent_requests where id=new.request_id;
  recipients:=array[q.customer_id,new.planner_id];ev:='REQUESTED';
 else
  q:=new;
  if new.confirmed_at is distinct from old.confirmed_at and new.confirmed_at is not null then ev:='CONFIRMED';
  elsif new.state is not distinct from old.state then return new;
  else ev:=case new.state when 'ACCEPTED' then case when new.meeting_kind is null then 'CONFIRMED' else 'ACCEPTED' end when 'DEPARTED' then 'DEPARTED' when 'ARRIVED' then 'ARRIVED' when 'COMPLETED' then 'COMPLETED' when 'CANCELLED' then 'CANCELLED' when 'EXPIRED' then 'REJECTED' end;end if;
  recipients:=array[q.customer_id,q.planner_id];
  if q.planner_id is null then recipients:=recipients||coalesce((select array_agg(planner_id) from private.urgent_offers where request_id=q.id),array[]::uuid[]);end if;
 end if;
 if ev is null then return new;end if;
 for uid in select distinct x from unnest(recipients) x where x is not null loop
  if ev in('DEPARTED','ARRIVED') and uid<>q.customer_id then continue;end if;
  if not coalesce((select in_app_enabled from private.notification_preferences where user_id=uid),true) then continue;end if;
  heading:=case ev when 'REQUESTED' then case when uid=q.customer_id then '상담 요청 접수' else '새 예약 요청' end when 'ACCEPTED' then case when uid=q.customer_id then '전문가 요청 확인' else '수락 처리 완료' end when 'CONFIRMED' then '예약 확정' when 'DEPARTED' then '전문가 출발' when 'ARRIVED' then '전문가 도착' when 'COMPLETED' then '상담 완료' when 'CANCELLED' then '예약 취소' else '예약 요청 종료' end;
  message:=case ev when 'REQUESTED' then '방문상담 요청이 접수됐습니다. 아직 확정 전입니다. 희망 일정을 확인해 주세요.' when 'ACCEPTED' then case when uid=q.customer_id then '전문가가 요청을 확인했습니다. 방문 일정과 주소 제공 동의를 확인해 주세요.' else '수락했습니다. 고객의 방문 일정 확정을 기다려 주세요.' end when 'CONFIRMED' then coalesce(to_char(q.preferred_at at time zone 'Asia/Seoul','YYYY-MM-DD HH24:MI'),'일정 확인 필요')||' · 전문가 방문상담이 확정됐습니다. 내 예약에서 장소를 확인해 주세요.' when 'DEPARTED' then '전문가가 출발했습니다. 내 예약에서 확인해 주세요.' when 'ARRIVED' then '전문가가 도착했습니다. 내 예약에서 확인해 주세요.' when 'COMPLETED' then '상담 완료 처리가 반영됐습니다.' when 'CANCELLED' then '방문상담이 취소됐습니다. 내 예약에서 결과를 확인해 주세요.' else '요청이 종료됐습니다. 필요하면 다른 전문가나 일정을 직접 선택해 주세요.' end;
  begin
   insert into private.notifications(recipient_user_id,notification_type,title,body,deep_link,dedupe_key)
   values(uid,'BOOKING_'||ev,heading,message,'/urgent.html?request='||q.id,'visit-v2:'||q.id||':'||ev)
   on conflict(recipient_user_id,dedupe_key) do nothing;
  exception when others then raise log 'visit_notice_failed reservation=% event=% recipient=% sqlstate=%',q.id,ev,uid,sqlstate;end;
 end loop;return new;
exception when others then raise log 'visit_event_notification_failed sqlstate=%',sqlstate;return new;
end$$;
revoke all on function private.urgent_notification() from public,anon,authenticated;
-- The existing two triggers remain in place (offer INSERT and request UPDATE).

-- Preserve the existing consultation permission predicate, and use exactly the
-- existing visit workspace predicate for the separate visit route. No inbox call.
do $$declare d text;needle text;begin
 d:=pg_get_functiondef('public.notification_reservation(uuid)'::regprocedure);
 if position('notification_visit_route_v2' in d)=0 then
 needle:='if result is null then raise exception ''reservation_not_found'';end if;';
 if position(needle in d)=0 then raise exception 'reservation_route_definition_review_required';end if;
 d:=replace(d,needle,$route$
 -- notification_visit_route_v2
 if result is null then
 select jsonb_build_object('id',q.id,'state',q.state,'workspace','/urgent.html') into result
 from private.urgent_requests q where q.id=reservation_id and
 (q.customer_id=auth.uid() or (private.urgent_eligible(auth.uid()) and
 (q.planner_id=auth.uid() or (q.state='REQUESTED' and exists(select 1 from private.urgent_offers o where o.request_id=q.id and o.planner_id=auth.uid() and o.state='OFFERED')))));
 end if;

 if result is null and exists(select 1 from private.urgent_offers o where o.request_id=reservation_id and o.planner_id=auth.uid() and o.state='PASSED') then
  -- Only the caller's own action receipt, not the customer's reservation details.
  result:=jsonb_build_object('id',reservation_id,'workspace',null,'receipt_only',true,'state','DECLINED');
 end if;
 if result is null then raise exception 'reservation_not_found';end if;
 $route$);execute d;end if;
end$$;

-- Existing queue authorization still checks recipient, preference and binding.
-- Only a strict, locally generated visit link can provide a non-consultation ID.
create or replace function private.notification_booking_id(n private.notifications) returns uuid language plpgsql stable security definer set search_path='' as $$
declare rid uuid;begin
 if n.consultation_id is not null then return n.consultation_id;end if;
 if n.dedupe_key like 'visit-v2:%' and n.notification_type like 'BOOKING_%' and n.deep_link ~ '^/urgent[.]html[?]request=[0-9a-fA-F-]{36}$' then
  begin rid:=substring(n.deep_link from 'request=(.*)$')::uuid;exception when invalid_text_representation then return null;end;
  if exists(select 1 from private.urgent_requests where id=rid) then return rid;end if;
 end if;return null;
end$$;
revoke all on function private.notification_booking_id(private.notifications) from public,anon,authenticated;
do $$declare d text;begin
 d:=pg_get_functiondef('public.reservation_web_push_service(uuid,text,jsonb)'::regprocedure);
 if position('private.notification_booking_id(n)' in d)=0 then
  if position('''reservationId'',n.consultation_id' in d)=0 then raise exception 'push_route_definition_review_required';end if;
  execute replace(d,'''reservationId'',n.consultation_id','''reservationId'',private.notification_booking_id(n)');
 end if;
end$$;

-- Read-only workspace/settings/catalog must never expire bookings or emit notices.
-- Keep expiry rules intact; explicit commands and existing DB cron run them.
-- SELECT confirmed bohumso-urgent-retention is active every minute; no new job.
do $$declare r record;d text;begin
 for r in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname in('urgent_command','urgent_command_before_professions','urgent_command_before_release') loop
  d:=pg_get_functiondef(r.oid);
  if position('read_only_expiry_v2' in d)=0 and position('perform private.expire_urgent();' in d)>0 then
   d:=replace(d,'perform private.expire_urgent();',$patch$-- read_only_expiry_v2
   if operation not in ('workspace','settings','catalog') then perform private.expire_urgent();end if;$patch$);
   execute d;
  end if;
 end loop;
end$$;
commit;
