-- Owner-only publication by explicit self-declaration. Document verification is untouched.
begin;
select pg_advisory_xact_lock(4040042);
create table if not exists private.owner_publication_declarations(
 user_id uuid primary key references private.admin_access_owner(user_id),
 organization text not null, reason text not null, declared_at timestamptz not null default now()
);
alter table private.owner_publication_declarations enable row level security;
revoke all on private.owner_publication_declarations from public,anon,authenticated;
do $$begin
 if to_regprocedure('private.planner_eligible_before_owner_declaration(uuid)') is null then
  alter function private.planner_eligible(uuid) rename to planner_eligible_before_owner_declaration;
 end if;
 if to_regprocedure('public.early_expert_review_before_owner_declaration(text,jsonb)') is null then
  alter function public.early_expert_review(text,jsonb) rename to early_expert_review_before_owner_declaration;
 end if;
end$$;
revoke all on function private.planner_eligible_before_owner_declaration(uuid),public.early_expert_review_before_owner_declaration(text,jsonb) from public,anon,authenticated;
create or replace function private.planner_eligible(subject uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.planner_eligible_before_owner_declaration(subject) or exists(
  select 1 from private.owner_publication_declarations d
  join private.admin_access_owner o on o.user_id=d.user_id
  join private.admin_memberships m on m.user_id=o.user_id
  join auth.users u on u.id=o.user_id
  join public.member_profiles mp on mp.user_id=u.id
  join private.expert_profiles p on p.user_id=u.id
  join public.partner_applications a on a.user_id=u.id
  join private.planner_directory directory on directory.user_id=u.id
  where u.id=subject and lower(u.email)=o.email and u.email_confirmed_at is not null
   and p.status='APPROVED' and p.map_visible and a.status='approved' and a.profession='planner'
   and private.verified_contact(subject) is not null
   and (nullif(to_jsonb(u)->>'banned_until','')::timestamptz is null or (to_jsonb(u)->>'banned_until')::timestamptz<=now())
   and exists(select 1 from public.member_consents c where c.user_id=subject and c.version<>'')
   and not exists(select 1 from private.account_lifecycle where user_id=subject and status<>'ACTIVE')
 )
$$;
create or replace function public.early_expert_review(operation text,payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare subject uuid; p private.expert_profiles; area private.service_areas; phone text; org text; why text;
begin
 if operation<>'approve' or payload->>'registration_reference' is distinct from 'OWNER_DECLARATION' then
  return public.early_expert_review_before_owner_declaration(operation,payload);
 end if;
 subject:=(payload->>'user_id')::uuid;
 if not private.is_owner() or subject is distinct from auth.uid() then raise exception 'owner_required';end if;
 if not private.is_active_member() then raise exception 'membership_required';end if;
 phone:=private.verified_contact(subject);if phone is null then raise exception 'phone_verification_required';end if;
 org:=trim(payload->>'organization');why:=trim(payload->>'reason');
 if coalesce(length(org),0) not between 2 and 120 or coalesce(length(why),0) not between 5 and 1000 then raise exception 'evidence_required';end if;
 select * into p from private.expert_profiles where user_id=subject for update;
 if p.user_id is null or p.status in ('SUSPENDED','REJECTED') then raise exception 'application_locked';end if;
 select * into area from private.service_areas where id=p.primary_area;
 if area.id is null then raise exception 'invalid_area';end if;
 insert into private.owner_publication_declarations(user_id,organization,reason) values(subject,org,why)
 on conflict(user_id) do update set organization=excluded.organization,reason=excluded.reason,declared_at=now();
 insert into public.partner_applications(user_id,full_name,profession,organization,region,credential_reference,status,reviewed_by,reviewed_at)
 values(subject,p.display_name,'planner',org,p.primary_area,'OWNER_DECLARATION','approved',subject,now())
 on conflict(user_id) do update set full_name=excluded.full_name,profession=excluded.profession,organization=excluded.organization,region=excluded.region,credential_reference=excluded.credential_reference,status=excluded.status,reviewed_by=excluded.reviewed_by,reviewed_at=excluded.reviewed_at;
 insert into private.planner_directory(user_id,specialties,hours,latitude,longitude,phone,evidence,is_sample,available)
 values(subject,p.specialties,p.start_hour||':00–'||p.end_hour||':00',area.latitude,area.longitude,'0'||substr(phone,4),'대표자 본인 확인: '||why,false,true)
 on conflict(user_id) do update set specialties=excluded.specialties,hours=excluded.hours,latitude=excluded.latitude,longitude=excluded.longitude,phone=excluded.phone,evidence=excluded.evidence,is_sample=false,available=true;
 -- No VERIFIED document status, verified_at or verified_by is fabricated.
 -- Explicit publication applies only to this owner profile, not historical test data.
 if exists(select 1 from pg_catalog.pg_attribute where attrelid='private.planner_directory'::regclass and attname='is_test' and not attisdropped) then
  execute 'update private.planner_directory set is_test=false where user_id=$1' using subject;
 end if;
 if exists(select 1 from pg_catalog.pg_attribute where attrelid='public.partner_applications'::regclass and attname='is_test' and not attisdropped) then
  execute 'update public.partner_applications set is_test=false where user_id=$1' using subject;
 end if;
 update private.expert_profiles set status='APPROVED',map_visible=true,updated_at=now() where user_id=subject;
 insert into private.expert_verification_events(subject,actor,action,reason) values(subject,subject,'OWNER_DECLARED_PUBLICATION',why);
 return jsonb_build_object('saved',true,'verification_method','OWNER_DECLARATION');
end$$;
revoke all on function private.planner_eligible(uuid),public.early_expert_review(text,jsonb) from public,anon,authenticated;
grant execute on function public.early_expert_review(text,jsonb) to authenticated;
commit;
