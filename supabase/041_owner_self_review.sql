-- Evidence, verified phone, lifecycle and audit checks remain in place.
begin;
select pg_advisory_xact_lock(4040041);
do $$declare definition text;before_guard text:='if subject=auth.uid() then raise exception ''self_review_forbidden'';end if;';after_guard text:='if subject=auth.uid() and not private.is_owner() then raise exception ''self_review_forbidden'';end if;';begin
 definition:=pg_get_functiondef('public.early_expert_review_before_roster(text,jsonb)'::regprocedure);
 if position(after_guard in definition)>0 then return;end if;
 if position(before_guard in definition)=0 then raise exception 'unexpected_review_function';end if;
 definition:=replace(definition,before_guard,after_guard);
 definition:=replace(definition,'values(subject,auth.uid(),upper(operation),reason)','values(subject,auth.uid(),case when subject=auth.uid() then ''OWNER_SELF_''||upper(operation) else upper(operation) end,reason)');
 execute definition;
end$$;
commit;
