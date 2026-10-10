-- Development candidate rollback. Keep inquiries, conversations, notes and audit history intact.
-- Restore the previous frontend release as part of rollback. Never delete the support tables.
begin;
select pg_advisory_xact_lock(hashtextextended('bohumso-support-conversations',57));
update private.support_threads set ai_enabled=false,ai_epoch=ai_epoch+1;
revoke all on function private.support_ai_start(uuid,uuid),private.support_ai_finish(uuid,text,text,boolean) from public,anon,authenticated,service_role;
drop function if exists public.support_command(text,jsonb);
-- Compatibility trigger remains to retain inquiries submitted by the prior client.
-- Reapplying 057 restores the conversation API with the retained data.
commit;
