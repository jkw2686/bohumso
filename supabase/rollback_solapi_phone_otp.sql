-- Operational rollback: retains contact/OTP tables and user history. Disable Netlify phone switch first.
begin;
CREATE OR REPLACE FUNCTION private.urgent_eligible(subject uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$select private.planner_eligible(subject)$function$;

CREATE OR REPLACE FUNCTION private.require_booking_access()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if not private.is_active_member() then raise exception 'membership_required';end if;
 if not exists(select 1 from private.release_controls where policies_approved) then raise exception 'policies_not_approved';end if;
 if not private.beta_allowed() then raise exception 'beta_invitation_required';end if;
 if not exists(select 1 from auth.users where id=auth.uid() and phone_confirmed_at is not null) then raise exception 'phone_verification_required';end if;
end $function$;

CREATE OR REPLACE FUNCTION public.release_status()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select jsonb_build_object('serviceStage',f.stage,'signupEnabled',f.public_signup and f.customer_signup,'expertApplicationsEnabled',f.expert_applications,'phoneDurationMinutes',f.phone_duration_minutes,'policiesApproved',r.policies_approved,'closedBeta',f.invite_only,'betaAllowed',private.beta_allowed(),'phoneEnabled',r.phone_enabled,'phoneVerified',exists(select 1 from auth.users where id=auth.uid() and phone_confirmed_at is not null)) from private.release_controls r cross join private.service_features f
$function$;

CREATE OR REPLACE FUNCTION public.urgent_command(operation text, payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$begin
 if operation in ('request','start') then perform private.require_booking_access();end if;
 return public.urgent_command_before_release(operation,payload);
end $function$;

CREATE OR REPLACE FUNCTION public.consultation_command(operation text, payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare c private.consultations; result jsonb; rid uuid; target uuid;office text; stamp timestamptz;verified_phone text;
begin
 if not private.is_active_member() then raise exception 'membership_required';end if;
 if operation='request' then
 perform private.require_booking_access();
 perform pg_advisory_xact_lock(hashtextextended('customer:'||auth.uid()::text,33));
 if nullif(payload->>'request_key','') is null then raise exception 'request_key_required';end if;
 select id into rid from private.consultations where customer_id=auth.uid() and request_key=(payload->>'request_key')::uuid;
 if rid is not null then return jsonb_build_object('id',rid,'replay',true);end if;
 target:=nullif(payload->>'planner_id','')::uuid;office:=nullif(payload->>'office_id','');stamp:=(payload->>'preferred_at')::timestamptz;
 perform private.check_reservation_slot(target,office,stamp,null,payload->>'method');
 else
 select * into c from private.consultations where id=nullif(payload->>'id','')::uuid for update;
 if operation in ('propose','office_assign','confirm','office_confirm','accept') then
 if c.id is null or not (c.customer_id=auth.uid() or c.planner_id=auth.uid() or private.is_admin()) then raise exception 'request_forbidden';end if;
 target:=case when operation='office_assign' then (payload->>'planner_id')::uuid else c.planner_id end;
 stamp:=case when operation='propose' then (payload->>'preferred_at')::timestamptz else c.preferred_at end;
 perform private.check_reservation_slot(target,c.office_id,stamp,c.id,c.method);
 end if;
 end if;
 if operation='followup_confirm' then
 if c.id is null or not (c.customer_id=auth.uid() or c.planner_id=auth.uid()) then raise exception 'request_forbidden';end if;
 select preferred_at into stamp from private.followup_meetings where id=(payload->>'followup_id')::uuid and consultation_id=c.id and state='proposed';
 perform private.check_reservation_slot(c.planner_id,null,stamp,c.id);
 end if;
 if operation in ('confirm','office_confirm') then
 if payload->>'share_consent' is distinct from 'true' then raise exception 'consent_required';end if;
 select phone into verified_phone from auth.users where id=auth.uid() and phone_confirmed_at is not null;
 if verified_phone is null then raise exception 'phone_verification_required';end if;
 payload:=payload||jsonb_build_object('phone',case when verified_phone like '+82%' then '0'||substr(verified_phone,4) when verified_phone like '82%' then '0'||substr(verified_phone,3) else verified_phone end);
 -- Reuse contact disclosure validation for both direct and assigned reservations.
 operation:='confirm';
 end if;
 result:=public.consultation_command_before_integrity(operation,payload);
 if operation='request' then update private.consultations set request_key=(payload->>'request_key')::uuid,duration_minutes=private.reservation_duration(office,payload->>'method') where id=(result->>'id')::uuid;end if;
 if operation='accept' and c.allocation_mode='office' then update private.consultations set state='coordinating',customer_ok=false where id=c.id;end if;
 if operation='confirm' then insert into private.consent_records(user_id,type,version,accepted,accepted_at,source) values(auth.uid(),'THIRD_PARTY_PROVISION','2026-10-05-early-access-v1',true,now(),'reservation:'||c.id::text||':recipient:'||c.planner_id::text);end if;
 return result;
end$function$;

CREATE OR REPLACE FUNCTION public.early_expert_review_before_roster(operation text, payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
end$function$;

CREATE OR REPLACE FUNCTION private.match_expert_roster()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare roster private.organization_roster;u jsonb;phone_value text;
begin
 if new.status in ('SUSPENDED','REJECTED') or new.organization_status<>'NOT_SUBMITTED' then return new;end if;
 select to_jsonb(a) into u from auth.users a where id=new.user_id;
 phone_value:=regexp_replace(coalesce(u->>'phone',''),'[^0-9]','','g');if phone_value like '82%' then phone_value:='0'||substr(phone_value,3);end if;
 select * into roster from private.organization_roster r where expires_at>now() and ((u->>'email_confirmed_at' is not null and email_hash=encode(sha256(convert_to(lower(u->>'email'),'UTF8')),'hex')) or (u->>'phone_confirmed_at' is not null and phone_value<>'' and phone_hash=encode(sha256(convert_to(phone_value,'UTF8')),'hex'))) order by created_at desc limit 1;
 if roster.id is not null then new.organization_status:='VERIFIED';new.roster_id:=roster.id;new.status:='VERIFICATION_PENDING';new.map_visible:=false;insert into private.expert_verification_events(subject,actor,action) values(new.user_id,new.user_id,'ORGANIZATION_ROSTER_MATCH');end if;
 return new;
end$function$;

CREATE OR REPLACE FUNCTION private.planner_eligible(subject uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$select private.planner_eligible_before_roster(subject) and exists(select 1 from private.expert_profiles p where p.user_id=subject and (p.registration_status='VERIFIED' or p.roster_id is null or exists(select 1 from private.organization_roster r where r.id=p.roster_id and r.expires_at>now())))$function$;

revoke all on function public.phone_otp_service(uuid,text,jsonb),public.my_phone_status() from public,anon,authenticated,service_role;
-- Legacy write RPCs stay revoked; keep the supported reservation flow.
commit;
