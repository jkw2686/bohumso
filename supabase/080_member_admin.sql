begin;
create table if not exists private.admin_reporting_access(user_id uuid primary key references auth.users(id), scope text not null check(scope in('support','statistics')));
alter table private.admin_reporting_access enable row level security;
revoke all on private.admin_reporting_access from public,anon,authenticated;
create or replace function private.require_member_admin(details boolean default false) returns void language plpgsql security definer set search_path='' as $$
declare scope text; allowed boolean; begin
 if exists(select 1 from private.account_lifecycle where user_id=auth.uid() and status<>'ACTIVE') then raise exception 'admin_required';end if;
 select a.scope into scope from private.admin_reporting_access a where user_id=auth.uid();
 if to_regprocedure('private.is_admin_before_mfa()') is not null then execute 'select private.is_admin_before_mfa()' into allowed;else allowed:=private.is_admin();end if;
 if not coalesce(allowed,false) then raise exception 'admin_required';end if;
 if coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'aal','aal1')<>'aal2' then raise exception 'mfa_required';end if;
 if details and scope='statistics' then raise exception 'member_detail_forbidden';end if;
end$$;
revoke all on function private.require_member_admin(boolean) from public,anon,authenticated;
create or replace view private.member_registry as
 select u.id,coalesce(d.name,nullif(e.display_name,''),a.full_name,'이름 미입력') name,
 case when e.user_id is not null or a.user_id is not null or d.member_type='expert' then 'expert' else 'consumer' end member_type,
 coalesce(e.primary_area,(select s.id from private.service_areas s where a.region like s.id||'%' order by length(s.id) desc limit 1),'') region,
 coalesce(m.created_at,(to_jsonb(u)->>'created_at')::timestamptz) joined_at,
 coalesce(l.status,'ACTIVE') account_status,
 coalesce(e.status,upper(a.status),'NOT_REGISTERED') registration_status,
 coalesce(e.map_visible,false) map_visible,
 coalesce((to_jsonb(m)->>'is_test')::boolean,false) is_test,
 coalesce(d.phone,regexp_replace(private.verified_contact(u.id),'^\+?82','0')) phone,
 coalesce(d.contact_status,'UNCONFIRMED') contact_status
 from auth.users u left join public.member_profiles m on m.user_id=u.id
 left join private.member_contact_details d on d.user_id=u.id
 left join private.expert_profiles e on e.user_id=u.id
 left join public.partner_applications a on a.user_id=u.id
 left join private.account_lifecycle l on l.user_id=u.id;
