-- Contact first. Existing confirmed reservations retain their original flow.
begin;
select pg_advisory_xact_lock(49009);
create table if not exists private.contact_flow_backup(name text primary key,snapshot jsonb not null,created_at timestamptz not null default now());
alter table private.contact_flow_backup enable row level security;
revoke all on private.contact_flow_backup from public,anon,authenticated;
insert into private.contact_flow_backup(name,snapshot)
select '049-v1',jsonb_build_object('functions',(select jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,'definition',pg_get_functiondef(p.oid))) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('private','public') and p.prokind='f'),'columns',(select jsonb_agg(to_jsonb(c)) from information_schema.columns c where table_schema in ('private','public')),'policies',(select jsonb_agg(to_jsonb(p)) from pg_policies p where schemaname in ('private','public','storage')),'member',(select to_jsonb(m) from public.member_profiles m order by user_id limit 1)) on conflict do nothing;
alter table private.office_locations add column if not exists booking_enabled boolean not null default true;
alter table private.consultations add column if not exists contact_flow integer not null default 0;
alter table private.consultations alter column contact_flow set default 2;
alter table private.urgent_requests add column if not exists contact_flow integer not null default 0;
alter table private.urgent_requests alter column contact_flow set default 2;
create table if not exists private.contact_permissions(
 id bigint generated always as identity primary key,kind text not null check(kind in ('booking','visit')),request_id uuid not null,
 subject uuid not null references auth.users(id),recipient uuid not null references auth.users(id),phone_digest text not null,
 version text not null default 'contact-2026-10-09-v1',created_at timestamptz not null default now(),
 unique(kind,request_id,subject,recipient,phone_digest),check(subject<>recipient));
create table if not exists private.contact_acknowledgements(
 kind text not null check(kind in ('booking','visit')),request_id uuid not null,subject uuid not null references auth.users(id),
 recipient uuid not null references auth.users(id),schedule text not null,created_at timestamptz not null default now(),
 primary key(kind,request_id,subject,recipient,schedule));
alter table private.contact_permissions enable row level security;
alter table private.contact_acknowledgements enable row level security;
revoke all on private.contact_permissions,private.contact_acknowledgements from public,anon,authenticated;
do $$begin
 if not exists(select 1 from pg_trigger where tgname='contact_permission_immutable') then create trigger contact_permission_immutable before update or delete on private.contact_permissions for each row execute function private.immutable_consent();end if;
 if not exists(select 1 from pg_trigger where tgname='contact_ack_immutable') then create trigger contact_ack_immutable before update or delete on private.contact_acknowledgements for each row execute function private.immutable_consent();end if;
end$$;
-- Keep the live OTP provider bridge; no client-provided phone is trusted.
create or replace function private.flow_phone(subject uuid) returns text language plpgsql stable security definer set search_path='' as $$
declare number text;
begin
 if to_regprocedure('private.verified_contact(uuid)') is not null then execute 'select private.verified_contact($1)' into number using subject;
 else select phone into number from auth.users where id=subject and phone_confirmed_at is not null;end if;
 if exists(select 1 from private.account_lifecycle where user_id=subject and status<>'ACTIVE') then return null;end if;
 number:=regexp_replace(number,'[- ]','','g');
 number:=case when number like '+82%' then '0'||substr(number,4) when number like '82%' then '0'||substr(number,3) else number end;
 return case when number~'^01[0-9]{8,9}$' then number end;
end$$;
create or replace function private.flow_contact(kind text,rid uuid,customer uuid,expert uuid,schedule text,active boolean) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare other uuid;mine boolean;theirs boolean;my_ack boolean;their_ack boolean;number text;
begin
 if auth.uid() is null or expert is null or auth.uid() not in (customer,expert) then return null;end if;
 other:=case when auth.uid()=customer then expert else customer end;
 select exists(select 1 from private.contact_permissions p where p.kind=flow_contact.kind and request_id=rid and subject=auth.uid() and recipient=other and phone_digest=md5(private.flow_phone(auth.uid()))) into mine;
 select exists(select 1 from private.contact_permissions p where p.kind=flow_contact.kind and request_id=rid and subject=other and recipient=auth.uid() and phone_digest=md5(private.flow_phone(other))) into theirs;
 select exists(select 1 from private.contact_acknowledgements a where a.kind=flow_contact.kind and request_id=rid and subject=auth.uid() and recipient=other and a.schedule=flow_contact.schedule) into my_ack;
 select exists(select 1 from private.contact_acknowledgements a where a.kind=flow_contact.kind and request_id=rid and subject=other and recipient=auth.uid() and a.schedule=flow_contact.schedule) into their_ack;
 if active and mine and theirs and private.planner_eligible(expert) then number:=private.flow_phone(other);end if;
 return jsonb_build_object('myConsent',mine,'otherConsent',theirs,'myContacted',my_ack,'otherContacted',their_ack,'phone',number,'ready',active and mine and theirs and my_ack and their_ack,'active',active);
