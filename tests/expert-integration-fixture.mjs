import {readFile} from 'node:fs/promises';
import {setupCare,ids,day} from './appointment-care-fixture.mjs';
export {ids,day};
export const taxId='20000000-0000-4000-8000-000000000003';
export async function setupIntegration({legacy=false}={}){
 const f=await setupCare();await f.db.exec('reset role');
 await f.db.exec("create or replace function private.is_owner() returns boolean language sql stable security definer set search_path='' as $$select private.is_admin()$$;");
 for(const name of ['056_booking_hardening.sql','057_support_conversations.sql','060_support_chat.sql','061_expert_growth.sql',...(legacy?['011_expert_onboarding.sql']:[]),'062_expert_types_policy.sql','063_unified_expert_booking.sql','064_growth_summary.sql','064_growth_summary.sql','062_expert_types_policy.sql','063_unified_expert_booking.sql']){
  try{await f.db.exec(await readFile('supabase/'+name,'utf8'));}catch(e){await f.db.close();throw Error(name+': '+e.message+' '+(e.where||'')+' '+(e.position||''));}
 }
 const owner=async(sql,args=[])=>{await f.db.exec('reset role');return args.length?(await f.db.query(sql,args)).rows:await f.db.exec(sql);};
 await owner("insert into auth.users(id,email_confirmed_at,phone_confirmed_at,phone) values($1,now(),now(),'+821000000003')",[taxId]);
 await f.login(taxId);await f.rpc('complete_membership',[true,true,true,false]);
 const profile={profession:'tax',display_name:'김세무',organization:'격리 세무사무소',registration_reference:'FIXTURE-TAX-01',primary_area:'경기 분당',secondary_areas:[],specialties:['tax_consultation'],weekdays:[0,1,2,3,4,5,6],start_hour:9,end_hour:18,consent:true,operating_consent:true,policy_version:'tax-service-2026-10-12-v1'};
 async function approvedTax(){
  await owner('update private.expert_integration_settings set tax_enabled=true,unified_booking=true;update private.service_features set expert_applications=true;update private.release_controls set policies_approved=true');
  await f.login(taxId);await f.rpc('expert_profile_command',['save',profile]);
  await f.login(taxId,'service_role');
  await f.rpc('early_document_service',[taxId,'save',{profession:'tax',kind:'registration',path:taxId+'/fixture.pdf',filename:'fixture.pdf',mime:'application/pdf',bytes:128}]);
  await f.login(ids.admin);
  await f.rpc('early_expert_review',['verify',{user_id:taxId,kind:'registration',decision:'VERIFIED',reason:'격리 등록정보 확인 자료'}]);
  await f.rpc('early_expert_review',['approve',{user_id:taxId,organization:profile.organization,registration_reference:profile.registration_reference,reason:'격리 등록정보와 소속 확인'}]);
  await f.login(taxId);
  await f.rpc('expert_consultation_settings',['save',{revision:1,modes:['expert_office','expert_visit'],office_address:'격리 사무실 주소 101호',fee:{status:'paid',amount:50000,scope:'세무 관련 초기 상담',extra:'추가 업무는 별도 합의',tax_note:'부가세 포함'}}]);
 }
 return {...f,owner,profile,approvedTax};
}
