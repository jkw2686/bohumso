begin;
select pg_advisory_xact_lock(610061);

create table if not exists private.growth_settings (
 id boolean primary key default true check(id), weekly_drafts integer not null default 1 check(weekly_drafts between 0 and 4),
 monthly_books integer not null default 1 check(monthly_books between 0 and 2),
 allowed_hosts text[] not null default '{}', publishing_enabled boolean not null default false,
 revision integer not null default 1
);
insert into private.growth_settings(id) values(true) on conflict do nothing;
create table if not exists private.growth_contents (
 id uuid primary key default gen_random_uuid(), source_key text unique,
 draft jsonb not null, revision integer not null default 1,
 review_state text not null default 'review' check(review_state in ('review','approved','excluded')),
 approved_revision integer, approved_by uuid references auth.users(id) on delete set null, approved_at timestamptz,
 published jsonb, published_revision integer, published_at timestamptz,
 scheduled_at timestamptz, publish_error text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists private.growth_tasks (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 title text not null check(length(trim(title)) between 1 and 100), memo text not null default '' check(length(memo)<=300),
 due_date date, completed_at timestamptz, source_id uuid references private.growth_contents(id) on delete set null,
 source_title text, revision integer not null default 1, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists growth_tasks_owner on private.growth_tasks(user_id,due_date);
create table if not exists private.growth_receipts (
 actor uuid not null references auth.users(id) on delete cascade, request_key uuid not null,
 operation text not null, fingerprint text not null, result jsonb not null, created_at timestamptz not null default now(),
 primary key(actor,request_key)
);
alter table private.growth_settings enable row level security;
alter table private.growth_contents enable row level security;
alter table private.growth_tasks enable row level security;
alter table private.growth_receipts enable row level security;
revoke all on private.growth_settings,private.growth_contents,private.growth_tasks,private.growth_receipts from public,anon,authenticated;

create or replace function private.growth_expert() returns boolean language sql stable security definer set search_path='' as $$
 select private.is_active_member() and (exists(select 1 from private.expert_profiles where user_id=auth.uid())
  or exists(select 1 from public.partner_applications where user_id=auth.uid() and status<>'withdrawn'))
$$;

create or replace function private.growth_checks(doc jsonb) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare flags jsonb:='[]'; s jsonb; hostname text; checked date;
begin
 if doc->>'category' not in ('weekly','book','rest','tools') or doc->>'category' is null
  or length(trim(coalesce(doc->>'title',''))) not between 1 and 100 or length(trim(coalesce(doc->>'body',''))) not between 1 and 12000
  or length(trim(coalesce(doc->>'practice',''))) not between 1 and 100
  or doc->>'method' not in ('operator','ai') or doc->>'method' is null
  or jsonb_typeof(doc->'sources') is distinct from 'array' then raise exception 'invalid_content';end if;
 if doc->>'category'='book' and (nullif(trim(doc->>'author'),'') is null or nullif(trim(doc->>'book_title'),'') is null) then flags:=flags||'"book_details"'::jsonb;end if;
 if coalesce(doc->>'origin','')<>'bohumso' and jsonb_array_length(doc->'sources')=0 then flags:=flags||'"source_missing"'::jsonb;end if;
 if doc->>'method'='ai' and jsonb_array_length(doc->'sources')=0 then flags:=flags||'"source_missing"'::jsonb;end if;
 if jsonb_array_length(doc->'sources')>12 then raise exception 'invalid_content';end if;
 checked:=nullif(doc->>'checked_date','')::date;
 if checked is null or checked>(now() at time zone 'Asia/Seoul')::date then flags:=flags||'"check_required"'::jsonb;end if;
 if checked<(now() at time zone 'Asia/Seoul')::date-90 then flags:=flags||'"check_expired"'::jsonb;end if;
 for s in select value from jsonb_array_elements(doc->'sources') loop
  hostname:=lower(substring(s->>'url' from '^https://([a-zA-Z0-9.-]+)(?:/|$)'));
  if hostname is null or not exists(select 1 from private.growth_settings where hostname=any(allowed_hosts)) then flags:=flags||'"source_not_allowed"'::jsonb;end if;
  if coalesce(s->>'status','')<>'ok' then flags:=flags||'"source_check_required"'::jsonb;end if;
  if nullif(s->>'title','') is null or nullif(s->>'collected_at','') is null then flags:=flags||'"source_details"'::jsonb;end if;
 end loop;
 if coalesce((doc->>'advertising')::boolean,false) then flags:=flags||'"advertising_review"'::jsonb;end if;
 if coalesce(doc->>'evidence','')<>'reviewed' then flags:=flags||'"evidence_review"'::jsonb;end if;
 if exists(select 1 from private.growth_contents c where c.draft->>'title'=doc->>'title' and c.id::text is distinct from doc->>'id') then flags:=flags||'"duplicate_title"'::jsonb;end if;
 return flags;
end$$;

create or replace function private.growth_content_view(c private.growth_contents) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',c.id,'draft',c.draft,'revision',c.revision,'review_state',c.review_state,
  'approved_revision',c.approved_revision,'published_revision',c.published_revision,'published_at',c.published_at,
  'scheduled_at',c.scheduled_at,'publish_error',c.publish_error,'created_at',c.created_at,'checks',private.growth_checks(c.draft||jsonb_build_object('id',c.id)))
$$;

create or replace function public.growth_command(operation text,payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare subject uuid:=auth.uid(); target uuid; item private.growth_contents; task private.growth_tasks;
 receipt private.growth_receipts; attempt uuid; result jsonb; doc jsonb; settings private.growth_settings;
begin
 if subject is null or not private.is_active_member() then raise exception 'membership_required';end if;
 if operation='capabilities' then return jsonb_build_object('expert',private.growth_expert(),'admin',private.is_admin(),'owner',private.is_owner(),'version',1);end if;
 if operation like 'admin_%' then
  if not private.is_admin() then raise exception 'admin_required';end if;
 elsif not private.growth_expert() then raise exception 'expert_required';end if;
 if operation='mine' then
  return coalesce((select jsonb_agg(to_jsonb(t)||jsonb_build_object('source_available',exists(select 1 from private.growth_contents c where c.id=t.source_id and c.published is not null)) order by t.created_at desc)
   from private.growth_tasks t where t.user_id=subject),'[]');
 elsif operation='library' then
  return coalesce((select jsonb_agg(c.published||jsonb_build_object('id',c.id,'published_at',c.published_at) order by c.published_at desc)
   from private.growth_contents c where c.published is not null),'[]');
 elsif operation='content' then
  select * into item from private.growth_contents where id=(payload->>'id')::uuid and published is not null;
  if item.id is null then raise exception 'content_unavailable';end if;
  return item.published||jsonb_build_object('id',item.id,'published_at',item.published_at);
 elsif operation='admin_list' then
  return coalesce((select jsonb_agg(private.growth_content_view(c) order by c.created_at desc) from private.growth_contents c),'[]');
 elsif operation='admin_settings' then
  return (select to_jsonb(s)||jsonb_build_object('collection_connected',false,'generation_connected',false,'scheduler_connected',false) from private.growth_settings s);
 end if;
 if operation not in ('task_save','task_complete','task_delete','admin_save','admin_approve','admin_exclude','admin_publish','admin_schedule','admin_unpublish','admin_settings_save') then raise exception 'invalid_operation';end if;
 if operation in ('admin_approve','admin_publish','admin_schedule','admin_settings_save') and not private.is_owner() then raise exception 'owner_required';end if;
 attempt:=nullif(payload->>'request_key','')::uuid;
 if attempt is null then raise exception 'request_key_required';end if;
 perform pg_advisory_xact_lock(hashtextextended('growth:'||subject::text,61));
 select * into receipt from private.growth_receipts where actor=subject and request_key=attempt;
 if found then
  if receipt.operation<>operation or receipt.fingerprint<>md5(payload::text) then raise exception 'request_key_conflict';end if;
  return receipt.result;
 end if;
 if operation like 'task_%' then
  target:=nullif(payload->>'id','')::uuid;
  if target is not null then
   select * into task from private.growth_tasks where id=target and user_id=subject for update;
   if task.id is null then raise exception 'task_forbidden';end if;
   if task.revision is distinct from (payload->>'revision')::integer then raise exception 'stale_record';end if;
  elsif operation<>'task_save' then raise exception 'task_forbidden';end if;
  if operation='task_save' then
   if length(trim(coalesce(payload->>'title',''))) not between 1 and 100 or length(coalesce(payload->>'memo',''))>300 then raise exception 'invalid_task';end if;
   if target is null then
    if nullif(payload->>'source_id','') is not null then
     select * into item from private.growth_contents where id=(payload->>'source_id')::uuid and published is not null;
     if item.id is null then raise exception 'content_unavailable';end if;
    end if;
    insert into private.growth_tasks(user_id,title,memo,due_date,source_id,source_title)
     values(subject,trim(payload->>'title'),coalesce(payload->>'memo',''),nullif(payload->>'due_date','')::date,item.id,item.published->>'title') returning id into target;
   else
    update private.growth_tasks set title=trim(payload->>'title'),memo=coalesce(payload->>'memo',''),due_date=nullif(payload->>'due_date','')::date,revision=revision+1,updated_at=now() where id=target;
   end if;
  elsif operation='task_complete' then
   if payload->>'completed' not in ('true','false') or payload->>'completed' is null then raise exception 'invalid_task';end if;
   update private.growth_tasks set completed_at=case when (payload->>'completed')::boolean then now() else null end,revision=revision+1,updated_at=now() where id=target;
  else delete from private.growth_tasks where id=target and user_id=subject;
  end if;
  result:=jsonb_build_object('saved',true,'id',target);
 elsif operation='admin_settings_save' then
  select * into settings from private.growth_settings for update;
  if settings.revision is distinct from (payload->>'revision')::integer then raise exception 'stale_record';end if;
  if jsonb_typeof(payload->'allowed_hosts')<>'array' or exists(select 1 from jsonb_array_elements_text(payload->'allowed_hosts') h where h!~'^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$') then raise exception 'invalid_hosts';end if;
  update private.growth_settings set weekly_drafts=(payload->>'weekly_drafts')::integer,monthly_books=(payload->>'monthly_books')::integer,
   allowed_hosts=array(select jsonb_array_elements_text(payload->'allowed_hosts')),revision=revision+1;
  result:=jsonb_build_object('saved',true,'id','settings');
 else
  target:=nullif(payload->>'id','')::uuid;
  if target is not null then
   select * into item from private.growth_contents where id=target for update;
   if item.id is null then raise exception 'content_unavailable';end if;
   if item.revision is distinct from (payload->>'revision')::integer then raise exception 'stale_record';end if;
  elsif operation<>'admin_save' then raise exception 'content_unavailable';end if;
  if operation='admin_save' then
   doc:=payload->'content';perform private.growth_checks(doc||jsonb_build_object('id',target));
   if target is null then
    insert into private.growth_contents(draft,source_key) values(doc,nullif(payload->>'source_key','')) returning id into target;
   else
    update private.growth_contents set draft=doc,revision=revision+1,review_state='review',approved_revision=null,approved_by=null,approved_at=null,scheduled_at=null,publish_error=null,updated_at=now() where id=target;
   end if;
  elsif operation='admin_approve' then
   if private.growth_checks(item.draft||jsonb_build_object('id',item.id))<>'[]' then raise exception 'content_review_required';end if;
   update private.growth_contents set review_state='approved',approved_revision=revision,approved_by=subject,approved_at=now(),publish_error=null where id=target;
  elsif operation='admin_exclude' then
   update private.growth_contents set review_state='excluded',approved_revision=null,scheduled_at=null where id=target;
  elsif operation='admin_unpublish' then
   update private.growth_contents set published=null,published_revision=null,scheduled_at=null where id=target;
  else
   if item.review_state<>'approved' or item.approved_revision is distinct from item.revision
    or private.growth_checks(item.draft||jsonb_build_object('id',item.id))<>'[]' then raise exception 'content_review_required';end if;
   if operation='admin_schedule' then
    if nullif(payload->>'scheduled_at','') is null or (payload->>'scheduled_at')::timestamptz<=now() then raise exception 'invalid_schedule';end if;
    update private.growth_contents set scheduled_at=(payload->>'scheduled_at')::timestamptz,publish_error=null where id=target;
   else
    update private.growth_contents set published=draft,published_revision=revision,published_at=now(),scheduled_at=null,publish_error=null where id=target;
   end if;
  end if;
  result:=jsonb_build_object('saved',true,'id',target);
 end if;
 insert into private.growth_receipts(actor,request_key,operation,fingerprint,result) values(subject,attempt,operation,md5(payload::text),result);
 return result;
end$$;

-- Dormant publisher: installation does not create a job or enable the switch.
create or replace function public.growth_publish_due() returns jsonb language plpgsql security definer set search_path='' as $$
declare c private.growth_contents; n integer:=0; held integer:=0;
begin
 perform pg_advisory_xact_lock(610062);
 if not exists(select 1 from private.growth_settings where publishing_enabled) then return jsonb_build_object('enabled',false,'published',0);end if;
 for c in select * from private.growth_contents where scheduled_at<=now() for update loop
  if c.review_state='approved' and c.approved_revision=c.revision and private.growth_checks(c.draft||jsonb_build_object('id',c.id))='[]' then
   update private.growth_contents set published=draft,published_revision=revision,published_at=now(),scheduled_at=null,publish_error=null where id=c.id;n:=n+1;
  else update private.growth_contents set publish_error='content_review_required',scheduled_at=null where id=c.id;held:=held+1;end if;
 end loop;
 return jsonb_build_object('enabled',true,'published',n,'held',held);
end$$;
revoke all on function private.growth_expert(),private.growth_checks(jsonb),private.growth_content_view(private.growth_contents) from public,anon,authenticated;
revoke all on function public.growth_command(text,jsonb),public.growth_publish_due() from public,anon,authenticated;
grant execute on function public.growth_command(text,jsonb) to authenticated;
grant execute on function public.growth_publish_due() to service_role;
commit;