end$$;
create or replace function private.flow_notify(kind text,rid uuid,event_key text,heading text,customer uuid,expert uuid) returns void language plpgsql security definer set search_path='' as $$
declare receiver uuid;
begin
 foreach receiver in array array[customer,expert] loop
 if receiver is null then continue;end if;
 insert into private.notifications(recipient_user_id,notification_type,title,body,deep_link,dedupe_key)
 values(receiver,'RESERVATION_CHANGED',heading,'예약 화면에서 다음 단계를 확인해 주세요.',case when receiver=customer then '/requests.html' else '/partner-work.html' end||'?request='||rid::text,'flow:'||kind||':'||rid::text||':'||event_key) on conflict do nothing;
 end loop;
end$$;
create or replace function private.flow_action(kind text,rid uuid,customer uuid,expert uuid,schedule text,operation text,payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare other uuid;number text;state jsonb;inserted bigint;
begin
 if expert is null or auth.uid() is null or auth.uid() not in (customer,expert) or not private.planner_eligible(expert) then raise exception 'request_forbidden';end if;
 other:=case when auth.uid()=customer then expert else customer end;
 if operation='share_contact' then
 if payload->>'consent' is distinct from 'true' then raise exception 'contact_consent_required';end if;
 number:=private.flow_phone(auth.uid());if number is null then raise exception 'phone_verification_required';end if;
 insert into private.contact_permissions(kind,request_id,subject,recipient,phone_digest) values(kind,rid,auth.uid(),other,md5(number)) on conflict do nothing returning id into inserted;
 if inserted is not null then
 insert into private.consent_records(user_id,type,version,accepted,accepted_at,source) values(auth.uid(),'THIRD_PARTY_PROVISION','contact-2026-10-09-v1',true,now(),kind||':'||rid::text||':recipient:'||other::text);
 perform private.flow_notify(kind,rid,'consent:'||inserted::text,'연락처 공개 동의가 저장됐어요.',customer,expert);
 end if;
 elsif operation='contacted' then
 state:=private.flow_contact(kind,rid,customer,expert,schedule,true);
 if state->>'phone' is null then raise exception 'both_contact_consents_required';end if;
 if payload->>'confirmed' is distinct from 'true' then raise exception 'contact_confirmation_required';end if;
 insert into private.contact_acknowledgements(kind,request_id,subject,recipient,schedule) values(kind,rid,auth.uid(),other,schedule) on conflict do nothing;
 perform private.flow_notify(kind,rid,'contacted:'||auth.uid()::text||':'||schedule,'전화·연락 완료를 확인했어요.',customer,expert);
 else raise exception 'invalid_operation';end if;
 return jsonb_build_object('saved',true);
end$$;
-- Preserve the production wrappers, including OTP and verification fixes.
do $$begin
 if to_regprocedure('public.consultation_command_before_contact(text,jsonb)') is null then alter function public.consultation_command(text,jsonb) rename to consultation_command_before_contact;end if;
 if to_regprocedure('public.consultation_workspace_before_contact(text)') is null then alter function public.consultation_workspace(text) rename to consultation_workspace_before_contact;end if;
 if to_regprocedure('public.urgent_command_before_contact(text,jsonb)') is null then alter function public.urgent_command(text,jsonb) rename to urgent_command_before_contact;end if;
 if to_regprocedure('public.office_catalog_before_contact()') is null then alter function public.office_catalog() rename to office_catalog_before_contact;end if;
 if to_regprocedure('public.planner_catalog_before_contact(text,text)') is null then alter function public.planner_catalog(text,text) rename to planner_catalog_before_contact;end if;
 if to_regprocedure('public.reservation_slots_before_contact(text,uuid,date,text)') is null then alter function public.reservation_slots(text,uuid,date,text) rename to reservation_slots_before_contact;end if;
 if to_regprocedure('private.visit_available_before_contact(uuid)') is null then alter function private.visit_available(uuid) rename to visit_available_before_contact;end if;
end$$;
revoke all on function public.consultation_command_before_contact(text,jsonb),public.consultation_workspace_before_contact(text),public.urgent_command_before_contact(text,jsonb),public.office_catalog_before_contact(),public.reservation_slots_before_contact(text,uuid,date,text),private.visit_available_before_contact(uuid) from public,anon,authenticated;
revoke all on function public.planner_catalog_before_contact(text,text) from public,anon,authenticated;
create or replace function public.planner_catalog(area text default '',wanted text default '') returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('planners',coalesce(jsonb_agg(p||jsonb_build_object('available',d.available,'availability_status',case when not d.available then 'unavailable' else p->>'availability_status' end)),'[]')) from jsonb_array_elements(public.planner_catalog_before_contact(area,wanted)->'planners') p join private.planner_directory d on d.user_id=(p->>'id')::uuid
$$;
revoke all on function public.planner_catalog(text,text) from public,anon,authenticated;
grant execute on function public.planner_catalog(text,text) to anon,authenticated;
create or replace function private.visit_available(subject uuid) returns boolean language sql stable security definer set search_path='' as $$select private.visit_available_before_contact(subject) and exists(select 1 from private.planner_directory where user_id=subject and available)$$;
create or replace function public.consultation_availability(operation text default 'list',payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare enabled boolean;oid text;
begin
 if not private.is_active_member() then raise exception 'membership_required';end if;
 if operation in ('expert','office') then
 if payload->>'enabled' not in ('true','false') or payload->>'enabled' is null then raise exception 'invalid_operation';end if;enabled:=(payload->>'enabled')::boolean;
 if operation='expert' then
 if not private.planner_eligible(auth.uid()) then raise exception 'expert_verification_required';end if;
 perform 1 from private.planner_directory where user_id=auth.uid() for update;
 update private.planner_directory set available=enabled where user_id=auth.uid();
 if not enabled then update private.instant_availability set enabled=false,latitude=null,longitude=null,accuracy=null where user_id=auth.uid();end if;
 else
 oid:=payload->>'office_id';if not private.is_admin() then raise exception 'admin_required';end if;
 perform pg_advisory_xact_lock(hashtextextended('office:'||oid,33));
 if enabled and not exists(select 1 from private.office_locations where id=oid and status='active' and nullif(address,'') is not null and latitude is not null and longitude is not null) then raise exception 'office_not_active';end if;
 update private.office_locations set booking_enabled=enabled where id=oid;if not found then raise exception 'office_not_active';end if;
 end if;
 elsif operation<>'list' then raise exception 'invalid_operation';end if;
 return jsonb_build_object('expertEligible',private.planner_eligible(auth.uid()),'expertEnabled',coalesce((select available from private.planner_directory where user_id=auth.uid()),false),'offices',case when private.is_admin() then (select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'region',region,'enabled',booking_enabled and status='active','ready',status='active' and nullif(address,'') is not null and latitude is not null and longitude is not null) order by name),'[]') from private.office_locations where status<>'closed') else '[]'::jsonb end);
