-- Stop optional public contact access without deleting consent records or changing reservations.
begin;
revoke all on function public.expert_public_contact(text,jsonb),public.expert_public_phone(uuid) from public,anon,authenticated;
commit;
