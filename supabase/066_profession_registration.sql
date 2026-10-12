-- Generated catalog below is checked against shared/professions.json before release.
begin;
select pg_advisory_xact_lock(hashtextextended('profession-registration',66));
create table if not exists private.profession_release_backup(name text primary key,definition text not null);
create table if not exists private.profession_release_snapshot(name text primary key,payload jsonb);
alter table private.profession_release_backup enable row level security;
alter table private.profession_release_snapshot enable row level security;
revoke all on private.profession_release_backup,private.profession_release_snapshot from public,anon,authenticated;
insert into private.profession_release_snapshot values
 ('schema',(select jsonb_agg(to_jsonb(c)) from information_schema.columns c where table_schema in ('private','public'))),
 ('office_last_start_default',(select to_jsonb(pg_get_expr(d.adbin,d.adrelid)) from pg_attrdef d join pg_attribute a on a.attrelid=d.adrelid and a.attnum=d.adnum where d.adrelid='private.office_locations'::regclass and a.attname='last_start_hour')),
 ('member',(select to_jsonb(m) from public.member_profiles m order by user_id limit 1)),
 ('counts',jsonb_build_object('members',(select count(*) from public.member_profiles),'bookings',(select count(*) from private.consultations))) on conflict do nothing;
insert into private.profession_release_backup
 select p.oid::regprocedure::text,pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where (n.nspname='public' and (p.proname in ('expert_profile_command','early_expert_review','early_document_service','early_expert_documents','planner_catalog','expert_optional_profile','expert_photo_service','consultation_workspace','my_membership','reservation_slots','visit_catalog','urgent_command') or p.proname like 'consultation_command%' or p.proname like 'expert_optional_profile%'))
 or (n.nspname='private' and p.proname in ('planner_eligible','match_expert_roster','check_reservation_slot_before_visits','reservation_duration','specialty_match')) on conflict do nothing;

create table if not exists private.profession_definitions(id text primary key,definition jsonb not null,version text not null);
alter table private.profession_definitions enable row level security;
revoke all on private.profession_definitions from public,anon,authenticated;
-- PROFESSION_CATALOG_START
insert into private.profession_definitions(id,definition,version) values
 ('planner','{"name":"보험설계사","purpose":"보험금 청구 도움","icon":"person","intake":true,"documents":{"registration":"설계사 등록증","appointment":"위촉·소속 확인자료"},"documentRule":"any","documentHint":"설계사 등록증 또는 위촉·소속 확인자료 중 하나를 제출하세요.","registryLabel":"보험모집 등록번호 (선택)","specialties":{"claim":"청구서류 안내","coverage":"가입보험 확인","death":"사망보험금","critical":"암·중대질병","medical":"실손","surgery":"입원·수술","accident":"사고","corporate":"기업보험"},"pledges":["첫 미팅에서는 보험 가입을 권유하지 않습니다.","청구 도움 이후에도 고객이 먼저 명시적으로 요청한 경우에만 신규 가입 상담을 진행합니다."]}'::jsonb,'expert-professions-2026-10-12-v1'),
 ('tax','{"name":"세무사","purpose":"세무 상담","icon":"document","intake":true,"documents":{"registration":"세무사 등록 확인자료","appointment":"사무소 확인자료"},"documentRule":"all","documentHint":"세무사 등록증과 현재 사무소 정보를 확인할 자료를 제출하세요. 자격증만으로 개업 등록 확인을 대신하지 않습니다.","registryLabel":"세무사 등록번호","specialties":{"tax_income":"소득세","tax_inheritance":"상속·증여세","tax_property":"양도·부동산 세무"},"pledges":[]}'::jsonb,'expert-professions-2026-10-12-v1'),
 ('office','{"name":"보험소 운영자","purpose":"상담 공간 운영","icon":"home","intake":true,"documents":{"registration":"상담 공간 확인자료","appointment":"공간 운영 권한 확인자료"},"documentRule":"all","documentHint":"상담 공간과 사용·운영 권한을 확인할 자료를 제출하세요. 개인 전문가 자격 신청과 별도로 검토합니다.","registryLabel":"","specialties":{},"pledges":[]}'::jsonb,'expert-professions-2026-10-12-v1'),
 ('adjuster','{"name":"손해사정사","intake":false}'::jsonb,'expert-professions-2026-10-12-v1'),
 ('lawyer','{"name":"변호사","intake":false}'::jsonb,'expert-professions-2026-10-12-v1')
on conflict(id) do update set definition=excluded.definition,version=excluded.version;
-- PROFESSION_CATALOG_END