revoke all on private.member_registry from public,anon,authenticated;
create or replace function public.admin_members(operation text default 'summary',filters jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; offset_rows integer:=greatest(0,least(coalesce((filters->>'page')::integer,0),100000))*25;begin
 if operation not in('summary','list','detail') then raise exception 'invalid_operation';end if;
 perform private.require_member_admin(operation<>'summary');
 if operation='detail' then
  select to_jsonb(r) into result from private.member_registry r where id=(filters->>'id')::uuid;
  if result is null then raise exception 'member_not_found';end if;
  insert into private.member_privacy_events(actor,subject,action) values(auth.uid(),(filters->>'id')::uuid,'admin_member_detail');
  return result;
 end if;
 with filtered as(select * from private.member_registry r where
  (coalesce(filters->>'type','')='' or r.member_type=filters->>'type') and
  (coalesce(filters->>'q','')='' or r.name ilike '%'||(filters->>'q')||'%') and
  (coalesce(filters->>'region','')='' or r.region ilike '%'||(filters->>'region')||'%') and
  (coalesce(filters->>'status','')='' or r.registration_status=filters->>'status') and
  (coalesce(filters->>'pending','')<>'true' or r.registration_status in('PENDING','VERIFICATION_PENDING')) and
  (coalesce(filters->>'account','')='' or r.account_status=filters->>'account') and
  (coalesce(filters->>'test','')='' or r.is_test=(filters->>'test')::boolean) and
  (coalesce(filters->>'active','')='' or r.map_visible=(filters->>'active')::boolean) and
  (coalesce(filters->>'from','')='' or r.joined_at>=((filters->>'from')::date::timestamp at time zone 'Asia/Seoul')) and
  (coalesce(filters->>'to','')='' or r.joined_at<(((filters->>'to')::date+1)::timestamp at time zone 'Asia/Seoul'))
 ), paged as(select * from filtered order by joined_at desc nulls last,id limit 25 offset offset_rows)
 select case when operation='summary' then jsonb_build_object('total',count(*),'consumer',count(*) filter(where member_type='consumer'),'expert',count(*) filter(where member_type='expert'),'pending',count(*) filter(where registration_status in('PENDING','VERIFICATION_PENDING')),'today',count(*) filter(where joined_at>=(now() at time zone 'Asia/Seoul')::date::timestamp at time zone 'Asia/Seoul'),'test',count(*) filter(where is_test),'withdrawn',count(*) filter(where account_status='WITHDRAWN'))
 else jsonb_build_object('total',count(*),'page',offset_rows/25,'size',25,'rows',(select coalesce(jsonb_agg((to_jsonb(p)-'phone')||jsonb_build_object('phone',case when p.phone is not null then left(p.phone,3)||'-****-'||right(p.phone,4) else '미입력' end)),'[]') from paged p)) end into result from filtered;
 insert into private.member_privacy_events(actor,action) values(auth.uid(),'admin_members_'||operation);
 return result;
end$$;
revoke all on function public.admin_members(text,jsonb) from public,anon;
grant execute on function public.admin_members(text,jsonb) to authenticated;
create or replace function public.admin_operations_summary(period text default 'today') returns jsonb language plpgsql security definer set search_path='' as $$
declare since timestamptz; result jsonb; tasks jsonb;begin
 perform private.require_member_admin(false);
 if period not in('today','month','all') then raise exception 'invalid_period';end if;
 since:=case period when 'today' then (now() at time zone 'Asia/Seoul')::date::timestamp at time zone 'Asia/Seoul' when 'month' then date_trunc('month',now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul' end;
 select jsonb_build_object('waiting',count(*) filter(where state in('requested','unmatched')),'progress',count(*) filter(where state in('coordinating','confirmed','scheduled','awaiting_completion')),'completed',count(*) filter(where state='completed')) into result from private.consultations where since is null or created_at>=since;
 -- No names, phone numbers or consultation narratives in the home summary.
 select coalesce(jsonb_agg(to_jsonb(t)),'[]') into tasks from (
  select * from (
   select id::text,'상담 요청 확인' title,'/admin-requests.html?request='||id::text href,created_at from private.consultations where state in('requested','unmatched')
   union all select user_id::text,'전문가 자격 확인','/admin.html#members',created_at from private.expert_profiles where status='VERIFICATION_PENDING'
   union all select id::text,'문의·신고 확인','/admin.html#operations',created_at from private.member_rights_requests where status in('RECEIVED','IN_PROGRESS')
   union all select id::text,'상담 신고 확인','/admin-requests.html?request='||consultation_id::text,created_at from private.consultation_issues where not resolved
  ) work order by created_at,id limit 5
 ) t;
 if exists(select 1 from private.admin_reporting_access where user_id=auth.uid() and scope='statistics') then tasks:='[]'::jsonb;end if;
 return result||jsonb_build_object('tasks',tasks,'period',period);
end$$;
revoke all on function public.admin_operations_summary(text) from public,anon;
grant execute on function public.admin_operations_summary(text) to authenticated;
create or replace function public.admin_consultation_index(period text default 'today',bucket text default 'waiting',page integer default 0) returns jsonb language plpgsql security definer set search_path='' as $$
declare since timestamptz;result jsonb;begin
 perform private.require_member_admin(true);
 if period not in('today','month','all') or bucket not in('waiting','progress','completed') then raise exception 'invalid_filter';end if;
 since:=case period when 'today' then (now() at time zone 'Asia/Seoul')::date::timestamp at time zone 'Asia/Seoul' when 'month' then date_trunc('month',now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul' end;
 with filtered as(select id,state,created_at from private.consultations where (since is null or created_at>=since) and
  case bucket when 'waiting' then state in('requested','unmatched') when 'progress' then state in('coordinating','confirmed','scheduled','awaiting_completion') else state='completed' end),
  paged as(select * from filtered order by created_at desc,id limit 25 offset greatest(0,least(page,100000))*25)
 select jsonb_build_object('total',count(*),'rows',(select coalesce(jsonb_agg(to_jsonb(p)),'[]') from paged p)) into result from filtered;
 insert into private.member_privacy_events(actor,action) values(auth.uid(),'admin_consultation_index');return result;
end$$;
revoke all on function public.admin_consultation_index(text,text,integer) from public,anon;
grant execute on function public.admin_consultation_index(text,text,integer) to authenticated;
create or replace function public.admin_privacy_events(page integer default 0) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;begin
 perform private.require_member_admin(true);
 select jsonb_build_object('total',(select count(*) from private.member_privacy_events),'rows',coalesce(jsonb_agg(to_jsonb(p)),'[]')) into result from
 (select id,actor,subject,action,created_at from private.member_privacy_events order by id desc limit 25 offset greatest(0,least(page,100000))*25) p;
 insert into private.member_privacy_events(actor,action) values(auth.uid(),'admin_privacy_log_read');return result;
end$$;
revoke all on function public.admin_privacy_events(integer) from public,anon;
grant execute on function public.admin_privacy_events(integer) to authenticated;
commit;
