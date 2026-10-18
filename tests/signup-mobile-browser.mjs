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

await mkdir('outputs/signup-mobile-20261018',{recursive:true});
for(const width of [320,360,390,430]){
 await p.setViewportSize({width,height:850});
 const cards=p.locator('.signup-roles button'); const before=await cards.evaluateAll(es=>es.map(e=>({width:e.offsetWidth,height:e.offsetHeight})));
 await p.getByRole('button',{name:'전문가 가입',exact:true}).click();
 expect(await cards.evaluateAll(es=>es.map(e=>({width:e.offsetWidth,height:e.offsetHeight})))).toEqual(before);
 await p.getByRole('button',{name:'일반회원 가입',exact:true}).click();
 const styles=await p.locator('.role-description').first().evaluate(e=>{const s=getComputedStyle(e);return {size:s.fontSize,weight:s.fontWeight,break:s.wordBreak,space:s.whiteSpace};});
 expect(styles).toEqual({size:'15px',weight:'400',break:'keep-all',space:'normal'});
 expect(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await p.screenshot({path:'outputs/signup-mobile-20261018/signup-'+width+'.png',fullPage:true});
 await p.evaluate(()=>document.documentElement.style.fontSize='200%');
 expect(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await p.screenshot({path:'outputs/signup-mobile-20261018/signup-'+width+'-text200.png',fullPage:true});
 await p.evaluate(()=>document.documentElement.style.fontSize='');
}
await p.getByRole('button',{name:'전문가 가입',exact:true}).focus();await p.keyboard.press('Enter');
await expect(p.getByRole('button',{name:'전문가 가입',exact:true})).toHaveAttribute('aria-pressed','true');
await p.getByLabel('전문가 직군').selectOption('tax');expect(new URL(p.url()).searchParams.get('next')).toContain('tax');
expect(errors).toEqual([]);console.log('PASS 320/360/390/430, 200% text, stable role cards, typography, keyboard and expert intent. All network isolated.');
}finally{await browser.close();}
