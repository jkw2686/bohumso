-- 015_test_accounts.sql
-- 실운영 상태를 유지하면서 내부 테스트 계정/데이터를 분리한다.
-- 전부 additive(기존 컬럼·데이터·권한 불변) + 트리거 + 함수 교체. 트랜잭션으로 감싼다.
begin;

-- 1) is_test 컬럼 (default false → 기존 행은 모두 실데이터로 유지)
alter table public.member_profiles      add column if not exists is_test boolean not null default false;
alter table public.partner_applications add column if not exists is_test boolean not null default false;
alter table private.expert_applications add column if not exists is_test boolean not null default false;
alter table private.planner_directory   add column if not exists is_test boolean not null default false;
alter table private.consultations        add column if not exists is_test boolean not null default false;
alter table private.service_requests     add column if not exists is_test boolean not null default false;

-- 2) 테스트 이메일 목록 (어드민이 관리) + 판정 함수
create table if not exists private.test_emails(
 email text primary key check(email = lower(email)),
 note text not null default '',
 added_by uuid,
 created_at timestamptz not null default now()
);
revoke all on private.test_emails from public, anon, authenticated;

create or replace function private.email_is_test(uid uuid) returns boolean
 language sql stable security definer set search_path='' as $$
 select exists(
   select 1 from private.test_emails t
   join auth.users u on lower(u.email) = t.email
   where u.id = uid
 )
$$;

-- 3) 계정 가입 시 자동 플래그 (member / partner / expert)
create or replace function private.tag_account_is_test() returns trigger
 language plpgsql security definer set search_path='' as $$
begin
 new.is_test := coalesce(new.is_test, false) or private.email_is_test(new.user_id);
 return new;
end $$;

drop trigger if exists trg_member_is_test on public.member_profiles;
create trigger trg_member_is_test before insert on public.member_profiles
 for each row execute function private.tag_account_is_test();
drop trigger if exists trg_partner_is_test on public.partner_applications;
create trigger trg_partner_is_test before insert on public.partner_applications
 for each row execute function private.tag_account_is_test();
drop trigger if exists trg_expert_is_test on private.expert_applications;
create trigger trg_expert_is_test before insert on private.expert_applications
 for each row execute function private.tag_account_is_test();

-- 4) 데이터 태깅: 생성자(고객/전문가)의 테스트 여부를 데이터에 전파
create or replace function private.tag_customer_data_is_test() returns trigger
 language plpgsql security definer set search_path='' as $$
begin
 new.is_test := coalesce(new.is_test, false)
   or coalesce((select is_test from public.member_profiles where user_id = new.customer_id), false)
   or private.email_is_test(new.customer_id);
 return new;
end $$;

drop trigger if exists trg_consultation_is_test on private.consultations;
create trigger trg_consultation_is_test before insert on private.consultations
 for each row execute function private.tag_customer_data_is_test();
drop trigger if exists trg_service_request_is_test on private.service_requests;
create trigger trg_service_request_is_test before insert on private.service_requests
 for each row execute function private.tag_customer_data_is_test();

-- planner_directory 는 전문가 승인 시 생성 → 해당 전문가의 테스트 여부를 전파
create or replace function private.tag_directory_is_test() returns trigger
 language plpgsql security definer set search_path='' as $$
begin
 new.is_test := coalesce(new.is_test, false)
   or coalesce((select is_test from private.expert_applications where user_id = new.user_id), false)
   or coalesce((select is_test from public.partner_applications where user_id = new.user_id), false)
   or private.email_is_test(new.user_id);
 return new;
end $$;

drop trigger if exists trg_directory_is_test on private.planner_directory;
create trigger trg_directory_is_test before insert on private.planner_directory
 for each row execute function private.tag_directory_is_test();

-- 5) 기존 행 백필 (현재 test_emails 기준으로 과거 데이터도 동기화)
create or replace function private.resync_test_flags() returns void
 language plpgsql security definer set search_path='' as $$
begin
 update public.member_profiles      set is_test = private.email_is_test(user_id);
 update public.partner_applications set is_test = private.email_is_test(user_id);
 update private.expert_applications  set is_test = private.email_is_test(user_id);
 update private.planner_directory d  set is_test = private.email_is_test(d.user_id);
 update private.consultations c      set is_test = coalesce((select is_test from public.member_profiles m where m.user_id=c.customer_id),false) or private.email_is_test(c.customer_id);
 update private.service_requests s   set is_test = coalesce((select is_test from public.member_profiles m where m.user_id=s.customer_id),false) or private.email_is_test(s.customer_id);
end $$;
revoke all on function private.resync_test_flags() from public, anon, authenticated;

-- 6) 어드민 RPC: 테스트 이메일 지정/해제 (지정 후 과거 데이터까지 재동기화)
create or replace function public.admin_set_test_email(target_email text, flag boolean, note text default '')
 returns jsonb language plpgsql security definer set search_path='' as $$
declare e text := lower(trim(target_email));
begin
 if not private.is_admin() then raise exception 'admin_required'; end if;
 if e = '' or position('@' in e) = 0 then raise exception 'invalid_email'; end if;
 if flag then
   insert into private.test_emails(email, note, added_by) values(e, left(coalesce(note,''),200), auth.uid())
     on conflict(email) do update set note=excluded.note;
 else
   delete from private.test_emails where email = e;
 end if;
 perform private.resync_test_flags();
 return (select coalesce(jsonb_agg(jsonb_build_object('email',email,'note',note,'created_at',created_at) order by created_at desc),'[]') from private.test_emails);
