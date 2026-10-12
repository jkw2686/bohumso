import {readFile} from 'node:fs/promises';
import {setupIntegration,ids,day,taxId} from './expert-integration-fixture.mjs';
export {ids,day,taxId};
export const consentVersion='meeting-rating-public-2026-10-12-v1';
export async function setupFeedback(){
 const f=await setupIntegration();
 try{for(let i=0;i<2;i++)await f.owner(await readFile('supabase/065_meeting_feedback.sql','utf8'));}catch(e){await f.db.close();throw Error(e.message+' '+(e.where||''));}
 const feedback=(op,payload={})=>f.rpc('meeting_feedback',[op,payload]);
 const complete=async(n=2)=>{const id=await f.booking(n);await f.owner("update private.consultations set preferred_at=now()-interval '2 hours' where id=$1",[id]);await f.past(id);await f.login(ids.planner);await f.cmd('complete_request',{id,revision:(await f.row(id,'partner')).revision});await f.login(ids.customer);await f.cmd('complete_confirm',{id,revision:(await f.row(id)).revision});return id;};
 const save=async(id,extra={},kind='consultation')=>{const mine=(await feedback('get',{id,kind})).mine;return feedback('save',{id,kind,revision:mine?.revision||0,consent_version:consentVersion,...extra});};
 const summary=async(expert=ids.planner)=>{await f.login(null,'anon');return (await f.rpc('planner_catalog',['',''])).planners.find(p=>p.id===expert);};
 return {...f,feedback,complete,save,summary};
}
