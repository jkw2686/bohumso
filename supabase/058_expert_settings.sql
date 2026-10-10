-- Development candidate only. Preserve approval, existing appointments and office operations.
begin;
select pg_advisory_xact_lock(580058);
alter table private.planner_directory add column if not exists self_map_visible boolean not null default true;
alter table private.planner_directory add column if not exists settings_revision bigint not null default 0;
create table if not exists private.expert_settings_backup(name text primary key,definition text not null);
alter table private.expert_settings_backup enable row level security;
revoke all on private.expert_settings_backup from public,anon,authenticated,service_role;
insert into private.expert_settings_backup select name,pg_get_functiondef(to_regprocedure(name)) from unnest(array['public.urgent_command(text,jsonb)','public.consultation_command(text,jsonb)','public.planner_catalog(text,text)','private.visit_available(uuid)','public.visit_catalog(jsonb)','public.reservation_slots(text,uuid,date,text)','public.early_expert_review(text,jsonb)']) name on conflict do nothing;
do $$begin
 if to_regprocedure('public.urgent_command_before_settings(text,jsonb)') is null then alter function public.urgent_command(text,jsonb) rename to urgent_command_before_settings;end if;
 if to_regprocedure('public.consultation_command_before_settings(text,jsonb)') is null then alter function public.consultation_command(text,jsonb) rename to consultation_command_before_settings;end if;
 if to_regprocedure('public.planner_catalog_before_settings(text,text)') is null then alter function public.planner_catalog(text,text) rename to planner_catalog_before_settings;end if;
 if to_regprocedure('private.visit_available_before_settings(uuid)') is null then alter function private.visit_available(uuid) rename to visit_available_before_settings;end if;
 if to_regprocedure('public.visit_catalog_before_settings(jsonb)') is null then alter function public.visit_catalog(jsonb) rename to visit_catalog_before_settings;end if;
 if to_regprocedure('public.reservation_slots_before_settings(text,uuid,date,text)') is null then alter function public.reservation_slots(text,uuid,date,text) rename to reservation_slots_before_settings;end if;
 if to_regprocedure('public.early_expert_review_before_settings(text,jsonb)') is null then alter function public.early_expert_review(text,jsonb) rename to early_expert_review_before_settings;end if;
end$$;
revoke all on function public.urgent_command_before_settings(text,jsonb),public.consultation_command_before_settings(text,jsonb),public.planner_catalog_before_settings(text,text),private.visit_available_before_settings(uuid),public.visit_catalog_before_settings(jsonb),public.reservation_slots_before_settings(text,uuid,date,text),public.early_expert_review_before_settings(text,jsonb) from public,anon,authenticated,service_role;

-- 1-a) 숨김 검사를 visit_available에서 걷어낸다. 이 함수는 046 정의를 그대로 유지해야
-- 하는데, 046 accept 게이트(046:126)가 이 함수를 쓰기 때문에 숨김을 넣으면 숨긴 전문가가
-- '이미 받은' 방문 요청을 수락할 수 없게 된다. 숨김은 신규 탐색·요청 경로에만 둔다.
create or replace function private.visit_available(subject uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.visit_available_before_settings(subject)
$$;
-- 수락 허용 조건: urgent_eligible과 OFFERED 보유, 요청 만료는 024 accept가 이미 본다.
-- 여기서는 '다른 진행 중 방문과 겹치지 않음'만 확인한다. 지도 ON·지금 방문 ON은 요구하지 않는다.
create or replace function private.visit_accept_allowed(subject uuid) returns boolean language sql stable security definer set search_path='' as $$
 select not exists(select 1 from private.urgent_requests r where r.planner_id=subject and r.state in ('ACCEPTED','PREPARING','DEPARTED','EN_ROUTE','ARRIVED') and r.ends_at>now())
$$;
create or replace function public.visit_catalog(payload jsonb default '{}') returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(v),'[]'::jsonb) from jsonb_array_elements(public.visit_catalog_before_settings(payload)) v
  where exists(select 1 from private.planner_directory d where d.user_id=(v->>'id')::uuid and d.self_map_visible)
