import {chromium,expect} from '@playwright/test';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import launch from './playwright-launch.cjs';
const catalog=JSON.parse(await readFile('shared/professions.json','utf8'));
const uiOnly=process.argv.includes('--ui-only');
const f=uiOnly?null:await (await import('./profession-fixture.mjs')).setupProfessions();
const actor='10000000-0000-4000-8000-000000000002';
const origin='https://professions.fixture.test',auth='https://auth.fixture.test';
let model={profile:null,office_profile:null,events:[]},failed=false,saveCalls=0,queue=Promise.resolve();
const checks=[],errors=[];const check=(ok,label)=>{if(!ok)throw Error(label);checks.push(label);console.log('PASS '+label);};
const mock=async(name,args)=>{
 if(name==='my_membership')return {member:true,admin:false,profession:model.profile?.profession,partner_status:null};
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
  try{const file=path.resolve('public','.'+pathname);return route.fulfill({body:await readFile(file),contentType:file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.svg')?'image/svg+xml':file.endsWith('.woff2')?'font/woff2':file.endsWith('.png')?'image/png':'text/html; charset=utf-8'});}catch{return route.fulfill({status:404,body:''});}
 }
 if(u.origin!==auth)return route.abort();
 if(u.pathname.endsWith('/settings'))return route.fulfill({json:{external:{google:true}}});
 if(u.pathname.endsWith('/user'))return route.fulfill({json:user});
 if(u.pathname.endsWith('/token'))return route.fulfill({json:session});
 const name=u.pathname.split('/').pop(),args=route.request().postDataJSON()||{};
 if(name==='expert_profile_command'&&args.operation==='save'){saveCalls++;if(failed)return route.fulfill({status:503,json:{message:'isolated_failure'}});}
 try{const task=queue.then(async()=>{if(!f)return mock(name,args);await f.login(actor);return f.rpc(name,Object.values(args));});queue=task.catch(()=>{});return route.fulfill({json:await task});}catch(e){return route.fulfill({status:400,json:{message:e.message,code:e.code}});}
};await context.route('**/*',routeHandler);
const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
await mkdir('artifacts/profession-screens',{recursive:true});
try{
 await page.goto(origin+'/partner.html');await expect(page.locator('#partnerForm')).toBeVisible();
 const form=page.locator('#partnerForm'),next=()=>form.getByRole('button',{name:'다음',exact:true}).click();
 check(await form.getByRole('radio').count()===3,'three active professions only');
 await form.locator('input[value="tax"]').check();await next();
 await form.getByLabel('실명',{exact:true}).fill('김민수');await form.getByLabel('활동 지역',{exact:true}).selectOption('경기 분당');
 await form.getByLabel('소속 회사 또는 사무소',{exact:true}).fill('확인 세무사무소');await form.getByLabel('세무사 등록번호',{exact:true}).fill('T-12345');await form.getByLabel('사무소 주소',{exact:true}).fill('서울특별시 강남구 확인로 10');
 for(const width of [360,390,430,1440]){await page.setViewportSize({width,height:900});check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),width+'px no horizontal overflow');await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:'artifacts/profession-screens/tax-info-'+width+'.png',fullPage:true});}
 await page.setViewportSize({width:390,height:844});await next();await form.getByLabel('세무 상담료',{exact:true}).selectOption('paid');await form.getByLabel('상담료 또는 산정 기준',{exact:true}).fill('1시간 50,000원');await next();
 await expect(form).not.toContainText('첫 미팅에서는 보험 가입');check(await form.getByRole('checkbox').count()===1,'tax has common terms only');
 await form.getByRole('checkbox').check();await next();failed=true;await form.getByRole('button',{name:'저장하기',exact:true}).click();await expect(page.locator('#accountMessage')).toContainText('입력 내용은 유지');
 failed=false;await form.getByRole('button',{name:'저장하기',exact:true}).dblclick();await expect(form.getByText('저장했어요',{exact:true})).toBeVisible();check(saveCalls===2,'failed save retry with no duplicate success');
 await page.screenshot({path:'artifacts/profession-screens/tax-saved-390.png',fullPage:true});await page.reload();await expect(form).toBeVisible();await expect(form.locator('input[value="tax"]')).toBeChecked();await next();await expect(form.getByLabel('세무사 등록번호',{exact:true})).toHaveValue('T-12345');check(true,'saved profession and input survive reload');
 await page.goto(origin+'/partner.html?profession=office');await expect(form.locator('input[value="office"]')).toBeChecked();await next();await expect(form.getByLabel('거점명',{exact:true})).toBeVisible();await expect(form.getByLabel('운영 연락처',{exact:true})).toBeVisible();await expect(form.getByText('세무사 등록번호',{exact:true})).toHaveCount(0);check(true,'same account enters separate office application');
 await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:'artifacts/profession-screens/office-info-390.png',fullPage:true});
 if(uiOnly){await page.goto(origin+'/map.html?view=experts&region='+encodeURIComponent('경기 분당'));await expect(page.locator('#listCount')).toContainText('2명');await page.getByLabel('지도 직군 선택').selectOption('tax');await expect(page.locator('#listCount')).toContainText('1명');check(await page.locator('#areaRequest').evaluate(e=>e.hidden||e.getBoundingClientRect().bottom<=e.parentElement.getBoundingClientRect().bottom),'collapsed map action is not clipped');await page.locator('#listGrip').click();await expect(page.locator('#listBody')).toContainText('김세무');await expect(page.locator('#listBody')).not.toContainText('김보험');check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'map profession filter has no horizontal overflow');await page.screenshot({path:'artifacts/profession-screens/map-tax-390.png',fullPage:true});}
 if(uiOnly){const guest=await browser.newContext({viewport:{width:390,height:844}});await guest.route('**/*',routeHandler);const signup=await guest.newPage();await signup.goto(origin+'/signup.html?roleIntent=expert');await expect(signup.getByLabel('전문가 직군')).toBeVisible();await signup.locator('[data-phone-auth]').click();await expect(signup.locator('#accountMessage')).toContainText('직군을 먼저');await signup.getByLabel('전문가 직군').selectOption('tax');await signup.locator('[data-phone-auth]').click();await expect(signup.locator('[data-phone-panel]')).toBeVisible();check(new URL(signup.url()).searchParams.get('next').includes('profession=tax'),'phone signup retains chosen profession');const [destination]=await Promise.all([signup.waitForRequest(r=>r.url().startsWith('https://bohumso.netlify.app/signup.html')),signup.locator('#googleSignup').click()]);check(new URL(destination.url()).searchParams.get('next').includes('profession=tax'),'Google signup retains chosen profession without external authentication');await guest.close();}
 check(errors.length===0,'no page JavaScript errors');
}finally{await writeFile('artifacts/profession-browser-'+(uiOnly?'ui':'database')+'-report.json',JSON.stringify({at:new Date().toISOString(),mode:uiOnly?'UI with simulated responses':'isolated database',checks,errors,production:false},null,2));await browser.close();await f?.db.close();}
