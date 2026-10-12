import {readFile} from 'node:fs/promises';
import {setupCare,ids,day} from './appointment-care-fixture.mjs';
export {ids,day};
export async function setupProfessions(){
 const f=await setupCare();await f.db.exec('reset role');
 await f.db.exec('create table private.phone_contacts(user_id uuid primary key,phone_e164 text,phone_verification_status text,phone_verified_at timestamptz)');
 for(const file of ['043_auth_phone_status_bridge.sql','051_phone_signup.sql','056_booking_hardening.sql'])await f.db.exec(await readFile('supabase/'+file,'utf8'));
 await f.login(ids.customer);f.previous=await f.cmd('request',{planner_id:ids.next,purpose:'claim',region:'경기 분당',method:'phone',preferred_at:day(2)+'T18:00:00+09:00',request_key:crypto.randomUUID()});
 await f.db.exec('reset role');f.previousRow=(await f.db.query('select to_jsonb(c) value from private.consultations c where id=$1',[f.previous.id])).rows[0].value;
 for(const file of ['066_profession_registration.sql','066_profession_registration.sql']){
  try{await f.db.exec(await readFile('supabase/'+file,'utf8'));}catch(e){await f.db.close();throw Error(file+': '+e.message+' '+e.position);}
 }
 return f;
}
export const application=(profession='tax')=>({profession,display_name:'김민수',organization:'확인 세무사무소',registration_reference:'T-12345',office_address:'서울특별시 강남구 확인로 10',office_name:'확인보험소',address:'서울특별시 강남구 확인로 10',phone:'01000000003',primary_area:'경기 분당',secondary_areas:[],specialties:[],weekdays:[0,1,2,3,4,5,6],start_hour:9,end_hour:18,fee_mode:'unknown',fee_basis:'',consent:true,firstMeetingConfirmed:true,customerInitiatedConfirmed:true,agreement_version:'expert-professions-2026-10-12-v1'});
