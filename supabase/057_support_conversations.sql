-- Development candidate only. Apply separately after review; no external delivery or AI provider.
begin;
select pg_advisory_xact_lock(hashtextextended('bohumso-support-conversations',57));
create table if not exists private.support_threads (
 request_id uuid primary key references private.member_rights_requests(id),
 revision integer not null default 1, assigned_to uuid references auth.users(id),
 ai_epoch integer not null default 0, ai_enabled boolean not null default false,
 waiting_since timestamptz, review_reason text not null default '운영자 확인 요청',
 customer_confirmed_at timestamptz, resolution_source text, reopened_count integer not null default 0,
 consultation_id uuid references private.consultations(id)
);
create table if not exists private.support_messages (
 id bigint generated always as identity primary key,
 request_id uuid not null references private.member_rights_requests(id),
 actor uuid references auth.users(id), sender text not null check(sender in ('customer','operator','automatic','note')),
 body text not null check(length(trim(body)) between 1 and 2000), created_at timestamptz not null default now()
);
create index if not exists support_messages_thread on private.support_messages(request_id,id);
create table if not exists private.support_receipts (
 actor uuid not null references auth.users(id), request_key uuid not null,
 operation text not null, payload jsonb not null, result jsonb not null,
 created_at timestamptz not null default now(), primary key(actor,request_key)
);
create table if not exists private.support_ai_runs (
 id uuid primary key, request_id uuid not null references private.member_rights_requests(id), epoch integer not null,
 state text not null default 'running' check(state in ('running','published','discarded','failed')),
 started_at timestamptz not null default now(), finished_at timestamptz,
 summary text check(length(summary)<=2000), input_tokens integer check(input_tokens>=0), output_tokens integer check(output_tokens>=0),
 cost_usd numeric check(cost_usd>=0)
);
alter table private.support_threads enable row level security;
alter table private.support_messages enable row level security;
alter table private.support_receipts enable row level security;
alter table private.support_ai_runs enable row level security;
revoke all on private.support_threads,private.support_messages,private.support_receipts,private.support_ai_runs from public,anon,authenticated,service_role;
insert into private.support_threads(request_id,waiting_since)
 select id,case when response='' then created_at end from private.member_rights_requests on conflict do nothing;

-- Old clients still use the rights RPC: preserve their inquiries and invalidate outstanding automation.
create or replace function private.support_legacy_sync() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='INSERT' then
  insert into private.support_threads(request_id,waiting_since) values(new.id,new.created_at) on conflict do nothing;
 elsif new.response is distinct from old.response and new.response<>'' then
  if not exists(select 1 from private.support_messages where request_id=new.id and sender='operator' and body=new.response) then
   insert into private.support_messages(request_id,actor,sender,body) values(new.id,auth.uid(),'operator',new.response);
  end if;
  update private.support_threads set ai_epoch=ai_epoch+1,assigned_to=auth.uid(),waiting_since=null,revision=revision+1,customer_confirmed_at=null,resolution_source=null where request_id=new.id;
 end if;
 return new;
end$$;
drop trigger if exists support_legacy_sync on private.member_rights_requests;
create trigger support_legacy_sync after insert or update of response on private.member_rights_requests for each row execute function private.support_legacy_sync();
revoke all on function private.support_legacy_sync() from public,anon,authenticated,service_role;

-- Explicit JSON projection: internal notes, job keys and operator identity never enter customer responses.
create or replace function private.support_view(target uuid,admin_view boolean default false) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',r.id,'kind',r.kind,'detail',r.detail,'response',r.response,'status',r.status,
  'created_at',r.created_at,'updated_at',r.updated_at,'revision',t.revision,
  'handling',case when t.assigned_to is not null then 'operator' when t.ai_enabled then 'automatic' else 'review' end,
  'confirmed',t.customer_confirmed_at is not null,'waiting_since',t.waiting_since,
  'messages',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'sender',m.sender,'body',m.body,'created_at',m.created_at) order by m.id)
   from private.support_messages m where m.request_id=r.id and (admin_view or m.sender<>'note')),'[]'::jsonb))
  ||case when admin_view then jsonb_build_object('review_reason',t.review_reason,'reopened_count',t.reopened_count,
   'summary',(select a.summary from private.support_ai_runs a where a.request_id=r.id and a.state='published' order by a.finished_at desc limit 1),
   'related', (select jsonb_build_object('id',c.id,'state',c.state,'preferred_at',c.preferred_at,'method',c.method)
    from private.consultations c where c.id=t.consultation_id and r.user_id in (c.customer_id,c.planner_id))) else '{}'::jsonb end
 from private.member_rights_requests r join private.support_threads t on t.request_id=r.id where r.id=target
$$;

