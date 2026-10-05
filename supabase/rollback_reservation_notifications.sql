begin;
-- Stop new notifications and client access; preserve all existing notification/device records.
alter table private.consultations disable trigger reservation_notification;
alter table private.urgent_requests disable trigger urgent_notification;
alter table private.urgent_offers disable trigger urgent_offer_notification;
revoke execute on function public.notification_inbox(text,uuid),public.notification_reservation(uuid),public.push_device(text,uuid) from authenticated;
commit;
