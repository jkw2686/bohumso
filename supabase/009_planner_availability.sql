begin;
alter table private.planner_directory add column availability_status text not null default 'scheduled' check(availability_status in ('now','today','scheduled','unavailable'));
alter table private.planner_directory add column availability_until timestamptz;
create function public.set_planner_availability(status text) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not private.planner_eligible(auth.uid()) or not exists(select 1 from public.member_profiles where user_id=auth.uid()) then raise exception 'planner_required';end if;
 if status is null or status not in ('now','today','scheduled','unavailable') then raise exception 'invalid_availability';end if;
 update private.planner_directory set availability_status=status,available=status<>'unavailable',availability_until=case when status='now' then now()+interval '1 hour' when status='today' then (date_trunc('day',now() at time zone 'Asia/Seoul')+interval '1 day') at time zone 'Asia/Seoul' else null end where user_id=auth.uid();
 insert into private.consultation_events(actor,event,metadata) values(auth.uid(),'availability_changed',jsonb_build_object('status',status));
 return jsonb_build_object('saved',true);
end $$;
revoke all on function public.set_planner_availability(text) from public,anon;
grant execute on function public.set_planner_availability(text) to authenticated;
create or replace function public.planner_catalog(area text default '',wanted text default '') returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('planners',coalesce((
 select jsonb_agg(jsonb_build_object('id',d.user_id,'name',p.full_name,'organization',p.organization,'region',p.region,'specialties',d.specialties,'biography',d.biography,'experience',d.experience,'photo_url',d.photo_url,'available',d.available,'availability_status',case when not d.available then 'unavailable' when d.availability_until>now() then d.availability_status else 'scheduled' end,'availability_until',d.availability_until,'hours',d.hours,'latitude',d.latitude,'longitude',d.longitude,'is_sample',d.is_sample,'verified',d.verified_at is not null,'completed_count',(select count(*) from private.consultations c where c.planner_id=d.user_id and c.state='completed'),'rating',(select round(avg(r.rating),1) from private.consultation_reviews r where r.planner_id=d.user_id and r.visible),'reviews',(select coalesce(jsonb_agg(jsonb_build_object('rating',r.rating,'body',r.body,'created_at',r.created_at)),'[]') from private.consultation_reviews r where r.planner_id=d.user_id and r.visible)) order by p.full_name)
 from private.planner_directory d join public.partner_applications p on p.user_id=d.user_id where private.planner_eligible(d.user_id) and (area='' or p.region like area||'%') and (wanted='' or private.specialty_match(wanted,d.specialties))),'[]'::jsonb))
$$;


commit;
