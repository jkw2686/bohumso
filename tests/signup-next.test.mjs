import test from 'node:test';
import assert from 'node:assert/strict';
import {signupNext} from '../src/signup-next.js';
import {memberState,pendingAction} from '../src/member-access.js';
test('next action uses server membership, not intent',()=>{
 assert.equal(signupNext({member:false}),null);
 for(const [state,status,href] of [['ACTIVE_MEMBER',null,'/map.html?view=experts'],['EXPERT_DRAFT',null,'/partner.html'],['EXPERT_PENDING','pending','/partner.html'],['EXPERT_APPROVED','approved','/partner.html']])assert.equal(signupNext({member:true,state,partner_status:status,roleIntent:'expert'}).href,href);
 assert.equal(signupNext({member:true,admin:true}).href,'/admin.html');
 assert.equal(signupNext({member:true,partner_status:'approved',profession:'office'}).href,'/partner.html');
 assert.equal(signupNext({member:true,partner_status:'rejected'}).label,'보완 내용 확인');
});
test('only concurrent authorization requests share work; later checks revalidate',async()=>{
 let users=0,members=0;const client={auth:{getUser:async()=>{users++;await new Promise(r=>setTimeout(r,10));return {data:{user:{id:'fixture'}}};}},rpc:async()=>{members++;return {data:{member:true}};}};
 await Promise.all([memberState(client),memberState(client),memberState(client)]);assert.equal(users,1);assert.equal(members,1);await memberState(client);assert.equal(users,2);assert.equal(members,2);
});
test('expired, future, malformed and undated legacy intent cannot restore expert flow',()=>{
 const storage=new Map();globalThis.sessionStorage={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)};globalThis.location={search:''};
 for(const at of [Date.now()-86400000,Date.now()+86400000,null]){storage.set('bohumso-pending-action',JSON.stringify({at,next:'/partner.html'}));storage.set('bohumso-booking-return','/partner.html');assert.equal(pendingAction(),'/account.html');}
 storage.set('bohumso-pending-action',JSON.stringify({at:Date.now(),next:'/notifications.html?reservation=fixture'}));assert.equal(pendingAction(),'/notifications.html?reservation=fixture');delete globalThis.sessionStorage;delete globalThis.location;
});
