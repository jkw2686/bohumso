begin;
select pg_advisory_xact_lock(43001);
-- Preserve the existing contact record, including explicit re-verification blocks.
-- New Auth/SOLAPI confirmations are accepted only when no legacy record exists.
create or replace function private.verified_contact(subject uuid) returns text
language sql stable security definer set search_path='' as $$
 select case when exists(select 1 from private.phone_contacts where user_id=subject)
 then (select phone_e164 from private.phone_contacts where user_id=subject
   and phone_verification_status='OTP_VERIFIED' and phone_verified_at is not null)
 else (select case when phone like '+82%' then phone when phone like '82%' then '+'||phone else '+82'||substr(phone,2) end
   from auth.users where id=subject and phone_confirmed_at is not null
   and phone~'^(\+?82|0)10[0-9]{8}$') end
 where not exists(select 1 from private.account_lifecycle where user_id=subject and status<>'ACTIVE')
$$;
revoke all on function private.verified_contact(uuid) from public,anon,authenticated;
commit;
