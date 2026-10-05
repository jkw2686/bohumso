begin;
alter table private.consultations add column is_beta boolean not null default false;
create table private.beta_experts (
 user_id uuid primary key references private.beta_members on delete cascade,
 status text not null default 'PENDING' check(status in ('PENDING','APPROVED','REJECTED','SUSPENDED')),
 profile_complete boolean not null default false, map_visibility_enabled boolean not null default false,
 reviewed_by uuid references auth.users, reviewed_at timestamptz, review_note text not null default '',updated_at timestamptz not null default now()
);
alter table private.beta_experts enable row level security;
revoke all on private.beta_experts from public,anon,authenticated;
create function private.beta_expert_eligible(subject uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.release_controls where closed_beta) and private.beta_member(subject) and private.beta_phone_verified(subject)
 and exists(select 1 from private.beta_members b join private.beta_experts e using(user_id) join private.expert_service_areas a using(user_id) where b.user_id=subject and b.role='EXPERT' and e.status='APPROVED' and e.profile_complete and e.map_visibility_enabled)
$$;
alter function private.planner_eligible(uuid) rename to planner_eligible_before_beta;
create function private.planner_eligible(target uuid) returns boolean language sql stable security definer set search_path='' as $$
 select case when exists(select 1 from private.beta_members where user_id=target) then (private.beta_member() or private.is_admin()) and private.beta_expert_eligible(target) else private.planner_eligible_before_beta(target) end
$$;
alter function public.my_membership() rename to my_membership_before_beta_expert;
revoke all on function public.my_membership_before_beta_expert() from public,anon,authenticated;
create function public.my_membership() returns jsonb language sql stable security definer set search_path='' as $$
 select public.my_membership_before_beta_expert()||jsonb_build_object('state',case when private.is_admin() then 'ADMIN' when private.beta_member() and exists(select 1 from private.beta_members where user_id=auth.uid() and role='EXPERT') then case when private.beta_expert_eligible(auth.uid()) then 'EXPERT_APPROVED' else 'EXPERT_PENDING' end else public.my_membership_before_beta_expert()->>'state' end,
 'betaExpertStatus',(select status from private.beta_experts where user_id=auth.uid()))
