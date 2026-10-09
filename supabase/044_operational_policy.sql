-- Apply only after the PRODUCTION-compatible application build is published.
-- No existing consent rows, users, bookings, roles or Storage policies are changed.
begin;
select pg_advisory_xact_lock(44009);
create table if not exists private.operational_policy_backup (
 name text primary key, snapshot jsonb not null, created_at timestamptz not null default now()
);
alter table private.operational_policy_backup enable row level security;
revoke all on private.operational_policy_backup from public,anon,authenticated;
insert into private.operational_policy_backup(name,snapshot)
select '2026-10-09-v1',jsonb_build_object(
 'release',(select to_jsonb(r) from private.release_controls r where id),
 'features',(select to_jsonb(f) from private.service_features f where id),
 'functions',(select jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,'definition',pg_get_functiondef(p.oid)))
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname in ('private','public') and p.prokind='f'),
 'columns',(select jsonb_agg(to_jsonb(c)) from information_schema.columns c where c.table_schema in ('private','public')),
 'policies',(select jsonb_agg(to_jsonb(p)) from pg_policies p where schemaname in ('private','public','storage'))
) on conflict(name) do nothing;
-- Replace only the version constant in consent-writing routines. Preserve all
-- live production fixes (OTP bridge, owner exception, notifications, permissions).
do $migration$
declare r record;
begin
 for r in select p.oid,pg_get_functiondef(p.oid) as definition
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.prokind='f'
 and position('2026-10-05-early-access-v1' in p.prosrc)>0
 loop
  execute replace(r.definition,'2026-10-05-early-access-v1','2026-10-09-v1');
 end loop;
 if not exists(select 1 from private.release_controls where id)
 or not exists(select 1 from private.service_features where id) then
  raise exception 'release_configuration_missing';
 end if;
end $migration$;
update private.release_controls set policies_approved=true,closed_beta=false where id;
update private.service_features set stage='PRODUCTION',public_signup=true,customer_signup=true,expert_applications=true,invite_only=false where id;
commit;
