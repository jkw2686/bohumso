begin;
-- Self-entered contact data is never an authentication credential or real-name proof.
create table if not exists private.member_contact_details(
 user_id uuid primary key references auth.users(id) on delete cascade, name text not null,
 phone text not null check(phone ~ '^010[0-9]{8}$'),
 member_type text not null check(member_type in('consumer','expert')),
 region text not null default '', contact_status text not null default 'UNCONFIRMED'
 check(contact_status in('UNCONFIRMED','CALL_CONFIRMED')),
 confirmed_at timestamptz, confirmed_by uuid, updated_at timestamptz not null default now());
create table if not exists private.member_privacy_events(
 id bigint generated always as identity primary key, actor uuid not null, subject uuid,
 action text not null, created_at timestamptz not null default now());
alter table private.member_contact_details enable row level security;
alter table private.member_privacy_events enable row level security;
revoke all on private.member_contact_details,private.member_privacy_events from public,anon,authenticated;
create or replace function public.member_contact(operation text default 'get',payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); d private.member_contact_details; n text; p text; k text; begin
 if actor is null then raise exception 'authentication_required';end if;
 if exists(select 1 from private.account_lifecycle where user_id=actor and status<>'ACTIVE') then raise exception 'account_inactive';end if;
 if operation not in('get','save') then raise exception 'invalid_operation';end if;
 perform pg_advisory_xact_lock(hashtextextended('member-contact:'||actor::text,79));
 select * into d from private.member_contact_details where user_id=actor;
 if operation='save' then
  if d.user_id is null and payload->>'privacy_accepted' is distinct from 'true' then raise exception 'consent_required';end if;
  n:=trim(payload->>'name');p:=regexp_replace(coalesce(payload->>'phone',''),'[ -]','','g');k:=payload->>'member_type';
  if length(n) not between 2 and 60 or n is null or n ~ '[[:cntrl:]]' or p !~ '^010[0-9]{8}$' or k is null or k not in('consumer','expert') then raise exception 'invalid_contact';end if;
  -- No lookup/deduplication by phone, and no updates to auth.users or expert approval.
  insert into private.member_contact_details(user_id,name,phone,member_type) values(actor,n,p,k)
  on conflict(user_id) do update set name=excluded.name,phone=excluded.phone,member_type=excluded.member_type,
   contact_status=case when member_contact_details.phone=excluded.phone then member_contact_details.contact_status else 'UNCONFIRMED' end,
   confirmed_at=case when member_contact_details.phone=excluded.phone then member_contact_details.confirmed_at end,
   confirmed_by=case when member_contact_details.phone=excluded.phone then member_contact_details.confirmed_by end,updated_at=now();
  insert into private.member_privacy_events(actor,subject,action) values(actor,actor,'contact_updated');
  if d.user_id is null then insert into private.consent_records(user_id,type,version,accepted,accepted_at,source) values(actor,'PRIVACY_COLLECTION','2026-10-24-contact-v1',true,now(),'member_contact');end if;
  select * into d from private.member_contact_details where user_id=actor;
 end if;
 if d.user_id is null then
  select coalesce(nullif(to_jsonb(m)->>'full_name',''),nullif(e.display_name,''),a.full_name,''),
   regexp_replace(coalesce(private.verified_contact(actor),''),'^\+?82','0'),
   case when a.user_id is not null or e.user_id is not null then 'expert' else 'consumer' end
  into n,p,k from public.member_profiles m left join private.expert_profiles e on e.user_id=m.user_id left join public.partner_applications a on a.user_id=m.user_id where m.user_id=actor;
  return jsonb_build_object('complete',false,'name',coalesce(n,''),'phone',coalesce(p,''),'member_type',coalesce(k,'consumer'),'contact_status','UNCONFIRMED');
 end if;
 return jsonb_build_object('complete',true,'name',d.name,'phone',d.phone,'member_type',d.member_type,'contact_status',d.contact_status,'identity_verified',false);
end$$;
revoke all on function public.member_contact(text,jsonb) from public,anon;
grant execute on function public.member_contact(text,jsonb) to authenticated;
-- Separate unverified contact use from the existing verified_contact function.
create or replace function private.connection_contact(subject uuid) returns text language sql stable security definer set search_path='' as $$
 select coalesce((select phone from private.member_contact_details where user_id=subject),private.verified_contact(subject))
 where not exists(select 1 from private.account_lifecycle where user_id=subject and status<>'ACTIVE')
