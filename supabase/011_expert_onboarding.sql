begin;
create table private.expert_applications (
 user_id uuid primary key references auth.users(id) on delete cascade,
 profession text not null check(profession in ('planner','adjuster','lawyer')),
 full_name text not null, phone text not null, region text not null, organization text not null,
 registration_number text not null,
 status text not null default 'pending' check(status in ('pending','approved','needs_changes','rejected','withdrawn')),
 agreement_version text not null check(agreement_version='consumer-protection-2026-09-25-v1'), agreed_at timestamptz not null default now(),
 phone_verified_at timestamptz not null, submitted_at timestamptz not null default now(),
 revision integer not null default 1, review_reason text, reviewed_by uuid, reviewed_at timestamptz,
 sanction text check(sanction in ('warning','suspended','banned')), sanction_until timestamptz
);
create table private.expert_documents (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 kind text not null check(kind in ('identity','qualification')), profession text not null check(profession in ('planner','adjuster','lawyer')), deleting boolean not null default false, object_path text not null unique,
 filename text not null, mime text not null check(mime in ('image/jpeg','image/png','application/pdf')),
 bytes integer not null check(bytes between 1 and 10485760), created_at timestamptz not null default now(), unique(user_id,kind)
);
create table private.expert_events (
 id bigint generated always as identity primary key, user_id uuid not null, actor uuid,
 action text not null, reason text not null default '', details jsonb not null default '{}', created_at timestamptz not null default now()
);
revoke all on private.expert_applications,private.expert_documents,private.expert_events from public,anon,authenticated;
-- Service-only metadata operations. Storage bytes are checked and written by the server first.
create function public.expert_document_service(subject uuid,operation text,payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare d private.expert_documents; previous_path text;
begin
 perform 1 from auth.users where id=subject for update;
 if not exists(select 1 from public.member_profiles where user_id=subject) then raise exception 'membership_required';end if;
 if operation='save' then
  if exists(select 1 from private.expert_applications where user_id=subject and (status='approved' or sanction='banned')) then raise exception 'application_locked';end if;
  if payload->>'path' not like subject::text||'/%' or length(payload->>'filename')>120 then raise exception 'invalid_document';end if;
  if exists(select 1 from private.expert_documents where user_id=subject and deleting) then raise exception 'deletion_pending';end if;
  select object_path into previous_path from private.expert_documents where user_id=subject and kind=payload->>'kind';
  if previous_path is not null then raise exception 'document_exists';end if;
  insert into private.expert_documents(user_id,kind,profession,object_path,filename,mime,bytes) values(subject,payload->>'kind',payload->>'profession',payload->>'path',payload->>'filename',payload->>'mime',(payload->>'bytes')::integer)
  on conflict(user_id,kind) do update set profession=excluded.profession,object_path=excluded.object_path,filename=excluded.filename,mime=excluded.mime,bytes=excluded.bytes,created_at=now() returning * into d;
  update private.expert_applications set status='needs_changes',revision=revision+1 where user_id=subject and status='pending';
  insert into private.expert_events(user_id,actor,action) values(subject,subject,'document_uploaded');
  return jsonb_build_object('document',to_jsonb(d)-'object_path','previous_path',previous_path);
 elsif operation in ('read','delete') then
  select * into d from private.expert_documents where id=(payload->>'id')::uuid;
  if d.id is null or (d.user_id<>subject and not exists(select 1 from private.admin_memberships where user_id=subject)) then raise exception 'request_forbidden';end if;
  perform 1 from auth.users where id=d.user_id for update;
  select * into d from private.expert_documents where id=d.id for update;
  if operation='delete' then
   update private.expert_documents set deleting=true where id=d.id;
   update private.expert_applications set status='needs_changes',revision=revision+1 where user_id=d.user_id and status='pending';
   return to_jsonb(d);
  end if;
  if d.deleting then raise exception 'deletion_pending';end if;
  insert into private.expert_events(user_id,actor,action) values(d.user_id,subject,'document_viewed');
  return to_jsonb(d);
 elsif operation='confirm_delete' then
  select * into d from private.expert_documents where id=(payload->>'id')::uuid for update;
  if d.id is null then return '{}'::jsonb;end if;
  if d.user_id<>subject and not exists(select 1 from private.admin_memberships where user_id=subject) then raise exception 'request_forbidden';end if;
  if d.object_path is distinct from payload->>'path' then raise exception 'stale_document';end if;
  delete from private.expert_documents where id=d.id;
  update private.expert_applications set status='needs_changes',revision=revision+1 where user_id=d.user_id and status='pending';
  insert into private.expert_events(user_id,actor,action) values(d.user_id,subject,'document_deleted');return '{}'::jsonb;
 end if;
 raise exception 'invalid_operation';
end $$;
create function public.expert_workspace() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'login_required';end if;
 return jsonb_build_object('application',(select to_jsonb(a) from private.expert_applications a where user_id=auth.uid()),
 'documents',(select coalesce(jsonb_agg(to_jsonb(d)-'object_path'),'[]') from private.expert_documents d where user_id=auth.uid()),
 'events',(select coalesce(jsonb_agg(to_jsonb(e) order by id desc),'[]') from (select * from private.expert_events where user_id=auth.uid() order by id desc limit 50)e));
end $$;
create function public.expert_submit(payload jsonb,expected_revision integer default 0) returns void language plpgsql security definer set search_path='' as $$
declare a private.expert_applications; phone_at timestamptz; phone_value text;
begin
 if auth.uid() is null or not exists(select 1 from public.member_profiles where user_id=auth.uid()) then raise exception 'membership_required';end if;
 select phone_confirmed_at,phone into phone_at,phone_value from auth.users where id=auth.uid() for update;
 if phone_at is null or phone_value is null or regexp_replace(phone_value,'[^0-9]','','g') is distinct from regexp_replace(coalesce(payload->>'phone',''),'[^0-9]','','g') then raise exception 'phone_verification_required';end if;
 if payload->>'profession' is null or payload->>'profession' not in ('planner','adjuster','lawyer')
 or length(trim(coalesce(payload->>'full_name',''))) not between 2 and 60
 or length(trim(coalesce(payload->>'region',''))) not between 2 and 120
 or length(trim(coalesce(payload->>'organization',''))) not between 2 and 120
 or coalesce(payload->>'registration_number','') !~ '^[A-Za-z0-9][A-Za-z0-9 -]{2,39}$'
 or payload->>'registration_number' ~ '[0-9]{6}[ -]?[1-8][0-9]{6}' then raise exception 'invalid_application';end if;
 if payload->>'agreement_version' is distinct from 'consumer-protection-2026-09-25-v1' or payload->'agreements' is distinct from '[true,true,true]'::jsonb or payload->'document_consent' is distinct from 'true'::jsonb then raise exception 'consent_required';end if;
 if (select count(*) from private.expert_documents where user_id=auth.uid() and not deleting and profession=payload->>'profession')<>2 then raise exception 'documents_required';end if;
 select * into a from private.expert_applications where user_id=auth.uid() for update;
 if found and (a.status='approved' or a.sanction='banned' or (a.sanction='suspended' and a.sanction_until>now())) then raise exception 'application_locked';end if;
 if coalesce(a.revision,0)<>expected_revision then raise exception 'stale_application';end if;
 insert into private.expert_applications(user_id,profession,full_name,phone,region,organization,registration_number,agreement_version,phone_verified_at)
 values(auth.uid(),payload->>'profession',trim(payload->>'full_name'),payload->>'phone',trim(payload->>'region'),trim(payload->>'organization'),payload->>'registration_number',payload->>'agreement_version',phone_at)
 on conflict(user_id) do update set profession=excluded.profession,full_name=excluded.full_name,phone=excluded.phone,region=excluded.region,organization=excluded.organization,registration_number=excluded.registration_number,agreement_version=excluded.agreement_version,agreed_at=now(),phone_verified_at=phone_at,status='pending',submitted_at=now(),revision=private.expert_applications.revision+1,review_reason=null;
 insert into public.partner_applications(user_id,profession,full_name,organization,region,credential_reference,business_contact)
 values(auth.uid(),payload->>'profession',trim(payload->>'full_name'),trim(payload->>'organization'),trim(payload->>'region'),payload->>'registration_number',payload->>'phone')
 on conflict(user_id) do update set profession=excluded.profession,full_name=excluded.full_name,organization=excluded.organization,region=excluded.region,credential_reference=excluded.credential_reference,business_contact=excluded.business_contact,status='pending';
 insert into private.expert_events(user_id,actor,action,details) values(auth.uid(),auth.uid(),'submitted',jsonb_build_object('agreement_version',payload->>'agreement_version','agreed_at',now()));
end $$;
create function public.expert_admin_list() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not private.is_admin() then raise exception 'admin_required';end if;
 return (select coalesce(jsonb_agg(to_jsonb(a)||jsonb_build_object(
 'documents',(select coalesce(jsonb_agg(to_jsonb(d)-'object_path'),'[]') from private.expert_documents d where user_id=a.user_id),
 'events',(select coalesce(jsonb_agg(to_jsonb(e) order by id desc),'[]') from (select * from private.expert_events where user_id=a.user_id order by id desc limit 50)e),
 'reports',(select coalesce(jsonb_agg(jsonb_build_object('id',i.id,'category',i.category,'reason',i.reason,'created_at',i.created_at,'resolved',i.resolved)),'[]') from private.consultation_issues i join private.consultations c on c.id=i.consultation_id where c.planner_id=a.user_id)) order by a.submitted_at desc),'[]') from (select * from private.expert_applications order by submitted_at desc limit 200)a)
 || (select coalesce(jsonb_agg(jsonb_build_object('legacy',true,'user_id',p.user_id,'profession',p.profession,'full_name',p.full_name,'region',p.region,'organization',p.organization,'status',p.status,'phone',p.business_contact,'registration_number',p.credential_reference,'submitted_at',p.created_at,'documents','[]'::jsonb,'events','[]'::jsonb,'reports','[]'::jsonb)),'[]') from public.partner_applications p where not exists(select 1 from private.expert_applications e where e.user_id=p.user_id));
end $$;
create function public.expert_review(target_user uuid,decision text,reason text,expected_revision integer,checks jsonb default '{}',until_at timestamptz default null) returns void language plpgsql security definer set search_path='' as $$
declare a private.expert_applications;
begin
 if not private.is_admin() then raise exception 'admin_required';end if;
 if target_user=auth.uid() then raise exception 'self_review_forbidden';end if;
 if length(trim(coalesce(reason,''))) not between 5 and 1000 then raise exception 'reason_required';end if;
 perform 1 from auth.users where id=target_user for update;
 select * into a from private.expert_applications where user_id=target_user for update;
 if a.user_id is null or a.revision<>expected_revision then raise exception 'stale_application';end if;
 if decision in ('approved','needs_changes','rejected') then
  if a.status not in ('pending','needs_changes') or a.sanction='banned' then raise exception 'invalid_transition';end if;
  if decision='approved' and (checks is distinct from '{"identity":true,"qualification":true,"registry":true}'::jsonb or (select count(*) from private.expert_documents where user_id=target_user and not deleting and profession=a.profession)<>2) then raise exception 'verification_required';end if;
  update private.expert_applications set status=decision,review_reason=trim(reason),reviewed_by=auth.uid(),reviewed_at=now(),revision=revision+1 where user_id=target_user;
  if decision='approved' and a.profession='planner' then
   insert into private.planner_directory(user_id,identity_key,verified_by,verified_at,evidence,is_sample) values(target_user,'expert:'||a.profession||':'||upper(replace(a.registration_number,' ','')),auth.uid(),now(),trim(reason),true)
   on conflict(user_id) do update set identity_key=excluded.identity_key,verified_by=excluded.verified_by,verified_at=excluded.verified_at,evidence=excluded.evidence;
  end if;
  update public.partner_applications set status=case when decision='needs_changes' then 'rejected' else decision end,review_note=trim(reason),reviewed_by=auth.uid(),reviewed_at=now() where user_id=target_user;
 elsif decision in ('warning','suspended','banned') then
  if a.status<>'approved' or a.sanction='banned' then raise exception 'invalid_transition';end if;
  if decision='warning' and a.sanction is not null then raise exception 'invalid_transition';end if;
  if decision='suspended' and (until_at is null or until_at<=now() or until_at>now()+interval '366 days') then raise exception 'invalid_period';end if;
  if decision='suspended' and a.sanction is distinct from 'warning' then raise exception 'warning_required';end if;
  if decision='banned' and a.sanction is distinct from 'suspended' then raise exception 'suspension_required';end if;
  update private.expert_applications set sanction=decision,sanction_until=case when decision='suspended' then until_at else null end,revision=revision+1 where user_id=target_user;
 else raise exception 'invalid_transition';end if;
 insert into private.expert_events(user_id,actor,action,reason,details) values(target_user,auth.uid(),decision,trim(reason),jsonb_build_object('until',until_at,'checks',checks));
end $$;
-- Existing professional checks remain; sanctions additionally block exposure and accepting requests.
alter function private.planner_eligible(uuid) rename to planner_eligible_before_011;
create function private.planner_eligible(target uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.planner_eligible_before_011(target) and not exists(select 1 from private.expert_applications where user_id=target and (sanction='banned' or (sanction='suspended' and sanction_until>now())))
$$;
-- Badge only records the pledge; it is never a ranking input.
alter function public.planner_catalog(text,text) rename to planner_catalog_before_011;
create function public.planner_catalog(area text default '',wanted text default '') returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('planners',coalesce(jsonb_agg(p||jsonb_build_object('protection_pledge',case when a.status='approved' and a.sanction is null then jsonb_build_object('version',a.agreement_version,'agreed_at',a.agreed_at) else null end)),'[]'))
 from (select value as p from jsonb_array_elements(public.planner_catalog_before_011(area,wanted)->'planners')
 union all select jsonb_build_object('id',e.user_id,'name',e.full_name,'organization',e.organization,'region',e.region,'profession',e.profession,'specialties',jsonb_build_array('claim'),'biography','지인 테스트 프로필 · 상담 연결 기능 준비 중','experience',0,'photo_url','','available',false,'hours','','latitude',null,'longitude',null,'is_sample',true,'completed_count',0,'rating',null,'reviews','[]'::jsonb)
 from private.expert_applications e where e.status='approved' and e.profession in ('adjuster','lawyer') and (area='' or e.region like area||'%') and (wanted='' or wanted='claim')) profiles
 left join private.expert_applications a on a.user_id=(p->>'id')::uuid
 where a.sanction is distinct from 'banned' and not coalesce(a.sanction='suspended' and a.sanction_until>now(),false)
$$;
revoke all on function public.planner_catalog_before_011(text,text) from public,anon,authenticated;
revoke all on function private.planner_eligible(uuid),private.planner_eligible_before_011(uuid) from public,anon,authenticated;
revoke all on function public.expert_document_service(uuid,text,jsonb),public.expert_workspace(),public.expert_submit(jsonb,integer),public.expert_admin_list(),public.expert_review(uuid,text,text,integer,jsonb,timestamptz) from public,anon,authenticated;
grant execute on function public.expert_document_service(uuid,text,jsonb) to service_role;
grant execute on function public.expert_workspace(),public.expert_submit(jsonb,integer),public.expert_admin_list(),public.expert_review(uuid,text,text,integer,jsonb,timestamptz) to authenticated;
grant execute on function public.planner_catalog(text,text) to anon,authenticated;
-- Close legacy mutation bypasses for the new onboarding deployment.
revoke execute on function public.withdraw_partner_application(integer) from authenticated;
revoke execute on function public.apply_partner(text,text,text,text,text,boolean),public.submit_partner_application(jsonb,integer),public.review_partner(uuid,text,text),public.review_partner_application(uuid,text,text,integer) from authenticated;
commit;