alter table private.expert_profiles add column if not exists profession text check(profession in ('planner','tax','adjuster','lawyer'));
alter table private.expert_profiles add column if not exists organization text;
alter table private.expert_profiles add column if not exists registration_reference text;
alter table private.expert_profiles add column if not exists office_address text;
alter table private.expert_profiles add column if not exists fee_mode text check(fee_mode in ('unknown','free','paid'));
alter table private.expert_profiles add column if not exists fee_basis text check(length(fee_basis)<=200);
alter table private.consent_records add column if not exists profession text;
alter table private.consultations add column if not exists fee_notice text;
alter table private.urgent_requests add column if not exists fee_notice text;
alter table private.urgent_requests drop constraint if exists urgent_requests_purpose_check;
alter table private.urgent_requests add constraint urgent_requests_purpose_check check(purpose in ('death','illness','medical','accident','claim','coverage','other'));
alter table private.office_locations alter column last_start_hour set default 17;
alter table private.expert_profiles drop constraint if exists expert_profiles_specialties_check;
alter table private.expert_profiles add constraint expert_profiles_specialties_check check(cardinality(specialties) between 0 and 3);

create table if not exists private.office_operator_applications(
 user_id uuid primary key references auth.users(id),display_name text not null,office_name text not null,
 primary_area text not null references private.service_areas(id),address text not null,phone text not null,
 status text not null default 'PROFILE_COMPLETE_VERIFICATION_REQUIRED' check(status in ('PROFILE_COMPLETE_VERIFICATION_REQUIRED','VERIFICATION_PENDING','APPROVED','SUSPENDED','REJECTED')),
 registration_status text not null default 'NOT_SUBMITTED',organization_status text not null default 'NOT_SUBMITTED',
 office_id text references private.office_locations(id),updated_at timestamptz not null default now()
);
create table if not exists private.profession_documents(
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id),profession text not null check(profession in ('tax','office')),
 kind text not null check(kind in ('registration','appointment')),object_path text not null unique,filename text not null,
 mime text not null check(mime in ('image/jpeg','image/png','application/pdf')),bytes integer not null check(bytes between 1 and 4194304),
 deleting boolean not null default false,created_at timestamptz not null default now(),unique(user_id,profession,kind)
);
alter table private.office_operator_applications enable row level security;
alter table private.profession_documents enable row level security;
revoke all on private.office_operator_applications,private.profession_documents from public,anon,authenticated;

create or replace function private.expert_profession(subject uuid) returns text language sql stable security definer set search_path='' as $$
 select coalesce((select profession from private.expert_profiles where user_id=subject),(select profession from public.partner_applications where user_id=subject))
$$;
create or replace function public.profession_catalog() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('version',max(version),'professions',coalesce(jsonb_object_agg(id,definition),'{}')) from private.profession_definitions
$$;

do $$declare name text;signature text;begin
 foreach signature in array array['expert_profile_command(text,jsonb)','early_expert_review(text,jsonb)','early_document_service(uuid,text,jsonb)','early_expert_documents()','planner_catalog(text,text)','expert_optional_profile(text,jsonb)','consultation_workspace(text)','consultation_command(text,jsonb)','reservation_slots(text,uuid,date,text)','my_membership()','visit_catalog(jsonb)','urgent_command(text,jsonb)'] loop
 name:=split_part(signature,'(',1);
 if to_regprocedure('public.'||replace(signature,name,name||'_before_professions')) is null then execute format('alter function public.%s rename to %I',signature,name||'_before_professions');end if;
 execute format('revoke all on function public.%s from public,anon,authenticated',replace(signature,name,name||'_before_professions'));
 end loop;
 if to_regprocedure('private.planner_eligible_before_professions(uuid)') is null then alter function private.planner_eligible(uuid) rename to planner_eligible_before_professions;end if;
end$$;
revoke all on function private.planner_eligible_before_professions(uuid) from public,anon,authenticated;

