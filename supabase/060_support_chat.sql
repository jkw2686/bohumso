-- Review candidate: requires 057. No production execution or external delivery.
begin;
select pg_advisory_xact_lock(hashtextextended('bohumso-support-chat',60));
create table if not exists private.support_chat_backup(name text primary key,definition text not null);
alter table private.support_chat_backup enable row level security;
revoke all on private.support_chat_backup from public,anon,authenticated,service_role;
insert into private.support_chat_backup
 select p.oid::regprocedure::text,pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where (n.nspname='public' and p.proname='support_command') or (n.nspname='private' and p.proname in ('support_view','support_legacy_sync','support_ai_start','support_ai_finish')) on conflict do nothing;
alter table private.support_threads add column if not exists chat_state text not null default 'WAITING' check(chat_state in ('WAITING','REVIEWING','WAITING_CUSTOMER','ANSWERED','CLOSED'));
alter table private.support_threads add column if not exists topic text check(topic in ('usage','booking','profile','payment','error','other'));
alter table private.support_threads add column if not exists requester_role text not null default 'consumer' check(requester_role in ('consumer','planner'));
alter table private.support_threads add column if not exists chat_initialized boolean not null default false;
alter table private.support_messages add column if not exists receipt_notice boolean not null default false;
create unique index if not exists support_single_receipt_notice on private.support_messages(request_id) where receipt_notice;
create table if not exists private.support_reads(
 request_id uuid not null references private.member_rights_requests(id),user_id uuid not null references auth.users(id),
 message_id bigint not null default 0,updated_at timestamptz not null default now(),primary key(request_id,user_id)
);
alter table private.support_reads enable row level security;
revoke all on private.support_reads from public,anon,authenticated,service_role;
update private.support_threads t set chat_state=case when customer_confirmed_at is not null then 'CLOSED' when r.response<>'' then 'ANSWERED' when assigned_to is not null then 'REVIEWING' else 'WAITING' end,
 requester_role=case when exists(select 1 from public.partner_applications p where p.user_id=r.user_id) then 'planner' else 'consumer' end,chat_initialized=true
 from private.member_rights_requests r where r.id=t.request_id and not t.chat_initialized;
-- Only receipt notices are automatic in this version; preserve previous history.
update private.support_threads set ai_enabled=false,ai_epoch=ai_epoch+1 where ai_enabled;

create or replace function private.support_legacy_sync() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='INSERT' then
  insert into private.support_threads(request_id,waiting_since,requester_role,chat_initialized)
   values(new.id,new.created_at,case when exists(select 1 from public.partner_applications where user_id=new.user_id) then 'planner' else 'consumer' end,true) on conflict do nothing;
  if length(trim(new.detail))>0 then insert into private.support_messages(request_id,actor,sender,body) values(new.id,new.user_id,'customer',new.detail);end if;
  insert into private.support_messages(request_id,sender,body,receipt_notice) values(new.id,'automatic','문의가 접수되었습니다. 내용을 검토한 후 이 대화창으로 답변드리겠습니다. 확인이 필요한 내용에 따라 답변까지 시간이 걸릴 수 있습니다.',true) on conflict do nothing;
 elsif new.response is distinct from old.response and new.response<>'' then
  if not exists(select 1 from private.support_messages where request_id=new.id and sender='operator' and body=new.response) then
   insert into private.support_messages(request_id,actor,sender,body) values(new.id,auth.uid(),'operator',new.response);
  end if;
  update private.support_threads set ai_enabled=false,ai_epoch=ai_epoch+1,assigned_to=auth.uid(),waiting_since=null,revision=revision+1,
   customer_confirmed_at=null,resolution_source=null,chat_state='ANSWERED' where request_id=new.id;
 end if;
 return new;
end$$;

create or replace function private.support_view(target uuid,admin_view boolean default false) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',r.id,'kind',r.kind,'detail',r.detail,'response',r.response,'status',r.status,
  'created_at',r.created_at,'updated_at',r.updated_at,'revision',t.revision,'topic',t.topic,'role',t.requester_role,'chat_state',t.chat_state,
  'handling',case when t.assigned_to is not null then 'operator' else 'review' end,'can_reply',admin_view and t.assigned_to=auth.uid(),
  'confirmed',t.customer_confirmed_at is not null,'waiting_since',t.waiting_since,
  'last_message_at',coalesce((select max(created_at) from private.support_messages where request_id=r.id and sender<>'note'),r.created_at),
  'last_id',coalesce((select max(id) from private.support_messages where request_id=r.id and (admin_view or sender<>'note')),0),
  'unread',exists(select 1 from private.support_messages m where m.request_id=r.id and m.sender=case when admin_view then 'customer' else 'operator' end
   and m.id>coalesce((select message_id from private.support_reads where request_id=r.id and user_id=auth.uid()),0)),
  'messages',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'sender',m.sender,'body',m.body,'created_at',m.created_at,'receipt_notice',m.receipt_notice) order by m.id)
   from private.support_messages m where m.request_id=r.id and (admin_view or m.sender<>'note')),'[]'::jsonb))
  ||case when admin_view then jsonb_build_object('review_reason',t.review_reason,'reopened_count',t.reopened_count,
   'related',(select jsonb_build_object('id',c.id,'state',c.state,'preferred_at',c.preferred_at,'method',c.method) from private.consultations c
    where c.id=t.consultation_id and r.user_id in (c.customer_id,c.planner_id))) else '{}'::jsonb end
 from private.member_rights_requests r join private.support_threads t on t.request_id=r.id where r.id=target
