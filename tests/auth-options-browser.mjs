import {chromium,expect} from '@playwright/test';import {readFile,mkdir} from 'node:fs/promises';import path from 'node:path';
import {setupUrgent} from './urgent-fixture.mjs';
const f=await setupUrgent(false);await f.db.exec('reset role');
for(const n of ['026_release_controls.sql','027_private_rls.sql','030_public_early_access.sql','031_expert_early_access.sql','032_expert_verification.sql','033_reservation_integrity.sql','034_organization_roster.sql','035_operational_metrics.sql','036_member_rights_admin.sql','044_operational_policy.sql'])await f.db.exec(await readFile('supabase/'+n,'utf8'));
await f.db.exec('create table private.phone_contacts(user_id uuid primary key,phone_e164 text,phone_verification_status text,phone_verified_at timestamptz)');
for(const n of ['043_auth_phone_status_bridge.sql','051_phone_signup.sql'])await f.db.exec(await readFile('supabase/'+n,'utf8'));
const subject='40000000-0000-4000-8000-000000000052',origin='https://bohumso.netlify.app',authOrigin='https://auth.fixture.test',calls=[],errors=[];
await f.db.query('insert into auth.users(id,phone) values($1,$2)',[subject,'821000000000']);
const user={id:subject,phone:'821000000000',phone_confirmed_at:new Date().toISOString(),aud:'authenticated'};
const session={access_token:Buffer.from('{"alg":"HS256"}').toString('base64url')+'.'+Buffer.from(JSON.stringify({sub:subject,exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')+'.fixture',refresh_token:'fixture',expires_in:3600,token_type:'bearer',user};
let ready=true,queue=Promise.resolve();const serial=fn=>{const p=queue.then(fn);queue=p.catch(()=>{});return p;};
const browser=await chromium.launch({channel:'msedge',headless:true});await mkdir('artifacts',{recursive:true});
try{
 const context=await browser.newContext();await context.route('**/*',async route=>{
  const req=route.request(),u=new URL(req.url());
  if(u.origin===origin){
   if(u.pathname==='/api/config')return route.fulfill({json:{enabled:true,earlyAccess:true,signupEnabled:true,phoneVerificationEnabled:true,phoneSignupEnabled:ready,closedBeta:false,url:authOrigin,key:'fixture'}});
   const file=path.resolve('public','.'+u.pathname);if(!file.startsWith(path.resolve('public')+path.sep))return route.abort();
   try{return route.fulfill({body:await readFile(file),contentType:file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.svg')?'image/svg+xml':file.endsWith('.png')?'image/png':file.endsWith('.woff2')?'font/woff2':'text/html'});}catch{return route.fulfill({status:404,body:''});}
  }
  if(u.origin!==authOrigin)return route.abort();
  return serial(async()=>{
   const body=req.postDataJSON()||{};calls.push({path:u.pathname,body,url:u.href});
   if(u.pathname.endsWith('/settings'))return route.fulfill({json:{external:{google:true,kakao:false,phone:true}}});
   if(u.pathname.endsWith('/authorize'))return route.fulfill({body:'Google authorization fixture'});
   if(u.pathname.endsWith('/otp'))return route.fulfill({json:{message_id:'fixture'}});
   if(u.pathname.endsWith('/verify')){
    if(body.token!=='123456')return route.fulfill({status:403,json:{error_code:'otp_expired',msg:'Token has expired or is invalid'}});
    await f.db.exec('reset role');await f.db.query('update auth.users set phone_confirmed_at=now() where id=$1',[subject]);return route.fulfill({json:session});
   }
   if(u.pathname.endsWith('/user'))return route.fulfill({json:user});
   try{await f.login(subject);return route.fulfill({json:await f.rpc(u.pathname.split('/').pop(),Object.values(body))});}catch(e){return route.fulfill({status:400,json:{message:e.message}});}
  });
 });
 const page=await context.newPage();page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));
 for(const width of [320,360,390,768])for(const mode of ['signup','login']){
  await page.setViewportSize({width,height:844});await page.goto(origin+'/'+mode+'.html');
  await expect(page.getByRole('button',{name:'Google 계정으로 계속하기',exact:true})).toBeEnabled();
  await expect(page.getByRole('button',{name:'카카오로 계속하기 준비 중'})).toBeDisabled();
  await expect(page.getByRole('button',{name:'휴대전화 번호로 계속하기',exact:true})).toBeEnabled();
  await expect(page.locator('input[type=password]')).not.toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  const measures=await page.locator('.auth-google').evaluate(el=>({height:el.getBoundingClientRect().height,radius:getComputedStyle(el).borderRadius,logo:el.querySelector('img').naturalWidth}));expect(measures.height).toBeGreaterThanOrEqual(56);expect(measures.radius).toBe('999px');expect(measures.logo).toBeGreaterThan(0);
  if(width===390)await page.screenshot({path:'artifacts/auth-'+mode+'-mobile.png',fullPage:true});
 }
 await page.goto(origin+'/signup.html?next='+encodeURIComponent('/requests.html?purpose=claim'));
 await page.getByRole('button',{name:'Google 계정으로 계속하기'}).click();await page.waitForURL(authOrigin+'/auth/v1/authorize**');expect(new URL(page.url()).searchParams.get('redirect_to')).toBe(origin+'/account.html?next='+encodeURIComponent('/requests.html?purpose=claim'));
 await page.goto(origin+'/signup.html?next='+encodeURIComponent('/partner.html?roleIntent=expert'));
 await expect(page.getByRole('button',{name:'전문가 가입',exact:true})).toHaveAttribute('aria-pressed','true');
 await page.goto(origin+'/signup.html?next=%2Faccount.html');await page.setViewportSize({width:360,height:844});await page.getByRole('button',{name:'휴대전화 번호로 계속하기'}).click();
 await expect(page.getByLabel('휴대전화 번호',{exact:true})).toBeFocused();await expect(page.getByLabel('인증번호 6자리')).toBeDisabled();
 await page.getByLabel('휴대전화 번호',{exact:true}).fill('123');await page.getByRole('button',{name:'인증번호 받기',exact:true}).click();await expect(page.locator('#phoneAuthStatus')).toContainText('11자리');expect(calls.filter(c=>c.path.endsWith('/otp')).length).toBe(0);
 await page.getByLabel('휴대전화 번호',{exact:true}).fill('01000000000');await page.getByLabel('휴대전화 번호',{exact:true}).press('Enter');await expect(page.getByLabel('인증번호 6자리')).toBeFocused();
 expect(calls.find(c=>c.path.endsWith('/otp')).body).toMatchObject({phone:'+821000000000',create_user:true});await expect(page.getByRole('button',{name:/재발송/})).toBeDisabled();
 await page.getByLabel('인증번호 6자리').fill('000000');await page.getByRole('button',{name:'인증하고 계속하기'}).click();await expect(page.locator('#phoneAuthStatus')).toContainText('만료');
 await page.screenshot({path:'artifacts/auth-phone-mobile.png',fullPage:true});
 await page.getByLabel('인증번호 6자리').fill('123456');await page.getByRole('button',{name:'인증하고 계속하기'}).click();await page.waitForURL(origin+'/account.html');
 await expect(page.locator('#membershipState')).toContainText('계정 인증 완료');await expect(page.locator('#membershipForm')).toBeVisible();await expect(page.locator('[name=terms]')).not.toBeChecked();
 for(const field of ['age','terms','privacy'])await page.locator('#membershipForm [name='+field+']').check();await page.getByRole('button',{name:'동의하고 가입 완료'}).click();await expect(page.locator('#membershipState')).toContainText('회원 가입 완료');
 await serial(async()=>{await f.login(subject);expect((await f.rpc('my_membership')).member).toBe(true);expect((await f.rpc('member_rights',['list'])).consents).toHaveLength(3);});
 expect(calls.filter(c=>c.path.endsWith('/verify')).every(c=>c.body.type==='sms')).toBe(true);expect(errors).toEqual([]);
 console.log('PASS 3 entry options, 4 mobile/desktop widths, Google callback, expert intent, invalid phone/OTP, cooldown, phone-only signup + explicit consent on real isolated DB. No live SMS/accounts.');
}finally{await browser.close();await f.db.close();}
