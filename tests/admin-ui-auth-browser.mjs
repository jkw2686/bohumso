import {chromium} from '@playwright/test';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import launch from './playwright-launch.cjs';
import assert from 'node:assert/strict';
const origin='https://admin-audit.fixture.test',auth='https://auth.fixture.test';
const out='artifacts/admin-ui-auth-20261023';await mkdir(out,{recursive:true});
const browser=await chromium.launch(launch);const report=[];report.push=(...items)=>{for(const item of items)console.log(JSON.stringify(item));return Array.prototype.push.apply(report,items);};
const sessionFor=role=>{const user={id:role==='admin'?'10000000-0000-4000-8000-000000000001':'10000000-0000-4000-8000-000000000002',email:'audit@example.test',aud:'authenticated',email_confirmed_at:new Date().toISOString(),user_metadata:{name:'AUDIT FIXTURE'}};const exp=Math.floor(Date.now()/1000)+3600;return{user,access_token:Buffer.from('{"alg":"HS256"}').toString('base64url')+'.'+Buffer.from(JSON.stringify({sub:user.id,exp})).toString('base64url')+'.fixture',refresh_token:'fixture',expires_at:exp,expires_in:3600};};
async function open(role){let current=role, hold=null, failRole=false;const calls=[];const ctx=await browser.newContext({viewport:{width:390,height:844},storageState:{cookies:[],origins:role==='anonymous'?[]:[{origin,localStorage:[{name:'woori-account',value:JSON.stringify(sessionFor(role))}]}]}});
await ctx.route('**/*',async r=>{const u=new URL(r.request().url());if(u.origin===origin){if(u.pathname==='/auth-event-fixture.html')return r.fulfill({contentType:'text/html',body:'<!doctype html><title>Isolated auth event</title>'});if(u.pathname==='/api/config')return r.fulfill({json:{enabled:true,earlyAccess:true,expertApplicationsEnabled:true,signupEnabled:true,documentsEnabled:false,paymentsEnabled:false,url:auth,key:'fixture',operator:'AUDIT',contact:'audit@example.test'}});try{const f=path.resolve('public','.'+(u.pathname==='/'?'/index.html':u.pathname));return r.fulfill({body:await readFile(f),contentType:f.endsWith('.js')?'text/javascript':f.endsWith('.css')?'text/css':f.endsWith('.svg')?'image/svg+xml':f.endsWith('.woff2')?'font/woff2':'text/html; charset=utf-8'});}catch{return r.fulfill({status:404,body:''});}}
if(u.origin!==auth)return r.abort();if(u.pathname.endsWith('/user'))return current==='anonymous'?r.fulfill({status:401,json:{message:'no session'}}):r.fulfill({json:sessionFor(current).user});if(u.pathname.endsWith('/token'))return r.fulfill({json:sessionFor(current)});
const name=u.pathname.split('/').pop(),args=r.request().postDataJSON()||{};calls.push({name,op:args.operation,workspace:args.workspace});
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
});const page=await ctx.newPage();return{ctx,page,calls,setRole:r=>current=r,holdRole:()=>{let release;hold=new Promise(r=>release=r);return release;},failRole:()=>failRole=true};}

