import {chromium} from '@playwright/test';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import launch from './playwright-launch.cjs';
import assert from 'node:assert/strict';
const origin='https://admin-audit.fixture.test',auth='https://auth.fixture.test';
const out='artifacts/navigation-performance';await mkdir(out,{recursive:true});
const browser=await chromium.launch(launch);const report=[];report.push=(...items)=>{for(const item of items)console.log(JSON.stringify(item));return Array.prototype.push.apply(report,items);};
const sessionFor=role=>{const user={id:role==='admin'?'10000000-0000-4000-8000-000000000001':'10000000-0000-4000-8000-000000000002',email:'audit@example.test',aud:'authenticated',email_confirmed_at:new Date().toISOString(),user_metadata:{name:'AUDIT FIXTURE'}};const exp=Math.floor(Date.now()/1000)+3600;return{user,access_token:Buffer.from('{"alg":"HS256"}').toString('base64url')+'.'+Buffer.from(JSON.stringify({sub:user.id,exp})).toString('base64url')+'.fixture',refresh_token:'fixture',expires_at:exp,expires_in:3600};};
async function open(role){let current=role, hold=null, failRole=false,blockedName,blockedPromise,markStarted;const calls=[];const ctx=await browser.newContext({viewport:{width:390,height:844},storageState:{cookies:[],origins:role==='anonymous'?[]:[{origin,localStorage:[{name:'woori-account',value:JSON.stringify(sessionFor(role))}]}]}});
await ctx.route('**/*',async r=>{const u=new URL(r.request().url());if(u.origin===origin){if(u.pathname==='/auth-event-fixture.html')return r.fulfill({contentType:'text/html',body:'<!doctype html><title>Isolated auth event</title>'});if(u.pathname==='/api/config')return r.fulfill({json:{enabled:true,earlyAccess:true,expertApplicationsEnabled:true,signupEnabled:true,documentsEnabled:false,paymentsEnabled:false,url:auth,key:'fixture',operator:'AUDIT',contact:'audit@example.test'}});try{const f=path.resolve('public','.'+(u.pathname==='/'?'/index.html':u.pathname));return r.fulfill({body:await readFile(f),contentType:f.endsWith('.js')?'text/javascript':f.endsWith('.css')?'text/css':f.endsWith('.svg')?'image/svg+xml':f.endsWith('.woff2')?'font/woff2':'text/html; charset=utf-8'});}catch{return r.fulfill({status:404,body:''});}}
if(u.origin!==auth)return r.abort();if(u.pathname.endsWith('/user'))return current==='anonymous'?r.fulfill({status:401,json:{message:'no session'}}):r.fulfill({json:sessionFor(current).user});if(u.pathname.endsWith('/token'))return r.fulfill({json:sessionFor(current)});
const name=u.pathname.split('/').pop(),args=r.request().postDataJSON()||{};calls.push({name,op:args.operation,workspace:args.workspace});if(name===blockedName){blockedName=null;markStarted();await blockedPromise;}
if(name==='my_membership'){
 const snapshot=current;
 if(hold){const pending=hold;hold=null;await pending;}
 if(failRole)return r.fulfill({status:503,json:{message:'fixture role lookup failed'}});
 return r.fulfill({json:{member:true,admin:snapshot==='admin',partner_status:snapshot==='expert'?'approved':null,profession:snapshot==='expert'?'planner':null}});
}
if(name==='expert_optional_profile')return r.fulfill({json:{id:sessionFor(current).user.id,name:'AUDIT EXPERT'}});
if(name==='consultation_metrics')return r.fulfill({json:{visit_sessions:0,today_requests:0,active_planners:0,new_planners:0,test_paid_won:0,planner_summary:[]}});
if(name==='planner_catalog')return r.fulfill({json:{planners:[]}});
if(name==='early_expert_review')return r.fulfill({json:current==='admin'?[{user_id:'10000000-0000-4000-8000-000000000099',display_name:'AUDIT ADMIN DATA',profession:'planner',primary_area:'서울 종로구',status:'VERIFICATION_PENDING',documents:[]}]:[]});
if(name==='operational_metrics'||name==='admin_access_command'||name==='expert_roster_command'||name==='region_waitlist'||name==='list_service_requests'||name==='list_assignable_partners'||name==='admin_member_rights')return r.fulfill({json:[]});
if(name==='insurer_contacts_command')return r.fulfill({json:{contacts:[],admin:current==='admin'}});
if(name==='appointment_care')return r.fulfill({json:{cases:[],rows:[],appointments:[]}});
if(name==='consultation_workspace')return r.fulfill({json:{bookings:[],plans:[],regions:[],slots:[],subscriptions:[],planner_profiles:[],cases:[],reviews:[]}});
if(name==='growth_command')return r.fulfill({status:400,json:{code:'PGRST202',message:'audit fixture disabled'}});
return r.fulfill({json:{cases:[],items:[],rows:[],bookings:[],threads:[],expert:false}});
});const page=await ctx.newPage();return{ctx,page,calls,setRole:r=>current=r,holdRole:()=>{let release;hold=new Promise(r=>release=r);return release;},failRole:()=>failRole=true,holdRPC:name=>{blockedName=name;let release;blockedPromise=new Promise(r=>release=r);const started=new Promise(r=>markStarted=r);return {release,started};}};}


try{
 {
  const f=await open('expert'),pending=f.holdRPC('expert_optional_profile');
  try{await f.page.goto(origin+'/menu.html',{waitUntil:'domcontentloaded'});await pending.started;
   await f.page.getByRole('link',{name:'프로필 수정',exact:true}).waitFor();assert.equal(await f.page.getByText('AUDIT EXPERT',{exact:true}).count(),0);
   pending.release();await f.page.getByText('AUDIT EXPERT',{exact:true}).waitFor();
   report.push({test:'expert menus usable before optional profile finishes',result:'pass'});
  }finally{pending.release();await f.ctx.close();}
 }
 {
  const f=await open('expert'),pending=f.holdRPC('expert_optional_profile');
  try{await f.page.goto(origin+'/menu.html',{waitUntil:'domcontentloaded'});await pending.started;await f.page.getByRole('link',{name:'프로필 수정',exact:true}).waitFor();
   f.setRole('anonymous');await f.page.evaluate(()=>{localStorage.removeItem('woori-account');const c=new BroadcastChannel('woori-account');c.postMessage({event:'SIGNED_OUT',session:null});c.close();});
   await f.page.getByRole('link',{name:'일반회원 로그인',exact:true}).waitFor();pending.release();await f.page.waitForTimeout(100);
   assert.equal(await f.page.getByText('AUDIT EXPERT',{exact:true}).count(),0);assert.equal(await f.page.getByRole('link',{name:'프로필 수정',exact:true}).count(),0);
   report.push({test:'late optional profile cannot restore signed-out identity',result:'pass'});
  }finally{pending.release();await f.ctx.close();}
 }
 console.log('PASS progressive navigation '+report.length+' cases');
}finally{await browser.close();await writeFile(out+'/progressive-report.json',JSON.stringify(report,null,2));}
