import {build} from 'esbuild';import {chromium,expect} from '@playwright/test';import {readFile,writeFile} from 'node:fs/promises';import launch from './playwright-launch.cjs';
const fake=`export const client={auth:{onAuthStateChange(fn){window.roleAuth=fn;}}};export async function memberService(){return {client};}export async function memberState(){await new Promise(r=>setTimeout(r,200));if(localStorage.role==='error')throw Error('offline');const role=localStorage.role||'consumer';return {membership:{member:true,profession:'planner',partner_status:role==='consumer'?null:role==='pending'?'pending':'approved'},user:{id:role}};}`;
const bundle=(await build({entryPoints:['src/role-entry.js'],bundle:true,write:false,format:'esm',plugins:[{name:'fake-auth',setup(b){b.onResolve({filter:/member-access\.js$/},()=>({path:'auth',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:fake}));}}]})).outputFiles[0].text;
const browser=await chromium.launch(launch),page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.route('**/*',async route=>{const u=new URL(route.request().url());if(u.pathname==='/assets/role-entry.js')return route.fulfill({body:bundle,contentType:'text/javascript; charset=utf-8'});if(['/role-gate.js','/ui-icons.js'].includes(u.pathname))return route.fulfill({body:await readFile('public'+u.pathname),contentType:'text/javascript; charset=utf-8'});return route.fulfill({body:'<!doctype html><html><head><script src="/role-gate.js"></script><script type="module" src="/assets/role-entry.js"></script></head><body><main><h1>페이지 '+u.pathname+'</h1><button>기존 화면 버튼</button></main><nav data-customer-nav="home"></nav><script src="/ui-icons.js"></script></body></html>',contentType:'text/html; charset=utf-8'});});
try{
for(const width of [360,390,430]){
 await page.setViewportSize({width,height:844});
 for(const role of ['consumer','pending','approved']){
 await page.goto('https://role.test/account.html');await page.evaluate(role=>localStorage.role=role,role);
 for(const path of ['/','/map.html','/urgent.html','/find.html']){
  await page.goto('https://role.test'+path,{waitUntil:'domcontentloaded'});
  await expect(page.getByRole('button',{name:'기존 화면 버튼'})).toBeHidden();
  await page.waitForFunction(()=>document.documentElement.dataset.roleCheck==='ready');
  expect(new URL(page.url()).pathname).toBe(role==='consumer'?(path==='/'?'/map.html':path):'/partner.html');
  await page.reload();await page.waitForFunction(()=>document.documentElement.dataset.roleCheck==='ready');
  if(role!=='consumer'){await expect(page.locator('[data-customer-nav] a')).toHaveCount(3);await expect(page.getByRole('link',{name:'지도',exact:true})).toHaveCount(0);}
 }
 if(role!=='consumer'){await page.goto('https://role.test/map.html?preview=profile&planner='+role);await page.waitForFunction(()=>document.documentElement.dataset.roleCheck==='ready');await expect(page.getByText('내 프로필 지도 · 전문가 홈으로')).toBeVisible();expect(await page.evaluate(()=>localStorage.role)).toBe(role);}
 }
 console.log('PASS role routing mobile',width);
}
await page.evaluate(()=>{localStorage.role='consumer';window.roleAuth('SIGNED_IN');});await page.waitForFunction(()=>window.bohumsoMemberRole==='consumer');await expect(page.getByRole('link',{name:'지도',exact:true})).toBeVisible();
await page.evaluate(()=>{history.replaceState(null,'','/map.html');localStorage.role='approved';window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));});await page.waitForURL('**/partner.html');await page.waitForFunction(()=>document.documentElement.dataset.roleCheck==='ready');
await page.evaluate(()=>{localStorage.role='error';window.roleAuth('TOKEN_REFRESHED');});await expect(page.getByRole('button',{name:'다시 확인'})).toBeVisible();await expect(page.getByRole('button',{name:'기존 화면 버튼'})).toBeHidden();
expect(errors).toEqual([]);console.log('PASS identity change, BFCache return, failure closed, preview does not mutate role');
}finally{await browser.close();}
