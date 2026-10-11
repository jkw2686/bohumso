import {readFile} from 'node:fs/promises';
import {setupUrgent} from './urgent-fixture.mjs';
export {ids} from './commerce-fixture.mjs';
export async function setupSupport(){
 const f=await setupUrgent(false);await f.db.exec('reset role');
 for(const name of ['026_release_controls.sql','027_private_rls.sql','030_public_early_access.sql','031_expert_early_access.sql','032_expert_verification.sql','033_reservation_integrity.sql','034_organization_roster.sql','035_operational_metrics.sql','036_member_rights_admin.sql','057_support_conversations.sql'])await f.db.exec(await readFile('supabase/'+name,'utf8'));
 const command=(op,payload={})=>f.rpc('support_command',[op,payload]);
 const send=(op,payload={})=>command(op,{request_key:crypto.randomUUID(),...payload});
 const owner=async(sql,args=[])=>{await f.db.exec('reset role');return (await f.db.query(sql,args)).rows;};
 return {...f,command,send,owner};
}
