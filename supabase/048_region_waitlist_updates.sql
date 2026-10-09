begin;
select pg_advisory_xact_lock(420042);
alter table private.region_waitlist add column if not exists last_notified_at timestamptz;
alter table private.region_waitlist add column if not exists notified_at timestamptz;
create unique index if not exists region_waitlist_unique on private.region_waitlist(region,role,contact);
create index if not exists region_waitlist_region on private.region_waitlist(region,role);
create index if not exists region_waitlist_contact_day on private.region_waitlist(contact,created_at);
alter table private.region_waitlist enable row level security;
revoke all on private.region_waitlist from public,anon,authenticated;
create or replace function private.expire_region_waitlist() returns void language sql security definer set search_path='' as $$
 delete from private.region_waitlist where (consent_version<>'2026-10-09-v2' and coalesce(notified_at,last_notified_at) is not null) or created_at < now()-interval '1 year';
$$;
revoke all on function private.expire_region_waitlist() from public,anon,authenticated;
create or replace function public.region_waitlist(operation text,payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare area text:=btrim(payload->>'region'); kind text:=payload->>'role'; phone text:=payload->>'contact';
 wanted text:=nullif(payload->>'need',''); item private.region_waitlist; result jsonb; stamp timestamptz;
begin
 if operation='counts' then
  if not coalesce(private.is_admin(),false) then raise exception 'admin_required';end if;
  select coalesce(jsonb_agg(to_jsonb(t) order by t.consumers+t.planners desc,t.latest_at desc,t.region),'[]'::jsonb) into result from
   (select region,count(*) filter(where role='consumer') consumers,count(*) filter(where role='planner') planners,max(created_at) latest_at
    from private.region_waitlist where (consent_version='2026-10-09-v2' or coalesce(notified_at,last_notified_at) is null) and created_at>=now()-interval '1 year' group by region) t;
  return result;
 elsif operation is distinct from 'join' then raise exception 'invalid_operation';end if;
 if payload->'consent' is distinct from 'true'::jsonb then raise exception 'consent_required';end if;
 if area is null or length(area) not between 1 and 120 then raise exception 'invalid_region';end if;
 if kind is null or kind not in ('consumer','planner') then raise exception 'invalid_role';end if;
 if phone is null or phone !~ '^0[0-9]{8,10}$' then raise exception 'invalid_contact';end if;
 if wanted is not null and wanted not in ('claim','illness','medical','accident','death','coverage','other') then raise exception 'invalid_need';end if;
 perform pg_advisory_xact_lock(hashtextextended(phone,420042));
 perform pg_advisory_xact_lock(hashtextextended(area||':'||kind,420043));
 select * into item from private.region_waitlist w where w.region=area and w.role=kind and w.contact=phone;
 if not found then
  if (select count(*) from private.region_waitlist w where w.contact=phone and w.created_at>=current_date::timestamptz)>=5 then raise exception 'rate_limited';end if;
  stamp:=clock_timestamp();
  insert into private.region_waitlist(region,role,contact,need,consent_version,consented_at,created_at)
   values(area,kind,phone,wanted,case when payload->>'consent_scope'='regional_updates' then '2026-10-09-v2' else '2026-10-09' end,stamp,stamp) returning * into item;
 end if;
 return jsonb_build_object('position',(select count(*)+1 from private.region_waitlist w where w.region=area and w.role=kind and (w.created_at,w.id)<(item.created_at,item.id)));
exception when check_violation or not_null_violation or invalid_text_representation then raise exception 'invalid_input';
end;
$$;
revoke all on function public.region_waitlist(text,jsonb) from public;
grant execute on function public.region_waitlist(text,jsonb) to anon,authenticated;
commit;
