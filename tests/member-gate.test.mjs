import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {fixture,ids} from './commerce-fixture.mjs';import {safeNext} from '../src/member-access.js';
test('return path rejects external, encoded, normalized and auth-loop destinations',()=>{
 for(const value of ['https://evil.test','//evil.test','/\\evil.test','/%2f%2fevil.test','/x/..//evil.test','/login.html?next=/','/signup','/\n/evil'])assert.equal(safeNext(value),'/account.html');
 assert.equal(safeNext('/map.html?purpose=claim&situation=death'),'/map.html?purpose=claim&situation=death');
});
test('active membership enforced at RPC, planned office rejected, private bookings isolated',async()=>{
 const f=await fixture();try{await f.db.exec('reset role');for(const file of ['020_office_allocation.sql','023_active_member_gate.sql'])await f.db.exec(await readFile('supabase/'+file,'utf8'));
 const payload={office_assignment:true,request_key:crypto.randomUUID(),region:'경기 가평군',purpose:'claim',method:'scheduled',preferred_at:new Date(Date.now()+86400000).toISOString().slice(0,10)+'T14:00:00+09:00'};
 await f.login('', 'anon');await assert.rejects(f.cmd('request',payload),/permission denied/);
 await f.db.exec('reset role');await f.db.query('delete from public.member_consents where user_id=$1',[ids.other]);await f.login(ids.other);assert.equal((await f.rpc('my_membership')).member,false);await assert.rejects(f.cmd('request',payload),/membership_required/);await assert.rejects(f.rpc('consultation_workspace',['customer']),/membership_required/);
 await f.login(ids.customer);await assert.rejects(f.cmd('request',{...payload,office_id:'planned-0',status:'active'}),/office_not_active/);await assert.rejects(f.cmd('request',{...payload,office_id:'fake'}),/office_not_active/);const id=(await f.cmd('request',payload)).id;assert.ok(id);
 await f.login(ids.other);await f.rpc('complete_membership',[true,true,true,false]);assert.equal((await f.rpc('my_membership')).member,true);assert.equal((await f.rpc('consultation_workspace',['customer'])).bookings.length,0);await assert.rejects(f.rpc('consultation_workspace',['partner']),/request_forbidden/);await assert.rejects(f.cmd('confirm',{id,revision:1,share_consent:true,name:'test',phone:'01000000000'}),/request_forbidden/);
 await assert.rejects(f.rpc('consultation_command_member_v1',['request',payload]),/permission denied/);await assert.rejects(f.rpc('consultation_workspace_member_v1',['admin']),/permission denied/);
 await f.db.exec('reset role');await f.db.exec("insert into private.office_locations values('test-active','가상 운영 보험소','서울 마포구','active')");await f.login(ids.customer);const result=await f.cmd('request',{...payload,request_key:crypto.randomUUID(),office_id:'test-active'});assert.equal((await f.row(result.id)).office_id,'test-active');assert.equal((await f.row(result.id)).region,'서울 마포구');
 }finally{await f.db.close();}
});
