import PW_LAUNCH from './playwright-launch.cjs';
import {build} from 'esbuild';
import {chromium,expect} from '@playwright/test';
import {readFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
await mkdir('artifacts/booking-selection',{recursive:true});
await build({entryPoints:['src/office-request.js'],bundle:true,format:'esm',outfile:'artifacts/booking-selection/module.js'});
const browser=await chromium.launch(PW_LAUNCH),base='https://booking.fixture.test';
const context=await browser.newContext();
await context.route('**/*',async route=>{
 const u=new URL(route.request().url());if(u.origin!==base)return route.abort();
 if(u.pathname==='/fixture')return route.fulfill({contentType:'text/html',body:`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/simple-ux.css"><link rel="stylesheet" href="/type-system.css"><link rel="stylesheet" href="/requests-page.css"><main class="container"><form class="card" id="form"></form><div id="requestList"></div></main><script type="module">import {renderOfficeRequest} from '/module.js';window.calls=[];window.fail=false;renderOfficeRequest({form:document.getElementById('form'),selectedPlanner:{id:'expert-test',name:'검수 전문가',region:'경기 김포시',profession:'planner'},availability:async()=>{await new Promise(r=>setTimeout(r,60));return ['10:00','14:00','17:00'];},command:async(op,payload)=>{window.calls.push(payload);await new Promise(r=>setTimeout(r,180));if(window.fail)throw Error('reservation_slot_taken');},refresh:async()=>{},message:()=>{}});</script>`});
 try{const file=u.pathname==='/module.js'?'artifacts/booking-selection/module.js':path.join('public',u.pathname);return route.fulfill({body:await readFile(file),contentType:file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'application/octet-stream'});}catch{return route.fulfill({status:404,body:''});}
});
try{
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 for(const width of [360,390,768,1440]){
  await page.setViewportSize({width,height:900});await page.goto(base+'/fixture?planner=expert-test&region=test&purpose=claim');
  await page.getByRole('button',{name:/내일/}).click();
  await expect(page.getByRole('button',{name:'10:00',exact:true})).toBeEnabled();
  await expect(page.getByRole('button',{name:'09:00',exact:true})).toBeDisabled();
  await expect(page.getByRole('heading',{name:'오전',exact:true})).toBeVisible();await expect(page.getByRole('heading',{name:'오후',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'14:00',exact:true}).click();
  await expect(page.getByRole('button',{name:'이 시간으로 신청',exact:true})).toBeHidden();
  await page.getByRole('button',{name:'선택한 일정 확인',exact:true}).click();
  await expect(page.locator('.booking-review')).toContainText('검수 전문가');await expect(page.locator('.booking-review')).toContainText('14:00');
  expect(await page.evaluate(()=>window.calls.length)).toBe(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  await page.screenshot({path:`artifacts/booking-selection/review-${width}.png`,fullPage:true});
  await page.getByRole('button',{name:'시간 다시 선택',exact:true}).click();await page.getByRole('button',{name:'17:00',exact:true}).click();
  await page.getByRole('button',{name:'선택한 일정 확인',exact:true}).click();await expect(page.locator('.booking-review')).toContainText('17:00');
  await page.getByRole('button',{name:'날짜 변경',exact:true}).click();await page.getByRole('button',{name:/내일/}).click();
  await expect(page.getByRole('button',{name:'선택한 일정 확인',exact:true})).toBeDisabled();
  await page.getByRole('button',{name:'10:00',exact:true}).click();await page.getByRole('button',{name:'선택한 일정 확인',exact:true}).click();
  await page.evaluate(()=>window.fail=true);await page.getByRole('button',{name:'이 시간으로 신청',exact:true}).click();
  await expect(page.getByText('이 시간은 이용할 수 없습니다. 다른 시간을 선택해 주세요.',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'시간 다시 선택',exact:true}).click();await page.getByRole('button',{name:'17:00',exact:true}).click();await page.getByRole('button',{name:'선택한 일정 확인',exact:true}).click();
  await page.evaluate(()=>window.fail=false);await page.getByRole('button',{name:'이 시간으로 신청',exact:true}).click();
  await expect(page.getByRole('button',{name:'이 시간으로 신청',exact:true})).toBeDisabled();
  await expect(page.getByRole('heading',{name:'상담 요청이 접수되었습니다.'})).toBeVisible();
  expect(await page.evaluate(()=>window.calls.length)).toBe(2);expect(await page.evaluate(()=>window.calls[1].planner_id)).toBe('expert-test');
  console.log('PASS booking groups/review/edit/date reset/server availability/error/one submission '+width);
 }
 expect(errors).toEqual([]);
}finally{await browser.close();}
