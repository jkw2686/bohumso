-- Admin READ ONLY. No member/booking/notification rows are selected.
begin read only;
select n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) arguments,pg_get_functiondef(p.oid) definition
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where (n.nspname='private' and p.proname in('reservation_notification','appointment_notify','flush_appointment_reminders','appointment_sync'))
or (n.nspname='public' and p.proname in('notification_inbox','notification_reservation','reservation_web_push_service','reservation_notification_settings','appointment_care','consultation_command','consultation_workspace'));
select pg_get_triggerdef(oid) definition from pg_trigger where not tgisinternal
and tgrelid in('private.consultations'::regclass,'private.consultation_events'::regclass);
select table_name,column_name,data_type from information_schema.columns where table_schema='private'
and table_name in('notifications','office_staff','appointment_reminders','appointment_care','web_push_deliveries','consultation_schedule_proposals') order by table_name,ordinal_position;
rollback;
