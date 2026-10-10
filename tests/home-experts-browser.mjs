import {chromium,expect} from '@playwright/test';
import {readFile,mkdir} from 'node:fs/promises';
import path from 'node:path';

const browser=await chromium.launch({channel:'msedge',headless:true});
await mkdir('artifacts',{recursive:true});
try{
 const page=await browser.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',async route=>{
  const url=new URL(route.request().url());if(url.origin!=='https://fixture.test')return route.abort();
  if(url.pathname==='/api/config')return route.fulfill({json:{enabled:false}});
  if(url.pathname.startsWith('/assets/')||url.pathname==='/location.js')return route.fulfill({body:url.pathname==='/location.js'?'window.startBohumsoLocation=()=>{};':'',contentType:'text/javascript'});
  try{return route.fulfill({body:await readFile(path.resolve('public','.'+url.pathname)),contentType:url.pathname.endsWith('.css')?'text/css':url.pathname.endsWith('.js')?'text/javascript':url.pathname.endsWith('.woff2')?'font/woff2':url.pathname.endsWith('.svg')?'image/svg+xml':'text/html; charset=utf-8'});}catch{return route.fulfill({status:404,body:''});}
 });
 async function providers({officeError=false,catalogError=false}={}){
  await page.evaluate(({officeError,catalogError})=>{
   window.bohumsoOffices=async()=>{if(officeError)throw new Error('Unavailable');return [{id:'office',name:'공개 보험소',region:'경기 김포시',status:'active',latitude:37.615,longitude:126.716}];};
   window.bohumsoCatalog=async()=>{if(catalogError)throw new Error('Unavailable');return {planners:[
    {id:'expert',name:'김포 전문가',region:'경기 김포시',organization:'공개 소속',area_latitude:37.615,area_longitude:126.716,availability_status:'scheduled'},
    {id:'no-point',name:'지역 전문가',region:'경기 하남시',area_latitude:null,area_longitude:null},
    {id:'excluded',name:'예시 전문가',region:'경기 김포시',area_latitude:37.615,area_longitude:126.716,is_sample:true}
   ]};};
   window.dispatchEvent(new Event('bohumso-member-ready'));window.dispatchEvent(new Event('bohumso-member-ready'));
  },{officeError,catalogError});
 }
 for(const width of [320,360,390,1440]){
  await page.setViewportSize({width,height:844});await page.goto('https://fixture.test/index.html');
  await expect(page.locator('#homeExpertList')).toBeEmpty();await providers();
  await expect(page.locator('.home-expert-pin')).toHaveCount(1);
  await expect(page.locator('#homeExpertList .btn')).toHaveCount(2);
  await expect(page.getByText('예시 전문가',{exact:true})).toHaveCount(0);
  await expect(page.locator('#homeExpertList a')).toHaveAttribute('href','/map.html?view=experts&region='+encodeURIComponent('경기 하남시')+'&planner=no-point');
  await page.getByRole('button',{name:'김포 전문가 · 경기 김포시 활동지역 보기',exact:true}).press('Enter');
  await expect(page.locator('#homeMap .home-expert-pin')).toBeFocused();
  const popup=page.locator('#homeMap .leaflet-popup');
  await expect(popup).toContainText('김포 전문가');await expect(popup).toContainText('공개 소속');await expect(popup).toContainText('경기 김포시');
  await expect(popup).toContainText('현재 위치나 방문할 사무실 주소가 아닙니다.');
  await expect(popup.getByRole('link',{name:'전문가 지도에서 보기'})).toHaveAttribute('href','/map.html?view=experts&region='+encodeURIComponent('경기 김포시')+'&planner=expert');
  const group=page.locator('#homeMap .leaflet-marker-icon').filter({has:page.locator('svg')});
  const boxes=await group.evaluateAll(els=>els.filter(e=>['김포보험소','공개 보험소 · 운영 중','김포 전문가 · 전문가 활동지역'].includes(e.title)).map(e=>{const r=e.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom};}));
  expect(boxes).toHaveLength(3);
  for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++){const a=boxes[i],b=boxes[j];expect(a.right<=b.left||b.right<=a.left||a.bottom<=b.top||b.bottom<=a.top).toBe(true);}
  const rect=await popup.boundingBox(),map=await page.locator('#homeMap').boundingBox();
  expect(rect.width).toBeLessThanOrEqual(width);expect(rect.height).toBeLessThanOrEqual(map.height*.75);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  await expect(page.locator('#homeMap .leaflet-control-zoom')).toBeHidden();
  if(width===390)await page.screenshot({path:'artifacts/home-experts-mobile.png'});
  await page.locator('#homeMap .leaflet-popup-close-button').click();await expect(page.locator('#homeMap .leaflet-control-zoom')).toBeVisible();
  console.log('PASS home public experts: scheduled profile, shared coordinate, region link, keyboard, compact popup, width',width);
 }
 await page.goto('https://fixture.test/index.html');await providers({officeError:true});await expect(page.locator('.home-expert-pin')).toHaveCount(1);
 await page.goto('https://fixture.test/index.html');await providers({catalogError:true});await expect(page.locator('[title="공개 보험소 · 운영 중"]')).toHaveCount(1);await expect(page.locator('#homeExperts')).toBeHidden();
 expect(errors).toEqual([]);console.log('PASS independent catalog failures, late service readiness, no duplicate pins. No live data changed.');
}finally{await browser.close();}
