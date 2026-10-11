import {readFile} from 'node:fs/promises';
import {setupSupport,ids} from './support-integration-fixture.mjs';
import {dayKST} from '../src/growth-model.mjs';
export {ids};
export async function setupGrowth(){
 const f=await setupSupport();await f.owner('select 1');
 await f.db.exec(await readFile('supabase/060_support_chat.sql','utf8'));
 // Same owner predicate contract, isolated fixture identity only.
 await f.db.exec(`create or replace function private.is_owner() returns boolean language sql stable security definer set search_path='' as $$select private.is_admin() and auth.uid()='${ids.admin}'::uuid$$;revoke all on function private.is_owner() from public,anon,authenticated;`);
 const sql=await readFile('supabase/061_expert_growth.sql','utf8');await f.db.exec(sql);await f.db.exec(sql);
 const cmd=(op,p={})=>f.rpc('growth_command',[op,p]);
 const write=(op,p={})=>cmd(op,{request_key:crypto.randomUUID(),...p});
 const seed=JSON.parse(await readFile('data/growth-first-draft.json','utf8'));
 const first=async()=>{await f.login(ids.admin);const rows=await cmd('admin_list');return rows.find(r=>r.draft.title===seed.content.title)||{id:(await write('admin_save',seed)).id,revision:1,draft:seed.content};};
 const publish=async id=>{await f.login(ids.admin);let row=(await cmd('admin_list')).find(r=>r.id===id);await write('admin_save',{id,revision:row.revision,content:{...row.draft,checked_date:dayKST(),evidence:'reviewed'}});row=(await cmd('admin_list')).find(r=>r.id===id);await write('admin_approve',{id,revision:row.revision});await write('admin_publish',{id,revision:row.revision});};
 return {...f,cmd,write,first,publish};
}