end $$;
revoke all on function public.admin_set_test_email(text,boolean,text) from public, anon, authenticated;
grant execute on function public.admin_set_test_email(text,boolean,text) to authenticated;

-- 7) 어드민 RPC: 테스트 데이터 일괄 삭제 (예약·신청 데이터. 계정 플래그는 유지)
create or replace function public.admin_purge_test_data() returns jsonb
 language plpgsql security definer set search_path='' as $$
declare del_consult int; del_request int;
begin
 if not private.is_admin() then raise exception 'admin_required'; end if;
 with d as (delete from private.consultations where is_test returning 1) select count(*) into del_consult from d;
 with d as (delete from private.service_requests where is_test returning 1) select count(*) into del_request from d;
 return jsonb_build_object('deleted_consultations',del_consult,'deleted_service_requests',del_request);
end $$;
revoke all on function public.admin_purge_test_data() from public, anon, authenticated;
grant execute on function public.admin_purge_test_data() to authenticated;

-- 8) 어드민 RPC: 테스트 이메일 목록 조회
create or replace function public.admin_test_emails() returns jsonb
 language sql stable security definer set search_path='' as $$
 select case when private.is_admin()
   then coalesce((select jsonb_agg(jsonb_build_object('email',email,'note',note,'created_at',created_at) order by created_at desc) from private.test_emails),'[]')
   else jsonb_build_object('error','admin_required') end
$$;
revoke all on function public.admin_test_emails() from public, anon, authenticated;
grant execute on function public.admin_test_emails() to authenticated;

-- 9) 소비자 노출(planner_catalog): 테스트 전문가 제외 (011 정의 재현 + is_test 필터)
create or replace function public.planner_catalog(area text default '',wanted text default '') returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('planners',coalesce(jsonb_agg(p||jsonb_build_object('protection_pledge',case when a.status='approved' and a.sanction is null then jsonb_build_object('version',a.agreement_version,'agreed_at',a.agreed_at) else null end)),'[]'))
 from (
   select value as p from jsonb_array_elements(public.planner_catalog_before_011(area,wanted)->'planners')
     where not coalesce((select d.is_test from private.planner_directory d where d.user_id=(value->>'id')::uuid),false)
   union all
   select jsonb_build_object('id',e.user_id,'name',e.full_name,'organization',e.organization,'region',e.region,'profession',e.profession,'specialties',jsonb_build_array('claim'),'biography','지인 테스트 프로필 · 상담 연결 기능 준비 중','experience',0,'photo_url','','available',false,'hours','','latitude',null,'longitude',null,'is_sample',true,'completed_count',0,'rating',null,'reviews','[]'::jsonb)
   from private.expert_applications e where e.status='approved' and e.profession in ('adjuster','lawyer') and (area='' or e.region like area||'%') and (wanted='' or wanted='claim') and not coalesce(e.is_test,false)
 ) profiles
 left join private.expert_applications a on a.user_id=(p->>'id')::uuid
 where a.sanction is distinct from 'banned' and not coalesce(a.sanction='suspended' and a.sanction_until>now(),false)
$$;
grant execute on function public.planner_catalog(text,text) to anon,authenticated;

-- 10) 통계(consultation_metrics): 테스트 데이터/계정 기본 제외
create or replace function public.consultation_metrics() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare today date:=(now() at time zone 'Asia/Seoul')::date;
begin
 if not private.is_admin() then raise exception 'admin_required';end if;
 return jsonb_build_object('date_kst',today,'visit_sessions',(select count(*) from private.daily_visit_sessions where day=today),
 'today_requests',(select count(*) from private.consultations where (created_at at time zone 'Asia/Seoul')::date=today and not is_test),
 'active_planners',(select count(*) from private.planner_directory d where private.planner_eligible(d.user_id) and d.available and not d.is_test),
 'new_planners',(select count(*) from public.partner_applications where (created_at at time zone 'Asia/Seoul')::date=today and profession='planner' and not is_test),
 'test_paid_won',(select coalesce(sum(amount-refunded_won),0) from private.ad_subscriptions where state in ('active','refunding','refund_failed','refunded')),
 'planner_summary',(select coalesce(jsonb_agg(jsonb_build_object('id',d.user_id,'name',p.full_name,'sample',d.is_sample,'completed',(select count(*) from private.consultations c where c.planner_id=d.user_id and c.state='completed' and not c.is_test))),'[]') from private.planner_directory d join public.partner_applications p on p.user_id=d.user_id where not d.is_test));
end $$;
revoke all on function public.consultation_metrics() from public,anon,authenticated;
grant execute on function public.consultation_metrics() to authenticated;

-- 11) 초기 테스트 계정 지정 (운영자 이메일) + 과거 데이터 동기화. 어드민에서 변경 가능.
insert into private.test_emails(email,note) values('jkw2686@gmail.com','운영자 테스트 계정(초기 지정)') on conflict(email) do nothing;
select private.resync_test_flags();

commit;
