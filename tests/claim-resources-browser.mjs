import {chromium,expect} from '@playwright/test';
import {readFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {resources,resourceScope} from '../public/claim-resources-data.js';
const browser=await chromium.launch({channel:'msedge',headless:true}),errors=[];
await mkdir('artifacts',{recursive:true});
try{
 const context=await browser.newContext();await context.route('**/*',async route=>{const u=new URL(route.request().url());if(u.hostname!=='fixture.test')return route.abort();if(u.pathname==='/wizard')return route.fulfill({contentType:'text/html',body:`<meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/account.css"><link rel="stylesheet" href="/simple-ux.css"><link rel="stylesheet" href="/type-system.css"><main class="container"><form id="wizard"></form><div id="requestList"></div></main><script type="module">import {renderOfficeRequest} from '/src/office-request.js';window.commands=[];renderOfficeRequest({form:document.getElementById('wizard'),command:async(...args)=>commands.push(args),refresh:async()=>{},message:()=>{},selectedPlanner:{id:'selected-expert',name:'선택한 전문가',region:'경기 김포시'},availability:async()=>['10:00','18:00']});</script>`});try{const file=u.pathname.startsWith('/src/')?path.resolve('.'+u.pathname):path.resolve('public','.'+u.pathname);await route.fulfill({body:await readFile(file),contentType:file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.woff2')?'font/woff2':file.endsWith('.svg')?'image/svg+xml':'text/html; charset=utf-8'});}catch{await route.fulfill({status:404,body:''});}});
 await context.addInitScript(()=>{Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.copiedText=text;}}});Object.defineProperty(navigator,'share',{value:async data=>{window.sharedData=data;}});});
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 expect(resources.filter(r=>r.type==='hospital')).toHaveLength(47);expect(new Set(resources.map(r=>r.id)).size).toBe(resources.length);expect(resourceScope.summary.preserved).toHaveLength(8);
 for(const r of resources){expect(r.url).toMatch(/^https?:\/\//);if(r.reviewStatus==='homepage')expect(r.urlLabel).toBe('공식 홈페이지');}
 for(const width of [320,360,390,768,1440]){
  await page.setViewportSize({width,height:844});await page.goto('https://fixture.test/claim-resources.html');
  await expect(page.locator('#resourceList .resource-row')).toHaveCount(91);
  await expect(page.locator('input:visible')).toHaveCount(1);await expect(page.locator('select:visible')).toHaveCount(0);
  const categoryColors=await page.locator('#resourceCategories button').evaluateAll(buttons=>buttons.map(button=>getComputedStyle(button).backgroundColor));expect(categoryColors[0]).not.toBe(categoryColors[1]);
  await expect(page.locator('#comparisonTools')).not.toHaveAttribute('open','');await expect(page.locator('#preparationTools')).not.toHaveAttribute('open','');
  if(width===390)await page.screenshot({path:'artifacts/resources-simple-mobile.png'});
  await page.getByLabel('병원·지역·보험사 검색',{exact:true}).fill('서울 삼성');await expect(page.locator('#resourceList .resource-row')).toHaveCount(2);
  await expect(page.locator('#resourceList h3').first()).toHaveText('삼성서울병원');
  await page.getByRole('button',{name:'검색',exact:true}).click();await expect(page.locator('#resourceCount')).toContainText('검색 결과 2곳');
  await page.getByLabel('병원·지역·보험사 검색',{exact:true}).fill('분당 서울대');await expect(page.locator('#resourceList .resource-row')).toHaveCount(1);
  await page.locator('#resourceList .resource-detail-toggle').press('Enter');await expect(page.locator('#resourceList .resource-detail-toggle')).toHaveAttribute('aria-expanded','true');
  await page.getByLabel('분당서울대학교병원 기록 발급 신청자',{exact:true}).selectOption('family');await expect(page.locator('#resourceList')).toContainText('친족 신청');
  await page.locator('#resourceList input[type=checkbox]').first().check();await page.getByRole('button',{name:'선택한 안내문 보기',exact:true}).click();
  await expect(page.locator('#preparationText')).toHaveValue(/친족 신청/);await page.getByRole('button',{name:'안내 복사',exact:true}).click();expect(await page.evaluate(()=>window.copiedText)).toContain('www.snubh.org');
  await page.getByRole('button',{name:'공유',exact:true}).click();expect((await page.evaluate(()=>window.sharedData)).text).toContain('친족 신청');
  await page.getByLabel('병원·지역·보험사 검색',{exact:true}).fill('부산 병원');await expect(page.locator('#resourceList .resource-row')).toHaveCount(5);
  await page.getByRole('button',{name:'병원',exact:true}).click();await expect(page.getByRole('button',{name:'병원',exact:true})).toHaveAttribute('aria-pressed','true');
  // A new search starts from all institutions, not a previous category.
  await page.getByLabel('병원·지역·보험사 검색',{exact:true}).fill('캐롯');await expect(page.getByRole('button',{name:'전체',exact:true})).toHaveAttribute('aria-pressed','true');await expect(page.locator('#resourceList h3')).toHaveText('한화손해보험');
  await page.getByRole('button',{name:'전체 목록',exact:true}).click();await expect(page.locator('#resourceList .resource-row')).toHaveCount(91);
  await page.getByRole('button',{name:'보험사',exact:true}).click();await expect(page.locator('#resourceList .resource-row')).toHaveCount(38);
  await page.getByLabel('병원·지역·보험사 검색',{exact:true}).fill('목록에없는기관');await expect(page.locator('#resourceEmpty')).toBeVisible();
  await page.getByRole('button',{name:'전체 목록 보기',exact:true}).click();await expect(page.locator('#resourceList .resource-row')).toHaveCount(91);
  await page.getByRole('button',{name:'별도 참고',exact:true}).click();await expect(page.locator('#resourceList .resource-row')).toHaveCount(3);
  await page.locator('#comparisonTools>summary').click();await page.getByLabel('첫 번째 보험사').selectOption('samsungfire');await page.getByLabel('두 번째 보험사').selectOption('db');await expect(page.locator('#compareResults article')).toHaveCount(2);await expect(page.locator('#compareResults')).toContainText('접수·발급 방법');
  if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1)){console.log(await page.evaluate(()=>[...document.querySelectorAll('main *')].filter(e=>e.getBoundingClientRect().right>innerWidth+1).map(e=>[e.tagName,e.id,e.className,e.getBoundingClientRect().width,e.scrollWidth]).slice(0,18)));await page.screenshot({path:'artifacts/resources-overflow.png'});}
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  for(const a of await page.locator('a[target=_blank]').all())expect(await a.getAttribute('rel')).toBe('noopener noreferrer');
  await page.getByRole('button',{name:'전체 목록',exact:true}).click();await page.getByLabel('병원·지역·보험사 검색',{exact:true}).fill('강남구');await expect(page.locator('#resourceList .resource-row')).toHaveCount(2);
  if(width===390)await page.screenshot({path:'artifacts/resources-simple-search-mobile.png'});
  console.log('PASS one-field list, reordered search, categories, relation details, keyboard, copy/share and overflow',width);
 }
 await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{value:{writeText:async()=>{throw Error('denied');}}}));await page.getByRole('button',{name:'안내 복사',exact:true}).click();await expect(page.locator('#preparationText')).toBeFocused();await expect(page.locator('#preparationStatus')).toContainText('안내문을 선택');
 await page.goto('https://fixture.test/claim-resources.html?view=consumer&purpose=claim&situation=death');await expect(page.locator('#resourceBack')).toHaveAttribute('href','/map.html?view=experts&purpose=claim&situation=death');
 await page.goto('https://fixture.test/wizard?planner=selected-expert&region='+encodeURIComponent('경기 김포시')+'&situation=cancer&purpose=claim&method=phone');await expect(page.locator('#wizard')).toContainText('암 진단');await expect(page.getByRole('button',{name:'지역 변경',exact:true})).toHaveCount(0);await page.getByRole('button',{name:/내일/}).click();await page.getByRole('button',{name:'18:00',exact:true}).click();const url=page.url();await page.reload();await expect(page.getByRole('button',{name:'18:00',exact:true})).toHaveAttribute('aria-pressed','true');expect(page.url()).toBe(url);await page.getByRole('button',{name:'이 시간으로 신청',exact:true}).click();await expect(page.locator('#wizard')).toContainText('전문가 수락');const commands=await page.evaluate(()=>window.commands);expect(commands).toHaveLength(1);expect(commands[0][1].planner_id).toBe('selected-expert');expect(commands[0][1].office_assignment).toBe(false);expect(commands[0][1].method).toBe('phone');expect(commands[0][1]).not.toHaveProperty('documents');expect(errors).toEqual([]);console.log('PASS selected expert, context, back/reload time retention and pending request. No real request or external share sent.');
}finally{await browser.close();}
