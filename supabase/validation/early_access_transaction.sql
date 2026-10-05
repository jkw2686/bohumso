-- Transactional production-engine integration test. Synthetic fixtures NEVER commit.
-- This tests DB roles/RPC/RLS, not actual email/OAuth login or Storage HTTP upload.
begin;
create temporary table audit_checks(name text primary key,passed boolean not null);
grant all on audit_checks to authenticated,service_role,anon;
create function pg_temp.check_result(label text,ok boolean) returns void language plpgsql as $$begin if ok is distinct from true then raise exception 'FAILED: %',label;end if;insert into audit_checks values(label,true);end$$;
grant execute on function pg_temp.check_result(text,boolean) to authenticated,service_role,anon;
create temporary table audit_values(k text primary key,v jsonb);
grant all on audit_values to authenticated,service_role,anon;
insert into audit_values values('original_profile',(select to_jsonb(p) from public.member_profiles p limit 1)),('original_consent',(select to_jsonb(c) from public.member_consents c limit 1));
-- Use isolated UUIDs and fake test contacts; no email/SMS is sent.
insert into auth.users(id,email,email_confirmed_at,phone,phone_confirmed_at) values
('fa000000-0000-4000-8000-000000000001','customer-db-test@example.invalid',now(),'+821099990001',now()),
('fa000000-0000-4000-8000-000000000002','other-db-test@example.invalid',now(),'+821099990002',now()),
('fa000000-0000-4000-8000-000000000003','expert-db-test@example.invalid',now(),'+821099990003',now()),
('fa000000-0000-4000-8000-000000000004','admin-db-test@example.invalid',now(),'+821099990004',now());
insert into private.admin_memberships(user_id) values('fa000000-0000-4000-8000-000000000004');
do $$declare u uuid;begin foreach u in array array['fa000000-0000-4000-8000-000000000001'::uuid,'fa000000-0000-4000-8000-000000000002'::uuid,'fa000000-0000-4000-8000-000000000003'::uuid,'fa000000-0000-4000-8000-000000000004'::uuid] loop perform set_config('request.jwt.claim.sub',u::text,true);perform set_config('role','authenticated',true);perform public.complete_membership(true,true,true,false);reset role;end loop;end$$;
select pg_temp.check_result('new membership and three versioned consent records',(select count(*)=3 from private.consent_records where user_id='fa000000-0000-4000-8000-000000000001'));
do $$begin begin update private.consent_records set accepted=false where user_id='fa000000-0000-4000-8000-000000000001';raise exception 'consent update unexpectedly allowed';exception when others then if sqlerrm not like '%append_only_consent%' then raise;end if;end;end$$;
select pg_temp.check_result('consent is append only',true);
select set_config('request.jwt.claim.sub','fa000000-0000-4000-8000-000000000003',true);set local role authenticated;
select public.expert_profile_command('save','{"display_name":"운영DB 임시 검증 전문가","primary_area":"경기 분당","secondary_areas":[],"specialties":["claim"],"weekdays":[0,1,2,3,4,5,6],"start_hour":9,"end_hour":20,"consent":true}'::jsonb);
select pg_temp.check_result('expert profile creation',(public.expert_profile_command('get')->'profile'->>'status')='PROFILE_COMPLETE_VERIFICATION_REQUIRED');
reset role;set local role service_role;
insert into audit_values values('document',public.early_document_service('fa000000-0000-4000-8000-000000000003','save','{"kind":"registration","path":"fa000000-0000-4000-8000-000000000003/rollback-only.pdf","filename":"rollback-only.pdf","mime":"application/pdf","bytes":128}'::jsonb));
do $$begin begin perform public.early_document_service('fa000000-0000-4000-8000-000000000003','read',jsonb_build_object('id',(select v->'document'->>'id' from audit_values where k='document')));raise exception 'owner read unexpectedly allowed';exception when others then if sqlerrm not like '%request_forbidden%' then raise;end if;end;end$$;
select pg_temp.check_result('only admin can read review document metadata',public.early_document_service('fa000000-0000-4000-8000-000000000004','read',jsonb_build_object('id',(select v->'document'->>'id' from audit_values where k='document')))->>'object_path' is not null);
reset role;
select set_config('request.jwt.claim.sub','fa000000-0000-4000-8000-000000000004',true);set local role authenticated;
select public.early_expert_review('verify','{"user_id":"fa000000-0000-4000-8000-000000000003","kind":"registration","decision":"VERIFIED","reason":"임시 트랜잭션 검증 자료"}');
select public.early_expert_review('approve','{"user_id":"fa000000-0000-4000-8000-000000000003","organization":"임시 검증 소속","registration_reference":"ROLLBACK-ONLY","reason":"임시 트랜잭션 검증 승인"}');
reset role;
-- Gate changes are transaction-local and rolled back with the synthetic fixtures.
update private.release_controls set policies_approved=true;
insert into private.office_locations(id,name,region,status,address,latitude,longitude,weekdays) values('rollback-audit-office','임시 검증 보험소','경기 분당','active','가상 검증 주소',37.38,127.12,array[0,1,2,3,4,5,6]);
select set_config('request.jwt.claim.sub','fa000000-0000-4000-8000-000000000001',true);set local role authenticated;
select pg_temp.check_result('18:00 is the final start slot',public.reservation_slots('rollback-audit-office',null,((now() at time zone 'Asia/Seoul')::date+3))->>-1='18:00');
insert into audit_values values('booking',public.consultation_command('request',jsonb_build_object('purpose','claim','region','경기 분당','method','scheduled','preferred_at',((now() at time zone 'Asia/Seoul')::date+3)::text||'T18:00:00+09:00','request_key',gen_random_uuid(),'office_id','rollback-audit-office','office_assignment',true,'duration_minutes',30)));
reset role;
select pg_temp.check_result('office booking server duration is 60',(select duration_minutes=60 from private.consultations where id=(select (v->>'id')::uuid from audit_values where k='booking')));
select set_config('request.jwt.claim.sub','fa000000-0000-4000-8000-000000000002',true);set local role authenticated;
do $$begin begin perform public.consultation_command('request',jsonb_build_object('purpose','claim','region','경기 분당','method','scheduled','preferred_at',((now() at time zone 'Asia/Seoul')::date+3)::text||'T18:00:00+09:00','request_key',gen_random_uuid(),'office_id','rollback-audit-office','office_assignment',true));raise exception 'duplicate unexpectedly allowed';exception when others then if sqlerrm not like '%slot_unavailable%' then raise;end if;end;end$$;
select pg_temp.check_result('duplicate slot blocked',true);
select pg_temp.check_result('customer cannot see other customer booking',not exists(select 1 from jsonb_array_elements(public.consultation_workspace('customer')->'bookings') b where b->>'id'=(select v->>'id' from audit_values where k='booking')));
select pg_temp.check_result('member profile RLS own rows only',not exists(select 1 from public.member_profiles where user_id<>auth.uid()));
reset role;
select set_config('request.jwt.claim.sub','fa000000-0000-4000-8000-000000000003',true);set local role authenticated;
select pg_temp.check_result('expert cannot see unassigned booking',not exists(select 1 from jsonb_array_elements(public.consultation_workspace('partner')->'bookings') b where b->>'id'=(select v->>'id' from audit_values where k='booking')));
reset role;
select set_config('request.jwt.claim.sub','fa000000-0000-4000-8000-000000000004',true);set local role authenticated;
select public.consultation_command('office_assign',jsonb_build_object('id',(select v->>'id' from audit_values where k='booking'),'planner_id','fa000000-0000-4000-8000-000000000003','revision',(select b->'revision' from jsonb_array_elements(public.consultation_workspace('admin')->'bookings') b where b->>'id'=(select v->>'id' from audit_values where k='booking'))));
reset role;
select set_config('request.jwt.claim.sub','fa000000-0000-4000-8000-000000000003',true);set local role authenticated;
select pg_temp.check_result('expert sees assigned booking',exists(select 1 from jsonb_array_elements(public.consultation_workspace('partner')->'bookings') b where b->>'id'=(select v->>'id' from audit_values where k='booking')));
reset role;
select set_config('request.jwt.claim.sub','fa000000-0000-4000-8000-000000000002',true);set local role authenticated;
select public.member_rights('DELETE','{"detail":"임시 검증 삭제요청"}');select public.member_rights('WITHDRAW','{"confirmed":true}');
select pg_temp.check_result('withdrawal and deletion requests recorded',jsonb_array_length(public.member_rights('list')->'requests')=2 and (public.my_membership()->>'member')::boolean=false);
reset role;
select pg_temp.check_result('private bucket and restrictive storage policy',(select not public from storage.buckets where id='expert-documents') and exists(select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='expert_documents_endpoint_only' and permissive='RESTRICTIVE'));
set local role authenticated;
do $$begin begin insert into storage.objects(bucket_id,name) values('expert-documents','rollback-audit.txt');raise exception 'storage insert unexpectedly allowed';exception when insufficient_privilege then null;end;end$$;
select pg_temp.check_result('authenticated direct storage insert denied',true);
reset role;set local role anon;
do $$begin begin insert into storage.objects(bucket_id,name) values('expert-documents','rollback-audit.txt');raise exception 'anon storage insert unexpectedly allowed';exception when insufficient_privilege then null;end;end$$;
select pg_temp.check_result('anonymous direct storage insert denied',true);
reset role;
select pg_temp.check_result('existing profile unchanged',exists(select 1 from public.member_profiles p where to_jsonb(p)=(select v from audit_values where k='original_profile')));
select pg_temp.check_result('existing consent unchanged',exists(select 1 from public.member_consents c where to_jsonb(c)=(select v from audit_values where k='original_consent')));
select jsonb_agg(to_jsonb(a) order by name) as db_transaction_test_results from audit_checks a;
rollback;
