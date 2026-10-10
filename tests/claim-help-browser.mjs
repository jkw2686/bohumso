import {chromium,expect} from '@playwright/test';
import {readFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
const browser=await chromium.launch({channel:'msedge',headless:true});await mkdir('artifacts',{recursive:true});
const routes=['death','cancer','hospitalization','accident','claim','coverage'];
const titles=['가족이 돌아가셨어요','암 진단을 받았어요','입원·수술했어요','사고가 났어요','보험금 받을 수 있을까요?','내 보험이 궁금해요'];
const banners=['사망보험금','암 진단','입원·수술','사고 보험금','받을 보험금','가입보험'];
const errors=[];
try{
 for(const signedIn of [false,true]){
  const context=await browser.newContext(),user={id:'20000000-0000-4000-8000-000000000011',aud:'authenticated',email:'fixture@example.test'};
  await context.addInitScript(({signedIn,user})=>{if(signedIn){const exp=Math.floor(Date.now()/1000)+3600;localStorage.setItem('woori-account',JSON.stringify({access_token:btoa('{"alg":"HS256"}')+'.'+btoa(JSON.stringify({sub:user.id,exp}))+'.fixture',refresh_token:'fixture',expires_at:exp,expires_in:3600,token_type:'bearer',user}));}},{signedIn,user});
  await context.route('**/*',async route=>{
   const url=new URL(route.request().url());
   if(url.hostname==='auth.fixture.test'){
    if(url.pathname.endsWith('/user'))return route.fulfill({json:user});
    if(url.pathname.endsWith('/my_membership'))return route.fulfill({json:{member:true,state:'ACTIVE_MEMBER',partner_status:null}});
    if(url.pathname.endsWith('/planner_catalog'))return route.fulfill({json:{planners:[{id:'expert',available:true,name:'공개 전문가',region:'경기 김포시',area_latitude:37.615,area_longitude:126.716,specialties:['claim','coverage'],availability_status:'scheduled'}]}});
    if(url.pathname.endsWith('/office_catalog'))return route.fulfill({json:[{id:'office',name:'운영 보험소',region:'경기 김포시',status:'active',address:'공개 주소',latitude:37.615,longitude:126.716}]});
    if(url.pathname.endsWith('/reservation_slots'))return route.fulfill({json:['10:00','11:00','18:00']});
    return route.fulfill({json:{}});
   }
   if(url.origin!=='https://fixture.test')return route.abort();
   if(url.pathname==='/api/config')return route.fulfill({json:{enabled:true,url:'https://auth.fixture.test',key:'fixture'}});
   if(['/signup.html','/requests.html'].includes(url.pathname))return route.fulfill({body:'<!doctype html><h1>예약 진행 경로</h1>',contentType:'text/html'});
   if(url.pathname==='/location.js')return route.fulfill({body:'window.startBohumsoLocation=()=>{};',contentType:'text/javascript'});
   try{const file=path.resolve('public','.'+(url.pathname==='/'?'/index.html':url.pathname));return route.fulfill({body:await readFile(file),contentType:file.endsWith('.css')?'text/css':file.endsWith('.js')?'text/javascript':file.endsWith('.woff2')?'font/woff2':file.endsWith('.svg')?'image/svg+xml':'text/html; charset=utf-8'});}catch{return route.fulfill({status:404,body:''});}
  });
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  for(const width of [320,360,390,768,1440]){
   await page.setViewportSize({width,height:844});
   for(let i=0;i<routes.length;i++){
    const slug=routes[i];await page.goto('https://fixture.test/');await page.locator('.situation-cards a[href="/help/'+slug+'.html"]').click();
    await expect(page).toHaveURL('https://fixture.test/help/'+slug+'.html');await expect(page.getByRole('heading',{level:1,name:titles[i],exact:true})).toBeVisible();
    await expect(page.locator('.guide-steps li')).toHaveCount(3);await expect(page.locator('.guide-icon svg')).toBeVisible();
    await expect(page.locator('.member-header')).toContainText(signedIn?'내 정보':'무료 회원가입');
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
    await expect(page.locator('#documents')).not.toHaveAttribute('open','');await page.locator('#documents summary').click();
    await expect(page.locator('#documents')).toHaveAttribute('open','');await expect(page.locator('#documents summary')).toBeFocused();
    await expect(page.locator('#documents li')).toHaveCount(3);
    const bounds=await page.locator('#documents summary').boundingBox(),nav=await page.locator('.customer-nav').boundingBox();expect(bounds.y+bounds.height).toBeLessThanOrEqual(nav.y+1);
    await page.getByRole('link',{name:'← 다른 상황 선택',exact:true}).click();await expect(page).toHaveURL('https://fixture.test/#situations');
    await page.locator('.situation-cards a[href="/help/'+slug+'.html"]').click();
    if(width===390&&!signedIn&&slug==='cancer')await page.screenshot({path:'artifacts/claim-help-cancer-mobile.png',fullPage:true});
    await page.locator('[data-guide-primary]').click();
    await expect(page).toHaveURL(new RegExp('/map.html\\?view=experts&purpose='+(slug==='coverage'?'coverage':'claim')+'&situation='+slug+'$'));
    await expect(page.locator('.purpose-chip')).toContainText(banners[i]);await expect(page.locator('.professional-pin')).toHaveCount(1);
    await expect(page.locator('#listLink')).toHaveAttribute('href',new RegExp('situation='+slug));await expect(page.locator('.urgent-map-link')).toHaveAttribute('href',new RegExp('situation='+slug));
    await page.getByRole('button',{name:'공개 전문가 · 전문가 활동지역',exact:true}).press('Enter');
    await expect(page.locator('#cardBody a').first()).toHaveAttribute('href',new RegExp('situation='+slug));
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
   }
   console.log('PASS six help routes, documents, back, map context, public exploration, width',width,'signedIn',signedIn);
  }
  await page.goto('https://fixture.test/help/claim.html');
  for(const selected of ['illness','hospitalization','accident','death','claim']){
   await page.locator('#documents summary').click();await page.locator('input[value="'+selected+'"]').check();await expect(page.locator('[data-guide-primary]')).toHaveAttribute('href',new RegExp('situation='+selected+'$'));
   await expect(page.locator('[data-guide-secondary]')).toHaveAttribute('href',new RegExp('view=offices&purpose=claim&situation='+selected+'$'));
   await page.goto('https://fixture.test/help/claim.html');
  }
  await page.goto('https://fixture.test/map.html?view=offices&purpose=claim&situation=death&region='+encodeURIComponent('경기 김포시'));
  await expect(page.locator('.planned-pin:not(.is-planned)')).toHaveCount(1);await page.locator('.planned-pin:not(.is-planned)').click();
  await expect(page.getByRole('button',{name:'이 시간으로 방문 요청'})).toBeEnabled();await page.getByRole('button',{name:'이 시간으로 방문 요청'}).click();
  await expect(page).toHaveURL(new RegExp(signedIn?'/requests.html\\?':'/signup.html\\?next='));
  const url=new URL(page.url()),destination=signedIn?url:new URL(url.searchParams.get('next'),'https://fixture.test');expect(destination.searchParams.get('situation')).toBe('death');expect(destination.searchParams.get('office')).toBe('office');
  await context.close();
 }
 expect(errors).toEqual([]);console.log('PASS optional choices and existing booking auth gate. No real accounts, documents, GPS or bookings.');
}finally{await browser.close();}
