import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {fixture,ids} from './commerce-fixture.mjs';import {availabilityOf,prioritizeProfiles} from '../src/availability.js';
test('availability is owner-only, expires and preserves catalog privacy',async()=>{const f=await fixture();try{await f.login(ids.customer);await assert.rejects(f.rpc('set_planner_availability',['now']),/planner_required/);await f.login(ids.planner);await f.rpc('set_planner_availability',['now']);let catalog=await f.rpc('planner_catalog',['','']);let p=catalog.planners.find(p=>p.id===ids.planner);assert.equal(p.availability_status,'now');assert.equal(p.phone,undefined);await assert.rejects(f.rpc('set_planner_availability',['wrong']),/invalid_availability/);await f.db.exec('reset role');await f.db.query("update private.planner_directory set availability_until=now()-interval '1 minute' where user_id=$1",[ids.planner]);await f.login('','anon');catalog=await f.rpc('planner_catalog',['','']);assert.equal(catalog.planners.find(p=>p.id===ids.planner).availability_status,'scheduled');await f.login(ids.planner);await f.rpc('set_planner_availability',['unavailable']);catalog=await f.rpc('planner_catalog',['','']);assert.equal(catalog.planners.find(p=>p.id===ids.planner).available,false);}finally{await f.db.close();}});
test('available now takes priority over proximity, expired state does not',()=>{const p={name:'A',available:true,distance:5,availability_status:'now',availability_until:new Date(Date.now()+60000).toISOString()};const q={name:'B',available:true,distance:1};assert.equal(prioritizeProfiles([q,p])[0].name,'A');assert.equal(availabilityOf({...p,availability_until:'2000-01-01'}),'scheduled');});

// 홈 지도(public/map.js)는 번들 밖 일반 스크립트라 src/availability.js 를 import 할 수 없어
// 같은 규칙을 복제해 두었다. 두 판정이 갈라지면 목록과 지도의 배지가 서로 달라진다.
test('map.js 와 availability.js 의 지금 가능 판정이 일치한다',async()=>{
 const source=await readFile('public/map.js','utf8');
 const body=source.match(/function availOf\(s, now\) \{([\s\S]*?)\n  \}/);
 assert.ok(body,'map.js 에 availOf 가 있어야 한다');
 const mapAvailOf=new Function('s','now','{'+body[1]+'}');
 const future=new Date(Date.now()+60000).toISOString(),past='2000-01-01T00:00:00.000Z';
 const cases=[
  {available:false,availability_status:'now',availability_until:future},
  {available:true,availability_status:'now',availability_until:future},
  {available:true,availability_status:'now',availability_until:past},
  {available:true,availability_status:'now',availability_until:null},
  {available:true,availability_status:'today',availability_until:future},
  {available:true,availability_status:'scheduled',availability_until:null},
  {available:true,availability_status:undefined,availability_until:future},
 ];
 for(const c of cases){
  const mapped={available:c.available,availabilityStatus:c.availability_status||'scheduled',availabilityUntil:c.availability_until};
  assert.equal(mapAvailOf(mapped),availabilityOf(c),JSON.stringify(c));
 }
});
