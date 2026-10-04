begin;
-- API roles already have no table grants. Add default-deny RLS in depth.
-- Existing SECURITY DEFINER functions run as their owner and retain role checks.
do $$declare t record;begin
 for t in select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='private' and c.relkind='r' and not c.relrowsecurity loop
  execute format('alter table private.%I enable row level security',t.relname);
 end loop;
end $$;
commit;
