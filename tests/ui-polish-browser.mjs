import {chromium,expect} from '@playwright/test';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import PW_LAUNCH from './playwright-launch.cjs';
import {setupCare,ids,day} from './appointment-care-fixture.mjs';

const phase=process.argv[2]||'after';
if(phase==='before'&&(!execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).startsWith('65580fd')||execFileSync('git',['diff','--name-only','--','public','src'],{encoding:'utf8'}).trim()))throw Error('Capture baseline only from clean 65580fd source after its own build. Use the archived before images for comparison.');
const f=await setupCare();
await f.db.exec('reset role');
await f.db.exec(`create or replace function private.is_owner() returns boolean language sql stable security definer set search_path='' as $$select private.is_admin() and auth.uid()='${ids.admin}'::uuid$$;revoke all on function private.is_owner() from public,anon,authenticated;`);
for(const file of ['057_support_conversations.sql','060_support_chat.sql','061_expert_growth.sql'])await f.db.exec(await readFile('supabase/'+file,'utf8'));
if(phase==='after'){
 await f.login(ids.planner);const {id}=await f.cmd('request',{planner_id:ids.next,office_assignment:false,purpose:'claim',region:'경기 분당',method:'phone',preferred_at:day(2)+'T14:00:00+09:00',request_key:crypto.randomUUID()});
 await f.login(ids.next);await f.cmd('accept',{id,revision:(await f.row(id,'partner')).revision,place:'전화상담'});
 await f.login(ids.planner);await f.cmd('confirm',{id,revision:(await f.row(id)).revision,care_revision:(await f.get(id)).revision,name:'확인 고객',share_consent:true});
}
const browser=await chromium.launch(PW_LAUNCH),origin='https://ui.fixture.test',auth='https://auth.fixture.test';
const errors=[],results=[];let queue=Promise.resolve(),failOperation='',documentCalls=0;
const serial=fn=>{const p=queue.then(fn);queue=p.catch(()=>{});return p;};
const context=await browser.newContext({viewport:{width:390,height:844}});
const user={id:ids.planner,email:'expert@example.test',aud:'authenticated'},exp=Math.floor(Date.now()/1000)+3600;
const session={user,access_token:Buffer.from('{"alg":"HS256"}').toString('base64url')+'.'+Buffer.from(JSON.stringify({sub:user.id,exp})).toString('base64url')+'.fixture',refresh_token:'fixture',expires_at:exp,expires_in:3600};
await context.addInitScript(s=>localStorage.setItem('woori-account',JSON.stringify(s)),session);
await context.route('**/*',async r=>{
 const u=new URL(r.request().url());
 if(u.origin===origin){
  if(u.pathname==='/api/expert-documents'){documentCalls++;return r.fulfill({status:503,json:{error:'fixture_unavailable'}});}
  if(u.pathname==='/api/config')return r.fulfill({json:{enabled:true,earlyAccess:true,expertApplicationsEnabled:true,signupEnabled:true,documentsEnabled:true,paymentsEnabled:false,url:auth,key:'fixture'}});
  try{const file=path.resolve('public','.'+u.pathname);let body=await readFile(file);if(phase==='before'&&!u.pathname.startsWith('/assets/')&&/\.(html|css|js)$/.test(file))body=execFileSync('git',['show','65580fd:public'+u.pathname],{stdio:['ignore','pipe','ignore']});return r.fulfill({body,contentType:file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.svg')?'image/svg+xml':file.endsWith('.png')?'image/png':file.endsWith('.woff2')?'font/woff2':'text/html; charset=utf-8'});}catch{return r.fulfill({status:404,body:''});}
 }
 if(u.origin!==auth)return r.abort();
 if(u.pathname.endsWith('/user'))return r.fulfill({json:user});
 if(u.pathname.endsWith('/token'))return r.fulfill({json:session});
 const name=u.pathname.split('/').pop(),args=r.request().postDataJSON()||{};
 if(failOperation===name){failOperation='';return r.fulfill({status:503,json:{message:'fixture_unavailable'}});}
 try{return r.fulfill({json:await serial(async()=>{await f.login(user.id);return f.rpc(name,Object.values(args));})});}
 catch(e){return r.fulfill({status:400,json:{message:e.message,code:e.code||'P0001'}});}
});
const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
await mkdir('artifacts/ui-polish',{recursive:true});
try{
 const routes=phase==='before'?['partner','claim-resources','growth']:['partner','claim-resources','growth','account','requests','support','partner-work'];
 for(const route of routes){
  await page.goto(origin+'/'+route+'.html');
  if(route==='growth')await expect(page.getByRole('heading',{name:'나의 실천',exact:true})).toBeVisible();
  else if(route==='claim-resources')await expect(page.locator('.resource-row').first()).toBeVisible();
  else if(['partner','account','requests','partner-work'].includes(route))await expect(page.locator('#accountContent')).toBeVisible();
  else await expect(page.getByRole('button',{name:'1:1 문의',exact:true})).toBeVisible();
  await page.evaluate(()=>document.fonts.ready);
  if(phase==='after'&&route==='requests'){
   await expect(page.locator('.booking-card')).toHaveCount(1);
   const lines=await page.locator('.booking-card').evaluate(n=>[...n.children].map(c=>c.textContent));
   const time=lines.findIndex(t=>t.includes('전화상담')),state=await page.locator('.booking-card').evaluate(n=>[...n.children].findIndex(c=>c.classList.contains('request-status')));
   if(time<0||time>=state||!lines[0].includes('전문가'))throw Error('booking summary order');
  }
  for(const width of phase==='before'?[390]:[360,390,430,1440]){
   await page.setViewportSize({width,height:844});await page.evaluate(()=>scrollTo(0,0));
   const geometry=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth+1,tiny:[...document.querySelectorAll('main button,main .app-menu-row')].filter(b=>{const r=b.getBoundingClientRect();return r.height>0&&r.height<44;}).map(b=>b.textContent.trim())}));
   results.push({route,width,...geometry});
   if(phase!=='before'&&(geometry.overflow||geometry.tiny.length))throw Error(JSON.stringify(results.at(-1)));
   await page.screenshot({path:`artifacts/ui-polish/${phase}-${route}-${width}.png`,fullPage:true});
   if(width===390)await page.screenshot({path:`artifacts/ui-polish/${phase}-${route}-top.png`});
  }
  if(phase!=='before'){
   if(route==='partner')await page.getByRole('button',{name:'내 프로필',exact:true}).click();
   if(route==='growth')await page.getByText('날짜·메모 (선택)',{exact:true}).click();
   if(route==='claim-resources')await page.locator('.resource-detail-toggle').first().click();
   if(route==='support')await page.getByRole('button',{name:'1:1 문의',exact:true}).click();
   await page.setViewportSize({width:360,height:844});await page.evaluate(()=>document.documentElement.style.fontSize='200%');
   if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1))throw Error(route+' enlarged text overflow');
   if(route==='support'){
    const composer=page.locator('#supportNew textarea');await composer.fill('글자를 확대해도 입력할 수 있습니다.');
    await page.setViewportSize({width:360,height:500});await composer.scrollIntoViewIfNeeded();await expect(composer).toBeInViewport();
    await page.getByRole('button',{name:'보내기',exact:true}).scrollIntoViewIfNeeded();await expect(page.getByRole('button',{name:'보내기',exact:true})).toBeInViewport();
    await page.setViewportSize({width:360,height:844});
   }
   await page.screenshot({path:`artifacts/ui-polish/${phase}-${route}-200.png`,fullPage:true});await page.evaluate(()=>document.documentElement.style.fontSize='');
  }
 }
 if(phase!=='before'){
  await page.goto(origin+'/partner.html');await expect(page.locator('#accountContent')).toBeVisible();
  const settings=page.locator('.consult-settings');await settings.getByRole('button',{name:'상담 설정 변경'}).click();
  await settings.getByLabel('상담 요청 받기',{exact:true}).uncheck();failOperation='consultation_command';
  await settings.getByRole('button',{name:'저장하기',exact:true}).click();
  await expect(settings.locator('.profile-status')).toContainText('저장 실패');
  await expect(settings.getByLabel('상담 요청 받기',{exact:true})).not.toBeChecked();
  await expect(settings.locator('.profile-summary')).toContainText('요청 가능');
  await settings.getByRole('button',{name:'저장하기',exact:true}).click();await expect(settings.locator('.profile-status')).toContainText('저장 완료');
  await page.reload();await expect(settings.locator('.profile-summary')).toContainText('새 요청 쉬는 중');
  await page.getByRole('button',{name:'방문 가능 끄기'}).click();await expect(page.locator('.instant-status')).toContainText('지금 방문 쉬는 중');
  await context.setGeolocation({latitude:37.383,longitude:127.119,accuracy:20});await context.grantPermissions(['geolocation']);
  await page.getByRole('button',{name:'방문 가능 켜기'}).click();
  await expect(page.getByRole('dialog')).toContainText('자동 종료');
  await page.getByLabel('위치 사용 목적을 확인하고 동의합니다.').check();
  await page.getByRole('button',{name:'위치 사용하고 시작'}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.instant-status')).toContainText('요청 가능');
  await expect(settings.locator('.profile-summary')).toContainText('새 요청 쉬는 중');
  results.push({check:'independent consultation/visit states, consent, save failure, reload',passed:true});
  await page.getByRole('button',{name:'내 프로필',exact:true}).click();
  const profile=page.locator('.optional-profile');await profile.getByLabel('소개 인사말 (선택 · 40자)').fill('함께 확인해요 😊');failOperation='expert_optional_profile';
  await profile.getByRole('button',{name:'저장하기',exact:true}).click();await expect(profile.locator('.profile-status')).toContainText('입력은 유지');
  await expect(profile.getByLabel('소개 인사말 (선택 · 40자)')).toHaveValue('함께 확인해요 😊');
  await profile.getByRole('button',{name:'저장하기',exact:true}).click();await expect(profile.locator('.profile-status')).toContainText('저장했습니다');
  await page.reload();await expect(profile.locator('.profile-summary')).toContainText('함께 확인해요 😊');
  await page.getByText('자격·소속 자료',{exact:true}).click();
  const documents=page.locator('.document-panel');await documents.getByLabel('설계사 등록증',{exact:true}).setInputFiles({name:'확인자료.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4\nfixture')});
  await expect(documents.locator('.document-selection').first()).toContainText('확인자료.pdf');
  await documents.getByRole('button',{name:'자료 제출',exact:true}).first().click();await expect(documents.locator('[role=status]').first()).toContainText('동의');
  if(documentCalls)throw Error('document sent without consent');
  await documents.getByRole('checkbox').check();await documents.getByRole('button',{name:'자료 제출',exact:true}).first().click();
  await expect(documents.locator('[role=status]').first()).toContainText('처리하지 못했습니다');
  if(await documents.getByLabel('설계사 등록증',{exact:true}).evaluate(n=>n.files.length)!==1)throw Error('failed file selection lost');
  results.push({check:'profile failure/reload, document consent/failure/file retained',passed:true});
  await documents.screenshot({path:'artifacts/ui-polish/after-document-error.png'});
 }
 if(errors.length)throw Error(errors.join('\n'));
 console.log(JSON.stringify({phase,results,pageErrors:errors},null,2));
 await writeFile('artifacts/ui-polish/'+phase+'-results.json',JSON.stringify({results,pageErrors:errors},null,2));
}finally{await browser.close();await f.db.close();}
