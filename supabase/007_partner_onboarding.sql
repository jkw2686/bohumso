begin;
-- Additive migration for existing account tables; does not rewrite old applications.
alter table public.partner_applications add column if not exists revision integer not null default 1;
alter table public.partner_applications add column if not exists updated_at timestamptz not null default now();
alter table public.partner_applications add column if not exists business_contact text not null default '';
alter table public.partner_applications add column if not exists credential_issuer text not null default '';
alter table public.partner_applications add column if not exists career_years integer not null default 0;
alter table public.partner_applications add column if not exists consultation_modes text[] not null default '{}';
alter table public.partner_applications drop constraint if exists partner_applications_status_check;
alter table public.partner_applications add constraint partner_applications_status_check check(status in ('pending','approved','rejected','suspended','withdrawn'));
alter table public.partner_applications add constraint partner_application_details_check check(char_length(business_contact)<=40 and char_length(credential_issuer)<=120 and career_years between 0 and 80 and consultation_modes <@ array['remote','visit','office']::text[]);
create table private.partner_application_events(
 id bigint generated always as identity primary key,
 user_id uuid not null references auth.users(id) on delete cascade,
 actor uuid, action text not null, snapshot jsonb not null, created_at timestamptz not null default now()
);
revoke all on private.partner_application_events from public,anon,authenticated;
create function private.record_partner_application() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if TG_OP='UPDATE' then new.revision=old.revision+1; end if;
 new.updated_at=now();
 insert into private.partner_application_events(user_id,actor,action,snapshot)
 values(new.user_id,auth.uid(),case when TG_OP='INSERT' then 'submitted' when new.status<>old.status then new.status else 'updated' end,to_jsonb(new));
 return new;
end;$$;
revoke all on function private.record_partner_application() from public,anon,authenticated;
create trigger partner_application_history before insert or update on public.partner_applications for each row execute function private.record_partner_application();
create function public.submit_partner_application(payload jsonb,expected_revision integer default 0) returns void language plpgsql security definer set search_path='' as $$
declare previous public.partner_applications; modes text[]; years integer;
begin
 if auth.uid() is null or not exists(select 1 from public.member_profiles where user_id=auth.uid()) then raise exception 'membership_required';end if;
 perform 1 from auth.users where id=auth.uid() and email_confirmed_at is not null for update;
 if not found then raise exception 'verified_account_required';end if;
 if coalesce(payload->>'verification_consent','false')<>'true' then raise exception 'verification_consent_required';end if;
 if coalesce(payload->>'career_years','') !~ '^([0-9]|[1-7][0-9]|80)$' then raise exception 'invalid_application';end if;
 years=(payload->>'career_years')::integer;
 if jsonb_typeof(payload->'consultation_modes') is distinct from 'array' then raise exception 'invalid_application';end if;
 select array_agg(distinct x) into modes from jsonb_array_elements_text(payload->'consultation_modes') x;
 if coalesce(cardinality(modes),0)=0 or not modes <@ array['remote','visit','office']::text[] then raise exception 'invalid_application';end if;
 if char_length(trim(coalesce(payload->>'full_name',''))) not between 2 and 60
 or payload->>'profession' is null or payload->>'profession' not in ('planner','adjuster','lawyer','corporate','tax','office')
 or char_length(trim(coalesce(payload->>'organization',''))) not between 2 and 120
 or char_length(trim(coalesce(payload->>'region',''))) not between 2 and 120
 or char_length(trim(coalesce(payload->>'credential_reference',''))) not between 2 and 120
 or char_length(trim(coalesce(payload->>'credential_issuer',''))) not between 2 and 120
 or coalesce(payload->>'business_contact','') !~ '^\+?[0-9() -]{8,30}$'
 or char_length(regexp_replace(coalesce(payload->>'business_contact',''),'[^0-9]','','g')) not between 8 and 15
 or coalesce(payload->>'credential_reference','') ~ '[0-9]{6}[ -]?[1-8][0-9]{6}' then raise exception 'invalid_application';end if;
 select * into previous from public.partner_applications where user_id=auth.uid() for update;
 if found then
  if previous.status not in ('pending','rejected','withdrawn') then raise exception 'application_locked';end if;
  if previous.revision is distinct from expected_revision then raise exception 'stale_application';end if;
  update public.partner_applications set full_name=trim(payload->>'full_name'),profession=payload->>'profession',organization=trim(payload->>'organization'),region=trim(payload->>'region'),credential_reference=trim(payload->>'credential_reference'),credential_issuer=trim(payload->>'credential_issuer'),business_contact=trim(payload->>'business_contact'),career_years=years,consultation_modes=modes,status='pending',review_note='',reviewed_by=null,reviewed_at=null where user_id=auth.uid();
 else
  if expected_revision is distinct from 0 then raise exception 'stale_application';end if;
  insert into public.partner_applications(user_id,full_name,profession,organization,region,credential_reference,credential_issuer,business_contact,career_years,consultation_modes)
  values(auth.uid(),trim(payload->>'full_name'),payload->>'profession',trim(payload->>'organization'),trim(payload->>'region'),trim(payload->>'credential_reference'),trim(payload->>'credential_issuer'),trim(payload->>'business_contact'),years,modes);
 end if;
 insert into private.partner_audit(actor,subject,action,reason) values(auth.uid(),auth.uid(),'submitted','qualification_verification_consent:2026-09-21-v1');
end;$$;
create function public.withdraw_partner_application(expected_revision integer) returns void language plpgsql security definer set search_path='' as $$
declare application public.partner_applications;
begin
 if auth.uid() is null then raise exception 'membership_required';end if;
 select * into application from public.partner_applications where user_id=auth.uid() for update;
 if not found or application.status not in ('pending','rejected') then raise exception 'application_locked';end if;
 if application.revision is distinct from expected_revision then raise exception 'stale_application';end if;
 update public.partner_applications set status='withdrawn' where user_id=auth.uid();
 insert into private.partner_audit(actor,subject,action,reason) values(auth.uid(),auth.uid(),'withdrawn','신청자 직접 철회');
end;$$;
create function public.partner_application_history(target_user uuid default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare subject uuid=coalesce(target_user,auth.uid()); result jsonb;
begin
 if auth.uid() is null or (subject<>auth.uid() and not private.is_admin()) then raise exception 'application_forbidden';end if;
 select coalesce(jsonb_agg(jsonb_build_object('action',action,'status',snapshot->>'status','reason',snapshot->>'review_note','revision',snapshot->'revision','created_at',created_at) order by id desc),'[]') into result from (select * from private.partner_application_events where user_id=subject order by id desc limit 50) history;
 return result;
end;$$;
revoke all on function public.submit_partner_application(jsonb,integer),public.withdraw_partner_application(integer),public.partner_application_history(uuid) from public,anon;
grant execute on function public.submit_partner_application(jsonb,integer),public.withdraw_partner_application(integer),public.partner_application_history(uuid) to authenticated;
create function public.review_partner_application(target_user uuid,decision text,reason text,expected_revision integer) returns void language plpgsql security definer set search_path='' as $$
declare current_revision integer;
begin
 if auth.uid() is null or not private.is_admin() then raise exception 'admin_required';end if;
 select revision into current_revision from public.partner_applications where user_id=target_user for update;
 if current_revision is null then raise exception 'application_not_found';end if;
 if current_revision is distinct from expected_revision then raise exception 'stale_application';end if;
 perform public.review_partner(target_user,decision,reason);
end;$$;
revoke all on function public.review_partner_application(uuid,text,text,integer) from public,anon;
grant execute on function public.review_partner_application(uuid,text,text,integer) to authenticated;
commit;
