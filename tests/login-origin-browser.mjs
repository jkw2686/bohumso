import {chromium,expect} from '@playwright/test';
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
const browser=await chromium.launch({channel:'msedge',headless:true}),results=[];
try{for(const origin of ['https://bohumso.netlify.app','https://preview-fixture--bohumso.netlify.app'])for(const next of ['/notifications.html?reservation=fixture','https://external.invalid/']){
 const ctx=await browser.newContext();await ctx.route('**/*',async route=>{
  const u=new URL(route.request().url());
  if(u.origin===origin){if(u.pathname==='/api/config')return route.fulfill({json:{enabled:true,earlyAccess:true,signupEnabled:true,closedBeta:false,inAppNotificationsEnabled:false,url:'https://auth-fixture.invalid',key:'sb_publishable_fixture',operator:'테스트',contact:'test@example.invalid'}});
   try{return route.fulfill({body:await readFile(path.resolve('public','.'+u.pathname)),contentType:u.pathname.endsWith('.js')?'text/javascript':u.pathname.endsWith('.css')?'text/css':'text/html'});}catch{return route.fulfill({status:404,body:''});}}
  if(u.origin==='https://auth-fixture.invalid'){if(u.pathname.endsWith('/settings'))return route.fulfill({json:{external:{google:true}}});if(u.pathname.endsWith('/authorize'))return route.fulfill({body:'OAuth request captured; no external login'});return route.fulfill({status:401,json:{message:'not authenticated'}});}return route.abort();
 });
 const page=await ctx.newPage();await page.goto(origin+'/login.html?next='+encodeURIComponent(next));await page.locator('#googleLogin').click();await page.waitForURL('https://auth-fixture.invalid/auth/v1/authorize**');
 const callback=new URL(new URL(page.url()).searchParams.get('redirect_to'));expect(callback.origin).toBe(origin);expect(callback.pathname).toBe('/account.html');expect(callback.searchParams.get('next')).toBe(next.startsWith('/')?next:'/account.html');expect(new URL(page.url()).searchParams.get('code_challenge')).toBeTruthy();
 results.push({origin,next:next.startsWith('/')?'internal':'external-rejected',callbackOrigin:callback.origin,pkce:true});await ctx.close();
}await writeFile('artifacts/login-origin-browser.json',JSON.stringify({results,realLogin:false},null,2));console.log(JSON.stringify(results));}finally{await browser.close();}
