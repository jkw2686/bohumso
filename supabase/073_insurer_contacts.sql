-- 전문가 전용 '보험사 연락처' 자료게시판.
-- 표는 private에 두고 public 함수로만 접근한다(이 저장소의 기존 방식).
-- 소비자·비로그인에게는 어떤 경로로도 보이지 않는다. 초기 데이터는 넣지 않는다.
begin;
select pg_advisory_xact_lock(730073);

create table if not exists private.insurer_contacts(
 id uuid primary key default gen_random_uuid(),
 name text not null unique,
 category text not null check(category in ('생명','손해','공제')),
 homepage_url text check(homepage_url is null or homepage_url ~ '^https://[^[:space:]]{3,200}$'),
 portal_url text check(portal_url is null or portal_url ~ '^https://[^[:space:]]{3,200}$'),
 terms_url text check(terms_url is null or terms_url ~ '^https://[^[:space:]]{3,200}$'),
 claim_form_url text check(claim_form_url is null or claim_form_url ~ '^https://[^[:space:]]{3,200}$'),
 tel_customer text check(tel_customer is null or tel_customer ~ '^[0-9-]{3,20}$'),
 tel_incall text check(tel_incall is null or tel_incall ~ '^[0-9-]{3,20}$'),
 tel_it_help text check(tel_it_help is null or tel_it_help ~ '^[0-9-]{3,20}$'),
 fax_claim text check(fax_claim is null or fax_claim ~ '^[0-9-]{3,20}$'),
 sort_order integer not null default 100 check(sort_order between 0 and 100000),
 is_active boolean not null default true,
 verified boolean not null default false,
 memo text check(memo is null or length(memo)<=1000),
 updated_at timestamptz not null default now(),
 updated_by uuid references auth.users(id));
alter table private.insurer_contacts enable row level security;
revoke all on private.insurer_contacts from public,anon,authenticated;
create index if not exists insurer_contacts_order on private.insurer_contacts(category,sort_order,name);

create table if not exists private.insurer_favorites(
 user_id uuid not null references auth.users(id) on delete cascade,
 insurer_id uuid not null references private.insurer_contacts(id) on delete cascade,
 created_at timestamptz not null default now(),
 primary key(user_id,insurer_id));
alter table private.insurer_favorites enable row level security;
revoke all on private.insurer_favorites from public,anon,authenticated;

-- 열람 자격: 관리자 또는 승인된 전문가. 소비자 계정은 어느 조건에도 걸리지 않는다.
create or replace function private.insurer_reader() returns boolean language sql stable security definer set search_path='' as $$
 select private.is_admin() or (private.is_active_member()
  and exists(select 1 from public.partner_applications p where p.user_id=auth.uid() and p.status='approved'))
$$;
revoke all on function private.insurer_reader() from public,anon,authenticated;

create or replace function private.insurer_rows(include_hidden boolean) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(row order by fav desc,sort_order,name),'[]') from (
  select (c.id=f.insurer_id) is not null and f.insurer_id is not null as fav,c.sort_order,c.name,
   jsonb_build_object('id',c.id,'name',c.name,'category',c.category,'homepage_url',c.homepage_url,
    'portal_url',c.portal_url,'terms_url',c.terms_url,'claim_form_url',c.claim_form_url,
    'tel_customer',c.tel_customer,'tel_incall',c.tel_incall,'tel_it_help',c.tel_it_help,
    'fax_claim',c.fax_claim,'sort_order',c.sort_order,'is_active',c.is_active,'verified',c.verified,
    'memo',case when private.is_admin() then c.memo end,'updated_at',c.updated_at,
    'favorite',f.insurer_id is not null) as row
  from private.insurer_contacts c
  left join private.insurer_favorites f on f.insurer_id=c.id and f.user_id=auth.uid()
  where include_hidden or c.is_active) ordered
$$;
revoke all on function private.insurer_rows(boolean) from public,anon,authenticated;

