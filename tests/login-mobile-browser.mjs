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
const p=await ctx.newPage();p.on('pageerror',e=>errors.push(e.message));
await mkdir('outputs/login-mobile-20261018',{recursive:true});
for(const width of [320,360,390,430]){
 await p.setViewportSize({width,height:850});await p.goto(origin+'/login.html?next=%2Faccount.html');
 await expect(p.getByRole('button',{name:'Google로 계속하기',exact:true})).toBeEnabled();
 expect(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await p.screenshot({path:'outputs/login-mobile-20261018/login-'+width+'.png',fullPage:true});
 await p.locator('.email-auth summary').focus();await p.keyboard.press('Enter');await expect(p.locator('#loginForm')).toBeVisible();
 await p.locator('[name=email]').fill('layout@example.test');
 await p.evaluate(()=>document.documentElement.style.fontSize='200%');
 expect(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await expect(p.locator('[name=email]')).toHaveValue('layout@example.test');
 await p.screenshot({path:'outputs/login-mobile-20261018/login-'+width+'-text200.png',fullPage:true});
 await p.evaluate(()=>document.documentElement.style.fontSize='');
 await p.getByRole('button',{name:'휴대전화로 계속하기',exact:true}).click();await expect(p.locator('#phoneAuthPanel')).toBeVisible();
 expect(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
}
expect(errors).toEqual([]);expect(calls.some(x=>['token','otp','verify','signup'].includes(x))).toBe(false);
console.log('PASS login 320/360/390/430, 200% text, keyboard disclosure, retained input, phone panel; no login/signup/SMS requests; isolated network.');
}finally{await browser.close();}