end$$;
create or replace function public.office_catalog() returns jsonb language sql stable security definer set search_path='' as $$select coalesce(jsonb_agg(x||jsonb_build_object('bookingEnabled',o.booking_enabled and o.status='active')),'[]') from jsonb_array_elements(public.office_catalog_before_contact()) x join private.office_locations o on o.id=x->>'id'$$;
create or replace function public.reservation_slots(office_id text default null,planner_id uuid default null,day date default current_date,consultation_method text default 'scheduled') returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if office_id is not null and not exists(select 1 from private.office_locations where id=office_id and booking_enabled) then return '[]';end if;
 if planner_id is not null and not exists(select 1 from private.planner_directory where user_id=planner_id and available) then return '[]';end if;
 return public.reservation_slots_before_contact(office_id,planner_id,day,consultation_method);
end$$;
create or replace function public.consultation_command(operation text,payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare c private.consultations;info jsonb;result jsonb;oid text;target uuid;name text;
begin
 if not private.is_active_member() then raise exception 'membership_required';end if;
 if operation='request' then
 -- Replays must still work after reception is switched off.
 if exists(select 1 from private.consultations where customer_id=auth.uid() and request_key=nullif(payload->>'request_key','')::uuid) then return public.consultation_command_before_contact(operation,payload);end if;
 oid:=nullif(payload->>'office_id','');target:=nullif(payload->>'planner_id','')::uuid;
 if oid is not null then perform pg_advisory_xact_lock(hashtextextended('office:'||oid,33));if not exists(select 1 from private.office_locations where id=oid and booking_enabled) then raise exception 'reception_paused';end if;end if;
 if target is not null then perform 1 from private.planner_directory where user_id=target for update;if not exists(select 1 from private.planner_directory where user_id=target and available) then raise exception 'reception_paused';end if;end if;
 else
 select * into c from private.consultations where id=nullif(payload->>'id','')::uuid for update;
 if operation='accept' and c.contact_flow=2 then
 if c.planner_id is distinct from auth.uid() or not private.planner_eligible(auth.uid()) or c.state not in ('requested','coordinating') then raise exception 'request_forbidden';end if;
 if c.revision is distinct from (payload->>'revision')::integer then raise exception 'stale_request';end if;
 perform private.check_reservation_slot(c.planner_id,c.office_id,c.preferred_at,c.id,c.method);
 update private.consultations set planner_ok=true,customer_ok=false,state='coordinating',revision=revision+1,updated_at=now() where id=c.id;
 insert into private.consultation_events(consultation_id,actor,event) values(c.id,auth.uid(),'accept');
 return jsonb_build_object('saved',true,'id',c.id);
 end if;
 if operation in ('share_contact','contacted','confirm','office_confirm') and c.contact_flow=2 then
 if c.customer_id is distinct from auth.uid() and c.planner_id is distinct from auth.uid() then raise exception 'request_forbidden';end if;
 if c.revision is distinct from (payload->>'revision')::integer then raise exception 'stale_request';end if;
 if c.state<>'coordinating' or not c.planner_ok then raise exception 'invalid_transition';end if;
 if operation in ('share_contact','contacted') then return private.flow_action('booking',c.id,c.customer_id,c.planner_id,c.preferred_at::text||':'||c.revision::text,operation,payload);end if;
 info:=private.flow_contact('booking',c.id,c.customer_id,c.planner_id,c.preferred_at::text||':'||c.revision::text,true);
 if info->>'ready' is distinct from 'true' then raise exception 'contact_first_required';end if;
 if c.customer_id<>auth.uid() or payload->>'confirmed' is distinct from 'true' then raise exception 'contact_confirmation_required';end if;
 name:=trim(payload->>'name');if coalesce(length(name),0) not between 2 and 60 then raise exception 'customer_name_required';end if;
 payload:=payload||jsonb_build_object('name',name,'share_consent',true);
 end if;
 end if;
 result:=public.consultation_command_before_contact(operation,payload);
 return result;
end$$;
create or replace function public.consultation_workspace(workspace text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;rows jsonb:='[]';item jsonb;c private.consultations;info jsonb;
begin
 result:=public.consultation_workspace_before_contact(workspace);
 for item in select * from jsonb_array_elements(result->'bookings') loop
 select * into c from private.consultations where id=(item->>'id')::uuid;
 if c.contact_flow=2 then
 info:=private.flow_contact('booking',c.id,c.customer_id,c.planner_id,c.preferred_at::text||':'||c.revision::text,c.state in ('coordinating','scheduled','confirmed','awaiting_completion') and c.planner_ok);
 -- New contacts are visible only to the consenting pair, never through admin listings.
 item:=(item-'contact'-'planner_phone')||jsonb_build_object('contactFlow',2,'exchange',info);
 end if;rows:=rows||jsonb_build_array(item);
 end loop;return result||jsonb_build_object('bookings',rows);
end$$;
create or replace function public.urgent_command(operation text,payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare r private.urgent_requests;result jsonb;rows jsonb:='[]';item jsonb;info jsonb;number text;
begin
 if not private.is_active_member() then raise exception 'membership_required';end if;
 if operation='start' and not exists(select 1 from private.planner_directory where user_id=auth.uid() and available) then raise exception 'reception_paused';end if;
 if operation='accept' then
 perform private.expire_urgent();select * into r from private.urgent_requests where id=(payload->>'id')::uuid for update;
 if r.contact_flow=2 then
 if r.state<>'REQUESTED' or r.expires_at<=now() or r.preferred_at<=now() or not private.urgent_eligible(auth.uid()) or not exists(select 1 from private.urgent_offers where request_id=r.id and planner_id=auth.uid() and state='OFFERED') then raise exception 'offer_unavailable';end if;
 perform pg_advisory_xact_lock(hashtextextended('planner:'||auth.uid()::text,33));
 if exists(select 1 from private.urgent_requests where planner_id=auth.uid() and state in ('ACCEPTED','PREPARING','DEPARTED','EN_ROUTE','ARRIVED')) then raise exception 'expert_busy';end if;
 if exists(select 1 from private.consultations where planner_id=auth.uid() and state in ('requested','coordinating','confirmed','scheduled','awaiting_completion') and preferred_at<r.preferred_at+interval '60 minutes' and preferred_at+duration_minutes*interval '1 minute'>r.preferred_at) or exists(select 1 from private.followup_meetings where planner_id=auth.uid() and state='confirmed' and preferred_at<r.preferred_at+interval '60 minutes' and preferred_at+interval '30 minutes'>r.preferred_at) then raise exception 'slot_unavailable';end if;
 update private.urgent_requests set planner_id=auth.uid(),state='ACCEPTED',accepted_at=now() where id=r.id;
 update private.urgent_offers set state=case when planner_id=auth.uid() then 'ACCEPTED' else 'CLOSED' end where request_id=r.id;
 update private.instant_availability set enabled=false,latitude=null,longitude=null,accuracy=null where user_id=auth.uid();
 insert into private.urgent_events(request_id,actor,event) values(r.id,auth.uid(),'ACCEPTED');
 return jsonb_build_object('saved',true);
 end if;
 end if;
 if operation='request' then number:=private.flow_phone(auth.uid());if number is null then raise exception 'phone_verification_required';end if;payload:=payload||jsonb_build_object('phone',number);end if;
 if operation in ('share_contact','contacted','confirm_visit') then
 perform private.expire_urgent();select * into r from private.urgent_requests where id=(payload->>'id')::uuid for update;
 if r.id is null or (auth.uid() is distinct from r.customer_id and auth.uid() is distinct from r.planner_id) then raise exception 'request_forbidden';end if;
 if r.contact_flow=2 then
 if r.state<>'ACCEPTED' then raise exception 'invalid_transition';end if;
 if operation in ('share_contact','contacted') then return private.flow_action('visit',r.id,r.customer_id,r.planner_id,r.preferred_at::text,operation,payload);end if;
 info:=private.flow_contact('visit',r.id,r.customer_id,r.planner_id,r.preferred_at::text,true);
 if info->>'ready' is distinct from 'true' then raise exception 'contact_first_required';end if;
 end if;
 end if;
 result:=public.urgent_command_before_contact(operation,payload);
 if operation='settings' then return result||jsonb_build_object('receptionEnabled',coalesce((select available from private.planner_directory where user_id=auth.uid()),false));end if;
 if operation='workspace' then
 for item in select * from jsonb_array_elements(result) loop
 select * into r from private.urgent_requests where id=(item->>'id')::uuid;
 if r.contact_flow=2 then
 info:=private.flow_contact('visit',r.id,r.customer_id,r.planner_id,r.preferred_at::text,r.state in ('ACCEPTED','PREPARING','DEPARTED','EN_ROUTE','ARRIVED'));
 item:=item||jsonb_build_object('contactFlow',2,'exchange',info);
 if item->'details'<>'null'::jsonb then item:=jsonb_set(item,'{details}',(item->'details')-'phone');end if;
 if auth.uid()<>r.customer_id and (r.confirmed_at is null or not private.urgent_eligible(auth.uid()) or r.state not in ('ACCEPTED','PREPARING','DEPARTED','EN_ROUTE','ARRIVED')) then item:=item||jsonb_build_object('details',null);end if;
 end if;rows:=rows||jsonb_build_array(item);
 end loop;return rows;
 end if;
 if operation='confirm_visit' and r.contact_flow=2 then perform private.flow_notify('visit',r.id,'confirmed','방문 일정이 확정됐어요.',r.customer_id,r.planner_id);end if;
 return result;
end$$;
revoke all on function private.flow_phone(uuid),private.flow_contact(text,uuid,uuid,uuid,text,boolean),private.flow_notify(text,uuid,text,text,uuid,uuid),private.flow_action(text,uuid,uuid,uuid,text,text,jsonb),private.visit_available(uuid),public.consultation_availability(text,jsonb),public.consultation_command(text,jsonb),public.consultation_workspace(text),public.urgent_command(text,jsonb),public.office_catalog(),public.reservation_slots(text,uuid,date,text) from public,anon,authenticated;
grant execute on function public.consultation_availability(text,jsonb),public.consultation_command(text,jsonb),public.consultation_workspace(text),public.urgent_command(text,jsonb) to authenticated;
grant execute on function public.office_catalog(),public.reservation_slots(text,uuid,date,text) to anon,authenticated;
commit;
