-- NEW empty test DB only. Counts on a clean fixture: 18 private tables, 26 public RPCs.
-- Supabase extensions add public functions; do not compare the total public function count.
select expected.name as missing_table
from (values ('planner_directory'),('consultations'),('ad_plans'),('ad_slots'),('ad_subscriptions'),('ad_impressions'),('ad_audit')) expected(name)
where not exists(select 1 from information_schema.tables t where t.table_schema='private' and t.table_name=expected.name);

select expected.name as missing_rpc
from (values ('ad_checkout'),('ad_begin_confirm'),('ad_reconcile'),('ad_workspace'),('ad_admin_command'),('ad_user_order'),('ad_order_lookup'),('ad_refund_request'),('ad_refund_failure'),('ad_public_slots'),('ad_record_impression'),('consultation_command')) expected(name)
where not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=expected.name);

-- All queries below should return zero rows.
select table_name,grantee,privilege_type from information_schema.role_table_grants
where table_schema='private' and grantee in ('anon','authenticated');

select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where (n.nspname='public' and (p.proname like 'connection_%' or p.proname='expire_consultation_offers'))
or (n.nspname='private' and p.proname in ('offer_next','rank_planners','free_remaining'));

select p.proname,r.rolname from pg_proc p join pg_namespace n on n.oid=p.pronamespace cross join pg_roles r
where n.nspname='public' and r.rolname in ('anon','authenticated')
and p.proname in ('ad_reconcile','ad_order_lookup','ad_refund_failure','ad_public_slots','ad_record_impression','create_service_request','assign_service_request','confirm_service_request','change_service_request')
and has_function_privilege(r.oid,p.oid,'execute');
