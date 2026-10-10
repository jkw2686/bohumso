begin;
drop trigger if exists expert_booking_profile_sync on private.expert_profiles;
do $$declare r record;begin for r in select definition from private.booking_hardening_backup order by name loop execute r.definition;end loop;end$$;
-- Keep backup rows and all reservations. New wrappers remain private and unused.
commit;
