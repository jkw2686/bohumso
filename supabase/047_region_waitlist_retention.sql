begin;
create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule('bohumso-region-waitlist-retention','15 * * * *','select private.expire_region_waitlist()');
commit;
