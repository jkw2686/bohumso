begin;
create function public.expire_consultation_offers() returns integer language plpgsql security definer set search_path='' as $$
declare c private.consultations; total integer:=0;
begin
 for c in select * from private.consultations where state='requested' and automatic and response_deadline<now() order by response_deadline limit 100 for update skip locked loop
  update private.consultations set excluded=case when planner_id is null then excluded else array_append(excluded,planner_id) end,revision=revision+1 where id=c.id;
  insert into private.consultation_events(consultation_id,event,metadata) values(c.id,'offer_expired',jsonb_build_object('planner',c.planner_id));
  perform private.offer_next(c.id);total:=total+1;
 end loop;
 return total;
end $$;
revoke all on function public.expire_consultation_offers() from public,anon,authenticated;
grant execute on function public.expire_consultation_offers() to service_role;
commit;
