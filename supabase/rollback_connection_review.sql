begin;
do $$declare item record;begin
 if exists(select 1 from private.consultation_schedule_proposals where state='pending') then raise exception 'pending_schedule_changes_require_resolution';end if;
 for item in select definition from private.connection_review_backup loop execute item.definition;end loop;
end$$;
-- Retain proposal history and existing member/reservation records. Restore the UI separately.
commit;
