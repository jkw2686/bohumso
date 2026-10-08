import {chromium,expect} from '@playwright/test';
import {build} from 'esbuild';
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
const bundle=(await build({stdin:{contents:`import {renderEarlyExpertAdmin} from './src/early-expert-admin.js';
window.calls=[];const row={user_id:'fixture',display_name:'시험 전문가',primary_area:'경기 분당',status:'APPROVED',phoneVerified:true,documents:[]};
const client={rpc:async(name,args)=>{window.calls.push({name,args});if(args?.operation==='approve'&&args.payload.reason==='전화 미확인 시험')return {error:{message:'phone_verification_required'}};if(name==='admin_access_command')return {error:{message:'owner_required'}};return {data:name==='early_expert_review'&&args.operation==='list'?[row]:[]};}};
document.querySelector('#accountContent').hidden=false;document.querySelector('#accountNotice').textContent='';renderEarlyExpertAdmin({client,host:document.querySelector('#applications'),message:t=>document.querySelector('#accountMessage').textContent=t});`,resolveDir:process.cwd()},bundle:true,format:'esm',write:false})).outputFiles[0].text;
const browser=await chromium.launch({channel:'msedge',headless:true});const report=[];
try{
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',async r=>{const u=new URL(r.request().url());if(u.pathname==='/assets/account.js')return r.fulfill({body:bundle,contentType:'text/javascript; charset=utf-8'});if(u.origin!=='https://fixture.test')return r.abort();try{return r.fulfill({body:await readFile(path.resolve('public','.'+u.pathname)),contentType:u.pathname.endsWith('.css')?'text/css':u.pathname.endsWith('.svg')?'image/svg+xml':'text/html; charset=utf-8'});}catch{return r.fulfill({status:404,body:''});}});
 for(const width of [320,360,390,430,768,1440]){
  await page.setViewportSize({width,height:844});await page.goto('https://fixture.test/admin.html');
  await expect(page.getByText('경기 분당 · 승인 완료')).toBeVisible();
  const measurements=await page.locator('.expert-review-card').evaluate(card=>{const a=card.querySelector('.expert-review-actions'),buttons=[...a.querySelectorAll('button')],rects=buttons.map(b=>b.getBoundingClientRect());return {overflow:document.documentElement.scrollWidth>innerWidth+1,buttons:rects.map(r=>({height:r.height,width:r.width})),gap:rects[1].left-rects[0].right,inputs:[...card.querySelectorAll('input')].map(i=>({height:i.getBoundingClientRect().height,font:parseFloat(getComputedStyle(i).fontSize)})),differentColors:getComputedStyle(buttons[0]).backgroundColor!==getComputedStyle(buttons[1]).backgroundColor};});
  expect(measurements.overflow).toBe(false);expect(measurements.gap).toBeGreaterThanOrEqual(10);expect(measurements.differentColors).toBe(true);for(const b of measurements.buttons)expect(b.height).toBeGreaterThanOrEqual(48);for(const i of measurements.inputs){expect(i.height).toBeGreaterThanOrEqual(48);expect(i.font).toBeGreaterThanOrEqual(16);}
  report.push({width,...measurements});if([390,1440].includes(width))await page.locator('.expert-review-card').screenshot({path:`artifacts/admin-controls-${width}.png`});
 }
 await page.getByLabel('확인된 소속').fill('시험 소속');await page.getByLabel('확인 근거·보완 사유').fill('전화 미확인 시험');await page.getByRole('button',{name:'승인 후 지도에 표시'}).click();await expect(page.locator('.expert-review-card .review-feedback')).toContainText('승인되지 않았습니다');await expect(page.getByLabel('확인된 소속')).toHaveValue('시험 소속');await page.getByLabel('확인 근거·보완 사유').fill('시험 확인 근거');await page.getByRole('button',{name:'승인 후 지도에 표시'}).click();await expect.poll(()=>page.evaluate(()=>window.calls.filter(c=>c.args?.operation==='approve').length)).toBe(2);await page.getByRole('button',{name:'활동 정지',exact:true}).click();await expect.poll(()=>page.evaluate(()=>window.calls.filter(c=>c.args?.operation==='suspend').length)).toBe(1);expect(errors).toEqual([]);
 await writeFile('artifacts/mobile-controls-report.json',JSON.stringify({report,actualDevice:false,liveActions:false},null,2));console.log('PASS admin mobile controls: six widths, spacing, touch targets, Korean status, unchanged action payloads (mocked)');
}finally{await browser.close();}
