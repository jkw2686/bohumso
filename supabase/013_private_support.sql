begin;
create table if not exists bohumso_test.support_faq(id uuid primary key default gen_random_uuid(),seed_key text unique,question text not null check(length(question) between 2 and 120),answer text not null check(length(answer) between 2 and 1200),keywords text[] not null default '{}',action text not null default 'none' check(action in ('none','reserve','map','situation')),deleted boolean not null default false,revision integer not null default 1,updated_at timestamptz not null default now());
create table if not exists bohumso_test.support_inquiries(id uuid primary key default gen_random_uuid(),owner uuid not null references bohumso_test.actors(id),question text not null check(length(question) between 2 and 1000),request_key uuid not null,answer text,answered_by uuid references bohumso_test.actors(id),answered_at timestamptz,revision integer not null default 1,created_at timestamptz not null default now(),unique(owner,request_key));
insert into bohumso_test.support_faq(seed_key,question,answer,keywords,action) values
('reservation','예약은 어떻게 하나요?','상황을 선택하고 지도에서 보험소나 전문가를 직접 고른 뒤 상담 방식을 정해 신청해 주세요.',array['예약','예약 방법'],'reserve'),
('cost','비용이 있나요?','상담 신청은 무료입니다. 보험 가입 의무도 없습니다.',array['비용','무료','요금','가격'],'none'),
('calls','영업 전화 오나요?','영업 전화 없습니다. 요청하실 때만 연락드려요.',array['영업 전화','영업전화','스팸','전화 오나요'],'none'),
('help','어떤 도움을 받나요?','보험금 청구 관련 문의, 청구 거절·삭감, 사망·상속, 암·중대질병, 후유장해와 보장 점검 상황을 전문가에게 연결해 드려요. 정확한 건 전문가 상담에서 도와드려요.',array['어떤 도움','도움','상담 종류'],'situation'),
('nearby','가까운 보험소 찾기','지도에서 가까운 보험소·전문가를 직접 확인해 보세요. 개설 예정 거점은 예약할 수 없어요.',array['가까운','근처','지도','보험소 찾기'],'map'),
('insurance','보험 가입 상담','보험 가입 상담을 원하시면 상황 선택 후 전문가에게 직접 요청해 주세요. 여기서는 상품을 추천하거나 보험을 판단하지 않아요.',array['보험 가입','보험가입','가입 상담'],'situation') on conflict(seed_key) do nothing;
revoke all on bohumso_test.support_faq,bohumso_test.support_inquiries from public;
create or replace function public.bohumso_support_command(p_actor uuid,p_operation text,p_payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare v_role text;v_f bohumso_test.support_faq;v_i bohumso_test.support_inquiries;v_question text;v_answer text;
begin
 select role into v_role from bohumso_test.actors where id=p_actor for update;
 if v_role is null then raise exception 'test_login_required';end if;
 if p_operation='support_faq' then return coalesce((select jsonb_agg(to_jsonb(f)-'seed_key' order by f.updated_at,f.id) from bohumso_test.support_faq f where not f.deleted),'[]');end if;
 if p_operation='support_mine' then return coalesce((select jsonb_agg(to_jsonb(i) order by i.created_at,i.id) from bohumso_test.support_inquiries i where i.owner=p_actor),'[]');end if;
 if p_operation='support_submit' then
  v_question=trim(coalesce(p_payload->>'question',''));
  if length(v_question) not between 2 and 1000 or p_payload->'consent' is distinct from 'true'::jsonb then raise exception 'support_invalid';end if;
  select * into v_i from bohumso_test.support_inquiries where owner=p_actor and request_key=(p_payload->>'request_key')::uuid;
  if found then if v_i.question<>v_question then raise exception 'request_key_conflict';end if;return to_jsonb(v_i);end if;
  insert into bohumso_test.support_inquiries(owner,question,request_key) values(p_actor,v_question,(p_payload->>'request_key')::uuid) returning * into v_i;
  insert into bohumso_test.audit(actor,target,action) values(p_actor,v_i.id,'support_submitted');return to_jsonb(v_i);
 end if;
 if v_role<>'admin' then raise exception 'admin_required';end if;
 if p_operation='support_admin' then return coalesce((select jsonb_agg(to_jsonb(i) order by (i.answer is null) desc,i.created_at desc) from bohumso_test.support_inquiries i),'[]');end if;
 if p_operation='support_reply' then
  select * into v_i from bohumso_test.support_inquiries where id=(p_payload->>'id')::uuid for update;
  if v_i.id is null or v_i.revision is distinct from (p_payload->>'revision')::integer then raise exception 'stale_revision';end if;
  v_answer=trim(coalesce(p_payload->>'answer',''));if length(v_answer) not between 2 and 1200 then raise exception 'support_invalid';end if;
  update bohumso_test.support_inquiries set answer=v_answer,answered_by=p_actor,answered_at=now(),revision=revision+1 where id=v_i.id returning * into v_i;
  insert into bohumso_test.audit(actor,target,action) values(p_actor,v_i.id,'support_replied');return to_jsonb(v_i);
 end if;
 if p_operation in ('support_faq_save','support_faq_delete') then
  if coalesce(p_payload->>'id','')<>'' then
   select * into v_f from bohumso_test.support_faq where id=(p_payload->>'id')::uuid and not deleted for update;
   if v_f.id is null or v_f.revision is distinct from (p_payload->>'revision')::integer then raise exception 'stale_revision';end if;
  end if;
  if p_operation='support_faq_delete' then
   if v_f.id is null then raise exception 'support_invalid';end if;
   update bohumso_test.support_faq set deleted=true,revision=revision+1,updated_at=now() where id=v_f.id;
   insert into bohumso_test.audit(actor,target,action) values(p_actor,v_f.id,'support_faq_deleted');return '{}';
  end if;
  v_question=trim(coalesce(p_payload->>'question',''));v_answer=trim(coalesce(p_payload->>'answer',''));
  if length(v_question) not between 2 and 120 or length(v_answer) not between 2 and 1200 or coalesce(p_payload->>'action','') not in ('none','reserve','map','situation') or jsonb_typeof(p_payload->'keywords') is distinct from 'array' then raise exception 'support_invalid';end if;
  if jsonb_array_length(p_payload->'keywords')>20 or exists(select 1 from jsonb_array_elements_text(p_payload->'keywords') k where length(trim(k)) not between 1 and 40) then raise exception 'support_invalid';end if;
  if v_f.id is null then
   insert into bohumso_test.support_faq(question,answer,keywords,action) values(v_question,v_answer,array(select jsonb_array_elements_text(p_payload->'keywords')),p_payload->>'action') returning * into v_f;
  else
   update bohumso_test.support_faq set question=v_question,answer=v_answer,keywords=array(select jsonb_array_elements_text(p_payload->'keywords')),action=p_payload->>'action',revision=revision+1,updated_at=now() where id=v_f.id returning * into v_f;
  end if;
  insert into bohumso_test.audit(actor,target,action) values(p_actor,v_f.id,'support_faq_saved');return to_jsonb(v_f);
 end if;
 raise exception 'unknown_operation';
end $$;
revoke all on function public.bohumso_support_command(uuid,text,jsonb) from public;
do $$ declare api_role text;begin
 foreach api_role in array array['anon','authenticated'] loop
  if exists(select 1 from pg_roles where rolname=api_role) then
   execute format('revoke all on function public.bohumso_support_command(uuid,text,jsonb) from %I',api_role);
   execute format('revoke all on bohumso_test.support_faq,bohumso_test.support_inquiries from %I',api_role);
  end if;
 end loop;
 if exists(select 1 from pg_roles where rolname='service_role') then grant execute on function public.bohumso_support_command(uuid,text,jsonb) to service_role;end if;
end $$;
commit;
