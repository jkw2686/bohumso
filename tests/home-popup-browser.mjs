import {chromium,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';import path from 'node:path';
const b=await chromium.launch({channel:'msedge',headless:true});
try{
 const p=await b.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.addInitScript(()=>{window.waitlistCalls=[];window.openRegionWaitlist=args=>window.waitlistCalls.push(args);});
 await p.route('**/*',async r=>{const u=new URL(r.request().url());if(u.origin!=='https://fixture.test')return r.abort();
  if(u.pathname==='/api/config')return r.fulfill({json:{enabled:false}});
  if(u.pathname.startsWith('/assets/')||u.pathname==='/location.js')return r.fulfill({body:u.pathname==='/location.js'?'window.startBohumsoLocation=()=>{};':'',contentType:'text/javascript'});
  try{return r.fulfill({body:await readFile(path.resolve('public','.'+u.pathname)),contentType:u.pathname.endsWith('.css')?'text/css':u.pathname.endsWith('.js')?'text/javascript':u.pathname.endsWith('.woff2')?'font/woff2':u.pathname.endsWith('.svg')?'image/svg+xml':'text/html; charset=utf-8'});}catch{return r.fulfill({status:404,body:''});}
 });
 for(const [width,height] of [[320,568],[360,640],[390,844],[590,760],[844,390],[1440,900]]){
  await p.setViewportSize({width,height});await p.goto('https://fixture.test/index.html');await p.locator('#homeMap').evaluate(n=>n.scrollIntoView({block:'center',behavior:'instant'}));
  await p.locator('#homeMap .leaflet-marker-icon[title="하남보험소"]').press('Enter');const popup=p.locator('#homeMap .leaflet-popup');await expect(popup).toBeVisible();await expect(p.locator('#homeMap .leaflet-control-zoom')).toBeHidden();
  await expect.poll(()=>popup.evaluate(e=>e.getBoundingClientRect().top>=document.querySelector('#homeMap').getBoundingClientRect().top-1)).toBe(true);const g=await popup.evaluate(e=>{const r=e.getBoundingClientRect(),m=document.querySelector('#homeMap').getBoundingClientRect(),c=e.querySelector('.leaflet-popup-close-button'),a=e.querySelector('.office-opening-section .btn');return {left:r.left,right:r.right,height:r.height,mapHeight:m.height,top:r.top,mapTop:m.top,bottom:r.bottom,mapBottom:m.bottom,w:innerWidth,color:getComputedStyle(a).color,close:c.getBoundingClientRect().width};});
  expect(g.left).toBeGreaterThanOrEqual(0);expect(g.right).toBeLessThanOrEqual(width);expect(g.height).toBeLessThanOrEqual(g.mapHeight*.75);expect(g.top).toBeGreaterThanOrEqual(g.mapTop-1);expect(g.bottom).toBeLessThanOrEqual(g.mapBottom+1);expect(g.color).toBe('rgb(255, 255, 255)');expect(Math.round(g.close)).toBeGreaterThanOrEqual(44);
  await popup.getByRole('button',{name:'오픈 알림 신청',exact:true}).click();await popup.getByRole('button',{name:'이 지역에서 활동하고 싶어요',exact:true}).click();expect(await p.evaluate(()=>waitlistCalls.map(c=>c.role))).toEqual(['consumer','planner']);await expect(popup.getByRole('link',{name:'주변 지역 전문가 보기'})).toHaveAttribute('href',/view=experts/);
  expect(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);if(width===390)await p.screenshot({path:'artifacts/office-compact-home-mobile.png'});
  await p.locator('#homeMap .leaflet-popup-close-button').click();await expect(p.locator('#homeMap .leaflet-control-zoom')).toBeVisible();
  await p.goto('https://fixture.test/map.html?region='+encodeURIComponent('경기 하남시'));await expect(p.locator('.spot')).toHaveCount(1);await p.getByRole('button',{name:'하남보험소 · 개설 예정 보험소',exact:true}).press('Enter');await expect(p.locator('#cardSheet')).toBeVisible();await expect(p.locator('#cardClose')).toBeFocused();
  const sheet=await p.locator('#cardSheet').boundingBox(),map=await p.locator('#mapStage').boundingBox();expect(sheet.width).toBeLessThanOrEqual(320);expect(sheet.height).toBeLessThanOrEqual(Math.min(280,map.height*.5)+1);expect(sheet.y).toBeGreaterThanOrEqual(map.y);expect(sheet.y+sheet.height).toBeLessThanOrEqual(map.y+map.height);expect(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  await p.locator('#cardBody').getByRole('button',{name:'이 지역에서 활동하고 싶어요',exact:true}).click();expect(await p.evaluate(()=>waitlistCalls.at(-1).role)).toBe('planner');await p.keyboard.press('Escape');await expect(p.locator('#cardSheet')).toBeHidden();await expect(p.locator('#listReopen')).toBeFocused();
  await p.getByRole('button',{name:'하남보험소 · 개설 예정 보험소',exact:true}).press('Enter');expect(await p.locator('#cardBody').evaluate(n=>n.scrollTop)).toBe(0);if(width===390)await p.screenshot({path:'artifacts/office-compact-map-mobile.png'});
  console.log('PASS compact office',width,height,'home height',Math.round(g.height),'map card',Math.round(sheet.height));
 }
 expect(errors).toEqual([]);console.log('PASS compact home/map office panels, six viewports, both application routes, map bounds, close/reopen, keyboard. No live submissions.');
}finally{await b.close();}
