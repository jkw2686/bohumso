-- Existing owner's authorized account only; no new identities or OTP bypass.
-- Real production RPC writes/read/cancel; ROLLBACK removes every test artifact.
begin;
create temporary table operational_check(result text);
do $test$
declare subject uuid;rid uuid;reply jsonb;workspace jsonb;rowdata private.consultations;stamp timestamptz;
begin
 select id into subject from auth.users where lower(email)='jkw2686@gmail.com';
 if subject is null or private.verified_contact(subject) is null then raise exception 'verified_owner_required';end if;
 update private.release_controls set policies_approved=true where id;
 stamp:=((now() at time zone 'Asia/Seoul')::date+14+time '10:00') at time zone 'Asia/Seoul';
 perform set_config('request.jwt.claim.sub',subject::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',subject,'role','authenticated')::text,true);
 set local role authenticated;
 reply:=public.consultation_command('request',jsonb_build_object('office_assignment',true,'request_key',gen_random_uuid(),'purpose','claim','region','경기 분당','method','phone','preferred_at',stamp));
 rid:=(reply->>'id')::uuid;
 workspace:=public.consultation_workspace('customer');
 if not exists(select 1 from jsonb_array_elements(workspace->'bookings') b where b->>'id'=rid::text) then raise exception 'customer_read_failed';end if;
 reset role;
 select * into rowdata from private.consultations where id=rid;
 if rowdata.customer_id is distinct from subject or rowdata.state<>'requested' or rowdata.created_at is null or rowdata.preferred_at is distinct from stamp or rowdata.allocation_mode<>'office' then raise exception 'stored_fields_failed';end if;
 set local role authenticated;
 perform public.consultation_command('cancel',jsonb_build_object('id',rid,'revision',rowdata.revision));
 reset role;
 if (select state from private.consultations where id=rid)<>'cancelled' then raise exception 'cancel_failed';end if;
 insert into operational_check values('PASS: production RPC DB insert, owner linkage, requested status, timestamps, customer list, cancellation; transaction rolled back');
end $test$;
select * from operational_check;
rollback;
