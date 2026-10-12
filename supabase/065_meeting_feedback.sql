-- Development candidate only. Existing completion and review records are retained.
begin;
select pg_advisory_xact_lock(650065);
create table if not exists private.feedback_backup(signature text primary key,definition text not null);
insert into private.feedback_backup select p.oid::regprocedure::text,pg_get_functiondef(p.oid) from pg_proc p
 where p.oid in ('public.consultation_workspace(text)'::regprocedure,'public.consultation_command(text,jsonb)'::regprocedure,'public.planner_catalog(text,text)'::regprocedure) on conflict do nothing;
create table if not exists private.feedback_policy(id boolean primary key default true check(id),minimum_public_count integer check(minimum_public_count between 2 and 100));
insert into private.feedback_policy(id) values(true) on conflict do nothing;
alter table private.urgent_requests add column if not exists customer_completed_at timestamptz;
create table if not exists private.meeting_feedback(
 kind text not null check(kind in ('consultation','visit')),meeting_id uuid not null,
 respondent_role text not null check(respondent_role in ('consumer','expert')),respondent_id uuid not null references auth.users(id),expert_id uuid not null,
 rating integer check(rating between 1 and 5),tags text[] not null default '{}' check(cardinality(tags)<=4 and tags<@array['kind','clear','helpful','punctual']),
 public_consent boolean not null default false,consent_version text,consented_at timestamptz,
 help_status text check(help_status in ('done','ongoing','not_done')),
 initiator text check(initiator in ('none','customer','expert','unknown')),timing text check(timing in ('during','after','unknown')),
 problem text not null default '' check(length(problem)<=1000),revision integer not null default 1,
 fingerprint text not null,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 primary key(kind,meeting_id,respondent_role),
 check((initiator in ('customer','expert') and timing is not null) or (coalesce(initiator,'') not in ('customer','expert') and timing is null)),
 check(respondent_role='consumer' or (rating is null and tags='{}' and not public_consent)),
 check(not public_consent or (consent_version='meeting-rating-public-2026-10-12-v1' and consented_at is not null))
);
create table if not exists private.feedback_checks(
 kind text not null,meeting_id uuid not null,flags text[] not null,status text not null default 'pending' check(status in ('pending','reviewing','reviewed')),
 revision integer not null default 1,note text not null default '',reviewed_by uuid,updated_at timestamptz not null default now(),created_at timestamptz not null default now(),
 primary key(kind,meeting_id)
);
create table if not exists private.feedback_events(id bigint generated always as identity primary key,kind text not null,meeting_id uuid not null,actor uuid not null,event text not null,detail jsonb not null,created_at timestamptz not null default now());
create index if not exists meeting_feedback_public_expert on private.meeting_feedback(expert_id) where respondent_role='consumer' and public_consent;
create index if not exists feedback_checks_pending on private.feedback_checks(created_at,meeting_id) where status<>'reviewed';
alter table private.feedback_backup enable row level security;
alter table private.feedback_policy enable row level security;
alter table private.meeting_feedback enable row level security;
alter table private.feedback_checks enable row level security;
alter table private.feedback_events enable row level security;
revoke all on private.feedback_backup,private.feedback_policy,private.meeting_feedback,private.feedback_checks,private.feedback_events from public,anon,authenticated;

