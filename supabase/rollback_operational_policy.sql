-- Stop new requests without deleting existing users/bookings/consent history.
-- The current dated policy remains archived. Reverting UI is a separate Git revert.
begin;
select pg_advisory_xact_lock(44009);
do $rollback$
declare b jsonb;
begin
 select snapshot into b from private.operational_policy_backup where name='2026-10-09-v1';
 if b is null then raise exception 'operational_backup_missing';end if;
 update private.release_controls set policies_approved=(b->'release'->>'policies_approved')::boolean,
 closed_beta=(b->'release'->>'closed_beta')::boolean where id;
 update private.service_features set stage=b->'features'->>'stage',public_signup=(b->'features'->>'public_signup')::boolean,
 customer_signup=(b->'features'->>'customer_signup')::boolean,expert_applications=(b->'features'->>'expert_applications')::boolean,
 invite_only=(b->'features'->>'invite_only')::boolean where id;
 -- Intentionally keep the version accepted by newly registered users. Never
 -- overwrite append-only consent records or restore unrelated routine changes.
end $rollback$;
commit;
