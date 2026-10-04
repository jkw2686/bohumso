begin;
create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule('bohumso-urgent-retention','* * * * *','select private.expire_urgent()');
commit;
