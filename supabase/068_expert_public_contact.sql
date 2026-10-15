-- Optional explicitly consented public contact. Never copies an authentication or consultation phone.
begin;
select pg_advisory_xact_lock(hashtextextended('expert-public-contact-v1',68));
create table if not exists private.expert_public_contacts(
 user_id uuid primary key references auth.users(id) on delete cascade,
 phone text not null default '',is_public boolean not null default false,
 consent_version text,consented_at timestamptz,updated_at timestamptz not null default now(),
 check(not is_public or(phone ~ '^(0[1-9][0-9]{7,10}|1[568][0-9]{6})$' and consent_version is not distinct from 'expert-public-phone-v1' and consented_at is not null))
);
alter table private.expert_public_contacts enable row level security;
revoke all on private.expert_public_contacts from public,anon,authenticated;
create or replace function public.expert_public_contact(operation text default 'get',payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();number text;publish boolean;begin
 if not private.is_active_member() then raise exception 'membership_required';end if;
 if operation='set' then
  number:=regexp_replace(coalesce(payload->>'phone',''),'[- ()]','','g');
  if jsonb_typeof(payload->'public') is distinct from 'boolean' then raise exception 'invalid_setting';end if;
  publish:=(payload->>'public')::boolean;
  if number<>'' and number!~'^(0[1-9][0-9]{7,10}|1[568][0-9]{6})$' then raise exception 'invalid_phone';end if;
  if (number<>'' or publish) and not exists(select 1 from public.partner_applications p where p.user_id=actor and p.profession in('planner','adjuster','tax','corporate') and p.status not in('rejected','suspended','withdrawn')) then raise exception 'expert_required';end if;
  if publish and(number='' or payload->'consent' is distinct from 'true'::jsonb or payload->>'consent_version' is distinct from 'expert-public-phone-v1') then raise exception 'public_contact_consent_required';end if;
  insert into private.expert_public_contacts(user_id,phone,is_public,consent_version,consented_at)
   values(actor,number,publish,case when publish then 'expert-public-phone-v1' end,case when publish then now() end)
   on conflict(user_id) do update set phone=excluded.phone,is_public=excluded.is_public,consent_version=excluded.consent_version,consented_at=excluded.consented_at,updated_at=now();
 elsif operation<>'get' then raise exception 'invalid_operation';end if;
 return coalesce((select jsonb_build_object('phone',phone,'public',is_public,'consentVersion',consent_version) from private.expert_public_contacts where user_id=actor),jsonb_build_object('phone','','public',false));
end$$;
create or replace function public.expert_public_phone(expert_id uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',c.user_id,'phone',c.phone) from private.expert_public_contacts c
 where c.user_id=expert_id and c.is_public and c.consent_version='expert-public-phone-v1' and c.consented_at is not null
 and exists(select 1 from jsonb_array_elements(public.planner_catalog('','')->'planners') p where p->>'id'=expert_id::text and coalesce((p->>'is_sample')::boolean,false)=false)
$$;
revoke all on function public.expert_public_contact(text,jsonb),public.expert_public_phone(uuid) from public,anon,authenticated;
grant execute on function public.expert_public_contact(text,jsonb) to authenticated;
grant execute on function public.expert_public_phone(uuid) to anon,authenticated;
commit;
