-- Restores the captured gates. New phone-only accounts remain stored but cannot
-- use membership features until an email is verified or phone signup is restored.
begin;
select pg_advisory_xact_lock(51010);
do $rollback$
declare item record;
begin
 for item in select definition from private.phone_signup_backup loop execute item.definition;end loop;
end $rollback$;
commit;