$$;
create function public.beta_expert(operation text,payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare actor uuid:=auth.uid(); target uuid; name text; job text; organization text; tags text[]; hours text; decision text;
begin
 if operation='review' or operation='list' then
  if not private.is_admin() then raise exception 'admin_required';end if;
  if operation='list' then return (select coalesce(jsonb_agg(to_jsonb(e)||jsonb_build_object('name',p.full_name,'profession',p.profession,'region',p.region,'specialties',d.specialties,'hours',d.hours,'phoneVerified',private.beta_phone_verified(e.user_id)) order by e.updated_at desc),'[]') from private.beta_experts e join public.partner_applications p using(user_id) join private.planner_directory d using(user_id));end if;
  target:=(payload->>'userId')::uuid;decision:=payload->>'decision';
  if target=actor then raise exception 'self_review_forbidden';end if;
  if decision is null or decision not in ('APPROVED','REJECTED','SUSPENDED') or length(trim(coalesce(payload->>'reason','')))<3 then raise exception 'invalid_review';end if;
  perform 1 from private.beta_experts where user_id=target for update;
  if not found then raise exception 'application_not_found';end if;
  if decision='APPROVED' and (not private.beta_member(target) or not private.beta_phone_verified(target) or not exists(select 1 from private.beta_experts e join private.expert_service_areas a using(user_id) where e.user_id=target and e.profile_complete)) then raise exception 'profile_required';end if;
  update private.beta_experts set status=decision,map_visibility_enabled=decision='APPROVED',reviewed_by=actor,reviewed_at=now(),review_note=left(payload->>'reason',500),updated_at=now() where user_id=target;
  update public.partner_applications set status=lower(decision),reviewed_by=actor,reviewed_at=now(),review_note='비공개 베타 검토' where user_id=target;
  insert into private.beta_audit(actor,subject,event) values(actor,target,'EXPERT_'||decision);
  return jsonb_build_object('saved',true);
 end if;
 if not private.beta_member() or not exists(select 1 from private.beta_members where user_id=actor and role='EXPERT') then raise exception 'expert_required';end if;
 if operation='settings' then return jsonb_build_object('expert',(select to_jsonb(e)-'reviewed_by' from private.beta_experts e where user_id=actor),'profile',(select jsonb_build_object('name',p.full_name,'profession',p.profession,'organization',p.organization,'specialties',d.specialties,'hours',d.hours) from public.partner_applications p left join private.planner_directory d using(user_id) where p.user_id=actor),'phoneVerified',private.beta_phone_verified());end if;
 if operation<>'save' then raise exception 'invalid_operation';end if;
 if not private.beta_phone_verified() then raise exception 'phone_verification_required';end if;
 name:=trim(payload->>'name');job:=payload->>'profession';organization:=trim(payload->>'organization');hours:=trim(payload->>'hours');tags:=array(select jsonb_array_elements_text(payload->'specialties'));
 if name is null or length(name) not between 2 and 60 or job is null or job not in ('planner','adjuster') or organization is null or length(organization) not between 2 and 120 or hours is null or length(hours) not between 2 and 200 or cardinality(tags) not between 1 and 6 or not(tags<@array['claim','coverage','death','illness','medical','accident']) then raise exception 'invalid_application';end if;
 if payload->>'pledge' is distinct from 'true' then raise exception 'consent_required';end if;
 insert into public.partner_applications(user_id,full_name,profession,organization,region,credential_reference) values(actor,name,job,organization,'활동지역 설정 대기','BETA-NO-DOCUMENT')
 on conflict(user_id) do update set full_name=excluded.full_name,profession=excluded.profession,organization=excluded.organization,status='pending';
 -- No fabricated identity verification. Real public catalog continues to exclude this sample row.
 insert into private.planner_directory(user_id,specialties,hours,available,is_sample,phone) values(actor,tags,hours,true,true,coalesce((select phone from private.beta_members where user_id=actor),''))
 on conflict(user_id) do update set specialties=excluded.specialties,hours=excluded.hours,available=true,is_sample=true,phone=excluded.phone;
 insert into private.beta_experts(user_id,profile_complete) values(actor,true) on conflict(user_id) do update set status='PENDING',profile_complete=true,map_visibility_enabled=false,updated_at=now();
 insert into private.beta_audit(actor,subject,event) values(actor,actor,'EXPERT_PROFILE_PLEDGE_2026_10_05');
 return jsonb_build_object('saved',true);
end $$;
-- Every activity-region edit requires a fresh review; changing a centroid never grants approval.
create function private.beta_area_changed() returns trigger language plpgsql security definer set search_path='' as $$begin
 update private.beta_experts set status='PENDING',map_visibility_enabled=false,updated_at=now() where user_id=new.user_id;
 if found then update public.partner_applications set region=new.primary_area,status='pending' where user_id=new.user_id;end if;
 return new;
end $$;
create trigger beta_area_review after insert or update on private.expert_service_areas for each row execute function private.beta_area_changed();
alter function public.planner_catalog(text,text) rename to planner_catalog_before_beta;
revoke all on function public.planner_catalog_before_beta(text,text) from public,anon,authenticated;
create function public.planner_catalog(area text default '',wanted text default '') returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('planners',
 coalesce((select jsonb_agg(p) from jsonb_array_elements(public.planner_catalog_before_beta(area,wanted)->'planners') p where not exists(select 1 from private.beta_members where user_id=(p->>'id')::uuid)),'[]')||
 coalesce((select jsonb_agg(jsonb_build_object('id',e.user_id,'name',p.full_name,'organization',p.organization,'region',s.primary_area,'specialties',d.specialties,'biography','비공개 베타 참여 전문가','experience',0,'photo_url','','available',d.available,'hours',d.hours,'is_sample',false,'beta',true,'verified',false,'area_latitude',a.latitude,'area_longitude',a.longitude,'primary_service_area',a.name,'availability_status','scheduled','completed_count',0,'reviews','[]'::jsonb))
 from private.beta_experts e join public.partner_applications p using(user_id) join private.planner_directory d using(user_id) join private.expert_service_areas s using(user_id) join private.service_areas a on a.id=s.primary_area
 where (private.beta_member() or private.is_admin()) and private.beta_expert_eligible(e.user_id) and (area='' or s.primary_area like area||'%') and (wanted='' or private.specialty_match(wanted,d.specialties))),'[]'))
$$;
alter function public.consultation_command(text,jsonb) rename to consultation_command_before_beta;
revoke all on function public.consultation_command_before_beta(text,jsonb) from public,anon,authenticated;
create function public.consultation_command(operation text,payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare target uuid; slot timestamptz; current_id uuid; existing_id uuid; result jsonb; c private.consultations;
begin
 if not private.is_active_member() then raise exception 'membership_required';end if;
 if operation='office_assign' and not private.is_admin() then raise exception 'admin_required';end if;
 if operation='profile' and exists(select 1 from private.beta_members where user_id=auth.uid()) then raise exception 'beta_profile_required';end if;
 if operation='verify_planner' and exists(select 1 from private.beta_members where user_id=(payload->>'planner_id')::uuid) then raise exception 'beta_review_required';end if;
 if operation='request' then
  perform private.require_booking_access();
  perform 1 from public.member_profiles where user_id=auth.uid() for update;
  select id into existing_id from private.consultations where customer_id=auth.uid() and request_key=nullif(payload->>'request_key','')::uuid;
  if existing_id is not null then return jsonb_build_object('id',existing_id,'replay',true);end if;
  target:=nullif(payload->>'planner_id','')::uuid;slot:=(payload->>'preferred_at')::timestamptz;
  if target is not null and private.beta_member() is distinct from exists(select 1 from private.beta_members where user_id=target) then raise exception 'beta_scope_mismatch';end if;
 elsif operation in ('propose','office_assign','followup_confirm') then
  select * into c from private.consultations where id=(payload->>'id')::uuid;
  if c.id is null or (not private.is_admin() and c.customer_id is distinct from auth.uid() and c.planner_id is distinct from auth.uid()) then raise exception 'request_forbidden';end if;
  current_id:=c.id;target:=c.planner_id;slot:=c.preferred_at;
  if operation='propose' then slot:=(payload->>'preferred_at')::timestamptz;end if;
  if operation='office_assign' then target:=(payload->>'planner_id')::uuid;end if;
  if operation='followup_confirm' then select preferred_at into slot from private.followup_meetings where id=(payload->>'followup_id')::uuid and consultation_id=current_id;end if;
 end if;
 if target is not null and slot is not null then
  -- Shared row lock serializes request/propose/allocation with confirmation, across DB connections.
  perform 1 from private.planner_directory where user_id=target for update;
  if exists(select 1 from private.consultations where planner_id=target and preferred_at=slot and id is distinct from current_id and state in ('requested','coordinating','confirmed','scheduled','awaiting_completion')) or exists(select 1 from private.followup_meetings where planner_id=target and preferred_at=slot and state='confirmed') then raise exception 'invalid_slot';end if;
 end if;
 if operation='office_assign' then
  if not private.is_admin() then raise exception 'admin_required';end if;
  select * into c from private.consultations where id=current_id for update;
  if c.is_beta is distinct from exists(select 1 from private.beta_members where user_id=target) then raise exception 'beta_scope_mismatch';end if;
  if c.is_beta then
   if c.allocation_mode<>'office' or c.state not in ('requested','coordinating') or c.preferred_at<=now() or not private.beta_expert_eligible(target) or target=c.customer_id then raise exception 'invalid_transition';end if;
   if c.revision is distinct from (payload->>'revision')::integer then raise exception 'stale_request';end if;
   update private.consultations set planner_id=target,planner_ok=false,customer_ok=true,state='requested',revision=revision+1,updated_at=now() where id=current_id;
   insert into private.consultation_events(consultation_id,actor,event,metadata) values(current_id,auth.uid(),'office_assigned',jsonb_build_object('planner',target,'beta',true));
   return jsonb_build_object('id',current_id,'saved',true);
  end if;
 end if;
 result:=public.consultation_command_before_beta(operation,payload);
 if operation='request' then update private.consultations set is_beta=private.beta_member(),request_key=nullif(payload->>'request_key','')::uuid where id=(result->>'id')::uuid and customer_id=auth.uid();end if;
 return result;
end $$;
revoke all on function private.beta_expert_eligible(uuid),private.planner_eligible_before_beta(uuid),private.planner_eligible(uuid),private.beta_area_changed(),public.beta_expert(text,jsonb),public.my_membership(),public.planner_catalog(text,text),public.consultation_command(text,jsonb) from public,anon,authenticated;
grant execute on function public.beta_expert(text,jsonb),public.my_membership(),public.consultation_command(text,jsonb) to authenticated;
grant execute on function public.planner_catalog(text,text) to anon,authenticated;
commit;
