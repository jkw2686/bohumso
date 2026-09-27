begin;
create table if not exists bohumso_test.contact_cases(id uuid primary key,customer uuid not null references bohumso_test.actors,expert uuid references bohumso_test.experts,branch uuid references bohumso_test.branches,phone text,consent_version text not null,consented_at timestamptz not null default now(),state text not null default 'new' check(state in ('new','contacted','completed')),revision int not null default 1,created_at timestamptz not null default now(),completed_at timestamptz,erased_at timestamptz);
create table if not exists bohumso_test.contact_reviews(case_id uuid primary key references bohumso_test.contact_cases,stars int not null check(stars between 1 and 5),sales boolean not null,money boolean not null,helpful boolean not null,body text not null check(length(body)<=1000),created_at timestamptz not null default now());
create table if not exists bohumso_test.contact_reports(id uuid primary key default gen_random_uuid(),case_id uuid not null references bohumso_test.contact_cases,source text not null,reason text not null,decision text,reviewed_by uuid,reviewed_at timestamptz,created_at timestamptz not null default now(),unique(case_id,source));
create or replace function bohumso_test.redact_contact(value jsonb) returns jsonb language sql immutable set search_path='' as $$
select case jsonb_typeof(value) when 'object' then coalesce((select jsonb_object_agg(key,bohumso_test.redact_contact(val)) from jsonb_each(value) as t(key,val) where key<>'phone'),'{}') when 'array' then coalesce((select jsonb_agg(bohumso_test.redact_contact(val)) from jsonb_array_elements(value) as t(val)),'[]') else value end
$$;
create or replace function public.bohumso_contact_command(actor uuid,operation text,payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare who bohumso_test.actors;c bohumso_test.contact_cases;result jsonb;target uuid;phone_value text;expert_value uuid;branch_value uuid;
begin
select * into who from bohumso_test.actors where id=actor for update;if who.id is null then raise exception 'test_login_required';end if;
if operation in ('request','book') then
 if who.role<>'customer' then raise exception 'customer_required';end if;
 phone_value=regexp_replace(coalesce(payload->>'contact_phone',''),'[^0-9]','','g');
 if phone_value !~ '^0100000[0-9]{4}$' or payload->>'contact_version' is distinct from 'single-recipient-2026-09-28' or payload->'contact_consent' is distinct from 'true'::jsonb then raise exception 'contact_consent_required';end if;
 if operation='book' then
 if coalesce(payload->>'preferred_slot','') !~ '^(10|11|12|13|14|15|16|17):00$' or coalesce(payload->>'preferred_date','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'invalid_booking_time';end if;
 if ((payload->>'preferred_date')::date+(payload->>'preferred_slot')::time) at time zone 'Asia/Seoul' <= now() then raise exception 'invalid_booking_time';end if;
 end if;
 result=public.bohumso_test_command(actor,operation,(payload-'phone')||jsonb_build_object('phone',''));
 target=(result->>'id')::uuid;
 select * into c from bohumso_test.contact_cases where id=target for update;
 if found then if c.phone is distinct from phone_value and c.erased_at is null then raise exception 'request_key_conflict';end if;return result;end if;
 insert into bohumso_test.contact_cases(id,customer,expert,branch,phone,consent_version) values(target,actor,case when operation='request' then (payload->>'expert')::uuid end,case when operation='book' then (payload->>'branch')::uuid end,phone_value,'single-recipient-2026-09-28');
 insert into bohumso_test.audit(actor,target,action,reason) values(actor,target,'contact_consent','single-recipient-2026-09-28');return result;
end if;
if operation='assign_expert' then
 select * into c from bohumso_test.contact_cases where id=(payload->>'id')::uuid for update;
 if c.id is not null and c.expert is not null and c.expert is distinct from (payload->>'expert')::uuid then raise exception 'contact_reassignment_forbidden';end if;
 result=public.bohumso_test_command(actor,operation,payload);
 if c.id is not null then
 if not exists(select 1 from bohumso_test.experts e where e.id=(payload->>'expert')::uuid and e.sanction is distinct from 'banned' and not coalesce(e.sanction='suspended' and e.suspended_until>now(),false)) then raise exception 'expert_unavailable';end if;
 update bohumso_test.contact_cases set expert=(payload->>'expert')::uuid,revision=revision+1 where id=c.id;
 end if;return result;
end if;
if operation in ('request_state','booking_state','intake') and exists(select 1 from bohumso_test.contact_cases where id=(payload->>'id')::uuid) then raise exception 'contact_use_workflow';end if;
if operation='contact_list' then
 return coalesce((select jsonb_agg((to_jsonb(x)-'phone')||jsonb_build_object('expert_name',e.name,'review',(select to_jsonb(r) from bohumso_test.contact_reviews r where r.case_id=x.id),'overdue',x.state='new' and x.created_at<now()-interval '24 hours') order by x.created_at desc) from bohumso_test.contact_cases x left join bohumso_test.experts e on e.id=x.expert where x.customer=actor or x.expert=actor or who.role='admin' or exists(select 1 from bohumso_test.branches b where b.id=x.branch and b.operator=actor)),'[]');
end if;
if operation='contact_admin' then
 if who.role<>'admin' then raise exception 'admin_required';end if;
 return jsonb_build_object('logs',(select coalesce(jsonb_agg(to_jsonb(a) order by a.at desc),'[]') from bohumso_test.audit a where a.action like 'contact_%'),'reports',(select coalesce(jsonb_agg(to_jsonb(r)||jsonb_build_object('expert',cc2.expert,'expert_name',e.name) order by r.created_at desc),'[]') from bohumso_test.contact_reports r join bohumso_test.contact_cases cc2 on cc2.id=r.case_id left join bohumso_test.experts e on e.id=cc2.expert),'reviews',(select coalesce(jsonb_agg(to_jsonb(r)),'[]') from bohumso_test.contact_reviews r),'flags',(select coalesce(jsonb_agg(jsonb_build_object('expert',e.id,'name',e.name,'rating',e.rating,'review_count',(select count(*) from bohumso_test.contact_reviews r join bohumso_test.contact_cases cc2 on cc2.id=r.case_id where cc2.expert=e.id),'suspected_reports',(select count(*) from bohumso_test.contact_reports r join bohumso_test.contact_cases cc2 on cc2.id=r.case_id where cc2.expert=e.id and r.decision is distinct from 'dismissed'))),'[]') from bohumso_test.experts e where ((select count(*) from bohumso_test.contact_reviews r join bohumso_test.contact_cases cc2 on cc2.id=r.case_id where cc2.expert=e.id)>=3 and e.rating<3) or (select count(*) from bohumso_test.contact_reports r join bohumso_test.contact_cases cc2 on cc2.id=r.case_id where cc2.expert=e.id and r.decision is distinct from 'dismissed')>=2));
end if;
if operation='contact_report_review' then
 if who.role<>'admin' or coalesce(payload->>'decision','') not in ('confirmed','dismissed') or length(trim(coalesce(payload->>'reason','')))<5 then raise exception 'reason_required';end if;
 update bohumso_test.contact_reports set decision=payload->>'decision',reviewed_by=actor,reviewed_at=now() where id=(payload->>'id')::uuid and decision is null;
 if not found then raise exception 'stale_revision';end if;
 insert into bohumso_test.audit(actor,target,action,reason) values(actor,(payload->>'id')::uuid,'contact_report_review',payload->>'reason');return '{}';
end if;
if operation like 'contact_%' then
 select * into c from bohumso_test.contact_cases where id=(payload->>'id')::uuid for update;if c.id is null then raise exception 'request_forbidden';end if;
 if operation='contact_view' then
 if who.role<>'expert' or c.expert is distinct from actor then raise exception 'request_forbidden';end if;
 if c.phone is null then return jsonb_build_object('phone',null);end if;
 insert into bohumso_test.audit(actor,target,action) values(actor,c.id,'contact_view');return jsonb_build_object('phone',c.phone);
 elsif operation='contact_state' then
 if c.expert is distinct from actor or who.role<>'expert' then raise exception 'request_forbidden';end if;
 if c.revision is distinct from (payload->>'revision')::int then raise exception 'stale_revision';end if;
 if not (c.state='new' and payload->>'state'='contacted' or c.state='contacted' and payload->>'state'='completed') then raise exception 'invalid_transition';end if;
 update bohumso_test.contact_cases set state=payload->>'state',revision=revision+1,completed_at=case when payload->>'state'='completed' then now() end where id=c.id;
 update bohumso_test.requests set state=case when payload->>'state'='completed' then 'completed' else 'delivered' end,revision=revision+1 where id=c.id;
 update bohumso_test.bookings set state=case when payload->>'state'='completed' then 'completed' else 'assigned' end,revision=revision+1 where id=c.id;
 insert into bohumso_test.audit(actor,target,action) values(actor,c.id,'contact_'||(payload->>'state'));return '{}';
 elsif operation='contact_erase' then
 if c.customer is distinct from actor and who.role<>'admin' then raise exception 'request_forbidden';end if;
 update bohumso_test.contact_cases set phone=null,erased_at=now(),revision=revision+1 where id=c.id;
 insert into bohumso_test.audit(actor,target,action) values(actor,c.id,'contact_erased');return '{}';
 elsif operation in ('contact_survey','contact_report') then
 if c.customer is distinct from actor then raise exception 'request_forbidden';end if;
 if operation='contact_survey' then
 if c.state<>'completed' then raise exception 'invalid_transition';end if;
 if jsonb_typeof(payload->'sales') is distinct from 'boolean' or jsonb_typeof(payload->'money') is distinct from 'boolean' or jsonb_typeof(payload->'helpful') is distinct from 'boolean' then raise exception 'invalid_request';end if;
 insert into bohumso_test.contact_reviews values(c.id,(payload->>'stars')::int,(payload->>'sales')::boolean,(payload->>'money')::boolean,(payload->>'helpful')::boolean,coalesce(payload->>'body',''),now());
 update bohumso_test.experts set rating=(select round(avg(r.stars),2) from bohumso_test.contact_reviews r join bohumso_test.contact_cases cc on cc.id=r.case_id where cc.expert=c.expert),revision=revision+1 where id=c.expert;
 if (payload->>'sales')::boolean or (payload->>'money')::boolean then insert into bohumso_test.contact_reports(case_id,source,reason) values(c.id,'survey','사후 설문: 권유='||(payload->>'sales')||', 금전요구='||(payload->>'money'));end if;
 else
 if length(trim(coalesce(payload->>'reason',''))) not between 5 and 1000 then raise exception 'reason_required';end if;
 insert into bohumso_test.contact_reports(case_id,source,reason) values(c.id,'direct',trim(payload->>'reason'));
 end if;return '{}';
 end if;
 raise exception 'unknown_operation';
end if;
return bohumso_test.redact_contact(public.bohumso_test_command(actor,operation,payload));
end $$;
revoke all on bohumso_test.contact_cases,bohumso_test.contact_reviews,bohumso_test.contact_reports from public;
revoke all on function public.bohumso_contact_command(uuid,text,jsonb) from public;
do $$ declare r text;begin foreach r in array array['anon','authenticated'] loop if exists(select 1 from pg_roles where rolname=r) then execute format('revoke all on function public.bohumso_contact_command(uuid,text,jsonb) from %I',r);execute format('revoke all on all tables in schema bohumso_test from %I',r);end if;end loop;if exists(select 1 from pg_roles where rolname='service_role') then grant execute on function public.bohumso_contact_command(uuid,text,jsonb) to service_role;end if;end $$;
commit;