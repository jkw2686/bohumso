import {readFile} from 'node:fs/promises';
import {setupVisits} from './expert-visits-fixture.mjs';
import {ids} from './commerce-fixture.mjs';
export {ids};
export const day=n=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(new Date(Date.now()+n*86400000));
export async function setupCare(){
 const f=await setupVisits();await f.db.exec('reset role');
 for(const name of ['052_optional_expert_profile.sql','053_connection_review.sql','054_profile_office_scope.sql','055_appointment_care.sql','055_appointment_care.sql'])await f.db.exec(await readFile('supabase/'+name,'utf8'));
 f.care=(op,payload={})=>f.rpc('appointment_care',[op,payload]);
 f.get=(id,kind='consultation')=>f.care('get',{id,kind});
 f.act=async(op,id,payload={},kind='consultation')=>f.care(op,{id,kind,revision:(await f.get(id,kind)).revision,request_key:crypto.randomUUID(),...payload});
 f.booking=async(n=2,expert=ids.planner,method='phone')=>{
  await f.login(ids.customer);const {id}=await f.cmd('request',{planner_id:expert,office_assignment:false,purpose:'claim',region:'경기 분당',method,preferred_at:day(n)+'T14:00:00+09:00',request_key:crypto.randomUUID()});
  await f.login(expert);await f.cmd('accept',{id,revision:(await f.row(id,'partner')).revision,place:'만날 건물 입구'});
  await f.login(ids.customer);await f.cmd('confirm',{id,revision:(await f.row(id)).revision,care_revision:(await f.get(id)).revision,name:'확인 고객',share_consent:true});return id;
 };
 f.past=async(id,days=1,kind='consultation')=>{await f.db.exec('reset role');await f.db.query("update private.appointment_care set terms=terms||jsonb_build_object('at',now()-make_interval(days=>$1)) where kind=$2 and id=$3",[days,kind,id]);};
 f.policy=async()=>{await f.db.exec("reset role;update private.appointment_policy set effective_at=now()-interval '89 days',enforcement_enabled=true");};
 f.decide=async(id,outcome='consumer_absent',extra={})=>{await f.login(ids.admin);return f.act('decide',id,{outcome,reason:'양쪽 설명과 약속 기록을 확인한 결과',records_reviewed:true,both_sides_reviewed:true,exceptions_reviewed:true,absence_verified:true,no_advance_contact_verified:true,not_silence_only:true,...extra});};
 return f;
}
