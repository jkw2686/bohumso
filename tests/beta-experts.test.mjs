import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {betaFixture} from './beta-fixture.mjs';import {ids} from './commerce-fixture.mjs';
test('beta: reviewed area-only experts, five isolated booking round trips and server slot exclusion',async()=>{
 const f=await betaFixture();try{await f.db.exec('reset role');await f.db.exec(await readFile('supabase/029_beta_experts.sql','utf8'));
 const expert=await f.invite('EXPERT');await f.join(ids.planner,expert.code);await f.rpc('beta_expert',['save',{name:'베타 전문가',profession:'planner',organization:'비공개 테스트',hours:'평일 09:00~18:00',specialties:['claim'],pledge:true}]);await f.urgent('save_areas',{primary:'경기 분당',secondary:['경기 판교','경기 수지']});
 await assert.rejects(f.rpc('beta_expert',['review',{userId:ids.planner,decision:'APPROVED',reason:'권한 없음'}]),/admin_required/);
 await f.login(ids.customer);assert.ok(!(await f.rpc('planner_catalog',['',''])).planners.some(p=>p.id===ids.planner));
 await f.login(ids.admin);await f.rpc('beta_expert',['review',{userId:ids.planner,decision:'APPROVED',reason:'비공개 기능 검토'}]);
 for(const id of [ids.customer,ids.other]){const invite=await f.invite();await f.join(id,invite.code);}
 await f.login(ids.customer);const catalog=await f.rpc('planner_catalog',['','']);const p=catalog.planners.find(p=>p.id===ids.planner);assert.equal(p.beta,true);assert.equal(p.area_latitude,37.383);assert.equal(p.latitude,undefined);assert.equal(p.verified,false);
 await f.login(null,'anon');assert.ok(!(await f.rpc('planner_catalog',['',''])).planners.some(p=>p.id===ids.planner));
 for(let i=0;i<5;i++){
  const payload={planner_id:ids.planner,purpose:'claim',method:'phone',region:'경기 분당',preferred_at:f.slot(i),request_key:crypto.randomUUID()};
  await f.login(ids.customer);const {id}=await f.cmd('request',payload);assert.equal((await f.cmd('request',payload)).id,id);assert.equal((await f.row(id)).is_beta,true);
  await f.login(ids.other);assert.equal((await f.rpc('consultation_workspace',['customer'])).bookings.length,0);await assert.rejects(f.cmd('request',payload),/invalid_slot/);await assert.rejects(f.cmd('cancel',{id,revision:1}),/request_forbidden/);
  await assert.rejects(f.cmd('propose',{id,revision:1,preferred_at:f.slot(i)}),/request_forbidden/);
  await f.login(ids.planner);await f.cmd('accept',{id,revision:1});
  await f.login(ids.customer);await f.cmd('confirm',{id,revision:2,name:'테스트 고객',phone:'01012345678',share_consent:true});assert.equal((await f.row(id)).state,'scheduled');
  // Local clock fixture only. Never backdate a production reservation to claim an actual journey.
  await f.db.exec('reset role');await f.db.query("update private.consultations set preferred_at=now()-interval '1 minute' where id=$1",[id]);
  await f.login(ids.planner);await f.cmd('complete_request',{id,revision:3});await f.login(ids.customer);await f.cmd('complete_confirm',{id,revision:4});assert.equal((await f.row(id)).state,'completed');
 }
 await f.login(ids.customer);const office=await f.cmd('request',{office_assignment:true,purpose:'claim',region:'경기 분당',preferred_at:f.slot(8),request_key:crypto.randomUUID()});let officeRow=await f.row(office.id);assert.equal(officeRow.planner_id,null);assert.equal(officeRow.is_beta,true);
 await assert.rejects(f.cmd('office_assign',{id:office.id,revision:officeRow.revision,planner_id:ids.planner}),/admin_required/);
 await f.login(ids.admin);await assert.rejects(f.cmd('office_assign',{id:office.id,revision:officeRow.revision,planner_id:ids.next}),/beta_scope_mismatch/);await f.cmd('office_assign',{id:office.id,revision:officeRow.revision,planner_id:ids.planner});
 await f.login(ids.planner);officeRow=await f.row(office.id,'partner');await f.cmd('accept',{id:office.id,revision:officeRow.revision});assert.equal((await f.row(office.id,'partner')).state,'scheduled');
 await f.login(ids.admin);assert.equal((await f.admin('dashboard')).bookings.completed,5);await f.rpc('beta_expert',['review',{userId:ids.planner,decision:'SUSPENDED',reason:'검증 중지 테스트'}]);
 await f.login(ids.planner);await assert.rejects(f.rpc('consultation_workspace',['partner']),/request_forbidden/);assert.equal((await f.rpc('my_membership')).state,'EXPERT_PENDING');
 await f.login(ids.customer);assert.ok(!(await f.rpc('planner_catalog',['',''])).planners.some(p=>p.id===ids.planner));
 await f.db.exec('reset role');const count=await f.db.query("select count(*)::int n from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='private' and c.relkind='r' and not c.relrowsecurity");assert.equal(count.rows[0].n,0);
 }finally{await f.db.close();}
});
