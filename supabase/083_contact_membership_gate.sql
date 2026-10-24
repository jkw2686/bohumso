begin;
do $$begin
 if to_regprocedure('public.my_membership_before_contact()') is null then alter function public.my_membership() rename to my_membership_before_contact;end if;
 if to_regprocedure('public.release_status_before_contact()') is null then alter function public.release_status() rename to release_status_before_contact;end if;
end$$;
create or replace function public.my_membership() returns jsonb language sql stable security definer set search_path='' as $$
 select public.my_membership_before_contact()||jsonb_build_object('contact_required',auth.uid() is not null and not exists(select 1 from private.member_contact_details where user_id=auth.uid()))
$$;
create or replace function public.release_status() returns jsonb language sql stable security definer set search_path='' as $$
 select public.release_status_before_contact()||jsonb_build_object('contactReady',exists(select 1 from private.member_contact_details where user_id=auth.uid()))
$$;
-- All other release and membership gates stay unchanged. No phone entry becomes proof of identity.
do $$declare d text;f record;begin
 select pg_get_functiondef('private.require_booking_access()'::regprocedure) into d;
 d:=replace(d,'if not private.beta_phone_verified() then','if private.connection_contact(auth.uid()) is null then');
 d:=replace(d,'if not exists(select 1 from auth.users where id=auth.uid() and phone_confirmed_at is not null) then','if private.connection_contact(auth.uid()) is null then');
 execute d;
 for f in select oid from pg_proc where pronamespace='public'::regnamespace and proname like 'consultation_command%' loop
  d:=pg_get_functiondef(f.oid);d:=replace(d,'private.verified_contact(actor)','private.connection_contact(actor)');
  execute d;
 end loop;
end$$;
revoke all on function public.my_membership_before_contact(),public.release_status_before_contact(),public.my_membership(),public.release_status() from public,anon,authenticated;
grant execute on function public.my_membership(),public.release_status() to authenticated;
-- release_status was public configuration; keep anonymous access without exposing contact data.
grant execute on function public.release_status() to anon,service_role;
commit;