$$;
create or replace function private.expert_settings_state(subject uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('revision',d.settings_revision,'mapEnabled',d.self_map_visible,'mapVisible',d.self_map_visible and private.planner_eligible(subject),'eligible',private.planner_eligible(subject),'scheduledAvailable',d.available,'phone',d.phone,
 'visitEnabled',coalesce(i.enabled and i.expires_at>now(),false),'visitAvailable',private.visit_available(subject),'expiresAt',i.expires_at,'locationUpdatedAt',i.updated_at,
 -- 화면이 '진행 중 방문 때문에 새 요청을 받지 않는 상태'를 위치 만료와 구분해 안내할 수 있게 한다.
 'visitInProgress',not private.visit_accept_allowed(subject),
 'locationState',case when i.updated_at is null or i.latitude is null then 'missing' when i.updated_at<=now()-make_interval(mins=>(private.visit_config()->>'expireMinutes')::int) then 'expired' else 'fresh' end,
 'visitConfig',private.visit_config(),'areas',(select to_jsonb(a)-'user_id' from private.expert_service_areas a where a.user_id=subject)) from private.planner_directory d left join private.instant_availability i using(user_id) where d.user_id=subject
$$;
revoke all on function private.expert_settings_state(uuid),private.visit_available(uuid) from public,anon,authenticated,service_role;

-- Legacy visit controls share the same row lock and cannot activate a hidden profile.
create or replace function public.urgent_command(operation text,payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();d private.planner_directory;r private.urgent_requests;result jsonb;
begin
 if operation in ('start','stop','refresh_location','save_areas') then
  if not private.is_active_member() then raise exception 'membership_required';end if;
  select * into d from private.planner_directory where user_id=actor for update;
  if operation in ('start','refresh_location') and (d.user_id is null or not d.self_map_visible) then raise exception 'map_hidden';end if;
 end if;
 -- 1-a) 이미 받은 방문 요청 수락.
 -- 두 하위 계층이 모두 '지금 방문 ON'을 요구하기 때문에 위임으로는 해결되지 않는다.
 --   046:126  if not private.visit_available(actor) ...  → 방문 ON + 위치 신선도
 --   024:112  perform 1 from instant_availability where enabled and expires_at>now()
 --            if not found ... raise 'expert_busy'       → 방문 ON
 -- 숨김 전환 전에 받은 요청은 그대로 수락할 수 있어야 하므로, 수락만 이 계층에서 처리한다.
 -- 적용하는 조건은 지시서 그대로다: OFFERED 보유 + urgent_eligible(승인 유지·정지 아님)
 -- + 다른 진행 중 방문과 겹치지 않음 + 요청 자체 만료. 지도 ON·지금 방문 ON은 묻지 않는다.
 -- 상태 전이 결과는 024:114-116,130 과 동일하다(024:128 은 ACCEPTED 에서 변화가 없어 생략).
 if operation='accept' then
  if not private.is_active_member() then raise exception 'membership_required';end if;
  perform pg_advisory_xact_lock(hashtextextended('planner:'||actor::text,33));
  select * into r from private.urgent_requests where id=(payload->>'id')::uuid for update;
  if r.id is null then raise exception 'request_forbidden';end if;
  if r.state<>'REQUESTED' or r.expires_at<=now() or not private.urgent_eligible(actor)
   or not exists(select 1 from private.urgent_offers where request_id=r.id and planner_id=actor and state='OFFERED') then raise exception 'offer_unavailable';end if;
  if not private.visit_accept_allowed(actor) then raise exception 'expert_busy';end if;
  if r.meeting_kind is not null then
   if r.preferred_at<=now() then raise exception 'invalid_visit_time';end if;
   if exists(select 1 from private.consultations c where c.planner_id=actor and c.state in ('requested','coordinating','confirmed','scheduled','awaiting_completion') and c.preferred_at<r.preferred_at+interval '60 minutes' and c.preferred_at+c.duration_minutes*interval '1 minute'>r.preferred_at) or exists(select 1 from private.followup_meetings f where f.planner_id=actor and f.state='confirmed' and f.preferred_at<r.preferred_at+interval '60 minutes' and f.preferred_at+interval '30 minutes'>r.preferred_at) then raise exception 'slot_unavailable';end if;
  end if;
  update private.urgent_requests set planner_id=actor,state='ACCEPTED',accepted_at=now() where id=r.id;
  update private.urgent_offers set state=case when planner_id=actor then 'ACCEPTED' else 'CLOSED' end where request_id=r.id;
  update private.instant_availability set enabled=false,latitude=null,longitude=null,accuracy=null where user_id=actor;
  insert into private.urgent_events(request_id,actor,event) values(r.id,actor,'ACCEPTED');
  update private.planner_directory set settings_revision=settings_revision+1 where user_id=actor;
  return jsonb_build_object('saved',true);
 end if;
 result:=public.urgent_command_before_settings(operation,payload);
 if operation in ('start','stop','refresh_location','save_areas') then
  update private.planner_directory set settings_revision=settings_revision+1 where user_id=actor;
  if operation='save_areas' then
   update private.expert_profiles e set primary_area=a.primary_area,secondary_areas=a.secondary_areas,updated_at=now() from private.expert_service_areas a where a.user_id=actor and e.user_id=actor;
   update public.partner_applications p set region=a.primary_area from private.expert_service_areas a where a.user_id=actor and p.user_id=actor;
  end if;
 end if;
 return result;
end$$;

create or replace function public.expert_settings(operation text default 'get',payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();d private.planner_directory;enabled boolean;result jsonb;
begin
 if not private.is_active_member() then raise exception 'membership_required';end if;
 if payload ? 'user_id' or payload ? 'subject' or payload ? 'planner_id' then raise exception 'request_forbidden';end if;
 if not exists(select 1 from public.partner_applications where user_id=actor and profession='planner') then raise exception 'planner_required';end if;
 select * into d from private.planner_directory where user_id=actor for update;
 if d.user_id is null then raise exception 'profile_required';end if;
 if operation='get' then return private.expert_settings_state(actor);end if;
 if operation not in ('map','visit','refresh','area','contact') then raise exception 'invalid_operation';end if;
 if d.settings_revision is distinct from (payload->>'revision')::bigint then raise exception 'stale_settings';end if;
 if operation in ('map','visit') then
  if jsonb_typeof(payload->'enabled') is distinct from 'boolean' then raise exception 'invalid_settings';end if;
  enabled:=(payload->>'enabled')::boolean;
 end if;
 if operation='map' then
  if enabled and not private.planner_eligible(actor) then raise exception 'expert_verification_required';end if;
  if not enabled and payload->>'confirmed' is distinct from 'true' then raise exception 'confirmation_required';end if;
  update private.planner_directory set self_map_visible=enabled,settings_revision=settings_revision+1 where user_id=actor;
  if not enabled then update private.instant_availability set enabled=false,latitude=null,longitude=null,accuracy=null,updated_at=now() where user_id=actor;end if;
 elsif operation='visit' then
  result:=public.urgent_command(case when enabled then 'start' else 'stop' end,payload);
 elsif operation='refresh' then result:=public.urgent_command('refresh_location',payload);
 elsif operation='area' then result:=public.urgent_command('save_areas',payload);
 elsif operation='contact' then
  if length(coalesce(payload->>'phone',''))>30 then raise exception 'invalid_contact';end if;
  update private.planner_directory set phone=regexp_replace(coalesce(payload->>'phone',''),'[- ]','','g'),settings_revision=settings_revision+1 where user_id=actor;
 end if;
 return private.expert_settings_state(actor)||jsonb_build_object('saved',true);
end$$;

-- Hiding a profile prevents new direct requests, while existing requests remain usable.
create or replace function public.consultation_command(operation text,payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare target uuid;
begin
 if operation='request' and nullif(payload->>'office_id','') is null then
  target:=nullif(payload->>'planner_id','')::uuid;
  perform 1 from private.planner_directory where user_id=target for update;
  if exists(select 1 from private.planner_directory where user_id=target and not self_map_visible)
   and not exists(select 1 from private.consultations where customer_id=auth.uid() and planner_id=target and request_key=(payload->>'request_key')::uuid) then raise exception 'expert_not_visible';end if;
 end if;
 -- 1-b) 관리자 보험소 배정은 숨긴 전문가를 새로 배정하지 않는다. 이미 배정된 담당자의
 -- 확정·진행 경로(confirm/office_confirm/journey/complete)는 건드리지 않는다.
 if operation='office_assign' then
  target:=nullif(payload->>'planner_id','')::uuid;
  if exists(select 1 from private.planner_directory where user_id=target and not self_map_visible) then raise exception 'expert_not_visible';end if;
 end if;
 return public.consultation_command_before_settings(operation,payload);
end$$;
-- 1-c) 빈 시간 조회는 신규 예약 화면(public/office-slot.js, window.bohumsoSlots)만 사용한다.
-- 기존 예약의 일정 변경은 consultation_command('propose')로 처리하며 이 함수를 쓰지 않는다
-- (src/workflow.js 확인). 따라서 숨긴 전문가 지정 조회는 빈 목록으로 돌려도 기존 경로에 영향이 없다.
create or replace function public.reservation_slots(office_id text default null,planner_id uuid default null,day date default current_date,consultation_method text default 'scheduled') returns jsonb language sql stable security definer set search_path='' as $$
 select case when planner_id is not null and exists(select 1 from private.planner_directory d where d.user_id=planner_id and not d.self_map_visible)
  then '[]'::jsonb else public.reservation_slots_before_settings(office_id,planner_id,day,consultation_method) end
$$;
-- 1-d) 관리자 활동정지·반려 시 지금 방문을 즉시 끈다. 재승인은 방문을 자동 복원하지 않는다
-- (instant_availability를 다시 켜지 않으므로 전문가가 직접 시작해야 한다).
-- 심사 함수 본문은 덮어쓰지 않고 호출 뒤 상태를 맞추는 wrapper 방식이다.
create or replace function public.early_expert_review(operation text,payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare subject uuid; result jsonb;
begin
 result:=public.early_expert_review_before_settings(operation,payload);
 subject:=nullif(payload->>'user_id','')::uuid;
 if subject is not null and exists(select 1 from private.expert_profiles p where p.user_id=subject and (p.status in ('SUSPENDED','REJECTED') or not p.map_visible)) then
  update private.instant_availability set enabled=false,latitude=null,longitude=null,accuracy=null,updated_at=now() where user_id=subject and (enabled or latitude is not null);
 end if;
 return result;
end$$;
create or replace function public.planner_catalog(area text default '',wanted text default '') returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('planners',coalesce(jsonb_agg(p||jsonb_build_object(
   'region',coalesce(a.primary_area,p->>'region'),
   -- 4-a) '지금 가능' 배지가 언제 내려가야 하는지 서버가 알려준다.
   -- 방문 자동종료 시각과 위치 유효시간(갱신 + expireMinutes) 중 먼저 오는 쪽이다.
   -- 좌표(latitude/longitude)는 그대로 비공개이며 여기서 내려주지 않는다.
   'availability_until',case when p->>'availability_status'='now'
     then least(i.expires_at,i.updated_at+make_interval(mins=>(private.visit_config()->>'expireMinutes')::int)) end
  ) order by ord),'[]'))
 from jsonb_array_elements(public.planner_catalog_before_settings('',wanted)->'planners') with ordinality entry(p,ord)
 join private.planner_directory d on d.user_id=(p->>'id')::uuid left join private.expert_service_areas a on a.user_id=d.user_id
 left join private.instant_availability i on i.user_id=d.user_id
 where d.self_map_visible and (coalesce(area,'')='' or coalesce(a.primary_area,p->>'region') like area||'%' or exists(select 1 from unnest(a.secondary_areas) x where x like area||'%'))
$$;
revoke all on function private.visit_accept_allowed(uuid) from public,anon,authenticated,service_role;
revoke all on function public.expert_settings(text,jsonb),public.urgent_command(text,jsonb),public.consultation_command(text,jsonb),public.planner_catalog(text,text),public.visit_catalog(jsonb),public.reservation_slots(text,uuid,date,text),public.early_expert_review(text,jsonb) from public,anon,authenticated;
grant execute on function public.expert_settings(text,jsonb),public.urgent_command(text,jsonb),public.consultation_command(text,jsonb),public.visit_catalog(jsonb),public.early_expert_review(text,jsonb) to authenticated;
grant execute on function public.planner_catalog(text,text),public.reservation_slots(text,uuid,date,text) to anon,authenticated;
commit;