$$;

create or replace function public.support_command(operation text,payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare subject uuid:=auth.uid(); admin_user boolean:=private.is_admin(); r private.member_rights_requests;
 t private.support_threads; receipt private.support_receipts; attempt_uuid uuid; target uuid; result jsonb;
 body text:=trim(coalesce(payload->>'body','')); kind text:=coalesce(payload->>'kind','INQUIRY'); related uuid; seen bigint; next_state text;
begin
 if subject is null then raise exception 'verified_account_required';end if;
 if operation='capabilities' then return jsonb_build_object('version',2,'receiptOnly',true,'aiConnected',false,'externalNotifications',false);end if;
 if operation in ('admin_list','admin_detail','admin_read','take','release','reply','note','state','metrics') and not admin_user then raise exception 'admin_required';end if;
 if operation='unread' then return jsonb_build_object('count',(select count(distinct q.id) from private.member_rights_requests q join private.support_messages m on m.request_id=q.id
  left join private.support_reads s on s.request_id=q.id and s.user_id=subject where q.user_id=subject and m.sender='operator' and m.id>coalesce(s.message_id,0)));end if;
 if operation='receipt' then
  select s.result into result from private.support_receipts s where actor=subject and request_key=(support_command.payload->>'request_key')::uuid;return result;
 end if;
 if operation='reservations' then return coalesce((select jsonb_agg(to_jsonb(q) order by q.preferred_at desc) from
  (select c.id,c.state,c.preferred_at,c.method from private.consultations c where subject in (c.customer_id,c.planner_id) order by c.preferred_at desc limit 50) q),'[]');end if;
 if operation='mine' then return coalesce((select jsonb_agg(private.support_view(q.id)-'messages'-'detail'-'response' order by q.created_at desc,q.id) from private.member_rights_requests q where q.user_id=subject),'[]');end if;
 if operation='admin_list' then return coalesce((select jsonb_agg(private.support_view(x.id,true)-'messages'-'detail'-'response' order by x.waiting_since nulls last,x.created_at,x.id) from
  (select q.id,q.created_at,s.waiting_since from private.member_rights_requests q join private.support_threads s on s.request_id=q.id
   where coalesce(payload->>'state','')='' or s.chat_state=payload->>'state'
   order by s.waiting_since nulls last,q.created_at,q.id limit 50 offset greatest(0,coalesce((payload->>'offset')::integer,0))) x),'[]');end if;
 if operation='metrics' then return jsonb_build_object('total',(select count(*) from private.support_threads),
  'customerConfirmed',(select count(*) from private.support_threads where customer_confirmed_at is not null),
  'unresolved',(select count(*) from private.support_threads where chat_state<>'CLOSED'),
  'reopened',(select count(*) from private.support_threads where reopened_count>0),'aiConnected',false,'operatorActiveSeconds',null);end if;
 if operation in ('detail','admin_detail') then
  select * into r from private.member_rights_requests where id=(payload->>'id')::uuid;
  if r.id is null or (operation='detail' and r.user_id<>subject) then raise exception 'request_forbidden';end if;
  return private.support_view(r.id,operation='admin_detail');
 end if;
 if operation in ('read','admin_read') then
  select * into r from private.member_rights_requests where id=(payload->>'id')::uuid for update;
  if r.id is null or (operation='read' and r.user_id<>subject) then raise exception 'request_forbidden';end if;
  seen:=(payload->>'message_id')::bigint;
  if seen is null or not exists(select 1 from private.support_messages where id=seen and request_id=r.id and (operation='admin_read' or sender<>'note')) then raise exception 'invalid_read_cursor';end if;
  insert into private.support_reads(request_id,user_id,message_id) values(r.id,subject,seen)
   on conflict(request_id,user_id) do update set message_id=greatest(private.support_reads.message_id,excluded.message_id),updated_at=now();
  return jsonb_build_object('saved',true,'id',r.id);
 end if;
 if operation not in ('create','message','resolve','take','release','reply','note','state') then raise exception 'invalid_operation';end if;
 attempt_uuid:=nullif(payload->>'request_key','')::uuid;
 if attempt_uuid is null then raise exception 'request_key_required';end if;
 perform pg_advisory_xact_lock(hashtextextended('support:'||subject::text,57));
 select * into receipt from private.support_receipts where actor=subject and support_receipts.request_key=attempt_uuid;
 if found then
  if receipt.operation<>operation or receipt.payload<>payload then raise exception 'request_key_conflict';end if;
  return receipt.result;
 end if;
 if operation='create' then
  if kind not in ('ACCESS','CORRECT','DELETE','WITHDRAW','INQUIRY','REPORT') or length(body) not between 1 and 2000 then raise exception 'invalid_support_message';end if;
  if nullif(payload->>'topic','') is not null and payload->>'topic' not in ('usage','booking','profile','payment','error','other') then raise exception 'invalid_support_topic';end if;
  related:=nullif(payload->>'consultation_id','')::uuid;
  if related is not null and not exists(select 1 from private.consultations c where c.id=related and subject in (c.customer_id,c.planner_id)) then raise exception 'request_forbidden';end if;
  result:=public.member_rights(kind,jsonb_build_object('detail',body,'confirmed',payload->'confirmed'));
  target:=(result->>'id')::uuid;
  update private.support_threads set consultation_id=related,topic=nullif(payload->>'topic','') where request_id=target;
 else
  target:=(payload->>'id')::uuid;
  select * into r from private.member_rights_requests where id=target for update;
  if r.id is null or (operation in ('message','resolve') and r.user_id<>subject) then raise exception 'request_forbidden';end if;
  select * into t from private.support_threads where request_id=target for update;
  if t.request_id is null then raise exception 'support_unavailable';end if;
  if operation<>'message' and t.revision is distinct from (payload->>'revision')::integer then raise exception 'stale_request';end if;
  if operation in ('message','reply','note') and length(body) not between 1 and 2000 then raise exception 'invalid_support_message';end if;
  if operation in ('reply','note','release','state') and t.assigned_to is distinct from subject then raise exception 'support_take_required';end if;
  if operation='take' then
   if t.assigned_to is not null and t.assigned_to<>subject then raise exception 'support_already_taken';end if;
   update private.support_threads set assigned_to=subject,ai_enabled=false,ai_epoch=ai_epoch+1,
    chat_state=case when chat_state='WAITING' then 'REVIEWING' else chat_state end where request_id=target;
  elsif operation='release' then
   if payload->>'confirmed' is distinct from 'true' then raise exception 'confirmation_required';end if;
   update private.support_threads set assigned_to=null,ai_enabled=false,ai_epoch=ai_epoch+1,
    chat_state=case when chat_state='REVIEWING' then 'WAITING' else chat_state end where request_id=target;
  elsif operation='resolve' then
   if not exists(select 1 from private.support_messages where request_id=target and sender='operator') and r.response='' then raise exception 'support_answer_required';end if;
   update private.support_threads set chat_state='CLOSED',customer_confirmed_at=now(),waiting_since=null,ai_epoch=ai_epoch+1,resolution_source='operator' where request_id=target;
   update private.member_rights_requests set status='COMPLETED' where id=target;
  elsif operation='state' then
   next_state:=payload->>'state';
   if next_state is null or next_state not in ('CLOSED','WAITING','REVIEWING') then raise exception 'invalid_support_state';end if;
   update private.support_threads set chat_state=next_state,customer_confirmed_at=null,resolution_source=null,
    waiting_since=case when next_state='CLOSED' then null else coalesce(waiting_since,now()) end,ai_epoch=ai_epoch+1 where request_id=target;
   update private.member_rights_requests set status=case when next_state='CLOSED' then 'COMPLETED' else 'IN_PROGRESS' end where id=target;
  else
   insert into private.support_messages(request_id,actor,sender,body) values(target,subject,case operation when 'message' then 'customer' when 'note' then 'note' else 'operator' end,body);
   if operation='message' then
    update private.support_threads set chat_state='WAITING',waiting_since=coalesce(waiting_since,now()),customer_confirmed_at=null,resolution_source=null,
     reopened_count=reopened_count+case when t.chat_state='CLOSED' then 1 else 0 end,ai_epoch=ai_epoch+1 where request_id=target;
    update private.member_rights_requests set status='RECEIVED' where id=target;
   elsif operation='reply' then
    next_state:=coalesce(payload->>'state','ANSWERED');
    if next_state not in ('ANSWERED','WAITING_CUSTOMER') then raise exception 'invalid_support_state';end if;
    update private.member_rights_requests set response=body,status='IN_PROGRESS' where id=target;
    update private.support_threads set chat_state=next_state,waiting_since=null,ai_epoch=ai_epoch+1,customer_confirmed_at=null,resolution_source=null where request_id=target;
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

create or replace function private.support_ai_start(target uuid,job uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin raise exception 'automatic_response_paused';end$$;
create or replace function private.support_ai_finish(job uuid,answer text,summary_text text default null,failed boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$
begin update private.support_ai_runs set state='discarded',finished_at=now() where id=job and state='running';return jsonb_build_object('state','discarded');end$$;
revoke all on function private.support_view(uuid,boolean),private.support_legacy_sync(),private.support_ai_start(uuid,uuid),private.support_ai_finish(uuid,text,text,boolean) from public,anon,authenticated,service_role;
revoke all on function public.support_command(text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.support_command(text,jsonb) to authenticated;
commit;
