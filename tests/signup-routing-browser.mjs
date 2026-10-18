import PW_LAUNCH from './playwright-launch.cjs';
import {chromium,expect} from '@playwright/test';
import {readFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
const origin='https://bohumso.netlify.app',auth='https://auth.fixture.test',browser=await chromium.launch(PW_LAUNCH);
const user={id:'90000000-0000-4000-8000-000000000002',email:'isolated@example.test',email_confirmed_at:'2026-01-01T00:00:00Z',aud:'authenticated'};
const token=Buffer.from('{"alg":"HS256"}').toString('base64url')+'.'+Buffer.from(JSON.stringify({sub:user.id,exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')+'.fixture';
let member={member:true,state:'ACTIVE_MEMBER'},fail=false;const calls=[],errors=[];
try{
const ctx=await browser.newContext();await ctx.route('**/*',async r=>{const u=new URL(r.request().url());
 if(u.origin===origin){if(u.pathname==='/api/config')return r.fulfill({json:{enabled:true,earlyAccess:true,signupEnabled:true,phoneVerificationEnabled:true,phoneSignupEnabled:true,url:auth,key:'fixture'}});if(u.pathname.startsWith('/api/'))return r.fulfill({json:{enabled:false}});
  try{const file=path.resolve('public','.'+u.pathname);return r.fulfill({body:await readFile(file),contentType:file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.svg')?'image/svg+xml':file.endsWith('.png')?'image/png':'text/html'});}catch{return r.fulfill({status:404,body:''});}}
 if(u.origin!==auth)return r.abort();const name=u.pathname.split('/').pop();calls.push(name);
 if(name==='settings')return r.fulfill({json:{external:{google:true}}});if(name==='user')return r.fulfill({json:user});
 if(name==='my_membership')return r.fulfill(fail?{status:503,json:{message:'fixture_unavailable'}}:{json:member});
 if(name==='complete_membership'){member={member:true,state:'ACTIVE_MEMBER'};return r.fulfill({json:member});}
 return r.fulfill({json:{enabled:false,items:[]}});
});
const p=await ctx.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto(origin+'/signup.html');
for(const width of [360,390,430,1440]){await p.setViewportSize({width,height:850});await expect(p.getByRole('button',{name:'일반회원 가입',exact:true})).toHaveAttribute('aria-pressed','true');await expect(p.getByLabel('전문가 직군')).not.toBeVisible();await p.getByRole('button',{name:'전문가 가입',exact:true}).click();await expect(p.getByLabel('전문가 직군')).toBeVisible();await p.getByLabel('전문가 직군').selectOption('tax');await p.getByRole('button',{name:'일반회원 가입',exact:true}).click();expect(new URL(p.url()).searchParams.get('next')).toBe('/account.html');expect(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await mkdir('outputs/signup-entry-20261018',{recursive:true});await p.screenshot({path:`outputs/signup-entry-20261018/signup-${width}.png`,fullPage:true});}
await p.goto(origin+'/signup.html?next='+encodeURIComponent('/requests.html?purpose=claim&region=서울'));
await p.getByRole('button',{name:'전문가 가입',exact:true}).click();await p.reload();await p.getByRole('button',{name:'일반회원 가입',exact:true}).click();expect(new URL(p.url()).searchParams.get('next')).toContain('purpose=claim');
await p.goto(origin+'/signup.html?next=%2Faccount.html');
await p.evaluate(({token,user})=>{localStorage.setItem('woori-account',JSON.stringify({access_token:token,refresh_token:'fixture',expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,token_type:'bearer',user}));sessionStorage.setItem('bohumso-signup-intent','expert');}, {token,user});
await p.goto(origin+'/account.html');await expect(p.locator('#accountNextAction')).toContainText('가까운 전문가 찾기');await expect(p).toHaveURL(origin+'/account.html');await expect(p.getByRole('link',{name:/^전문가로 참여하기/})).toBeVisible();
for(const [state,partner_status,label] of [['EXPERT_DRAFT',null,'전문가 등록 이어하기'],['EXPERT_PENDING','pending','심사 현황 확인'],['EXPERT_APPROVED','approved','상담 업무 시작하기']]){member={member:true,state,partner_status,profession:'planner'};await p.reload();await expect(p.locator('#accountNextAction')).toContainText(label);}
member={member:true,state:'ACTIVE_MEMBER'};await p.goto(origin+'/partner-work.html');await expect(p.locator('#accountMessage')).toContainText('승인된 전문가');await expect(p.locator('#accountContent')).not.toBeVisible();
await p.goto(origin+'/admin.html');await expect(p.locator('#accountMessage')).toContainText('관리자 권한');await expect(p.locator('#accountContent')).not.toBeVisible();
member={member:false,state:'AUTHENTICATED_INCOMPLETE'};await p.goto(origin+'/account.html');await expect(p.locator('#membershipForm')).toBeVisible();await expect(p.locator('#accountNextAction')).toHaveCount(0);for(const name of ['age','terms','privacy'])await p.locator(`[name=${name}]`).check();await p.getByRole('button',{name:'동의하고 가입 완료',exact:true}).click();await expect(p.locator('#accountNextAction')).toContainText('가입이 완료됐어요.');await p.reload();await expect(p.locator('#accountNextAction')).not.toContainText('가입이 완료됐어요.');
await p.setViewportSize({width:390,height:850});await p.screenshot({path:'outputs/signup-entry-20261018/account-390.png',fullPage:true});
await p.evaluate(()=>{sessionStorage.setItem('bohumso-action-owner','previous-account');sessionStorage.setItem('bohumso-pending-action',JSON.stringify({at:Date.now(),next:'/partner-work.html'}));});await p.goto(origin+'/account.html?next=%2Fpartner-work.html');await expect(p.locator('#accountNextAction')).toContainText('가까운 전문가 찾기');expect(new URL(p.url()).searchParams.has('next')).toBe(false);
await p.locator('#accountNextAction a').first().focus();await expect(p.locator('#accountNextAction a').first()).toBeFocused();await p.keyboard.press('Tab');await expect(p.locator('#accountNextAction a').nth(1)).toBeFocused();
fail=true;await p.reload();await expect(p.getByRole('button',{name:'연결 다시 확인'})).toBeVisible();await expect(p.locator('#accountContent')).not.toBeVisible();fail=false;await p.getByRole('button',{name:'연결 다시 확인'}).click();await expect(p.locator('#accountNextAction')).toBeVisible();
expect(errors).toEqual([]);expect(calls.filter(x=>x==='complete_membership')).toHaveLength(1);console.log('PASS signup roles/4 widths, stale expert intent, consumer/expert next actions, consent completion once, private page denial, failure/retry. All network responses isolated.');
}finally{await browser.close();}
