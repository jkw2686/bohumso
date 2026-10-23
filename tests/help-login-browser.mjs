import {chromium,expect} from '@playwright/test';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import launch from './playwright-launch.cjs';
const catalog=JSON.parse(await readFile('shared/professions.json','utf8'));
const uiOnly=true;let testRole='beta';
const f=uiOnly?null:await (await import('./profession-fixture.mjs')).setupProfessions();
const actor='10000000-0000-4000-8000-000000000002';
const origin='https://professions.fixture.test',auth='https://auth.fixture.test';
let model={profile:null,office_profile:null,events:[]},failed=false,saveCalls=0,queue=Promise.resolve();
const checks=[],errors=[];const check=(ok,label)=>{if(!ok)throw Error(label);checks.push(label);console.log('PASS '+label);};
const mock=async(name,args)=>{
 if(name==='my_membership')return {member:true,admin:false,profession:model.profile?.profession,partner_status:testRole==='approved'?'approved':null,beta_role:testRole==='beta'?'EXPERT':null};if(name==='beta_expert')return {phoneVerified:true,expert:{status:'APPROVED'},profile:{}};if(name==='urgent_command')return {eligible:testRole==='approved',areas:null,instant:null,visitConfig:{expireMinutes:30}};if(name==='reservation_notification_settings')return {enabled:true};if(name==='consultation_workspace')return {bookings:[]};
 if(name==='my_phone_status')return {verified:true};
 if(name==='profession_catalog')return catalog;
 if(name==='service_area_catalog')return [{id:'경기 분당',name:'분당',region:'경기',latitude:37.38,longitude:127.11}];
 if(name==='early_expert_documents')return [];
 if(name==='release_status')return {phoneVerified:true,signupEnabled:true,expertApplicationsEnabled:true};
 if(name==='expert_profile_command'){
  if(args.operation==='save'){model[args.payload.profession==='office'?'office_profile':'profile']={...args.payload,status:'PROFILE_COMPLETE_VERIFICATION_REQUIRED'};}
  return model;
 }
 if(name==='planner_catalog')return {planners:[{id:'20000000-0000-4000-8000-000000000001',name:'김보험',profession:'planner',profession_name:'보험설계사',organization:'확인 회사',region:'경기 분당',area_latitude:37.38,area_longitude:127.11,available:true,specialties:[]},{id:actor,name:'김세무',profession:'tax',profession_name:'세무사',organization:'확인 사무소',region:'경기 분당',area_latitude:37.381,area_longitude:127.115,available:true,specialties:[],fee_notice:'방문 전 상담료 확인이 필요합니다'}]};
 if(name==='office_catalog'||name==='notification_list')return [];
 return {};
};
const browser=await chromium.launch(launch),context=await browser.newContext({viewport:{width:390,height:844}});
const user={id:actor,email:'isolated@example.test',phone_confirmed_at:new Date().toISOString(),aud:'authenticated'};
const exp=Math.floor(Date.now()/1000)+3600,session={user,access_token:Buffer.from('{"alg":"HS256"}').toString('base64url')+'.'+Buffer.from(JSON.stringify({sub:actor,exp})).toString('base64url')+'.fixture',refresh_token:'fixture',expires_at:exp,expires_in:3600};
await context.addInitScript(s=>localStorage.setItem('woori-account',JSON.stringify(s)),session);
const routeHandler=async route=>{
 const u=new URL(route.request().url());
 if(u.origin===origin){
  if(u.pathname==='/api/config')return route.fulfill({json:{enabled:true,earlyAccess:true,expertApplicationsEnabled:true,documentsEnabled:true,signupEnabled:true,phoneVerificationEnabled:true,phoneSignupEnabled:true,paymentsEnabled:false,url:auth,key:'fixture'}});
  let pathname=u.pathname==='/'?'/index.html':u.pathname;if(!path.extname(pathname))pathname+='.html';
  try{const file=path.resolve('public','.'+pathname);return route.fulfill({body:process.env.QA_ASSET_ORIGIN?Buffer.from(await (await fetch(process.env.QA_ASSET_ORIGIN+pathname)).arrayBuffer()):await readFile(file),contentType:file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.svg')?'image/svg+xml':file.endsWith('.woff2')?'font/woff2':file.endsWith('.png')?'image/png':'text/html; charset=utf-8'});}catch{return route.fulfill({status:404,body:''});}
 }
 if(u.origin!==auth)return route.abort();
 if(u.pathname.endsWith('/settings'))return route.fulfill({json:{external:{google:true}}});
 if(u.pathname.endsWith('/user'))return route.fulfill({json:user});
 if(u.pathname.endsWith('/token'))return route.fulfill({json:session});
 const name=u.pathname.split('/').pop(),args=route.request().postDataJSON()||{};
 if(name==='expert_profile_command'&&args.operation==='save'){saveCalls++;if(failed)return route.fulfill({status:503,json:{message:'isolated_failure'}});}
 try{const task=queue.then(async()=>{if(!f)return mock(name,args);await f.login(actor);return f.rpc(name,Object.values(args));});queue=task.catch(()=>{});return route.fulfill({json:await task});}catch(e){return route.fulfill({status:400,json:{message:e.message,code:e.code}});}
};await context.route('**/*',routeHandler);
try{const p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));
for(const role of ['beta','approved','pending']){testRole=role;model={profile:role==='beta'?null:{profession:'planner',status:role==='approved'?'APPROVED':'VERIFICATION_PENDING',display_name:'격리 전문가',primary_area:'경기 분당',weekdays:[1],start_hour:9,end_hour:18},office_profile:null};await p.goto(origin+'/partner.html');await expect(p.locator('[data-expert-overview]')).toBeVisible();await expect(p.locator('[data-notification-summary]')).toHaveCount(1);if(role==='beta')await expect(p.locator('[data-instant-settings]')).toHaveCount(1);if(role==='approved')await expect(p.getByRole('heading',{name:'답변할 요청',exact:true})).toBeVisible();if(role==='pending')await expect(p.getByRole('heading',{name:'답변할 요청',exact:true})).toHaveCount(0);}
for(const role of ['approved','pending','beta','member']){testRole=role;if(role==='member')model={profile:null,office_profile:null};const next='/partner.html?'+new URLSearchParams({roleIntent:'expert',region:'서울 종로구'});await p.goto(origin+'/account.html?next='+encodeURIComponent(next));await p.waitForURL('**/partner.html?**');expect(new URL(p.url()).searchParams.get('region')).toBe('서울 종로구');await expect(p.locator('#accountContent')).toBeVisible();if(role==='member')await expect(p.locator('#partnerState')).toContainText('직군을 선택');}
await context.route('**/requests.html?**',r=>r.fulfill({contentType:'text/html',body:'<p>격리 예약 복귀 목적지</p>'}));
for(const help of ['claim','tax']){const next='/requests.html?help='+help+'&profession='+(help==='tax'?'tax':'planner')+'&planner='+actor+'&purpose='+(help==='tax'?'other':'claim')+'&date=2030-01-15&time=14%3A00';await p.goto(origin+'/account.html?next='+encodeURIComponent(next));await p.waitForURL('**/requests.html?**');expect(new URL(p.url()).searchParams.get('help')).toBe(help);expect(new URL(p.url()).searchParams.get('planner')).toBe(actor);expect(new URL(p.url()).searchParams.get('time')).toBe('14:00');}
expect(saveCalls).toBe(0);
const anonContext=await browser.newContext();await anonContext.route('**/*',routeHandler);const anon=await anonContext.newPage();
const next='/partner.html?'+new URLSearchParams({roleIntent:'expert',region:'서울 종로구'});await anon.goto(origin+next);await anon.waitForURL('**/login.html?**');expect(new URL(anon.url()).searchParams.get('next')).toBe(next);
await expect(anon.locator('a[href*="signup"]')).not.toHaveCount(0);await anonContext.close();
console.log('PASS anonymous login return and member/pending/approved expert routing preserve region without saving.');
console.log('PASS authenticated callback preserves both booking purposes and expert-management entry for 3 roles.');
expect(errors).toEqual([]);console.log('PASS built partner.html beta, approved and pending integration; isolated responses only.');}finally{await browser.close();}
