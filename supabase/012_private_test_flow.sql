-- Isolated synthetic-data schema. No production tables are changed.
begin;
create schema if not exists bohumso_test;
revoke all on schema bohumso_test from public;
create table if not exists bohumso_test.actors(id uuid primary key default gen_random_uuid(),role text not null check(role in ('customer','expert','admin')),name text not null,is_test boolean not null default true check(is_test));
create table if not exists bohumso_test.experts(id uuid primary key references bohumso_test.actors(id),profession text not null check(profession in ('planner','adjuster')),name text not null,organization text not null,region text not null check(region in ('마포구','송파구','분당구')),registration text not null default '',specialties text[] not null default '{}',bio text not null default '',status text not null default 'unverified' check(status in ('unverified','pending','needs_changes','rejected','verified')),pledge_version text not null,agreed_at timestamptz not null default now(),sanction text check(sanction in ('warning','suspended','banned')),suspended_until timestamptz,revision integer not null default 1,reason text,created_at timestamptz not null default now(),latitude double precision not null,longitude double precision not null,rating numeric,check(length(name) between 2 and 60),check(length(organization) between 2 and 120),check(length(bio)<=600));
create table if not exists bohumso_test.documents(id uuid primary key default gen_random_uuid(),owner uuid not null references bohumso_test.actors(id),kind text not null check(kind in ('identity','qualification')),filename text not null,mime text not null check(mime in ('image/png','image/jpeg','application/pdf')),data text not null check(length(data)<=5592408),consented_at timestamptz not null default now(),unique(owner,kind));
create table if not exists bohumso_test.requests(id uuid primary key default gen_random_uuid(),customer uuid not null references bohumso_test.actors(id),expert uuid not null references bohumso_test.experts(id),situation text not null check(situation in ('death','cancer','denial','disability','other')),method text not null check(method in ('office','visit','remote')),region text not null,expert_name text not null,state text not null default 'new' check(state in ('new','delivered','completed')),revision integer not null default 1,request_key uuid not null,created_at timestamptz not null default now(),unique(customer,request_key));
create table if not exists bohumso_test.audit(id bigint generated always as identity primary key,actor uuid not null,target uuid not null,action text not null,reason text not null default '',at timestamptz not null default now());
revoke all on all tables in schema bohumso_test from public;
insert into bohumso_test.actors(id,role,name) values('10000000-1111-4000-8000-000000000001','customer','가상 소비자'),('30000000-1111-4000-8000-000000000001','admin','테스트 관리자'),('20000000-1111-4000-8000-000000000001','expert','가상 손해사정사 김도움'),('20000000-1111-4000-8000-000000000002','expert','가상 설계사 이안심') on conflict do nothing;
insert into bohumso_test.experts(id,profession,name,organization,region,registration,specialties,bio,status,pledge_version,latitude,longitude,rating) values
('20000000-1111-4000-8000-000000000001','adjuster','가상 김도움','샘플 손해사정 사무소','마포구','TEST-ADJ-01',array['denial','disability'],'가상 전문가 프로필입니다. 실제 자격 확인·상담 대상이 아닙니다.','verified','consumer-protection-2026-09-26-v2',37.555,126.923,4.8),
('20000000-1111-4000-8000-000000000002','planner','가상 이안심','샘플 보험대리점','마포구','TEST-PLAN-02',array['death','cancer'],'가상 전문가 프로필입니다. 실제 자격 확인·상담 대상이 아닙니다.','verified','consumer-protection-2026-09-26-v2',37.561,126.939,4.7) on conflict do nothing;
-- 거점(보험소) 모델 — additive(기존 expert/request 흐름 유지). 소비자는 거점을 골라 예약, 거점이 전문가 배정.
alter table bohumso_test.actors drop constraint if exists actors_role_check;
alter table bohumso_test.actors add constraint actors_role_check check(role in ('customer','expert','admin','branch'));
create table if not exists bohumso_test.branches(id uuid primary key default gen_random_uuid(),operator uuid references bohumso_test.actors(id),name text not null,district text not null,address text not null default '',contact text not null default '',pledge_version text not null default 'consumer-protection-2026-09-26-v2',latitude double precision not null,longitude double precision not null,created_at timestamptz not null default now(),check(length(name) between 2 and 80));
alter table bohumso_test.experts add column if not exists branch uuid references bohumso_test.branches(id);
create table if not exists bohumso_test.bookings(id uuid primary key default gen_random_uuid(),customer uuid not null references bohumso_test.actors(id),branch uuid not null references bohumso_test.branches(id),situation text not null check(situation in ('death','cancer','denial','disability','other')),method text not null check(method in ('office','visit','remote')),preferred_date text not null default '',preferred_slot text not null default '',name text not null default '',phone text not null default '',assigned_expert uuid references bohumso_test.experts(id),state text not null default 'new' check(state in ('new','assigned','completed')),request_key uuid not null,revision integer not null default 1,created_at timestamptz not null default now(),unique(customer,request_key));
insert into bohumso_test.actors(id,role,name) values
 ('40000000-1111-4000-8000-000000000001','branch','마포 보험소 운영자'),
 ('40000000-1111-4000-8000-000000000002','branch','송파 보험소 운영자'),
 ('40000000-1111-4000-8000-000000000003','branch','분당 보험소 운영자'),
 ('40000000-1111-4000-8000-000000000004','branch','수정구 보험소 운영자') on conflict do nothing;
