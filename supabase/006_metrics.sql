begin;
create table private.daily_visit_sessions(day date not null,session_id uuid not null,primary key(day,session_id));
revoke all on private.daily_visit_sessions from public,anon,authenticated;
create function public.record_visit_session(session_id uuid) returns void language sql security definer set search_path='' as $$
 insert into private.daily_visit_sessions(day,session_id) values((now() at time zone 'Asia/Seoul')::date,session_id) on conflict do nothing
$$;
create function public.consultation_metrics() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare today date:=(now() at time zone 'Asia/Seoul')::date;
begin
 if not private.is_admin() then raise exception 'admin_required';end if;
 return jsonb_build_object('date_kst',today,'visit_sessions',(select count(*) from private.daily_visit_sessions where day=today),
 'today_requests',(select count(*) from private.consultations where (created_at at time zone 'Asia/Seoul')::date=today),
 'active_planners',(select count(*) from private.planner_directory d where private.planner_eligible(d.user_id) and d.available),
 'new_planners',(select count(*) from public.partner_applications where (created_at at time zone 'Asia/Seoul')::date=today and profession='planner'),
 'test_paid_won',(select coalesce(sum(amount-refunded_won),0) from private.ad_subscriptions where state in ('active','refunding','refund_failed','refunded')),
 'planner_summary',(select coalesce(jsonb_agg(jsonb_build_object('id',d.user_id,'name',p.full_name,'sample',d.is_sample,'completed',(select count(*) from private.consultations c where c.planner_id=d.user_id and c.state='completed'))),'[]') from private.planner_directory d join public.partner_applications p on p.user_id=d.user_id));
end $$;
revoke all on function public.record_visit_session(uuid),public.consultation_metrics() from public,anon,authenticated;
grant execute on function public.record_visit_session(uuid) to anon,authenticated;
grant execute on function public.consultation_metrics() to authenticated;
commit;
