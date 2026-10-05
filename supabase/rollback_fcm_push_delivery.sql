begin;
-- Disable dispatch first: PUSH_NOTIFICATIONS_ENABLED=false in Netlify.
-- Preserve subscriptions, delivery audit, inbox and existing member/reservation data.
revoke all on function public.push_service(uuid,text,jsonb) from public,anon,authenticated,service_role;
-- Retain the final-transaction notification trigger fix; reverting it can emit false confirmations.
commit;