const links=page=>page.locator('#menuContent a[href*="admin"]');
const settled=page=>page.locator('#menuContent[aria-busy="false"]').waitFor();
async function change(f,role){
 f.setRole(role);
 await f.page.evaluate(({role,session})=>{
  if(role==='anonymous')localStorage.removeItem('woori-account');else localStorage.setItem('woori-account',JSON.stringify(session));
  const c=new BroadcastChannel('woori-account');c.postMessage({event:role==='anonymous'?'SIGNED_OUT':'SIGNED_IN',session:role==='anonymous'?null:session});c.close();
 },{role,session:sessionFor(role)});
}
try {
 if(!process.argv.includes('--history-only')){
 if(!process.argv.includes('--gates-only')){
 for(const role of ['anonymous','member','expert','admin']){
  const f=await open(role);await f.page.goto(origin+'/menu.html',{waitUntil:'domcontentloaded'});await settled(f.page);
  assert.equal(await links(f.page).count(),role==='admin'?2:0);
  report.push({test:'role menu',role,result:'pass'});await f.ctx.close();
 }
 for(const role of ['anonymous','member','expert']){
  const f=await open('admin');await f.page.goto(origin+'/menu.html',{waitUntil:'domcontentloaded'});await settled(f.page);
  await change(f,role);await f.page.waitForFunction(()=>!document.querySelector('#menuContent a[href*="admin"]'));
  await settled(f.page);assert.equal(await links(f.page).count(),0);
  assert.equal(await f.page.locator('#menuIdentity').getByText('AUDIT FIXTURE',{exact:true}).count(),role==='member'?1:0);
  report.push({test:'cross-tab menu account change',role,result:'pass'});await f.ctx.close();
 }
 {
  const f=await open('admin'),release=f.holdRole();await f.page.goto(origin+'/menu.html',{waitUntil:'domcontentloaded'});
  // Wait until the held administrator role request actually started.
  for(let tries=0;!f.calls.some(c=>c.name==='my_membership');tries++){if(tries>500)throw Error('role request did not start');await f.page.waitForTimeout(10);}
  await change(f,'anonymous');await settled(f.page);release();await f.page.waitForTimeout(150);
  assert.equal(await links(f.page).count(),0);assert.equal(await f.page.getByText('AUDIT FIXTURE',{exact:true}).count(),0);
  report.push({test:'late administrator response after logout',result:'pass'});await f.ctx.close();
 }
 {
  const f=await open('admin');await f.page.goto(origin+'/menu.html',{waitUntil:'domcontentloaded'});await settled(f.page);f.failRole();
  await f.page.evaluate(()=>dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true})));
  assert.equal(await links(f.page).count(),0);
  await f.page.evaluate(()=>dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})));
  await settled(f.page);assert.equal(await links(f.page).count(),0);
  report.push({test:'BFCache lifecycle and failed role lookup (synthetic events)',result:'pass'});await f.ctx.close();
 }
 {
  const f=await open('admin');await f.page.goto(origin+'/menu.html',{waitUntil:'domcontentloaded'});await settled(f.page);
  f.setRole('anonymous');const other=await f.ctx.newPage();await other.goto(origin+'/auth-event-fixture.html',{waitUntil:'domcontentloaded'});
  await other.evaluate(()=>localStorage.removeItem('woori-account'));
  await f.page.waitForFunction(()=>!document.querySelector('#menuContent a[href*="admin"]'));await settled(f.page);
  assert.equal(await links(f.page).count(),0);report.push({test:'actual second-tab storage logout without BroadcastChannel',result:'pass'});await f.ctx.close();
 }
 }
 if(!process.argv.includes('--menus-only')){
 for(const pathname of ['/admin.html','/admin-requests.html']){
  // No JavaScript: this is also the first-paint state before auth can finish.
  const ctx=await browser.newContext({javaScriptEnabled:false,viewport:{width:390,height:844}});
  await ctx.route('**/*',async r=>{const u=new URL(r.request().url());if(u.origin!==origin)return r.abort();try{return r.fulfill({body:await readFile(path.resolve('public','.'+u.pathname)),contentType:u.pathname.endsWith('.css')?'text/css':'text/html; charset=utf-8'});}catch{return r.fulfill({status:404,body:''});}});
  const p=await ctx.newPage();await p.goto(origin+pathname);
  assert.equal(await p.locator('#adminAccessNotice').innerText(),'접근 권한을 확인하고 있습니다.');
  for(const selector of ['.nav','main','#adminSidebar','#legacyArchive'])if(await p.locator(selector).count())assert.equal(await p.locator(selector).isVisible(),false);
  await ctx.close();report.push({test:'initial paint gate without JavaScript',pathname,result:'pass'});
  for(const role of ['anonymous','member','expert','admin']){
   const f=await open(role);await f.page.goto(origin+pathname,{waitUntil:'domcontentloaded'});
   if(role==='anonymous')await f.page.waitForURL('**/login.html?**',{waitUntil:'domcontentloaded'});
   else if(role==='admin')await f.page.locator('body[data-admin-access="granted"]').waitFor();
   else await f.page.locator('#adminAccessNotice').filter({hasText:'관리자 권한이 필요합니다.'}).waitFor();
   if(role!=='anonymous')assert.equal(await f.page.locator('main').isVisible(),role==='admin');
   if(role==='admin'){
    await f.page.screenshot({path:out+'/'+pathname.slice(1)+'.png'});
    await change(f,'member');await f.page.waitForFunction(()=>location.pathname==='/account.html'||document.getElementById('adminAccessNotice')?.textContent==='관리자 권한이 필요합니다.');
    if(new URL(f.page.url()).pathname.startsWith('/admin'))assert.equal(await f.page.locator('main').isVisible(),false);
    assert.equal(await f.page.getByText('AUDIT ADMIN DATA',{exact:true}).count(),0);
   }
   report.push({test:'direct admin access and account isolation',pathname,role,result:'pass'});await f.ctx.close();
  }
 }
 {
  const f=await open('admin');await f.page.goto(origin+'/admin.html',{waitUntil:'domcontentloaded'});await f.page.locator('body[data-admin-access="granted"]').waitFor();f.failRole();
  await f.page.evaluate(session=>{const c=new BroadcastChannel('woori-account');c.postMessage({event:'TOKEN_REFRESHED',session});c.close();},sessionFor('admin'));
  await f.page.locator('#adminAccessNotice').filter({hasText:'접근 권한을 확인하지 못했습니다.'}).waitFor();
  assert.equal(await f.page.locator('main').isVisible(),false);assert.equal(await f.page.getByText('AUDIT ADMIN DATA',{exact:true}).count(),0);
  report.push({test:'same-account auth change rechecks role and fails closed',result:'pass'});await f.ctx.close();
 }
 }
 }
 {
  const f=await open('admin');await f.page.goto(origin+'/menu.html',{waitUntil:'domcontentloaded'});await settled(f.page);
  await f.page.goto(origin+'/auth-event-fixture.html',{waitUntil:'domcontentloaded'});
  f.setRole('anonymous');await f.page.evaluate(()=>localStorage.removeItem('woori-account'));
  await f.page.goBack({waitUntil:'domcontentloaded'});await settled(f.page);
  assert.equal(await links(f.page).count(),0);assert.equal(await f.page.getByText('AUDIT FIXTURE',{exact:true}).count(),0);
  report.push({test:'browser back after leaving admin menu and logging out',result:'pass'});await f.ctx.close();
 }
 console.log('PASS admin UI auth regression: '+report.length+' isolated checks');
}finally{await browser.close();await writeFile(out+'/'+(process.argv.find(arg=>/^--(history|menus|gates)-only$/.test(arg))||'ui').replace('--','')+'-report.json',JSON.stringify(report,null,2));}
