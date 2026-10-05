begin;
create table private.verification_documents(id uuid primary key default gen_random_uuid(),user_id uuid not null references private.expert_profiles(user_id),kind text not null check(kind in ('registration','appointment')),object_path text not null unique,filename text not null,mime text not null check(mime in ('image/jpeg','image/png','application/pdf')),bytes integer not null check(bytes between 1 and 4194304),deleting boolean not null default false,created_at timestamptz not null default now(),unique(user_id,kind));
alter table private.verification_documents enable row level security;
revoke all on private.verification_documents from public,anon,authenticated;
create function public.early_document_service(subject uuid,operation text,payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare doc private.verification_documents;profile private.expert_profiles; administrator boolean;
begin
 select exists(select 1 from private.admin_memberships where user_id=subject) into administrator;
 if not exists(select 1 from auth.users u join public.member_profiles m on m.user_id=u.id where u.id=subject and u.email_confirmed_at is not null) or exists(select 1 from private.account_lifecycle where user_id=subject and status<>'ACTIVE') then raise exception 'membership_required';end if;
 if operation='save' then
 select * into profile from private.expert_profiles where user_id=subject for update;
 if profile.user_id is null or profile.status in ('SUSPENDED','REJECTED','APPROVED') then raise exception 'application_locked';end if;
 if payload->>'path' not like subject::text||'/%' or payload->>'kind' not in ('registration','appointment') then raise exception 'invalid_document';end if;
 insert into private.verification_documents(user_id,kind,object_path,filename,mime,bytes) values(subject,payload->>'kind',payload->>'path',left(payload->>'filename',120),payload->>'mime',(payload->>'bytes')::integer) returning * into doc;
 update private.expert_profiles set status='VERIFICATION_PENDING',registration_status=case when doc.kind='registration' then 'PENDING' else registration_status end,organization_status=case when doc.kind='appointment' then 'PENDING' else organization_status end,map_visible=false,updated_at=now() where user_id=subject;
 insert into private.consent_records(user_id,type,version,accepted,accepted_at,source) values(subject,'EXPERT_DOCUMENT','2026-10-05-early-access-v1',true,now(),'expert_document_upload');
 insert into private.expert_verification_events(subject,actor,action) values(subject,subject,'DOCUMENT_UPLOADED');
 return jsonb_build_object('document',to_jsonb(doc)-'object_path');
 end if;
 select * into doc from private.verification_documents where id=(payload->>'id')::uuid for update;
 if doc.id is null or (doc.user_id<>subject and not administrator) then raise exception 'request_forbidden';end if;
 if operation='read' then
 if doc.deleting or not administrator then raise exception 'request_forbidden';end if;
 insert into private.expert_verification_events(subject,actor,action) values(doc.user_id,subject,'DOCUMENT_VIEWED');return to_jsonb(doc);
 elsif operation='delete' then
 update private.verification_documents set deleting=true where id=doc.id;
 update private.expert_profiles set status='PROFILE_COMPLETE_VERIFICATION_REQUIRED',map_visible=false,registration_status=case when doc.kind='registration' then 'NOT_SUBMITTED' else registration_status end,organization_status=case when doc.kind='appointment' then 'NOT_SUBMITTED' else organization_status end where user_id=doc.user_id;
 return to_jsonb(doc);
 elsif operation='confirm_delete' then
 if not doc.deleting or doc.object_path<>payload->>'path' then raise exception 'request_forbidden';end if;
 delete from private.verification_documents where id=doc.id;
 insert into private.expert_verification_events(subject,actor,action) values(doc.user_id,subject,'DOCUMENT_DELETED');return '{}'::jsonb;
 end if;
 raise exception 'invalid_operation';
end$$;
create function public.early_expert_documents() returns jsonb language sql stable security definer set search_path='' as $$select coalesce(jsonb_agg(to_jsonb(d)-'object_path'),'[]') from private.verification_documents d where user_id=auth.uid()$$;
create function public.early_expert_review(operation text,payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare subject uuid; p private.expert_profiles;decision text;doc_kind text;reason text;area private.service_areas; phone text;reference text;
begin
 if not private.is_admin() then raise exception 'admin_required';end if;
 if operation='list' then return (select coalesce(jsonb_agg(to_jsonb(e)||jsonb_build_object('documents',(select coalesce(jsonb_agg(to_jsonb(d)-'object_path'),'[]') from private.verification_documents d where d.user_id=e.user_id),'phoneVerified',exists(select 1 from auth.users where id=e.user_id and phone_confirmed_at is not null)) order by e.updated_at desc),'[]') from private.expert_profiles e);end if;
 subject:=(payload->>'user_id')::uuid;if subject=auth.uid() then raise exception 'self_review_forbidden';end if;
 select * into p from private.expert_profiles where user_id=subject for update;
 if p.user_id is null then raise exception 'request_forbidden';end if;
 reason:=trim(payload->>'reason');if reason is null or length(reason)<5 or length(reason)>1000 then raise exception 'evidence_required';end if;
 if operation='verify' then
 doc_kind:=payload->>'kind';decision:=payload->>'decision';
 if doc_kind not in ('registration','appointment') or decision not in ('VERIFIED','NEEDS_RESUBMISSION','REJECTED','EXPIRED') then raise exception 'invalid_operation';end if;
 if decision='VERIFIED' and not exists(select 1 from private.verification_documents where user_id=subject and verification_documents.kind=doc_kind and not deleting) then raise exception 'document_required';end if;
 update private.expert_profiles set registration_status=case when doc_kind='registration' then decision else registration_status end,organization_status=case when doc_kind='appointment' then decision else organization_status end,map_visible=false,status='VERIFICATION_PENDING',updated_at=now() where user_id=subject;
 elsif operation='approve' then
 if p.registration_status<>'VERIFIED' and p.organization_status<>'VERIFIED' then raise exception 'verification_required';end if;
 select u.phone into phone from auth.users u where u.id=subject and u.phone_confirmed_at is not null;
 if phone is null then raise exception 'phone_verification_required';end if;
 if exists(select 1 from private.account_lifecycle where user_id=subject and status<>'ACTIVE') then raise exception 'account_inactive';end if;
 select * into area from private.service_areas where id=p.primary_area;
 reference:=nullif(trim(payload->>'registration_reference'),'');
 if reference is null and p.organization_status='VERIFIED' then select 'appointment:'||id::text into reference from private.verification_documents where user_id=subject and kind='appointment' and not deleting;end if;
 if length(trim(coalesce(payload->>'organization','')))<2 or length(coalesce(reference,''))<2 then raise exception 'evidence_required';end if;
 insert into public.partner_applications(user_id,full_name,profession,organization,region,credential_reference,status,reviewed_by,reviewed_at) values(subject,p.display_name,'planner',payload->>'organization',p.primary_area,reference,'approved',auth.uid(),now()) on conflict(user_id) do update set full_name=excluded.full_name,profession='planner',organization=excluded.organization,region=excluded.region,credential_reference=excluded.credential_reference,status='approved',reviewed_by=auth.uid(),reviewed_at=now();
 insert into private.planner_directory(user_id,specialties,hours,latitude,longitude,phone,verified_by,verified_at,evidence,is_sample,available) values(subject,p.specialties,p.start_hour||':00–'||p.end_hour||':00',area.latitude,area.longitude,case when phone like '+82%' then '0'||substr(phone,4) when phone like '82%' then '0'||substr(phone,3) else phone end,auth.uid(),now(),reason,false,true) on conflict(user_id) do update set specialties=excluded.specialties,hours=excluded.hours,latitude=excluded.latitude,longitude=excluded.longitude,phone=excluded.phone,verified_by=auth.uid(),verified_at=now(),evidence=reason,is_sample=false,available=true;
 update private.expert_profiles set status='APPROVED',map_visible=true,updated_at=now() where user_id=subject;
 elsif operation='suspend' then update private.expert_profiles set status='SUSPENDED',map_visible=false,updated_at=now() where user_id=subject;
 else raise exception 'invalid_operation';end if;
 insert into private.expert_verification_events(subject,actor,action,reason) values(subject,auth.uid(),upper(operation),reason);
 return jsonb_build_object('saved',true);
end$$;
revoke all on function public.early_document_service(uuid,text,jsonb),public.early_expert_documents(),public.early_expert_review(text,jsonb) from public,anon,authenticated;
grant execute on function public.early_document_service(uuid,text,jsonb) to service_role;
grant execute on function public.early_expert_documents(),public.early_expert_review(text,jsonb) to authenticated;
commit;
