begin;
alter table private.member_rights_requests add column response text not null default '' check(length(response)<=2000),add column updated_at timestamptz not null default now();
create table private.member_rights_events(id bigint generated always as identity primary key,request_id uuid not null references private.member_rights_requests(id),actor uuid not null references auth.users(id),status text not null,created_at timestamptz not null default now());
alter table private.member_rights_events enable row level security;
revoke all on private.member_rights_events from public,anon,authenticated;
create function public.admin_member_rights(operation text,payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare r private.member_rights_requests;next_status text:=payload->>'status';
begin
 if not private.is_admin() then raise exception 'admin_required';end if;
 if operation='list' then return (select coalesce(jsonb_agg(to_jsonb(item) order by item.created_at desc),'[]') from (select * from private.member_rights_requests order by created_at desc limit 200) item);end if;
 if operation<>'respond' or next_status is null or next_status not in ('IN_PROGRESS','COMPLETED','DECLINED') or length(trim(coalesce(payload->>'response','')))<5 then raise exception 'invalid_response';end if;
 select * into r from private.member_rights_requests where id=(payload->>'id')::uuid for update;
 if r.id is null then raise exception 'request_forbidden';end if;
 -- A completion note records the operator's work; it never claims to erase retained data automatically.
 update private.member_rights_requests set status=next_status,response=left(payload->>'response',2000),updated_at=now() where id=r.id;
 insert into private.member_rights_events(request_id,actor,status) values(r.id,auth.uid(),next_status);
 return jsonb_build_object('saved',true);
end$$;
revoke all on function public.admin_member_rights(text,jsonb) from public,anon,authenticated;
grant execute on function public.admin_member_rights(text,jsonb) to authenticated;
commit;
