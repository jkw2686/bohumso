-- Auth/SOLAPI OTP and explicit membership consent are both required.
begin;
select pg_advisory_xact_lock(51010);
create table if not exists private.phone_signup_backup (
 signature text primary key, definition text not null, created_at timestamptz not null default now()
);
alter table private.phone_signup_backup enable row level security;
revoke all on private.phone_signup_backup from public,anon,authenticated;
do $migration$
declare signature text; routine regprocedure; original text; updated text; old_gate text; new_gate text;
begin
 if to_regprocedure('private.verified_contact(uuid)') is null then raise exception 'phone_bridge_required';end if;
 foreach signature in array array[
  'private.is_active_member()',
  'public.complete_membership(boolean,boolean,boolean,boolean)',
  'public.early_document_service(uuid,text,jsonb)',
  'public.release_status()'
 ] loop
  routine:=to_regprocedure(signature);
  if routine is null then raise exception 'phone_signup_baseline_missing: %',signature;end if;
  original:=pg_get_functiondef(routine);
  if signature='public.release_status()' then
   old_gate:='''phoneEnabled'', r.phone_enabled';
   if position(old_gate in original)=0 then old_gate:='''phoneEnabled'',r.phone_enabled';end if;
   new_gate:='''phoneSignupEnabled'',true,'||old_gate;
   if position('''phoneSignupEnabled''' in original)>0 then continue;end if;
  else
   if position('private.verified_contact' in original)>0 then continue;end if;
   if signature like 'public.complete_membership%' then
    old_gate:='email_confirmed_at is not null';
    new_gate:='(email_confirmed_at is not null or (phone_confirmed_at is not null and private.verified_contact(id) is not null))';
   else
    old_gate:='u.email_confirmed_at is not null';
    new_gate:='(u.email_confirmed_at is not null or (u.phone_confirmed_at is not null and private.verified_contact(u.id) is not null))';
   end if;
  end if;
  if position(old_gate in original)=0 then raise exception 'phone_signup_gate_changed: %',signature;end if;
  insert into private.phone_signup_backup(signature,definition) values(signature,original) on conflict do nothing;
  updated:=replace(original,old_gate,new_gate);
  execute updated;
 end loop;
end $migration$;
-- Function grants, owner authorization, document review, RLS and stored rows remain unchanged.
commit;
