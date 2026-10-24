begin;
-- Preserve all qualification predicates; change only the extra OTP prerequisite.
-- Do not touch auth.users, roster identity matching, is_active_member or account recovery.
do $$declare f record;s text;begin
 for f in select oid from pg_proc where pronamespace in('public'::regnamespace,'private'::regnamespace)
 and (proname like 'early_expert_review%' or proname like 'planner_eligible%') loop
  s:=pg_get_functiondef(f.oid);
  s:=replace(s,'select u.phone into phone from auth.users u where u.id=subject and u.phone_confirmed_at is not null;','phone:=private.connection_contact(subject);');
  s:=replace(s,'select u.phone into phone from auth.users u where id=target and phone_confirmed_at is not null;','phone:=private.connection_contact(target);');
  s:=replace(s,'private.verified_contact(target) is null','private.connection_contact(target) is null');
  s:=replace(s,'and u.phone_confirmed_at is not null and private.verified_contact(subject) is not null','and private.connection_contact(subject) is not null');
  s:=replace(s,'and u.phone_confirmed_at is not null)','and private.connection_contact(subject) is not null)');
  execute s;
 end loop;
end$$;
commit;
