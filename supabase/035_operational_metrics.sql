begin;
create table private.operational_counters(hour timestamptz not null,event text not null,total bigint not null default 0,primary key(hour,event));
alter table private.operational_counters enable row level security;
revoke all on private.operational_counters from public,anon,authenticated;
create function public.record_operational_event(event_name text) returns void language plpgsql security definer set search_path='' as $$
begin
 if event_name is null or event_name not in ('home_view','signup_started','signup_completed','location_success','location_denied','expert_viewed','reservation_started','reservation_created','reservation_confirmed','consultation_completed','google_auth_failed','email_auth_failed','location_failed','reservation_failed','duplicate_reservation','rls_denied','function_error','payment_test_error') then raise exception 'invalid_event';end if;
 -- Aggregate only: no identity, URL, form values, phone, email, coordinates or document content.
 insert into private.operational_counters(hour,event,total) values(date_trunc('hour',now()),event_name,1) on conflict(hour,event) do update set total=least(private.operational_counters.total+1,100000);
 delete from private.operational_counters where hour<now()-interval '30 days';
end$$;
create function public.operational_metrics() returns jsonb language plpgsql stable security definer set search_path='' as $$begin
 if not private.is_admin() then raise exception 'admin_required';end if;
 return (select coalesce(jsonb_agg(to_jsonb(c) order by hour desc,event),'[]') from private.operational_counters c where hour>now()-interval '30 days');end$$;
revoke all on function public.record_operational_event(text),public.operational_metrics() from public,anon,authenticated;
grant execute on function public.record_operational_event(text) to anon,authenticated;
grant execute on function public.operational_metrics() to authenticated;
commit;
