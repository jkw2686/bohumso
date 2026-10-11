-- Restore the 057 API together with its prior UI. Preserve all conversations and read cursors.
begin;
select pg_advisory_xact_lock(hashtextextended('bohumso-support-chat',60));
do $$declare r record;begin for r in select definition from private.support_chat_backup order by name loop execute r.definition;end loop;end$$;
update private.support_threads set ai_enabled=false,ai_epoch=ai_epoch+1 where ai_enabled;
-- Reapplying 060 preserves existing states and receipts; no data or columns are removed.
commit;