create or replace function public.support_command(operation text,payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare subject uuid:=auth.uid(); admin_user boolean:=private.is_admin(); r private.member_rights_requests;
 t private.support_threads; receipt private.support_receipts; attempt_uuid uuid; target uuid; result jsonb;
 body text:=trim(coalesce(payload->>'body','')); kind text:=coalesce(payload->>'kind','INQUIRY'); related uuid;
begin
 if subject is null then raise exception 'verified_account_required';end if;
 if operation='capabilities' then return jsonb_build_object('version',1,'aiConnected',false,'externalNotifications',false);end if;
 if operation='reservations' then return coalesce((select jsonb_agg(to_jsonb(q) order by q.preferred_at desc) from
  (select c.id,c.state,c.preferred_at,c.method from private.consultations c where subject in (c.customer_id,c.planner_id) order by c.preferred_at desc limit 50) q),'[]');end if;
 if operation in ('admin_list','admin_detail','take','release','reply','note','metrics') and not admin_user then raise exception 'admin_required';end if;
 if operation='mine' then return coalesce((select jsonb_agg(private.support_view(q.id) order by q.created_at desc,q.id) from private.member_rights_requests q where q.user_id=subject),'[]');end if;
 if operation='admin_list' then
  return coalesce((select jsonb_agg(private.support_view(x.id,true) order by x.waiting_since nulls last,x.created_at,x.id) from
   (select q.id,q.created_at,s.waiting_since from private.member_rights_requests q join private.support_threads s on s.request_id=q.id
    order by s.waiting_since nulls last,q.created_at,q.id limit 50 offset greatest(0,coalesce((payload->>'offset')::integer,0))) x),'[]');
 end if;
 if operation='metrics' then return jsonb_build_object(
  'total',(select count(*) from private.member_rights_requests),
  'customerConfirmedAI',(select count(*) from private.support_threads where customer_confirmed_at is not null and resolution_source='automatic'),
  'operatorReview',(select count(*) from private.support_threads where not ai_enabled or assigned_to is not null),
  'reopened',(select count(*) from private.support_threads where reopened_count>0),
  'unresolved',(select count(*) from private.support_threads where customer_confirmed_at is null),
  'operatorActiveSeconds',null,'aiConnected',false,
  'aiRuns',(select count(*) from private.support_ai_runs),
  'knownInputTokens',(select sum(input_tokens) from private.support_ai_runs),
  'knownOutputTokens',(select sum(output_tokens) from private.support_ai_runs),
  'knownCostUSD',(select sum(cost_usd) from private.support_ai_runs),
  'unknownCostRuns',(select count(*) from private.support_ai_runs where cost_usd is null));end if;
 if operation in ('detail','admin_detail') then
  select * into r from private.member_rights_requests where id=(payload->>'id')::uuid;
  if r.id is null or (operation='detail' and r.user_id<>subject) then raise exception 'request_forbidden';end if;
  return private.support_view(r.id,operation='admin_detail');
 end if;
 if operation not in ('create','message','resolve','take','release','reply','note') then raise exception 'invalid_operation';end if;
 attempt_uuid:=nullif(payload->>'request_key','')::uuid;
 if attempt_uuid is null then raise exception 'request_key_required';end if;
 -- Serialize retries for this actor before checking rate limits or executing account actions.
 perform pg_advisory_xact_lock(hashtextextended('support:'||subject::text,57));
 select * into receipt from private.support_receipts where actor=subject and support_receipts.request_key=attempt_uuid;
 if found then
  if receipt.operation<>operation or receipt.payload<>payload then raise exception 'request_key_conflict';end if;
  return receipt.result;
 end if;
 if operation='create' then
  if kind not in ('ACCESS','CORRECT','DELETE','WITHDRAW','INQUIRY','REPORT') or length(body) not between 2 and 2000 then raise exception 'invalid_support_message';end if;
  related:=nullif(payload->>'consultation_id','')::uuid;
  if related is not null and not exists(select 1 from private.consultations c where c.id=related and subject in (c.customer_id,c.planner_id)) then raise exception 'request_forbidden';end if;
  result:=public.member_rights(kind,jsonb_build_object('detail',body,'confirmed',payload->'confirmed'));
  target:=(result->>'id')::uuid;
  update private.support_threads set consultation_id=related where request_id=target;
  insert into private.support_messages(request_id,actor,sender,body) values(target,subject,'customer',body);
 else
  target:=(payload->>'id')::uuid;
  select * into r from private.member_rights_requests where id=target for update;
  if r.id is null or (operation in ('message','resolve') and r.user_id<>subject) then raise exception 'request_forbidden';end if;
  select * into t from private.support_threads where request_id=target for update;
  if t.request_id is null then raise exception 'support_unavailable';end if;
  if operation in ('take','release','reply','note','resolve') and t.revision is distinct from (payload->>'revision')::integer then raise exception 'stale_request';end if;
  if operation in ('message','reply','note') and length(body) not between 2 and 2000 then raise exception 'invalid_support_message';end if;
  if operation in ('reply','note','release') and t.assigned_to is distinct from subject then raise exception 'support_take_required';end if;
  if operation='take' then
   if t.assigned_to is not null and t.assigned_to<>subject then raise exception 'support_already_taken';end if;
   update private.support_threads set assigned_to=subject,ai_epoch=ai_epoch+1 where request_id=target;
   if t.customer_confirmed_at is null then update private.member_rights_requests set status='IN_PROGRESS' where id=target;end if;
  elsif operation='release' then
   if payload->>'confirmed' is distinct from 'true' then raise exception 'confirmation_required';end if;
   -- Release ownership explicitly. AI stays disabled unless an independently reviewed worker enables it.
   update private.support_threads set assigned_to=null,ai_epoch=ai_epoch+1 where request_id=target;
  elsif operation='resolve' then
   if not exists(select 1 from private.support_messages where request_id=target and sender in ('operator','automatic')) and r.response='' then raise exception 'support_answer_required';end if;
   update private.support_threads set customer_confirmed_at=now(),waiting_since=null,ai_epoch=ai_epoch+1,
    resolution_source=coalesce((select sender from private.support_messages where request_id=target and sender in ('operator','automatic') order by id desc limit 1),'operator') where request_id=target;
   update private.member_rights_requests set status='COMPLETED' where id=target;
  else
   insert into private.support_messages(request_id,actor,sender,body) values(target,subject,case operation when 'message' then 'customer' when 'note' then 'note' else 'operator' end,body);
   if operation='message' then
    update private.support_threads set waiting_since=coalesce(waiting_since,now()),customer_confirmed_at=null,resolution_source=null,
     reopened_count=reopened_count+case when t.customer_confirmed_at is not null or r.status in ('COMPLETED','DECLINED') then 1 else 0 end,ai_epoch=ai_epoch+1 where request_id=target;
    update private.member_rights_requests set status='IN_PROGRESS' where id=target;
   elsif operation='reply' then
    update private.support_threads set waiting_since=null,ai_epoch=ai_epoch+1,customer_confirmed_at=null,resolution_source=null where request_id=target;
    update private.member_rights_requests set response=body,status='IN_PROGRESS' where id=target;
   end if;
  end if;
  update private.support_threads set revision=revision+1 where request_id=target;
  update private.member_rights_requests set updated_at=now() where id=target;
  insert into private.member_rights_events(request_id,actor,status) values(target,subject,'SUPPORT_'||upper(operation));
 end if;
 result:=jsonb_build_object('saved',true,'id',target);
 insert into private.support_receipts(actor,request_key,operation,payload,result) values(subject,attempt_uuid,operation,payload,result);
 return result;
end$$;

-- No HTTP endpoint, provider, paid call, booking mutation or browser grant is connected to these guards.
-- Local mock integration exercises the same per-thread locking used by operator takeover.
create or replace function private.support_ai_start(target uuid,job uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare t private.support_threads;a private.support_ai_runs;
begin
 perform 1 from private.member_rights_requests where id=target for update;
 select * into t from private.support_threads where request_id=target for update;
 if t.request_id is null or not t.ai_enabled or t.assigned_to is not null or t.customer_confirmed_at is not null then raise exception 'automatic_response_paused';end if;
 select * into a from private.support_ai_runs where id=job;
 if found then if a.request_id<>target then raise exception 'request_key_conflict';end if;return to_jsonb(a);end if;
 if exists(select 1 from private.support_ai_runs where request_id=target and state in ('running','published') and epoch=t.ai_epoch) then raise exception 'automatic_response_running';end if;
 insert into private.support_ai_runs(id,request_id,epoch) values(job,target,t.ai_epoch) returning * into a;return to_jsonb(a);
end$$;
create or replace function private.support_ai_finish(job uuid,answer text,summary_text text default null,failed boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a private.support_ai_runs;t private.support_threads;target uuid;state_after text;
begin
 select request_id into target from private.support_ai_runs where id=job;
 if target is null then raise exception 'request_forbidden';end if;
 perform 1 from private.member_rights_requests where id=target for update;
 select * into t from private.support_threads where request_id=target for update;
 select * into a from private.support_ai_runs where id=job for update;
 if a.state<>'running' then return jsonb_build_object('state',a.state);end if;
 state_after:=case when failed then 'failed' when not t.ai_enabled or t.assigned_to is not null or t.ai_epoch<>a.epoch or t.customer_confirmed_at is not null then 'discarded' else 'published' end;
 if state_after='published' then
  if length(trim(coalesce(answer,''))) not between 2 and 2000 then raise exception 'invalid_support_message';end if;
  insert into private.support_messages(request_id,sender,body) values(target,'automatic',answer);
  update private.support_threads set revision=revision+1 where request_id=target;
 end if;
 if failed and t.ai_epoch=a.epoch and t.assigned_to is null then update private.support_threads set ai_enabled=false,waiting_since=coalesce(waiting_since,now()),review_reason='자동안내 오류 · 운영자 확인 필요' where request_id=target;end if;
 update private.support_ai_runs set state=state_after,finished_at=now(),summary=case when state_after='published' then summary_text end where id=job;
 return jsonb_build_object('state',state_after);
end$$;
revoke all on function private.support_view(uuid,boolean),private.support_ai_start(uuid,uuid),private.support_ai_finish(uuid,text,text,boolean) from public,anon,authenticated,service_role;
revoke all on function public.support_command(text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.support_command(text,jsonb) to authenticated;
commit;