$$;
revoke all on function private.connection_contact(uuid) from public,anon,authenticated;
-- Narrow change to dateless expert connections; office and historic scheduling remain intact.
do $$declare definition text;begin
 select pg_get_functiondef('public.consultation_command(text,jsonb)'::regprocedure) into definition;
 if position('private.verified_contact(actor)' in definition)>0 then
  definition:=replace(definition,'perform private.require_booking_access();',
   'if not exists(select 1 from private.release_controls where policies_approved) then raise exception ''policies_not_approved'';end if; if not private.beta_allowed() then raise exception ''beta_invitation_required'';end if;');
  definition:=replace(definition,'private.verified_contact(actor)','private.connection_contact(actor)');
  definition:=replace(definition,'number:=private.connection_contact(actor);',
   'if (select count(*) from private.consultations where customer_id=actor and created_at>now()-interval ''1 hour'')>=10 then raise exception ''request_rate_limit'';end if; number:=private.connection_contact(actor);');
  definition:=replace(definition,'insert into private.consultations(customer_id,planner_id,purpose,region,method,preferred_at,request_key,connection_only)',
   'customer_name:=coalesce((select name from private.member_contact_details where user_id=actor),customer_name); insert into private.consultations(customer_id,planner_id,purpose,region,method,preferred_at,request_key,connection_only)');
  execute definition;
 elsif position('private.connection_contact(actor)' in definition)=0 then raise exception 'connection_definition_review_required';end if;
end$$;
create or replace function public.record_contact_outcome(consultation_id uuid,outcome text) returns void language plpgsql security definer set search_path='' as $$
declare c private.consultations; p text; begin
 if outcome not in('CALL_CONFIRMED','UNREACHABLE','DENIED_REQUEST','REPEATED_PRANK') then raise exception 'invalid_outcome';end if;
 select * into c from private.consultations where id=consultation_id for update;
 if c.id is null or c.planner_id is distinct from auth.uid() or not c.planner_ok or c.state not in('coordinating','scheduled','awaiting_completion','completed') or not private.planner_eligible(auth.uid()) then raise exception 'request_forbidden';end if;
 select phone into p from private.consultation_contacts x where x.consultation_id=c.id and recipient=auth.uid();
 if p is null then raise exception 'contact_not_available';end if;
 if outcome='CALL_CONFIRMED' then update private.member_contact_details set contact_status='CALL_CONFIRMED',confirmed_at=now(),confirmed_by=auth.uid() where user_id=c.customer_id and phone=p;end if;
 insert into private.member_privacy_events(actor,subject,action) values(auth.uid(),c.customer_id,'contact_'||outcome);
end$$;
revoke all on function public.record_contact_outcome(uuid,text) from public,anon;
grant execute on function public.record_contact_outcome(uuid,text) to authenticated;
-- New membership completion requires contact entry; existing members are supplemented, not recreated.
do $$begin
 if to_regprocedure('public.complete_membership_before_contact(boolean,boolean,boolean,boolean)') is null then alter function public.complete_membership(boolean,boolean,boolean,boolean) rename to complete_membership_before_contact;end if;
end$$;
create or replace function public.complete_membership(terms_accepted boolean,privacy_accepted boolean,age_accepted boolean,marketing_accepted boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$begin
 if auth.uid() is null then raise exception 'authentication_required';end if;
 if not exists(select 1 from private.member_contact_details where user_id=auth.uid()) then raise exception 'contact_required';end if;
 return public.complete_membership_before_contact(terms_accepted,privacy_accepted,age_accepted,marketing_accepted);
end$$;
revoke all on function public.complete_membership_before_contact(boolean,boolean,boolean,boolean),public.complete_membership(boolean,boolean,boolean,boolean) from public,anon,authenticated;
grant execute on function public.complete_membership(boolean,boolean,boolean,boolean) to authenticated;
create or replace function private.erase_withdrawn_member_contact() returns trigger language plpgsql security definer set search_path='' as $$begin
 if new.status='WITHDRAWN' then delete from private.member_contact_details where user_id=new.user_id;
  insert into private.member_privacy_events(actor,subject,action) values(new.user_id,new.user_id,'contact_erased_on_withdrawal');
 end if;return new;
end$$;
drop trigger if exists erase_withdrawn_member_contact on private.account_lifecycle;
create trigger erase_withdrawn_member_contact after insert or update of status on private.account_lifecycle for each row execute function private.erase_withdrawn_member_contact();
revoke all on function private.erase_withdrawn_member_contact() from public,anon,authenticated;
commit;