create or replace function public.insurer_contacts_command(operation text,payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare target uuid;rows jsonb;saved uuid;written integer:=0;skipped integer:=0;item jsonb;overwrite boolean;begin
 if not private.insurer_reader() then raise exception 'insurer_access_required';end if;

 if operation='list' then
  return jsonb_build_object('admin',private.is_admin(),'contacts',private.insurer_rows(private.is_admin()));

 elsif operation='favorite' then
  target:=(payload->>'id')::uuid;
  if not exists(select 1 from private.insurer_contacts where id=target and (is_active or private.is_admin())) then raise exception 'insurer_not_found';end if;
  if coalesce((payload->>'on')::boolean,true)
   then insert into private.insurer_favorites(user_id,insurer_id) values(auth.uid(),target) on conflict do nothing;
   else delete from private.insurer_favorites where user_id=auth.uid() and insurer_id=target;end if;
  return jsonb_build_object('contacts',private.insurer_rows(private.is_admin()));
 end if;

 -- 아래부터는 관리자 전용이다.
 if not private.is_admin() then raise exception 'admin_required';end if;

 if operation='save' then
  target:=nullif(payload->>'id','')::uuid;
  insert into private.insurer_contacts as c
   (id,name,category,homepage_url,portal_url,terms_url,claim_form_url,
    tel_customer,tel_incall,tel_it_help,fax_claim,sort_order,is_active,verified,memo,updated_at,updated_by)
  values(coalesce(target,gen_random_uuid()),trim(payload->>'name'),payload->>'category',
    nullif(payload->>'homepage_url',''),nullif(payload->>'portal_url',''),nullif(payload->>'terms_url',''),
    nullif(payload->>'claim_form_url',''),nullif(payload->>'tel_customer',''),nullif(payload->>'tel_incall',''),
    nullif(payload->>'tel_it_help',''),nullif(payload->>'fax_claim',''),
    coalesce((payload->>'sort_order')::integer,100),coalesce((payload->>'is_active')::boolean,true),
    coalesce((payload->>'verified')::boolean,false),nullif(payload->>'memo',''),now(),auth.uid())
  on conflict(id) do update set name=excluded.name,category=excluded.category,homepage_url=excluded.homepage_url,
    portal_url=excluded.portal_url,terms_url=excluded.terms_url,claim_form_url=excluded.claim_form_url,
    tel_customer=excluded.tel_customer,tel_incall=excluded.tel_incall,tel_it_help=excluded.tel_it_help,
    fax_claim=excluded.fax_claim,sort_order=excluded.sort_order,is_active=excluded.is_active,
    verified=excluded.verified,memo=excluded.memo,updated_at=now(),updated_by=auth.uid()
  returning c.id into saved;

 elsif operation='set_active' then
  update private.insurer_contacts set is_active=(payload->>'is_active')::boolean,updated_at=now(),updated_by=auth.uid()
   where id=(payload->>'id')::uuid;
  if not found then raise exception 'insurer_not_found';end if;

 elsif operation='delete' then
  delete from private.insurer_contacts where id=(payload->>'id')::uuid;
  if not found then raise exception 'insurer_not_found';end if;

 elsif operation='import' then
  -- CSV 일괄 등록. name 이 이미 있으면 overwrite 가 true 일 때만 덮어쓴다.
  overwrite:=coalesce((payload->>'overwrite')::boolean,false);
  rows:=coalesce(payload->'rows','[]'::jsonb);
  if jsonb_typeof(rows)<>'array' or jsonb_array_length(rows)>500 then raise exception 'invalid_import';end if;
  for item in select * from jsonb_array_elements(rows) loop
   if exists(select 1 from private.insurer_contacts where name=trim(item->>'name')) and not overwrite
    then skipped:=skipped+1;
   else
    insert into private.insurer_contacts as c
     (name,category,homepage_url,portal_url,terms_url,claim_form_url,tel_customer,tel_incall,tel_it_help,
      fax_claim,sort_order,is_active,verified,memo,updated_at,updated_by)
    values(trim(item->>'name'),item->>'category',nullif(item->>'homepage_url',''),nullif(item->>'portal_url',''),
      nullif(item->>'terms_url',''),nullif(item->>'claim_form_url',''),nullif(item->>'tel_customer',''),
      nullif(item->>'tel_incall',''),nullif(item->>'tel_it_help',''),nullif(item->>'fax_claim',''),
      coalesce((item->>'sort_order')::integer,100),coalesce((item->>'is_active')::boolean,true),
      coalesce((item->>'verified')::boolean,false),nullif(item->>'memo',''),now(),auth.uid())
    on conflict(name) do update set category=excluded.category,homepage_url=excluded.homepage_url,
      portal_url=excluded.portal_url,terms_url=excluded.terms_url,claim_form_url=excluded.claim_form_url,
      tel_customer=excluded.tel_customer,tel_incall=excluded.tel_incall,tel_it_help=excluded.tel_it_help,
      fax_claim=excluded.fax_claim,sort_order=excluded.sort_order,is_active=excluded.is_active,
      verified=excluded.verified,memo=excluded.memo,updated_at=now(),updated_by=auth.uid();
    written:=written+1;
   end if;
  end loop;
  return jsonb_build_object('written',written,'skipped',skipped,'admin',true,'contacts',private.insurer_rows(true));

 else raise exception 'invalid_operation';
 end if;

 return jsonb_build_object('saved',coalesce(saved,(payload->>'id')::uuid),'admin',true,'contacts',private.insurer_rows(true));
end$$;
revoke all on function public.insurer_contacts_command(text,jsonb) from public,anon,authenticated;
grant execute on function public.insurer_contacts_command(text,jsonb) to authenticated;
commit;
