import {chromium,expect} from '@playwright/test';import {readFile} from 'node:fs/promises';import path from 'node:path';
import {setupCare,ids} from './appointment-care-fixture.mjs';
const f=await setupCare(),browser=await chromium.launch({channel:'msedge',headless:true});const origin='https://pages.fixture.test',auth='https://auth.fixture.test';const errors=[];
try{
 const id=await f.booking();
 for(const [actor,route] of [[ids.customer,'/requests.html'],[ids.planner,'/partner-work.html']]){
  const user={id:actor,email:'account@example.test',aud:'authenticated'},session={access_token:Buffer.from('{"alg":"HS256"}').toString('base64url')+'.'+Buffer.from(JSON.stringify({sub:actor,exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')+'.fixture',refresh_token:'fixture',expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,token_type:'bearer',user};
  const context=await browser.newContext({viewport:{width:390,height:844}});await context.addInitScript(s=>localStorage.setItem('woori-account',JSON.stringify(s)),session);
  await context.route('**/*',async r=>{
   const u=new URL(r.request().url());if(u.origin===origin){
    if(u.pathname==='/api/config')return r.fulfill({json:{enabled:true,earlyAccess:true,signupEnabled:true,paymentsEnabled:false,url:auth,key:'fixture'}});
    try{const file=path.resolve('public','.'+u.pathname);return r.fulfill({body:await readFile(file),contentType:file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.svg')?'image/svg+xml':file.endsWith('.png')?'image/png':file.endsWith('.woff2')?'font/woff2':'text/html; charset=utf-8'});}catch{return r.fulfill({status:404,body:''});}
   }
   if(u.origin!==auth)return r.abort();if(u.pathname.endsWith('/user'))return r.fulfill({json:user});if(u.pathname.endsWith('/token'))return r.fulfill({json:session});
   const name=u.pathname.split('/').pop(),args=r.request().postDataJSON()||{};
   try{await f.login(actor);return r.fulfill({json:await f.rpc(name,Object.values(args))});}catch(e){return r.fulfill({status:400,json:{message:e.message,code:e.code}});}
  });
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(origin+route+'?request='+id);await expect(page.locator('[data-appointment-id="'+id+'"]')).toBeVisible();await expect(page.locator('#accountContent')).toBeVisible();
  for(const width of [360,390,430]){await page.setViewportSize({width,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);}
  await page.setViewportSize({width:390,height:844});await page.locator('[data-appointment-id] summary').filter({hasText:/^늦어요$/}).click();await page.getByLabel('예상 지연시간 (분)').fill('7');await page.getByRole('button',{name:'늦어요',exact:true}).click();await expect(page.locator('#accountMessage')).toBeEmpty();await expect(page.locator('[data-appointment-id]')).toContainText('약 7분 지연');
  await page.screenshot({path:actor===ids.customer?'artifacts/appointment-requests-page-390.png':'artifacts/appointment-partner-page-390.png',fullPage:true});await context.close();
 }
 expect(errors).toEqual([]);console.log('PASS actual requests.html and partner-work.html bundles with isolated SQL: both-party late actions, authenticated request deep links, 360/390/430 overflow, existing page initialization. No external connections.');
}finally{await browser.close();await f.db.close();}