create or replace function private.feedback_source(k text,target uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare customer uuid; expert uuid; completed boolean; can_confirm boolean:=false; purpose text; job text;
begin
 if k='consultation' then
  select customer_id,planner_id,state='completed' and completed_at is not null and completion_requested_at is not null and customer_ok and planner_ok,c.purpose,coalesce(integration_details->>'profession',p.profession,a.profession)
   into customer,expert,completed,purpose,job from private.consultations c left join private.expert_profiles p on p.user_id=c.planner_id left join public.partner_applications a on a.user_id=c.planner_id where c.id=target;
 elsif k='visit' then
  select customer_id,planner_id,v.state='COMPLETED' and confirmed_at is not null and customer_completed_at is not null,v.state='COMPLETED' and confirmed_at is not null and customer_completed_at is null and preferred_at<=now(),v.purpose,coalesce(p.profession,a.profession)
   into customer,expert,completed,can_confirm,purpose,job from private.urgent_requests v left join private.expert_profiles p on p.user_id=v.planner_id left join public.partner_applications a on a.user_id=v.planner_id where v.id=target;
 else raise exception 'feedback_forbidden';end if;
 if auth.uid() is null or customer is null or expert is null or customer=expert or not (auth.uid()=customer or auth.uid()=expert or private.is_admin()) then raise exception 'feedback_forbidden';end if;
 return jsonb_build_object('customer',customer,'expert',expert,'eligible',coalesce(completed,false),'canConfirm',coalesce(can_confirm,false) and auth.uid()=customer,'protection',job='planner' and (purpose='claim' or k='visit' and purpose in ('death','illness','medical','accident')),'role',case when auth.uid()=customer then 'consumer' when auth.uid()=expert then 'expert' else 'admin' end);
end$$;
create or replace function private.feedback_view(k text,target uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare s jsonb; mine jsonb; responses jsonb; check_row jsonb;
begin
 s:=private.feedback_source(k,target);
 select to_jsonb(f)-'respondent_id'-'expert_id'-'fingerprint' into mine from private.meeting_feedback f where kind=k and meeting_id=target and respondent_role=s->>'role';
 if private.is_admin() then
  select jsonb_object_agg(respondent_role,to_jsonb(f)-'respondent_id'-'expert_id'-'fingerprint') into responses from private.meeting_feedback f where kind=k and meeting_id=target;
  select to_jsonb(c)-'reviewed_by' into check_row from private.feedback_checks c where kind=k and meeting_id=target;
 end if;
 return (s-'customer'-'expert')||jsonb_build_object('kind',k,'id',target,'mine',mine,'responses',responses,'check',check_row);
end$$;
create or replace function private.feedback_check_refresh(k text,target uuid) returns void language plpgsql security definer set search_path='' as $$
declare c private.meeting_feedback;e private.meeting_feedback;flags text[]:='{}';
begin
 select * into c from private.meeting_feedback where kind=k and meeting_id=target and respondent_role='consumer';
 select * into e from private.meeting_feedback where kind=k and meeting_id=target and respondent_role='expert';
 if c.initiator='expert' or e.initiator='expert' then flags:=array_append(flags,'expert_initiated');end if;
 if (c.initiator in ('none','customer','expert') and e.initiator in ('none','customer','expert') and c.initiator<>e.initiator)
  or (c.initiator=e.initiator and c.initiator in ('customer','expert') and c.timing in ('during','after') and e.timing in ('during','after') and c.timing<>e.timing) then flags:=array_append(flags,'mismatch');end if;
 if coalesce(c.problem,'')<>'' or coalesce(e.problem,'')<>'' then flags:=array_append(flags,'problem');end if;
 if cardinality(flags)>0 or exists(select 1 from private.feedback_checks where kind=k and meeting_id=target) then
  insert into private.feedback_checks(kind,meeting_id,flags) values(k,target,flags)
   on conflict(kind,meeting_id) do update set flags=excluded.flags,status='pending',revision=private.feedback_checks.revision+1,updated_at=now();
 end if;
end$$;
create or replace function public.meeting_feedback(operation text,payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare k text:=coalesce(payload->>'kind','consultation');target uuid:=nullif(payload->>'id','')::uuid;s jsonb;who text;old private.meeting_feedback;body jsonb;fp text;rating integer;tags text[];initiator text;timing text;help text;consent boolean;problem text;result jsonb;
begin
 if auth.uid() is null then raise exception 'feedback_forbidden';end if;
 if operation='admin_list' then
  if not private.is_admin() then raise exception 'admin_required';end if;
  return coalesce((select jsonb_agg(private.feedback_view(c.kind,c.meeting_id) order by c.created_at,c.meeting_id) from private.feedback_checks c where c.status<>'reviewed'),'[]');
 end if;
 s:=private.feedback_source(k,target);who:=s->>'role';
 if operation='get' then return private.feedback_view(k,target);end if;
 perform pg_advisory_xact_lock(hashtextextended('feedback:'||k||target::text,65));
 if k='consultation' then perform 1 from private.consultations where id=target for update;else perform 1 from private.urgent_requests where id=target for update;end if;
 s:=private.feedback_source(k,target);who:=s->>'role';
 if operation='confirm_visit' then
  if k<>'visit' or who<>'consumer' or payload->>'met' is distinct from 'true' then raise exception 'feedback_forbidden';end if;
  if (s->>'eligible')::boolean then return private.feedback_view(k,target);end if;
  if s->>'canConfirm' is distinct from 'true' then raise exception 'meeting_not_completed';end if;
  update private.urgent_requests set customer_completed_at=now() where id=target;
  insert into private.feedback_events(kind,meeting_id,actor,event,detail) values(k,target,auth.uid(),'consumer_completion','{}');
  return private.feedback_view(k,target);
 elsif operation='admin_review' then
  if not private.is_admin() then raise exception 'admin_required';end if;
  if payload->>'status' not in ('reviewing','reviewed') or length(trim(coalesce(payload->>'note',''))) not between 5 and 1000 then raise exception 'feedback_invalid';end if;
  update private.feedback_checks set status=payload->>'status',note=trim(payload->>'note'),reviewed_by=auth.uid(),revision=revision+1,updated_at=now() where kind=k and meeting_id=target and revision=(payload->>'revision')::int;
  if not found then raise exception 'feedback_stale';end if;
  insert into private.feedback_events(kind,meeting_id,actor,event,detail) values(k,target,auth.uid(),'operator_review',payload-'id'-'kind');
  return private.feedback_view(k,target);
 elsif operation<>'save' then raise exception 'unknown_operation';end if;
 if s->>'eligible' is distinct from 'true' then raise exception 'meeting_not_completed';end if;
 if who not in ('consumer','expert') or who='expert' and s->>'protection' is distinct from 'true' then raise exception 'feedback_forbidden';end if;
 rating:=nullif(payload->>'rating','')::int;
 select coalesce(array_agg(distinct t order by t),'{}') into tags from jsonb_array_elements_text(coalesce(payload->'tags','[]')) t;
 initiator:=nullif(payload->>'initiator','');timing:=nullif(payload->>'timing','');help:=nullif(payload->>'help_status','');consent:=coalesce((payload->>'public_consent')::boolean,false);problem:=trim(coalesce(payload->>'problem',''));
 if (rating is not null and rating not between 1 and 5) or not tags<@array['kind','clear','helpful','punctual'] or length(problem)>1000
  or (initiator is not null and initiator not in ('none','customer','expert','unknown')) or (help is not null and help not in ('done','ongoing','not_done'))
  or (timing is not null and timing not in ('during','after','unknown')) then raise exception 'feedback_invalid';end if;
 if initiator in ('customer','expert') then if timing is null then raise exception 'feedback_timing_required';end if;else timing:=null;end if;
 if s->>'protection' is distinct from 'true' and (initiator is not null or timing is not null or help is not null) then raise exception 'feedback_not_applicable';end if;
 if who='expert' and (rating is not null or tags<>'{}' or consent) or who='consumer' and help is not null then raise exception 'feedback_forbidden';end if;
 if consent and payload->>'consent_version' is distinct from 'meeting-rating-public-2026-10-12-v1' then raise exception 'feedback_consent_required';end if;
 if rating is null and cardinality(tags)=0 and initiator is null and help is null and problem='' then raise exception 'feedback_empty';end if;
 body:=jsonb_build_object('rating',rating,'tags',tags,'initiator',initiator,'timing',timing,'help_status',help,'public_consent',consent,'consent_version',case when consent then payload->>'consent_version' end,'problem',problem);fp:=md5(body::text);
 select * into old from private.meeting_feedback where kind=k and meeting_id=target and respondent_role=who for update;
 if old.fingerprint=fp then return private.feedback_view(k,target);end if;
 if coalesce(old.revision,0) is distinct from (payload->>'revision')::int then raise exception 'feedback_stale';end if;
 insert into private.meeting_feedback(kind,meeting_id,respondent_role,respondent_id,expert_id,rating,tags,public_consent,consent_version,consented_at,help_status,initiator,timing,problem,fingerprint)
 values(k,target,who,auth.uid(),(s->>'expert')::uuid,rating,tags,consent,case when consent then payload->>'consent_version' end,case when consent then now() end,help,initiator,timing,problem,fp)
 on conflict(kind,meeting_id,respondent_role) do update set rating=excluded.rating,tags=excluded.tags,public_consent=excluded.public_consent,consent_version=excluded.consent_version,
  consented_at=case when old.public_consent and excluded.public_consent then old.consented_at else excluded.consented_at end,help_status=excluded.help_status,initiator=excluded.initiator,timing=excluded.timing,problem=excluded.problem,fingerprint=excluded.fingerprint,revision=old.revision+1,updated_at=now();
 insert into private.feedback_events(kind,meeting_id,actor,event,detail) values(k,target,auth.uid(),'response_saved',body||jsonb_build_object('previous_public_consent',coalesce(old.public_consent,false),'previous_consent_version',old.consent_version));
 perform private.feedback_check_refresh(k,target);
 return private.feedback_view(k,target);
end$$;

create or replace function private.expert_feedback_summary(subject uuid) returns jsonb language sql stable security definer set search_path='' as $$
 with responses as (
  select f.rating,f.tags from private.meeting_feedback f where expert_id=subject and respondent_role='consumer' and public_consent
  union all select r.rating,'{}'::text[] from private.consultation_reviews r join private.consultations c on c.id=r.consultation_id
   where r.planner_id=subject and r.planner_id=c.planner_id and r.visible and r.consent_version='review-public-v1' and c.state='completed' and c.completed_at is not null and c.completion_requested_at is not null and c.customer_ok and c.planner_ok and c.customer_id<>c.planner_id
    and not exists(select 1 from private.meeting_feedback f where f.kind='consultation' and f.meeting_id=r.consultation_id and f.respondent_role='consumer')
 ),stats as(select count(rating)::int n,round(avg(rating),1) mean from responses),tag_counts as(select tag,count(*)::int n from responses,unnest(tags) tag group by tag)
 select jsonb_build_object('count',s.n,'average',case when p.minimum_public_count is not null and s.n>=p.minimum_public_count then s.mean end,
  'state',case when s.n=0 then 'none' when p.minimum_public_count is null or s.n<p.minimum_public_count then 'collecting' else 'ready' end,
  'tags',coalesce((select jsonb_object_agg(tag,n) from tag_counts),'{}')) from stats s cross join private.feedback_policy p where p.id
$$;

do $$begin
 if to_regprocedure('public.command_before_feedback(text,jsonb)') is null then alter function public.consultation_command(text,jsonb) rename to command_before_feedback;end if;
 if to_regprocedure('public.workspace_before_feedback(text)') is null then alter function public.consultation_workspace(text) rename to workspace_before_feedback;end if;
 if to_regprocedure('public.catalog_before_feedback(text,text)') is null then alter function public.planner_catalog(text,text) rename to catalog_before_feedback;end if;
end$$;
create or replace function public.consultation_command(operation text,payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if operation='review' then raise exception 'use_meeting_feedback';end if;
 if operation='publish_review' then
  if not private.is_admin() then raise exception 'admin_required';end if;
  if (payload->>'visible')::boolean is distinct from true and coalesce(payload->>'moderation_category','') not in ('privacy','abuse','not_actual_meeting') then raise exception 'review_reason_required';end if;
 end if;
 return public.command_before_feedback(operation,payload);
end$$;
create or replace function public.consultation_workspace(workspace text) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 result:=public.workspace_before_feedback(workspace);
 return result||jsonb_build_object('meetingFeedbackEnabled',true,'bookings',coalesce((select jsonb_agg((b-'review')||jsonb_build_object(
  'review',case when workspace='customer' or workspace='admin' then b->'review' end,
  'issues',case when workspace='admin' then b->'issues' else coalesce((select jsonb_agg(to_jsonb(i)-'actor') from private.consultation_issues i where i.consultation_id=(b->>'id')::uuid and i.actor=auth.uid()),'[]') end,
  'meeting_feedback',case when nullif(b->>'planner_id','') is not null then private.feedback_view('consultation',(b->>'id')::uuid) end) order by ord)
  from jsonb_array_elements(result->'bookings') with ordinality q(b,ord)),'[]'));
end$$;
create or replace function public.planner_catalog(area text default '',wanted text default '') returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 result:=public.catalog_before_feedback(area,wanted);
 -- Retain the previous list ordering without using new feedback for map positions.
 return result||jsonb_build_object('planners',coalesce((select jsonb_agg((p-'reviews'-'rating')||jsonb_build_object('rating',null,'reviews','[]'::jsonb,'legacy_rating_order',legacy_order,'feedback_summary',private.expert_feedback_summary((p->>'id')::uuid)) order by ord)
  from (select p,ord,dense_rank() over(order by coalesce((p->>'rating')::numeric,0) desc) legacy_order from jsonb_array_elements(result->'planners') with ordinality q(p,ord)) ordered),'[]'));
end$$;
revoke all on function private.feedback_source(text,uuid),private.feedback_view(text,uuid),private.feedback_check_refresh(text,uuid),private.expert_feedback_summary(uuid),public.command_before_feedback(text,jsonb),public.workspace_before_feedback(text),public.catalog_before_feedback(text,text),public.meeting_feedback(text,jsonb),public.consultation_command(text,jsonb),public.consultation_workspace(text),public.planner_catalog(text,text) from public,anon,authenticated;
grant execute on function public.meeting_feedback(text,jsonb),public.consultation_command(text,jsonb),public.consultation_workspace(text) to authenticated;
grant execute on function public.planner_catalog(text,text) to anon,authenticated;
commit;
