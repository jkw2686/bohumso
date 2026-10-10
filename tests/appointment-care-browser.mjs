import {chromium,expect} from '@playwright/test';
import {readFile,mkdir} from 'node:fs/promises';import path from 'node:path';
import {setupCare,ids,day} from './appointment-care-fixture.mjs';
const origin='https://appointment.fixture.test';const f=await setupCare();const browser=await chromium.launch({channel:'msedge',headless:true});
let actor=ids.customer;const errors=[],calls=[];
try{
 const id=await f.booking();await f.act('propose',id,{at:day(3)+'T16:00:00+09:00',place:'전화상담',method:'phone'});
 const context=await browser.newContext();await context.route('**/*',async route=>{
  const u=new URL(route.request().url());if(u.origin!==origin)return route.abort();
  if(u.pathname==='/rpc'){
   const {operation,payload}=route.request().postDataJSON();calls.push({operation,payload});try{await f.login(actor);return route.fulfill({json:{data:await f.care(operation,payload)}});}catch(e){return route.fulfill({json:{error:{message:e.message,code:e.code}}});}
  }
  if(u.pathname==='/')return route.fulfill({contentType:'text/html',body:`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/simple-ux.css"><link rel="stylesheet" href="/account.css"><link rel="stylesheet" href="/type-system.css"></head><body data-account-page="requests"><main class="container"><h1>내 상담·방문예약</h1><div id="root" class="card"></div></main><script type="module">
import {renderCare,renderCareAdmin,renderCareInbox} from '/src/appointment-care.js';
const client={rpc:async(name,args)=>fetch('/rpc',{method:'POST',body:JSON.stringify(args)}).then(r=>r.json())};
const admin=new URLSearchParams(location.search).has('admin'),root=document.querySelector('#root');
async function load(){root.replaceChildren();if(admin){document.querySelector('h1').textContent='운영자 · 약속 확인';await renderCareAdmin(client,root);}else{const {data,error}=await client.rpc('appointment_care',{operation:'get',payload:{kind:'consultation',id:'${id}'}});if(error)throw error;renderCare({client,root,data,refresh:load});} }
await load();window.ready=true;
</script></body></html>`});
  try{const file=u.pathname.startsWith('/src/')?'.'+u.pathname:'public'+u.pathname;return route.fulfill({body:await readFile(path.resolve(file)),contentType:file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.woff2')?'font/woff2':'text/html'});}catch{return route.fulfill({status:404,body:''});}
 });
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());await mkdir('artifacts',{recursive:true});
 const load=async()=>{await page.goto(origin+'/?request='+id+(actor===ids.admin?'&admin=1':''));await page.waitForFunction(()=>window.ready);};
 for(const width of [360,390,430]){
  await page.setViewportSize({width,height:844});await load();await expect(page.getByText('수락 전까지 기존 약속은 유지돼요.')).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  const checks=await page.locator('.appointment-care').evaluate(root=>{
   const rgb=s=>(s.match(/[\d.]+/g)||[]).map(Number),lum=s=>rgb(s).slice(0,3).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((n,v,i)=>n+v*[.2126,.7152,.0722][i],0);
   const ratio=n=>{let p=n,bg;while(p){bg=getComputedStyle(p).backgroundColor;const c=rgb(bg);if(c.length===3||c[3]===1)break;p=p.parentElement;}const a=lum(getComputedStyle(n).color),b=lum(bg);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);};
   const nodes=[...root.querySelectorAll('button,a,summary,p,label')].filter(n=>n.getBoundingClientRect().height&&!n.disabled);return {contrast:Math.min(...nodes.map(ratio)),touch:Math.min(...nodes.filter(n=>n.matches('button,a,summary')).map(n=>n.getBoundingClientRect().height))};
  });expect(checks.contrast).toBeGreaterThanOrEqual(4.5);expect(checks.touch).toBeGreaterThanOrEqual(44);
  await page.locator('summary').filter({hasText:/^늦어요$/}).click();await page.getByLabel('예상 지연시간 (분)').fill('12');await page.getByRole('button',{name:'늦어요',exact:true}).click();await expect(page.getByText(/약 12분 지연/)).toHaveCount(width===360?1:width===390?2:3);
  if(width===390)await page.screenshot({path:'artifacts/appointment-consumer-390.png',fullPage:true});
 }
 actor=ids.planner;await page.setViewportSize({width:390,height:844});await load();await expect(page.getByRole('button',{name:'변경 수락',exact:true})).toBeVisible();await page.getByRole('button',{name:'변경 수락',exact:true}).click();await expect(page.getByText('수락 전까지 기존 약속은 유지돼요.')).toHaveCount(0);
 await page.locator('summary').filter({hasText:/^일정 변경 요청$/}).click();await page.getByLabel('희망 날짜·시간 (한국 시간)').fill(day(4)+'T15:00');await page.getByRole('button',{name:'일정 변경 요청',exact:true}).click();await expect(page.getByRole('button',{name:'제안 철회'})).toBeVisible();await page.screenshot({path:'artifacts/appointment-expert-390.png',fullPage:true});
 await f.past(id);await f.login(ids.customer);await f.act('report',id,{body:'양쪽의 약속 기록을 확인해 주세요'});actor=ids.admin;await load();await page.locator('summary').filter({hasText:/^불참 확인 중 ·/}).click();await page.locator('summary').filter({hasText:/^사실 확인 결과 저장$/}).click();await page.getByLabel('판정 근거 · 양쪽 설명과 예외 사정').fill('연락 기록만으로 불참을 확정할 수 없어 확인 불가로 판단합니다');for(const name of ['예약·변경·취소 기록을 검토했습니다','양쪽 설명 또는 설명 요청 이력을 확인했습니다','응급상황·합의 변경·앱 오류를 검토했습니다'])await page.getByLabel(name).check();
 await page.screenshot({path:'artifacts/appointment-admin-390.png',fullPage:true});await page.getByRole('button',{name:'사실 확인 결과 저장',exact:true}).click();await expect(page.locator('summary').filter({hasText:/^확인 불가 ·/})).toBeVisible();
 for(const width of [360,430]){await page.setViewportSize({width,height:844});await load();await page.locator('summary').filter({hasText:/^확인 불가 ·/}).click();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);}
 actor=ids.customer;await load();await page.locator('summary').filter({hasText:/^예약 취소$/}).click();await page.getByRole('button',{name:'예약 취소',exact:true}).click();await expect(page.getByRole('heading',{name:'취소된 약속'})).toBeVisible();
 const links=await page.getByRole('link').evaluateAll(ns=>ns.map(n=>n.href));expect(links.filter(x=>x.includes('/map.html')).every(x=>!/[?&](phone|place|note|address)=/.test(x))).toBe(true);expect(links.some(x=>x.includes('planner='+ids.planner))).toBe(true);
 await page.keyboard.press('Tab');expect(await page.evaluate(()=>document.activeElement!==document.body)).toBe(true);
 expect(errors).toEqual([]);console.log('PASS shared UI with real isolated SQL: mobile 360/390/430, late/change/cancel/admin decision, request-key mutations, role screens, private recovery URLs, keyboard. External requests blocked.');
}finally{await browser.close();await f.db.close();}