create or replace function public.expert_profile_command(operation text,payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare actor uuid:=auth.uid();p private.expert_profiles;job text;prior text;definition jsonb;version text;tags text[];secondary text[];days integer[];office private.office_operator_applications;
begin
 if not private.is_active_member() then raise exception 'membership_required';end if;
 if operation='get' then return jsonb_build_object(
 'profile',(select to_jsonb(e)||jsonb_build_object('profession',private.expert_profession(actor),'organization',coalesce(e.organization,(select organization from public.partner_applications where user_id=actor)), 'registration_reference',coalesce(e.registration_reference,(select credential_reference from public.partner_applications where user_id=actor))) from private.expert_profiles e where user_id=actor),
 'office_profile',(select to_jsonb(o)||jsonb_build_object('profession','office') from private.office_operator_applications o where user_id=actor),
 'events',(select coalesce(jsonb_agg(to_jsonb(e) order by created_at desc),'[]') from private.expert_verification_events e where subject=actor));end if;
 if operation<>'save' then raise exception 'invalid_operation';end if;
 if not exists(select 1 from private.service_features where expert_applications) then raise exception 'applications_disabled';end if;
 job:=payload->>'profession';select d.definition,d.version into definition,version from private.profession_definitions d where id=job;
 if not coalesce((definition->>'intake')::boolean,false) then raise exception 'profession_closed';end if;
 if payload->>'consent' is distinct from 'true' or payload->>'agreement_version' is distinct from version then raise exception 'consent_required';end if;
 if job='planner' and (payload->>'firstMeetingConfirmed' is distinct from 'true' or payload->>'customerInitiatedConfirmed' is distinct from 'true') then raise exception 'pledge_required';end if;
 if length(trim(coalesce(payload->>'display_name',''))) not between 2 and 60 or not exists(select 1 from private.service_areas where id=payload->>'primary_area') then raise exception 'invalid_profile';end if;
 perform pg_advisory_xact_lock(hashtextextended(actor::text,31));
 if job='office' then
  select * into office from private.office_operator_applications where user_id=actor for update;
  if office.status in ('SUSPENDED','REJECTED') then raise exception 'application_locked';end if;
  if length(trim(coalesce(payload->>'office_name',''))) not between 2 and 120 or length(trim(coalesce(payload->>'address',''))) not between 5 and 300 or coalesce(payload->>'phone','')!~'^0[0-9]{8,10}$' then raise exception 'invalid_office';end if;
  if office.status='APPROVED' and (office.office_name is distinct from trim(payload->>'office_name') or office.address is distinct from trim(payload->>'address')) then raise exception 'office_review_required';end if;
  insert into private.office_operator_applications(user_id,display_name,office_name,primary_area,address,phone) values(actor,trim(payload->>'display_name'),trim(payload->>'office_name'),payload->>'primary_area',trim(payload->>'address'),payload->>'phone')
  on conflict(user_id) do update set display_name=excluded.display_name,office_name=excluded.office_name,primary_area=excluded.primary_area,address=excluded.address,phone=excluded.phone,updated_at=now();
 else
  select * into p from private.expert_profiles where user_id=actor for update;prior:=private.expert_profession(actor);if prior='office' and p.user_id is null then prior:=null;end if;
  if prior is not null and prior<>job then raise exception 'profession_change_review_required';end if;
  if p.status in ('SUSPENDED','REJECTED') then raise exception 'application_locked';end if;
  if p.status='APPROVED' and p.display_name is distinct from trim(payload->>'display_name') then raise exception 'name_review_required';end if;
  if length(trim(coalesce(payload->>'organization',''))) not between 2 and 120 then raise exception 'organization_required';end if;
  if job='tax' and (length(trim(coalesce(payload->>'registration_reference',''))) not between 2 and 60 or length(trim(coalesce(payload->>'office_address',''))) not between 5 and 300 or coalesce(payload->>'fee_mode','') not in ('free','paid','unknown') or (payload->>'fee_mode'='paid' and length(trim(coalesce(payload->>'fee_basis',''))) not between 2 and 200)) then raise exception 'tax_details_required';end if;
  if job='tax' and p.status='APPROVED' and (p.registration_reference is distinct from trim(payload->>'registration_reference') or p.organization is distinct from trim(payload->>'organization') or p.office_address is distinct from trim(payload->>'office_address')) then raise exception 'organization_review_required';end if;
  tags:=array(select distinct jsonb_array_elements_text(coalesce(payload->'specialties','[]')));
  if cardinality(tags)>3 or exists(select 1 from unnest(tags) t where not (definition->'specialties' ? t)) then raise exception 'invalid_specialties';end if;
  secondary:=array(select distinct jsonb_array_elements_text(coalesce(payload->'secondary_areas','[]')));days:=array(select distinct value::integer from jsonb_array_elements_text(payload->'weekdays'));
  if cardinality(secondary)>2 or payload->>'primary_area'=any(secondary) or exists(select 1 from unnest(secondary) a where not exists(select 1 from private.service_areas where id=a)) then raise exception 'invalid_area';end if;
  if payload->>'start_hour' is null or payload->>'end_hour' is null or cardinality(days)=0 or not days<@array[0,1,2,3,4,5,6] or ((coalesce((payload->>'start_hour')::integer,-1)<9 or coalesce((payload->>'end_hour')::integer,99)>18) and not coalesce(p.start_hour=(payload->>'start_hour')::integer and p.end_hour=(payload->>'end_hour')::integer,false)) or (payload->>'start_hour')::integer>=(payload->>'end_hour')::integer then raise exception 'invalid_availability';end if;
  insert into private.expert_profiles(user_id,display_name,profession,organization,registration_reference,office_address,fee_mode,fee_basis,primary_area,secondary_areas,specialties,weekdays,start_hour,end_hour)
  values(actor,trim(payload->>'display_name'),job,trim(payload->>'organization'),trim(payload->>'registration_reference'),trim(payload->>'office_address'),case when job='tax' then payload->>'fee_mode' end,case when job='tax' and payload->>'fee_mode'='paid' then trim(payload->>'fee_basis') end,payload->>'primary_area',secondary,tags,days,(payload->>'start_hour')::integer,(payload->>'end_hour')::integer)
  on conflict(user_id) do update set display_name=excluded.display_name,profession=excluded.profession,organization=excluded.organization,registration_reference=excluded.registration_reference,office_address=excluded.office_address,fee_mode=excluded.fee_mode,fee_basis=excluded.fee_basis,primary_area=excluded.primary_area,secondary_areas=excluded.secondary_areas,specialties=excluded.specialties,weekdays=excluded.weekdays,start_hour=excluded.start_hour,end_hour=excluded.end_hour,updated_at=now();
  insert into private.expert_service_areas(user_id,primary_area,secondary_areas) values(actor,payload->>'primary_area',secondary) on conflict(user_id) do update set primary_area=excluded.primary_area,secondary_areas=excluded.secondary_areas,changed_at=now();
  insert into public.partner_applications(user_id,full_name,profession,organization,region,credential_reference,status) values(actor,trim(payload->>'display_name'),job,trim(payload->>'organization'),payload->>'primary_area',coalesce(payload->>'registration_reference',''),'pending')
  on conflict(user_id) do update set profession=excluded.profession,organization=excluded.organization,region=excluded.region,status=case when partner_applications.profession='office' then 'pending' else partner_applications.status end;
 end if;
 insert into private.consent_records(user_id,type,version,profession,accepted,accepted_at,source) select actor,'EXPERT_TERMS',version,job,true,now(),'profession_application'
 where not exists(select 1 from private.consent_records c where c.user_id=actor and c.type='EXPERT_TERMS' and c.version=version and c.profession=job and c.accepted);
 insert into private.expert_verification_events(subject,actor,action,reason) values(actor,actor,'PROFILE_SAVED',job);
 return public.expert_profile_command('get');
end$$;

-- Do not use a planner organization roster as tax registration evidence.
do $$declare source text;begin
 source:=pg_get_functiondef('private.match_expert_roster()'::regprocedure);
 if position('new.profession' in source)=0 then execute replace(source,'if new.status','if new.profession is not null and new.profession<>''planner'' then return new;end if; if new.status');end if;
end$$;

create or replace function public.early_expert_documents() returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce((select jsonb_agg(d||jsonb_build_object('profession','planner')) from jsonb_array_elements(public.early_expert_documents_before_professions()) d),'[]')||coalesce((select jsonb_agg(to_jsonb(d)-'object_path') from private.profession_documents d where user_id=auth.uid()),'[]')
$$;
create or replace function public.early_document_service(subject uuid,operation text,payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare legacy private.verification_documents;d private.profession_documents;job text;state text;definition jsonb;administrator boolean;
begin
 select exists(select 1 from private.admin_memberships where user_id=subject) into administrator;
 if not exists(select 1 from public.member_profiles m join auth.users u on u.id=m.user_id where m.user_id=subject and (u.email_confirmed_at is not null or (u.phone_confirmed_at is not null and private.verified_contact(u.id) is not null))) or exists(select 1 from private.account_lifecycle where user_id=subject and status<>'ACTIVE') then raise exception 'membership_required';end if;
 if operation='save' then
  job:=payload->>'profession';
  if job='planner' then
   if private.expert_profession(subject) is distinct from 'planner' then raise exception 'request_forbidden';end if;
   return public.early_document_service_before_professions(subject,operation,payload);
  end if;
  select x.definition into definition from private.profession_definitions x where x.id=job;
  if job='tax' then select status into state from private.expert_profiles where user_id=subject and profession='tax' for update;
  elsif job='office' then select status into state from private.office_operator_applications where user_id=subject for update;
  else raise exception 'invalid_document';end if;
  if state is null or state in ('APPROVED','SUSPENDED','REJECTED') then raise exception 'application_locked';end if;
  if not (definition->'documents' ? (payload->>'kind')) or coalesce(payload->>'path','') not like subject::text||'/%' then raise exception 'invalid_document';end if;
  insert into private.profession_documents(user_id,profession,kind,object_path,filename,mime,bytes) values(subject,job,payload->>'kind',payload->>'path',left(payload->>'filename',120),payload->>'mime',(payload->>'bytes')::integer) returning * into d;
  if job='tax' then update private.expert_profiles set status='VERIFICATION_PENDING',map_visible=false,registration_status=case when d.kind='registration' then 'PENDING' else registration_status end,organization_status=case when d.kind='appointment' then 'PENDING' else organization_status end where user_id=subject;
  else update private.office_operator_applications set status='VERIFICATION_PENDING',registration_status=case when d.kind='registration' then 'PENDING' else registration_status end,organization_status=case when d.kind='appointment' then 'PENDING' else organization_status end where user_id=subject;end if;
  insert into private.consent_records(user_id,type,version,profession,accepted,accepted_at,source) values(subject,'EXPERT_DOCUMENT',(select version from private.profession_definitions where id=job),job,true,now(),'expert_document_upload');
 elsif operation in ('read','delete','confirm_delete') then
  select * into d from private.profession_documents where id=(payload->>'id')::uuid for update;
  if d.id is null then
   if operation='read' then
    select * into legacy from private.verification_documents where id=(payload->>'id')::uuid;
    if legacy.id is null or legacy.deleting or (legacy.user_id<>subject and not administrator) then raise exception 'request_forbidden';end if;
    insert into private.expert_verification_events(subject,actor,action) values(legacy.user_id,subject,'DOCUMENT_VIEWED');return to_jsonb(legacy);
   end if;
   return public.early_document_service_before_professions(subject,operation,payload);
  end if;
  if d.user_id<>subject and not administrator then raise exception 'request_forbidden';end if;
  if operation='read' then if d.deleting then raise exception 'request_forbidden';end if;insert into private.expert_verification_events(subject,actor,action,reason) values(d.user_id,subject,'DOCUMENT_VIEWED',d.profession);return to_jsonb(d);end if;
  if operation='delete' then
   update private.profession_documents set deleting=true where id=d.id;
   if d.profession='tax' then update private.expert_profiles set status='PROFILE_COMPLETE_VERIFICATION_REQUIRED',map_visible=false,registration_status=case when d.kind='registration' then 'NOT_SUBMITTED' else registration_status end,organization_status=case when d.kind='appointment' then 'NOT_SUBMITTED' else organization_status end where user_id=d.user_id;
   else update private.office_operator_applications set status='PROFILE_COMPLETE_VERIFICATION_REQUIRED',registration_status=case when d.kind='registration' then 'NOT_SUBMITTED' else registration_status end,organization_status=case when d.kind='appointment' then 'NOT_SUBMITTED' else organization_status end where user_id=d.user_id;
   update private.office_locations set status='planned' where id=(select office_id from private.office_operator_applications where user_id=d.user_id);end if;
   return to_jsonb(d);
  end if;
  if not d.deleting or d.object_path is distinct from payload->>'path' then raise exception 'request_forbidden';end if;
  delete from private.profession_documents where id=d.id;
 else raise exception 'invalid_operation';end if;
 insert into private.expert_verification_events(subject,actor,action,reason) values(d.user_id,subject,'DOCUMENT_'||upper(operation),d.profession);
 return jsonb_build_object('document',to_jsonb(d)-'object_path');
end$$;

create or replace function public.early_expert_review(operation text,payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare actor uuid:=auth.uid();target uuid:=(payload->>'user_id')::uuid;p private.expert_profiles;o private.office_operator_applications;job text;result jsonb;reason text:=trim(payload->>'reason');decision text:=payload->>'decision';kind text:=payload->>'kind';a private.service_areas;phone text;oid text;
begin
 if not private.is_admin() then raise exception 'admin_required';end if;
 if operation='list' then
  return coalesce((select jsonb_agg(e||jsonb_build_object('profession',private.expert_profession((e->>'user_id')::uuid),'documents',case when private.expert_profession((e->>'user_id')::uuid)='tax' then coalesce((select jsonb_agg(to_jsonb(d)-'object_path') from private.profession_documents d where d.user_id=(e->>'user_id')::uuid and d.profession='tax'),'[]') else e->'documents' end)) from jsonb_array_elements(public.early_expert_review_before_professions('list')) e),'[]')
  ||coalesce((select jsonb_agg(to_jsonb(x)||jsonb_build_object('profession','office','organization',office_name,'documents',coalesce((select jsonb_agg(to_jsonb(d)-'object_path') from private.profession_documents d where d.user_id=x.user_id and d.profession='office'),'[]'),'phoneVerified',exists(select 1 from auth.users where id=x.user_id and phone_confirmed_at is not null))) from private.office_operator_applications x),'[]');
 end if;
 job:=case when payload->>'profession'='office' then 'office' else private.expert_profession(target) end;
 if job='planner' then return public.early_expert_review_before_professions(operation,payload);end if;
 if job is null or job not in ('tax','office') then raise exception 'profession_review_required';end if;
 if target=actor then raise exception 'self_review_forbidden';end if;
 if length(coalesce(reason,'')) not between 5 and 1000 then raise exception 'evidence_required';end if;
 if job='tax' then select * into p from private.expert_profiles where user_id=target for update;
 else select * into o from private.office_operator_applications where user_id=target for update;if o.user_id is null then raise exception 'request_forbidden';end if;end if;
 if operation='verify' then
  if coalesce(kind,'') not in ('registration','appointment') or coalesce(decision,'') not in ('VERIFIED','NEEDS_RESUBMISSION','REJECTED','EXPIRED') then raise exception 'invalid_operation';end if;
  if decision='VERIFIED' and not exists(select 1 from private.profession_documents d where d.user_id=target and d.profession=job and d.kind=kind and not deleting) then raise exception 'document_required';end if;
  if job='tax' then update private.expert_profiles set registration_status=case when kind='registration' then decision else registration_status end,organization_status=case when kind='appointment' then decision else organization_status end,status='VERIFICATION_PENDING',map_visible=false where user_id=target;
  else update private.office_operator_applications set registration_status=case when kind='registration' then decision else registration_status end,organization_status=case when kind='appointment' then decision else organization_status end,status='VERIFICATION_PENDING' where user_id=target;update private.office_locations set status='planned' where id=o.office_id;end if;
 elsif operation='approve' then
  if (job='tax' and (p.registration_status<>'VERIFIED' or p.organization_status<>'VERIFIED')) or (job='office' and (o.registration_status<>'VERIFIED' or o.organization_status<>'VERIFIED')) then raise exception 'verification_required';end if;
  select u.phone into phone from auth.users u where id=target and phone_confirmed_at is not null;
  if phone is null or private.verified_contact(target) is null then raise exception 'phone_verification_required';end if;
  if exists(select 1 from private.account_lifecycle where user_id=target and status<>'ACTIVE') then raise exception 'account_inactive';end if;
  if job='tax' then
   select * into a from private.service_areas where id=p.primary_area;
   update public.partner_applications set profession='tax',status='approved',full_name=p.display_name,organization=p.organization,region=p.primary_area,credential_reference=p.registration_reference,reviewed_by=actor,reviewed_at=now() where user_id=target;
   insert into private.planner_directory(user_id,specialties,hours,latitude,longitude,phone,verified_by,verified_at,evidence,is_sample,available) values(target,p.specialties,p.start_hour||':00–'||p.end_hour||':00',a.latitude,a.longitude,case when phone like '+82%' then '0'||substr(phone,4) else phone end,actor,now(),reason,false,true)
   on conflict(user_id) do update set verified_by=actor,verified_at=now(),evidence=reason,is_sample=false;
   update private.expert_profiles set status='APPROVED',map_visible=true where user_id=target;
  else
   if nullif(payload->>'latitude','') is null or nullif(payload->>'longitude','') is null then raise exception 'office_coordinates_required';end if;
   oid:=coalesce(o.office_id,'office-'||target::text);
   insert into public.partner_applications(user_id,full_name,profession,organization,region,credential_reference,status) values(target,o.display_name,'office',o.office_name,o.primary_area,'office-verified','approved') on conflict(user_id) do nothing;
   insert into private.office_locations(id,name,region,status,address,latitude,longitude,operator_user_id,last_start_hour) values(oid,o.office_name,o.primary_area,'active',o.address,(payload->>'latitude')::double precision,(payload->>'longitude')::double precision,target,17)
   on conflict(id) do update set status='active',name=excluded.name,address=excluded.address,latitude=excluded.latitude,longitude=excluded.longitude;
   update private.office_operator_applications set status='APPROVED',office_id=oid where user_id=target;
  end if;
 elsif operation='suspend' then
  if job='tax' then update private.expert_profiles set status='SUSPENDED',map_visible=false where user_id=target;
  else update private.office_operator_applications set status='SUSPENDED' where user_id=target;update private.office_locations set status='planned' where id=o.office_id;end if;
 else raise exception 'invalid_operation';end if;
 insert into private.expert_verification_events(subject,actor,action,reason) values(target,actor,upper(job||'_'||operation),reason);
 return jsonb_build_object('saved',true);
end$$;

create or replace function private.planner_eligible(subject uuid) returns boolean language sql stable security definer set search_path='' as $$
 select case when private.expert_profession(subject)='tax' then exists(
 select 1 from private.expert_profiles e join public.partner_applications p using(user_id) join private.planner_directory d using(user_id) join auth.users u on u.id=e.user_id join public.member_profiles m using(user_id)
 where e.user_id=subject and e.profession='tax' and p.profession='tax' and p.status='approved' and e.status='APPROVED' and e.map_visible and e.registration_status='VERIFIED' and e.organization_status='VERIFIED' and d.verified_at is not null and not d.is_sample and u.phone_confirmed_at is not null and private.verified_contact(subject) is not null
 and (nullif(to_jsonb(u)->>'banned_until','')::timestamptz is null or (to_jsonb(u)->>'banned_until')::timestamptz<=now())
 and exists(select 1 from public.member_consents where user_id=subject and version<>'')
 and not exists(select 1 from private.account_lifecycle where user_id=subject and status<>'ACTIVE'))
 else private.planner_eligible_before_professions(subject) end
$$;
create or replace function private.tax_fee_notice(subject uuid) returns text language sql stable security definer set search_path='' as $$
 select case when fee_mode='free' then '세무 상담료: 무료' when fee_mode='paid' and nullif(fee_basis,'') is not null then '세무 상담료: '||fee_basis else '방문 전 상담료 확인이 필요합니다' end from private.expert_profiles where user_id=subject and profession='tax'
$$;
create or replace function public.planner_catalog(area text default '',wanted text default '') returns jsonb language sql stable security definer set search_path='' as $$
 select b||jsonb_build_object('planners',coalesce((select jsonb_agg(p||jsonb_build_object('profession',private.expert_profession((p->>'id')::uuid),'profession_name',d.definition->>'name','fee_notice',private.tax_fee_notice((p->>'id')::uuid))||case when private.expert_profession((p->>'id')::uuid)='tax' then jsonb_build_object('protection_pledge',null,'insurance_types','[]'::jsonb,'help_tasks','[]'::jsonb) else '{}' end) from jsonb_array_elements(b->'planners') p left join private.profession_definitions d on d.id=private.expert_profession((p->>'id')::uuid) where private.expert_profession((p->>'id')::uuid)<>'tax' or coalesce(wanted,'') in ('','other') or wanted like 'tax_%'),'[]')) from (select public.planner_catalog_before_professions(area,wanted) b) q
$$;
create or replace function public.my_membership() returns jsonb language sql stable security definer set search_path='' as $$
 select public.my_membership_before_professions()||jsonb_build_object('profession',private.expert_profession(auth.uid()),'office_operator_status',(select status from private.office_operator_applications where user_id=auth.uid()))
$$;
-- The same existing optional photo service serves both personal professions.
do $$declare p record;s text;begin
 for p in select oid from pg_proc where pronamespace='public'::regnamespace and (proname like 'expert_optional_profile%' or proname='expert_photo_service' or proname like 'consultation_command%') loop
  s:=pg_get_functiondef(p.oid);
  if position('profession=''planner''' in s)>0 then execute replace(s,'profession=''planner''','profession in (''planner'',''tax'')');end if;
 end loop;
end$$;
create or replace function public.expert_optional_profile(operation text default 'get',payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare job text:=private.expert_profession(auth.uid());result jsonb;
begin
 if job='tax' and operation='save' and (coalesce(payload->'insurance_types','[]')<>'[]'::jsonb or coalesce(payload->'help_tasks','[]')<>'[]'::jsonb) then raise exception 'invalid_options';end if;
 result:=public.expert_optional_profile_before_professions(operation,payload);
 return result||jsonb_build_object('profession',job);
end$$;

-- New requests use hourly starts. Existing records keep their time and duration.
create or replace function private.reservation_duration(office text,consultation_method text) returns integer language sql stable security definer set search_path='' as $$select 60$$;
-- An omitted optional specialty is not a qualification or availability restriction.
do $$declare s text;begin
 s:=pg_get_functiondef('private.specialty_match(text,text[])'::regprocedure);
 if position('cardinality(tags)' in s)=0 then execute replace(s,'select coalesce(wanted','select coalesce(cardinality(tags),0)=0 or coalesce(wanted');end if;
end$$;
do $$declare s text;begin
 s:=pg_get_functiondef('private.check_reservation_slot_before_visits(uuid,text,timestamptz,uuid,text)'::regprocedure);
 if position('profession_hourly_slot' in s)=0 then
  s:=replace(s,'if office is not null then',E'-- profession_hourly_slot\n if existing_time then select coalesce(c.duration_minutes,60) into length_minutes from private.consultations c where c.id=exclude_id;else length_minutes:=60;end if;\n if not existing_time and (extract(minute from local_stamp)<>0 or extract(hour from local_stamp)<9 or extract(hour from local_stamp)>17) then raise exception ''invalid_slot'';end if;\n if office is not null then');execute s;
 end if;
end$$;
create or replace function public.consultation_command(operation text,payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;target uuid;notice text;
begin
 target:=nullif(payload->>'planner_id','')::uuid;
 if operation='request' and private.expert_profession(target)='tax' then
  perform 1 from private.expert_profiles where user_id=target for share;
  notice:=private.tax_fee_notice(target);
  if payload->>'fee_ack' is distinct from notice then raise exception 'fee_confirmation_required';end if;
  if payload->>'purpose' is distinct from 'other' then raise exception 'invalid_tax_purpose';end if;
 end if;
 result:=public.consultation_command_before_professions(operation,payload);
 if operation='request' and not coalesce((result->>'replay')::boolean,false) then update private.consultations set fee_notice=coalesce(fee_notice,notice) where id=(result->>'id')::uuid;end if;
 return result;
end$$;
create or replace function public.consultation_workspace(workspace text) returns jsonb language sql security definer set search_path='' as $$
 select b||case when workspace='partner' then jsonb_build_object('profile',coalesce(b->'profile','{}')||jsonb_build_object('profession',private.expert_profession(auth.uid()))) else '{}'::jsonb end||jsonb_build_object('bookings',coalesce((select jsonb_agg(r||jsonb_build_object('fee_notice',c.fee_notice)) from jsonb_array_elements(b->'bookings') r join private.consultations c on c.id=(r->>'id')::uuid),'[]')) from (select public.consultation_workspace_before_professions(workspace) b) x
$$;

create or replace function public.reservation_slots(office_id text default null,planner_id uuid default null,day date default current_date,consultation_method text default 'scheduled') returns jsonb language plpgsql security definer set search_path='' as $$
declare candidate text;stamp timestamptz;result jsonb:='[]';
begin
 for candidate in select jsonb_array_elements_text(public.reservation_slots_before_professions(office_id,planner_id,day,consultation_method)) loop
  stamp:=(day::text||'T'||candidate||':00+09:00')::timestamptz;
  begin perform private.check_reservation_slot(planner_id,office_id,stamp,null,consultation_method);
   result:=result||jsonb_build_array(candidate);
  exception when raise_exception then null;end;
 end loop;return result;
end$$;
revoke all on function public.reservation_slots(text,uuid,date,text) from public,anon,authenticated;
grant execute on function public.reservation_slots(text,uuid,date,text) to anon,authenticated;


create or replace function public.visit_catalog(payload jsonb default '{}') returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(v||jsonb_build_object('profession',private.expert_profession((v->>'id')::uuid),'profession_name',d.definition->>'name','fee_notice',private.tax_fee_notice((v->>'id')::uuid))),'[]')
 from jsonb_array_elements(public.visit_catalog_before_professions(payload)) v left join private.profession_definitions d on d.id=private.expert_profession((v->>'id')::uuid)
$$;
create or replace function public.urgent_command(operation text,payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;target uuid;notice text;
begin
 if not private.is_active_member() then raise exception 'membership_required';end if;
 target:=nullif(payload->>'planner_id','')::uuid;
 if operation='request' and private.expert_profession(target)='tax' then
  notice:=private.tax_fee_notice(target);
  if payload->>'fee_ack' is distinct from notice then raise exception 'fee_confirmation_required';end if;
  if payload->>'purpose' is distinct from 'other' then raise exception 'invalid_tax_purpose';end if;
 elsif operation='request' and payload->>'purpose'='other' then raise exception 'invalid_purpose';
 end if;
 result:=public.urgent_command_before_professions(operation,payload);
 if operation='request' and not coalesce((result->>'replay')::boolean,false) then update private.urgent_requests set fee_notice=notice where id=(result->>'id')::uuid;end if;
 if operation='workspace' then
  select coalesce(jsonb_agg(r||jsonb_build_object('fee_notice',q.fee_notice)),'[]') into result from jsonb_array_elements(result) r join private.urgent_requests q on q.id=(r->>'id')::uuid;
 end if;
 return result;
end$$;
revoke all on function public.visit_catalog(jsonb),public.urgent_command(text,jsonb),private.reservation_duration(text,text) from public,anon,authenticated;
grant execute on function public.visit_catalog(jsonb) to anon,authenticated;
grant execute on function public.urgent_command(text,jsonb) to authenticated;

create or replace function private.profession_intake_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if (tg_op='INSERT' or new.profession is distinct from old.profession) and not coalesce((select (definition->>'intake')::boolean from private.profession_definitions where id=new.profession),false) then raise exception 'profession_closed';end if;
 return new;
end$$;
do $$begin
 if not exists(select 1 from pg_trigger where tgname='profession_intake_guard' and tgrelid='public.partner_applications'::regclass) then
 create trigger profession_intake_guard before insert or update of profession on public.partner_applications for each row execute function private.profession_intake_guard();end if;
 if to_regclass('private.expert_applications') is not null and not exists(select 1 from pg_trigger where tgname='profession_intake_guard' and tgrelid=to_regclass('private.expert_applications')) then
 create trigger profession_intake_guard before insert or update of profession on private.expert_applications for each row execute function private.profession_intake_guard();end if;
end$$;
revoke all on function private.profession_intake_guard() from public,anon,authenticated;

revoke all on function private.expert_profession(uuid),private.tax_fee_notice(uuid),private.planner_eligible(uuid) from public,anon,authenticated;
revoke all on function public.profession_catalog(),public.expert_profile_command(text,jsonb),public.early_expert_documents(),public.early_document_service(uuid,text,jsonb),public.early_expert_review(text,jsonb),public.planner_catalog(text,text),public.my_membership(),public.expert_optional_profile(text,jsonb),public.consultation_command(text,jsonb),public.consultation_workspace(text) from public,anon,authenticated;
grant execute on function public.profession_catalog(),public.planner_catalog(text,text) to anon,authenticated;
grant execute on function public.expert_profile_command(text,jsonb),public.early_expert_documents(),public.early_expert_review(text,jsonb),public.my_membership(),public.expert_optional_profile(text,jsonb),public.consultation_command(text,jsonb),public.consultation_workspace(text) to authenticated;
grant execute on function public.early_document_service(uuid,text,jsonb) to service_role;
commit;
