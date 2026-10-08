begin;
create or replace function private.verified_contact(subject uuid) returns text language sql stable security definer set search_path='' as $$
 select phone_e164 from private.phone_contacts where user_id=subject and phone_verification_status='OTP_VERIFIED' and phone_verified_at is not null and not exists(select 1 from private.account_lifecycle where user_id=subject and status<>'ACTIVE')
$$;
revoke all on function private.verified_contact(uuid) from public,anon,authenticated;
commit;
