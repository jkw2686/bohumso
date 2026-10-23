import {chromium,expect} from '@playwright/test';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import launch from './playwright-launch.cjs';
import {build} from 'esbuild';
await build({entryPoints:['src/profile-editor.js'],bundle:true,format:'esm',platform:'browser',outfile:'artifacts/profile-settings-ui.js'});
const output=process.env.QA_OUTPUT||'artifacts/service-ui';
const base='https://design.fixture.test',auth='https://design-auth.fixture.test';
const id='40000000-0000-4000-8000-000000000052';
const user={id,email:'design@example.test',aud:'authenticated'};
const expires=Math.floor(Date.now()/1000)+3600;
const session={user,access_token:Buffer.from('{"alg":"HS256"}').toString('base64url')+'.'+Buffer.from(JSON.stringify({sub:id,exp:expires})).toString('base64url')+'.fixture',refresh_token:'fixture',expires_at:expires,expires_in:3600,token_type:'bearer'};
let loggedIn=false,profile={id,name:'가상 전문가',profession:'planner',profession_name:'보험설계사',organization:'가상 상담 사무소',region:'경기 김포시',area_latitude:37.615,area_longitude:126.716,available:true,is_sample:false,phone:'01000000000',hours:'09:00~17:00',specialties:['claim'],offices:[]};
let failSave=false,saveCount=0,requests=[];
const errors=[],checks=[];const check=t=>{checks.push(t);console.log('PASS '+t);};
const browser=await chromium.launch(launch),context=await browser.newContext();
await mkdir(output,{recursive:true});
context.setDefaultTimeout(20000);context.setDefaultNavigationTimeout(45000);
await context.addInitScript(()=>{Object.defineProperty(navigator,'geolocation',{value:{getCurrentPosition:(ok)=>ok({coords:{latitude:37.615,longitude:126.716,accuracy:30}})}});});
await context.route('**/*',async route=>{
 const req=route.request(),u=new URL(req.url());
 if(u.origin===auth){
  if(u.pathname.endsWith('/user'))return route.fulfill(loggedIn?{json:user}:{status:401,json:{message:'not signed in'}});
  if(u.pathname.endsWith('/token')){loggedIn=true;return route.fulfill({json:session});}
  if(u.pathname.endsWith('/settings'))return route.fulfill({json:{external:{google:true}}});
  const name=u.pathname.split('/').pop(),args=req.postDataJSON()||{};
  const data={my_membership:{member:true,state:'ACTIVE_MEMBER',admin:true,partner_status:'approved',profession:'planner'},my_phone_status:{verified:true},planner_catalog:{planners:[profile]},office_catalog:[],service_area_catalog:[{id:'경기 김포시',name:'김포시',region:'경기',latitude:37.615,longitude:126.716}],consultation_workspace:{profile,bookings:requests,summary:{},scheduleProposalsEnabled:false},reservation_slots:['10:00','11:00'],notification_list:[],release_status:{},support_answer_badge:{unread:0},region_waitlist:[],consultation_metrics:{visit_sessions:0,today_requests:0,active_planners:1,new_planners:0,test_paid_won:0,planner_summary:[]}};
  if(name==='consultation_command'){requests.push({...args.payload,id:'50000000-0000-4000-8000-000000000001',state:'requested',revision:1});return route.fulfill({json:{saved:true}});}
  if(name==='urgent_command')return route.fulfill({json:args.operation==='workspace'?[]:{eligible:false,instant:null,visitConfig:{expireMinutes:30}}});
  return route.fulfill({json:data[name]??{enabled:false,available:false}});
 }
 if(u.origin!==base)return route.abort();
 if(u.pathname==='/api/config')return route.fulfill({json:{enabled:true,earlyAccess:true,signupEnabled:true,phoneVerificationEnabled:true,paymentsEnabled:false,url:auth,key:'fixture'}});
 if(u.pathname==='/settings-rpc'){
  const args=req.postDataJSON();if(args.name==='consultation_workspace')return route.fulfill({json:{data:{profile}}});
  if(args.name==='expert_optional_profile')return route.fulfill({json:{data:null}});if(args.name==='expert_public_contact')return route.fulfill({json:{data:{phone:'',public:false}}});
  saveCount++;await new Promise(r=>setTimeout(r,300));if(failSave)return route.fulfill({json:{error:{message:'fixture save failed'}}});
  profile={...profile,...args.payload};return route.fulfill({json:{data:{saved:true}}});
 }
 if(u.pathname==='/settings-module.js')return route.fulfill({body:await readFile('artifacts/profile-settings-ui.js'),contentType:'text/javascript'});
 if(u.pathname==='/settings-fixture')return route.fulfill({contentType:'text/html',body:'<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/account.css"><link rel="stylesheet" href="/type-system.css"><link rel="stylesheet" href="/page-clarity.css"><body data-account-page="partner"><main class="container" id="root"></main><script src="/ui-icons.js"></script><script type="module">import {renderProfileEditor} from "/settings-module.js";const client={rpc:(name,args)=>fetch("/settings-rpc",{method:"POST",body:JSON.stringify({name,...args})}).then(r=>r.json())};await renderProfileEditor(client,document.getElementById("root"));</script></body></html>'});
 try{const f=(u.pathname.startsWith('/src/')||u.pathname.startsWith('/public/'))?path.resolve('.'+u.pathname):path.resolve(process.env.QA_PUBLIC||'public','.'+(u.pathname==='/'?'/index.html':u.pathname));const type=f.endsWith('.js')?'text/javascript':f.endsWith('.css')?'text/css':f.endsWith('.woff2')?'font/woff2':f.endsWith('.svg')?'image/svg+xml':'text/html;charset=utf-8';return route.fulfill({body:await readFile(f),contentType:type});}catch{return route.fulfill({status:404,body:''});}
});
try{
 const adminOnly=process.argv.includes('--admin-only');if(adminOnly){loggedIn=true;await context.addInitScript(s=>localStorage.setItem('woori-account',JSON.stringify(s)),session);}
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 if(!adminOnly){
 for(const width of [360,390,768,1440]){
  await page.setViewportSize({width,height:900});
  for(const route of ['/','/help/claim.html','/claim-resources.html?view=consumer','/map.html?view=experts','/menu.html','/login.html'].filter(route=>!process.env.QA_NON_MAP_ONLY||(route!=='/'&&!route.startsWith('/map')))){
   await page.goto(base+route);await expect(page.locator('body')).toBeVisible();
   await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
   if(width===360||width===390||width===1440)await page.screenshot({path:output+'/'+(route.split('?')[0].replaceAll('/','-')||'home')+'-'+width+'.png',fullPage:true});
   if(route==='/'){await expect(page.locator('#homeMap')).toBeVisible();expect(await page.locator('#homeMap').evaluate(e=>e.getBoundingClientRect().height)).toBeGreaterThanOrEqual(280);expect(await page.locator('.home-help').evaluate(e=>e.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);await page.screenshot({path:`${output}/home-${width}.png`});}
   if(route.includes('/map')){await expect(page.locator('#map')).toBeVisible();expect(await page.locator('#map').evaluate(e=>e.getBoundingClientRect().height)).toBeGreaterThan(200);await page.screenshot({path:`${output}/map-${width}.png`});}
  }
  check((process.env.QA_NON_MAP_ONLY?'help/resources/menu/login layout ':'home/help/resources/map/menu/login layout ')+width);
 }
 if(!process.env.QA_LAYOUT_ONLY){
 await page.setViewportSize({width:390,height:844});
 await page.goto(base+'/login.html?next='+encodeURIComponent('/map.html?view=experts&region=%EA%B2%BD%EA%B8%B0+%EA%B9%80%ED%8F%AC%EC%8B%9C&purpose=claim&situation=death'));
 await page.locator('.email-auth summary').click();await page.getByLabel('이메일',{exact:true}).fill('design@example.test');await page.getByLabel('비밀번호',{exact:true}).fill('fixture-password');await page.locator('#loginForm .btn').first().click();
 await expect(page).toHaveURL(/map.html/);await expect(page.locator('#listCount')).toContainText('1명');
 await page.getByRole('button',{name:'가상 전문가 · 전문가 활동지역',exact:true}).click();
 await page.locator('#cardBody').getByRole('link',{name:'상담 요청',exact:true}).click();await expect(page).toHaveURL(/requests.html/);
 await expect(page.locator('#requestForm')).toContainText('가상 전문가');expect(new URL(page.url()).searchParams.get('situation')).toBe('death');
 await page.getByRole('button',{name:/내일/}).click();await page.getByRole('button',{name:'10:00',exact:true}).click();await page.screenshot({path:output+'/booking-390.png'});
 await page.getByRole('button',{name:'선택한 일정 확인',exact:true}).click();await page.getByRole('button',{name:'이 시간으로 신청',exact:true}).click();await expect(page.locator('#requestForm')).toContainText('전문가 수락');expect(requests).toHaveLength(1);expect(requests[0].planner_id).toBe(id);expect(requests[0].region).toBe('경기 김포시');check('actual login form → map → chosen expert → booking; context and one simulated request retained');
 await page.goto(base+'/settings-fixture');await page.getByRole('button',{name:'상담 설정 변경'}).click();await page.getByLabel('상담 요청 받기',{exact:true}).uncheck();failSave=true;
 await page.getByRole('button',{name:'프로필 저장',exact:true}).click();await expect(page.getByRole('button',{name:'저장 중…'})).toBeDisabled();await expect(page.locator('.consult-settings form')).toHaveAttribute('aria-busy','true');await expect(page.locator('.consult-settings .profile-status')).toContainText('이전 설정으로 복구');await expect(page.getByLabel('상담 요청 받기',{exact:true})).toBeChecked();
 failSave=false;await page.getByLabel('상담 요청 받기',{exact:true}).uncheck();await page.getByRole('button',{name:'프로필 저장',exact:true}).click();await expect(page.locator('.consult-settings .profile-summary')).toContainText('상담 중지');expect(profile.available).toBe(false);expect(saveCount).toBe(2);await page.reload();await expect(page.locator('.profile-summary')).toContainText('상담 중지');check('consultation state: busy/disabled, failure rollback, save and reload');
 await page.screenshot({path:output+'/profile-state-390.png'});
 }
 }
 if(!process.env.QA_LAYOUT_ONLY){requests.splice(0);for(const width of [360,390,768,1440]){await page.setViewportSize({width,height:900});await page.goto(base+'/admin-requests.html');await expect(page.locator('#accountContent')).toBeVisible();await expect(page.locator('.admin-regional-tools')).not.toHaveAttribute('open','');await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await page.screenshot({path:'artifacts/service-ui/admin-'+width+'.png'});}check('admin map/list layout 360/390/768/1440 with simulated empty queue');}
 expect(errors).toEqual([]);check('no JavaScript errors; no production calls');
}finally{await writeFile('artifacts/service-ui/report.json',JSON.stringify({checks,errors,production:false,at:new Date().toISOString()},null,2));await browser.close();}