insert into bohumso_test.branches(id,operator,name,district,address,contact,latitude,longitude) values
 ('50000000-1111-4000-8000-000000000001','40000000-1111-4000-8000-000000000001','마포 보험소','마포구','서울 마포구 월드컵로 (가상)','02-000-0001',37.556,126.923),
 ('50000000-1111-4000-8000-000000000002','40000000-1111-4000-8000-000000000002','송파 보험소','송파구','서울 송파구 올림픽로 (가상)','02-000-0002',37.514,127.106),
 ('50000000-1111-4000-8000-000000000003','40000000-1111-4000-8000-000000000003','분당 보험소','분당구','경기 성남시 분당구 (가상)','031-000-0003',37.382,127.119),
 ('50000000-1111-4000-8000-000000000004','40000000-1111-4000-8000-000000000004','수정구 보험소','수정구','경기 성남시 수정구 (가상)','031-000-0004',37.450,127.145) on conflict do nothing;
update bohumso_test.experts set branch='50000000-1111-4000-8000-000000000001' where id in ('20000000-1111-4000-8000-000000000001','20000000-1111-4000-8000-000000000002') and branch is null;
create or replace function public.bohumso_test_command(actor uuid,operation text,payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare who bohumso_test.actors; e bohumso_test.experts; r bohumso_test.requests; d bohumso_test.documents; br bohumso_test.branches; bk bohumso_test.bookings; target uuid; decision text; region_value text; result jsonb; revision_value integer;
begin
 select * into who from bohumso_test.actors where id=actor for update;
 if who.id is null then raise exception 'test_login_required';end if;
 if operation='session' then return to_jsonb(who);end if;
 if operation='new_expert' then
  if who.role<>'admin' then raise exception 'admin_required';end if;
  insert into bohumso_test.actors(role,name) values('expert','새 가상 전문가') returning * into who;return to_jsonb(who);
 end if;
 if operation='catalog' then
  return coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'profession',x.profession,'name',x.name,'organization',x.organization,'region',x.region,'specialties',x.specialties,'bio',x.bio,'latitude',x.latitude,'longitude',x.longitude,'rating',x.rating,'pledge',x.sanction is null,'is_test',true) order by x.name) from bohumso_test.experts x where x.status='verified' and x.profession in ('planner','adjuster') and x.sanction is distinct from 'banned' and not coalesce(x.sanction='suspended' and x.suspended_until>now(),false) and (coalesce(payload->>'region','')='' or x.region=payload->>'region')),'[]');
 end if;
 if operation='branch_catalog' then
  return coalesce((select jsonb_agg(jsonb_build_object('id',b.id,'name',b.name,'district',b.district,'address',b.address,'contact',b.contact,'latitude',b.latitude,'longitude',b.longitude,'pledge',true,'no_cold_calls',true,'expert_count',(select count(*) from bohumso_test.experts x where x.branch=b.id and x.status='verified' and x.sanction is distinct from 'banned' and not coalesce(x.sanction='suspended' and x.suspended_until>now(),false)),'is_test',true) order by b.district,b.name) from bohumso_test.branches b where (coalesce(payload->>'district','')='' or b.district=payload->>'district')),'[]');
 end if;
 if operation='workspace' then
  return jsonb_build_object('actor',to_jsonb(who),'expert',(select to_jsonb(x) from bohumso_test.experts x where id=actor),'documents',(select coalesce(jsonb_agg(to_jsonb(x)-'data'),'[]') from bohumso_test.documents x where owner=actor),'requests',(select coalesce(jsonb_agg(to_jsonb(x) order by created_at desc),'[]') from bohumso_test.requests x where customer=actor),'history',(select coalesce(jsonb_agg(to_jsonb(x) order by id desc),'[]') from bohumso_test.audit x where x.target=actor));
 end if;
 if operation='register' or operation='profile' then
  if who.role<>'expert' then raise exception 'expert_required';end if;
  select * into e from bohumso_test.experts where id=actor for update;
  if e.sanction='banned' then raise exception 'application_locked';end if;
  if operation='register' and e.id is not null then raise exception 'already_registered';end if;
  if operation='profile' and (e.id is null or e.revision is distinct from (payload->>'revision')::integer) then raise exception 'stale_revision';end if;
  if coalesce(payload->>'profession','') not in ('planner','adjuster') or coalesce(payload->>'region','') not in ('마포구','송파구','분당구') or length(trim(coalesce(payload->>'name',''))) not between 2 and 60 or length(trim(coalesce(payload->>'organization',''))) not between 2 and 120 or length(coalesce(payload->>'bio',''))>600 then raise exception 'invalid_profile';end if;
  if coalesce(payload->>'registration','')<>'' and (payload->>'registration' !~ '^[A-Za-z0-9][A-Za-z0-9 -]{2,39}$' or payload->>'registration' ~ '[0-9]{6}[ -]?[1-8][0-9]{6}') then raise exception 'invalid_registration';end if;
  if jsonb_typeof(payload->'specialties') is distinct from 'array' or exists(select 1 from jsonb_array_elements_text(payload->'specialties') s where s not in ('death','cancer','denial','disability','other')) then raise exception 'invalid_specialty';end if;
  if operation='register' and (payload->'agreements' is distinct from '[true,true,true]'::jsonb or payload->>'agreement_version' is distinct from 'consumer-protection-2026-09-26-v2') then raise exception 'pledge_required';end if;
  region_value=payload->>'region';
  if operation='register' then
   insert into bohumso_test.experts(id,profession,name,organization,region,registration,specialties,bio,pledge_version,latitude,longitude) values(actor,payload->>'profession',trim(payload->>'name'),trim(payload->>'organization'),region_value,coalesce(payload->>'registration',''),array(select jsonb_array_elements_text(payload->'specialties')),coalesce(payload->>'bio',''),payload->>'agreement_version',case region_value when '마포구' then 37.552 when '송파구' then 37.514 else 37.382 end,case region_value when '마포구' then 126.933 when '송파구' then 127.106 else 127.119 end) returning * into e;
  else
   update bohumso_test.experts set status=case when e.name<>trim(payload->>'name') or e.organization<>trim(payload->>'organization') or e.profession<>payload->>'profession' or e.registration<>coalesce(payload->>'registration','') then 'unverified' else e.status end,profession=payload->>'profession',name=trim(payload->>'name'),organization=trim(payload->>'organization'),region=region_value,registration=coalesce(payload->>'registration',''),specialties=array(select jsonb_array_elements_text(payload->'specialties')),bio=coalesce(payload->>'bio',''),latitude=case region_value when '마포구' then 37.552 when '송파구' then 37.514 else 37.382 end,longitude=case region_value when '마포구' then 126.933 when '송파구' then 127.106 else 127.119 end,revision=revision+1 where id=actor returning * into e;
  end if;
  insert into bohumso_test.audit(actor,target,action) values(actor,actor,operation);return to_jsonb(e);
 end if;
 if operation in ('upload','delete_document','submit_review') then
  if who.role<>'expert' then raise exception 'expert_required';end if;
  select * into e from bohumso_test.experts where id=actor for update;
  if e.sanction='banned' and operation<>'delete_document' then raise exception 'application_locked';end if;
  if operation='upload' then
   if payload->'consent' is distinct from 'true'::jsonb or payload->'masked' is distinct from 'true'::jsonb then raise exception 'document_consent_required';end if;
   if coalesce(payload->>'kind','') not in ('identity','qualification') or coalesce(payload->>'mime','') not in ('image/png','image/jpeg','application/pdf') or length(coalesce(payload->>'data','')) not between 8 and 5592408 or length(coalesce(payload->>'filename','')) not between 1 and 120 then raise exception 'invalid_document';end if;
   insert into bohumso_test.documents(owner,kind,filename,mime,data) values(actor,payload->>'kind',payload->>'filename',payload->>'mime',payload->>'data') on conflict(owner,kind) do update set filename=excluded.filename,mime=excluded.mime,data=excluded.data,consented_at=now() returning * into d;
   update bohumso_test.experts set status='unverified',revision=revision+1 where id=actor;
   result=to_jsonb(d)-'data';
  elsif operation='delete_document' then
   delete from bohumso_test.documents where id=(payload->>'id')::uuid and owner=actor;
   if not found then raise exception 'document_forbidden';end if;
   update bohumso_test.experts set status=case when status='verified' then status else 'unverified' end,revision=revision+1 where id=actor;result='{}';
  else
   if e.id is null or e.revision is distinct from (payload->>'revision')::integer then raise exception 'stale_revision';end if;
   if e.status='verified' then raise exception 'already_verified';end if;
   if (select count(*) from bohumso_test.documents where owner=actor)<>2 or e.registration='' then raise exception 'documents_required';end if;
   update bohumso_test.experts set status='pending',reason=null,revision=revision+1 where id=actor returning * into e;result=to_jsonb(e);
  end if;
  insert into bohumso_test.audit(actor,target,action) values(actor,actor,operation);return result;
 end if;
 if operation='request' then
  if who.role<>'customer' then raise exception 'customer_required';end if;
  if payload->'consent' is distinct from 'true'::jsonb then raise exception 'request_consent_required';end if;
  select * into r from bohumso_test.requests where customer=actor and request_key=(payload->>'request_key')::uuid;
  if found then
   if r.expert is distinct from (payload->>'expert')::uuid or r.method is distinct from payload->>'method' or r.situation is distinct from payload->>'situation' then raise exception 'request_key_conflict';end if;return to_jsonb(r);
  end if;
  select * into e from bohumso_test.experts where id=(payload->>'expert')::uuid for update;
  if e.id is null or e.status<>'verified' or e.sanction='banned' or coalesce(e.sanction='suspended' and e.suspended_until>now(),false) then raise exception 'expert_unavailable';end if;
  if coalesce(payload->>'situation','') not in ('death','cancer','denial','disability','other') or coalesce(payload->>'method','') not in ('office','visit','remote') then raise exception 'invalid_request';end if;
  insert into bohumso_test.requests(customer,expert,situation,method,region,expert_name,request_key) values(actor,e.id,payload->>'situation',payload->>'method',e.region,e.name,(payload->>'request_key')::uuid) returning * into r;
  insert into bohumso_test.audit(actor,target,action) values(actor,r.id,'request_created');return to_jsonb(r);
 end if;
 if operation='branch_detail' then
  select * into br from bohumso_test.branches where id=(payload->>'id')::uuid;
  if br.id is null then raise exception 'branch_unavailable';end if;
  return to_jsonb(br)||jsonb_build_object('pledge',true,'no_cold_calls',true,'experts',(select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'name',x.name,'profession',x.profession) order by x.name),'[]') from bohumso_test.experts x where x.branch=br.id and x.status='verified' and x.sanction is distinct from 'banned' and not coalesce(x.sanction='suspended' and x.suspended_until>now(),false)),'expert_count',(select count(*) from bohumso_test.experts x where x.branch=br.id and x.status='verified' and x.sanction is distinct from 'banned' and not coalesce(x.sanction='suspended' and x.suspended_until>now(),false)));
 end if;
 if operation='book' then
  if who.role<>'customer' then raise exception 'customer_required';end if;
  if payload->'consent' is distinct from 'true'::jsonb then raise exception 'request_consent_required';end if;
  select * into bk from bohumso_test.bookings where customer=actor and request_key=(payload->>'request_key')::uuid;
  if found then
   if bk.branch is distinct from (payload->>'branch')::uuid or bk.method is distinct from payload->>'method' or bk.situation is distinct from payload->>'situation' then raise exception 'request_key_conflict';end if;return to_jsonb(bk);
  end if;
  select * into br from bohumso_test.branches where id=(payload->>'branch')::uuid;
  if br.id is null then raise exception 'branch_unavailable';end if;
  if coalesce(payload->>'situation','') not in ('death','cancer','denial','disability','other') or coalesce(payload->>'method','') not in ('office','visit','remote') then raise exception 'invalid_request';end if;
  insert into bohumso_test.bookings(customer,branch,situation,method,preferred_date,preferred_slot,name,phone,request_key) values(actor,br.id,payload->>'situation',payload->>'method',coalesce(payload->>'preferred_date',''),coalesce(payload->>'preferred_slot',''),coalesce(payload->>'name',''),coalesce(payload->>'phone',''),(payload->>'request_key')::uuid) returning * into bk;
  insert into bohumso_test.audit(actor,target,action) values(actor,bk.id,'booking_created');return to_jsonb(bk);
 end if;
 if operation in ('branch_workspace','branch_bookings','assign_expert','booking_state') then
  if who.role<>'branch' then raise exception 'branch_required';end if;
  select * into br from bohumso_test.branches where operator=actor;
  if br.id is null then raise exception 'branch_required';end if;
  if operation in ('branch_workspace','branch_bookings') then
   result=jsonb_build_object('branch',to_jsonb(br),'bookings',(select coalesce(jsonb_agg(to_jsonb(x)||jsonb_build_object('assigned_expert_name',(select y.name from bohumso_test.experts y where y.id=x.assigned_expert)) order by x.created_at desc),'[]') from bohumso_test.bookings x where x.branch=br.id),'experts',(select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'name',x.name,'profession',x.profession,'status',x.status) order by x.name),'[]') from bohumso_test.experts x where x.branch=br.id));
   return result;
  end if;
  select * into bk from bohumso_test.bookings where id=(payload->>'id')::uuid for update;
  if bk.id is null or bk.branch is distinct from br.id then raise exception 'booking_forbidden';end if;
  if bk.revision is distinct from (payload->>'revision')::integer then raise exception 'stale_revision';end if;
  if operation='assign_expert' then
   select * into e from bohumso_test.experts where id=(payload->>'expert')::uuid;
   if e.id is null or e.branch is distinct from br.id or e.status<>'verified' then raise exception 'expert_forbidden';end if;
   update bohumso_test.bookings set assigned_expert=e.id,state='assigned',revision=revision+1 where id=bk.id returning * into bk;
   insert into bohumso_test.audit(actor,target,action,reason) values(actor,bk.id,'assigned',e.name);
  else
   if coalesce(payload->>'state','') not in ('new','assigned','completed') then raise exception 'invalid_state';end if;
   update bohumso_test.bookings set state=payload->>'state',revision=revision+1 where id=bk.id returning * into bk;
   insert into bohumso_test.audit(actor,target,action,reason) values(actor,bk.id,'booking:'||bk.state,'거점 수기 상태 기록 · 자동 발송 없음');
  end if;
  return to_jsonb(bk)||jsonb_build_object('assigned_expert_name',(select y.name from bohumso_test.experts y where y.id=bk.assigned_expert));
 end if;
 if operation in ('admin_list','review','sanction','intake','document') then
  if who.role<>'admin' then raise exception 'admin_required';end if;
  if operation='admin_list' then return jsonb_build_object('experts',(select coalesce(jsonb_agg(to_jsonb(x)||jsonb_build_object('documents',(select coalesce(jsonb_agg(to_jsonb(docrow)-'data'),'[]') from bohumso_test.documents docrow where docrow.owner=x.id),'history',(select coalesce(jsonb_agg(to_jsonb(a) order by a.id desc),'[]') from bohumso_test.audit a where a.target=x.id)) order by x.created_at desc),'[]') from bohumso_test.experts x),'requests',(select coalesce(jsonb_agg(to_jsonb(x) order by created_at desc),'[]') from bohumso_test.requests x),'branches',(select coalesce(jsonb_agg(jsonb_build_object('id',b.id,'name',b.name,'district',b.district,'address',b.address,'expert_count',(select count(*) from bohumso_test.experts x where x.branch=b.id)) order by b.district,b.name),'[]') from bohumso_test.branches b),'bookings',(select coalesce(jsonb_agg(to_jsonb(x)||jsonb_build_object('branch_name',(select b.name from bohumso_test.branches b where b.id=x.branch),'assigned_expert_name',(select y.name from bohumso_test.experts y where y.id=x.assigned_expert)) order by x.created_at desc),'[]') from bohumso_test.bookings x));end if;
  if operation='document' then select * into d from bohumso_test.documents where id=(payload->>'id')::uuid;if not found then raise exception 'document_missing';end if;insert into bohumso_test.audit(actor,target,action) values(actor,d.owner,'document_viewed');return to_jsonb(d);end if;
  if operation='intake' then
   select * into r from bohumso_test.requests where id=(payload->>'id')::uuid for update;
   if r.id is null or r.revision is distinct from (payload->>'revision')::integer then raise exception 'stale_revision';end if;
   if coalesce(payload->>'state','') not in ('new','delivered','completed') then raise exception 'invalid_state';end if;
   update bohumso_test.requests set state=payload->>'state',revision=revision+1 where id=r.id returning * into r;insert into bohumso_test.audit(actor,target,action,reason) values(actor,r.id,'intake:'||r.state,'관리자 수기 상태 기록 · 자동 발송 없음');return to_jsonb(r);
  end if;
  target=(payload->>'id')::uuid;select * into e from bohumso_test.experts where id=target for update;
  if e.id is null or e.revision is distinct from (payload->>'revision')::integer then raise exception 'stale_revision';end if;
  if length(trim(coalesce(payload->>'reason',''))) not between 5 and 1000 then raise exception 'reason_required';end if;
  decision=payload->>'decision';
  if operation='review' then
   if e.status<>'pending' or coalesce(decision,'') not in ('verified','needs_changes','rejected') then raise exception 'invalid_transition';end if;
   if decision='verified' and ((select count(*) from bohumso_test.documents where owner=target)<>2 or e.registration='' or payload->'checked' is distinct from 'true'::jsonb) then raise exception 'verification_required';end if;
   update bohumso_test.experts set status=decision,reason=trim(payload->>'reason'),revision=revision+1 where id=target returning * into e;
  else
   if e.status<>'verified' or e.sanction='banned' or coalesce(decision,'') not in ('warning','suspended','banned') then raise exception 'invalid_transition';end if;
   if decision='warning' and e.sanction is not null then raise exception 'invalid_transition';end if;
   if decision='suspended' and (e.sanction is distinct from 'warning' or (payload->>'until')::timestamptz is null or (payload->>'until')::timestamptz<=now()) then raise exception 'invalid_period';end if;
   if decision='banned' and e.sanction is distinct from 'suspended' then raise exception 'invalid_transition';end if;
   update bohumso_test.experts set sanction=decision,suspended_until=case when decision='suspended' then (payload->>'until')::timestamptz else null end,reason=trim(payload->>'reason'),revision=revision+1 where id=target returning * into e;
  end if;
  insert into bohumso_test.audit(actor,target,action,reason) values(actor,target,operation||':'||decision,trim(payload->>'reason'));return to_jsonb(e);
 end if;
 raise exception 'unknown_operation';
end $$;
revoke all on function public.bohumso_test_command(uuid,text,jsonb) from public;
-- Supabase default privileges may grant API roles directly; PUBLIC revocation alone is insufficient.
do $$ declare api_role text;begin
 foreach api_role in array array['anon','authenticated'] loop
  if exists(select 1 from pg_roles where rolname=api_role) then
   execute format('revoke all on function public.bohumso_test_command(uuid,text,jsonb) from %I',api_role);
   execute format('revoke all on schema bohumso_test from %I',api_role);
   execute format('revoke all on all tables in schema bohumso_test from %I',api_role);
   execute format('revoke all on all sequences in schema bohumso_test from %I',api_role);
  end if;
 end loop;
 if exists(select 1 from pg_roles where rolname='service_role') then grant execute on function public.bohumso_test_command(uuid,text,jsonb) to service_role;end if;
end $$;
commit;
