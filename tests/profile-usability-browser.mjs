import {chromium,expect} from '@playwright/test';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
// 기본은 기존과 동일한 msedge. Edge 가 없는 컨테이너·CI 에서는
// PLAYWRIGHT_CHANNEL='' 와 PLAYWRIGHT_EXECUTABLE_PATH 로 다른 Chromium 을 지정한다.
// 환경변수를 주지 않으면 기본 동작은 그대로다.
const channel=process.env.PLAYWRIGHT_CHANNEL??'msedge';
const executablePath=process.env.PLAYWRIGHT_EXECUTABLE_PATH||undefined;
const browser=await chromium.launch({headless:true,...(channel?{channel}:{}),...(executablePath?{executablePath}:{})});
const context=await browser.newContext({viewport:{width:390,height:844}});await mkdir('artifacts',{recursive:true});
const id='40000000-0000-4000-8000-000000000052',otherId='40000000-0000-4000-8000-000000000053';
let profile={id,name:'박도움',organization:'함께 확인하는 보험회사',region:'경기 김포시',area_latitude:37.615,area_longitude:126.716,available:true,insurance_types:[],help_tasks:[],offices:[],biography:'',photo_url:''};
const other={...profile,id:otherId,name:'김상담',organization:'다른 소속',biography:'필요한 내용을 차근차근 안내해 드려요.'};
let bytes=null,version=0,saves=0,uploads=0,deletes=0,failSave=false,failPhoto=false,slowSave=false,brokenPhoto=false;const errors=[];
const base='https://fixture.test';context.setDefaultTimeout(10000);
await context.route('**/*',async route=>{
 const req=route.request(),u=new URL(req.url());
 if(u.pathname==='/api/expert-photo'){
  if(req.method()==='POST'){uploads++;if(failPhoto)return route.fulfill({status:500,json:{error:'photo_unavailable'}});bytes=req.postDataBuffer();profile.photo_url='https://bohumso.netlify.app/api/expert-photo?id='+id+'&v=00000000-0000-4000-8000-'+String(++version).padStart(12,'0');return route.fulfill({json:{saved:true,photo_url:profile.photo_url}});}
  if(req.method()==='DELETE'){deletes++;bytes=null;profile.photo_url='';return route.fulfill({json:{saved:true,photo_url:''}});}
  return bytes&&!brokenPhoto&&u.searchParams.get('v')===new URL(profile.photo_url).searchParams.get('v')?route.fulfill({body:bytes,contentType:'image/jpeg',headers:{'Cache-Control':'no-store'}}):route.fulfill({status:404,body:''});
 }
 if(u.origin!==base)return route.abort();
 if(u.pathname==='/catalog')return route.fulfill({json:{planners:[profile,other]}});
 if(u.pathname==='/rpc'){
  const args=req.postDataJSON();if(args.operation==='save'){saves++;if(slowSave)await new Promise(r=>setTimeout(r,250));if(failSave)return route.fulfill({json:{error:{message:'unavailable'}}});profile={...profile,...args.payload};}
  return route.fulfill({json:{data:profile}});
 }
 if(u.pathname==='/profile-fixture')return route.fulfill({contentType:'text/html',body:`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/visual.css"><link rel="stylesheet" href="/account.css"><link rel="stylesheet" href="/expert-onboarding.css"><link rel="stylesheet" href="/type-system.css"><body data-account-page="partner"><main class="container" id="host"><a href="/map.html?view=experts">지도 보기</a></main><script type="module">import {renderOptionalProfile} from '/src/optional-profile.js';const client={auth:{getSession:async()=>({data:{session:{access_token:'fixture'}}})},rpc:async(name,args)=>fetch('/rpc',{method:'POST',body:JSON.stringify(args)}).then(r=>r.json())};await renderOptionalProfile(client,document.getElementById('host'));</script>`});
 if(u.pathname==='/api/config')return route.fulfill({json:{enabled:true,url:base,key:'fixture'}});
 if(u.pathname.startsWith('/assets/')||u.pathname==='/location.js')return route.fulfill({body:'',contentType:'text/javascript'});
 try{
  const file=u.pathname.startsWith('/src/')||u.pathname.startsWith('/public/')?path.resolve('.'+u.pathname):path.resolve('public','.'+u.pathname);let body=await readFile(file);
  if(u.pathname==='/vendor/leaflet.js')body=Buffer.concat([body,Buffer.from(';const makeMap=L.map;L.map=function(...args){const m=makeMap(...args);(window.profileTestMaps||=[]).push(m);return m;};')]);
  return route.fulfill({body,contentType:file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.woff2')?'font/woff2':file.endsWith('.svg')?'image/svg+xml':'text/html; charset=utf-8'});
 }catch{return route.fulfill({status:404,body:''});}
});
await context.addInitScript(()=>{window.bohumsoCatalog=async()=>fetch('/catalog').then(r=>r.json());window.bohumsoOffices=async()=>[];window.startBohumsoLocation=()=>{};});
const editor=await context.newPage(),map=await context.newPage();for(const p of [editor,map])p.on('pageerror',e=>errors.push(e.message));
const save=()=>editor.getByRole('button',{name:'저장하기',exact:true});
async function openEditor(){await editor.goto(base+'/profile-fixture');await editor.getByText('지도 프로필 꾸미기 · 선택',{exact:true}).click();}
async function noOverflow(page){expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);}
async function choosePhoto(file){await editor.getByLabel('프로필 사진 선택',{exact:true}).setInputFiles(file);await expect(editor.getByLabel('사진 확대')).toBeVisible();}
async function confirmPhoto(){await editor.getByRole('button',{name:'이 사진 사용',exact:true}).click();await expect(editor.getByRole('status')).toContainText('사진을 확인');}
async function saved(){await save().click();await expect(editor.getByRole('status')).toContainText('저장했습니다.');await expect(save()).toBeDisabled();}
try{
 console.log('CHECK editor');await openEditor();await expect(save()).toBeDisabled();await expect(editor.locator('.profile-photo-edit>.expert-avatar svg')).toBeVisible();await expect(editor.getByLabel('보험소 방문상담',{exact:true})).toHaveCount(0);
 await editor.getByLabel('생명보험',{exact:true}).check();await saved();await editor.reload();await editor.getByText('지도 프로필 꾸미기 · 선택',{exact:true}).click();await expect(editor.getByLabel('생명보험',{exact:true})).toBeChecked();
 await editor.getByLabel('손해보험',{exact:true}).check();await editor.getByLabel('청구서류 안내',{exact:true}).check();await editor.getByLabel('소개 인사말 (선택 · 40자)').fill('가'.repeat(39)+'🙂');await expect(editor.locator('#profileIntroCount')).toContainText('40 / 40자');
 failSave=true;await save().click();await expect(editor.getByRole('status')).toContainText('입력은 유지');await expect(editor.getByLabel('소개 인사말 (선택 · 40자)')).toHaveValue('가'.repeat(39)+'🙂');
 failSave=false;slowSave=true;const initialSaves=saves;await save().click();await editor.locator('.optional-profile form').evaluate(f=>{f.requestSubmit();f.requestSubmit();});await expect(editor.getByRole('status')).toContainText('저장했습니다.');expect(saves-initialSaves).toBe(1);slowSave=false;
 console.log('CHECK text save/failure/duplicate passed');const portrait=await editor.evaluate(()=>{const c=document.createElement('canvas');c.width=600;c.height=900;const x=c.getContext('2d');x.fillStyle='#dde8f2';x.fillRect(0,0,600,900);x.fillStyle='#365078';x.fillRect(0,700,600,200);x.fillStyle='#b38a69';x.beginPath();x.ellipse(230,300,140,190,0,0,7);x.fill();x.fillStyle='#162030';x.fillRect(160,230,35,20);x.fillRect(260,230,35,20);return c.toDataURL('image/png').split(',')[1];});
 const photoFile={name:'portrait.png',mimeType:'image/png',buffer:Buffer.from(portrait,'base64')};
 await choosePhoto(photoFile);const center=await editor.locator('canvas').evaluate(c=>c.toDataURL());await editor.getByLabel('사진 확대').fill('1.4');await editor.getByLabel('사진 세로 위치').fill('0.1');await editor.getByLabel('사진 가로 위치').focus();await editor.keyboard.press('ArrowRight');expect(await editor.locator('canvas').evaluate(c=>c.toDataURL())!==center).toBe(true);await editor.locator('canvas').scrollIntoViewIfNeeded();const rect=await editor.locator('canvas').boundingBox(),beforeDrag=await editor.locator('canvas').evaluate(c=>c.toDataURL());await editor.mouse.move(rect.x+rect.width/2,rect.y+rect.height/2);await editor.mouse.down();await editor.mouse.move(rect.x+rect.width/2-25,rect.y+rect.height/2-25,{steps:5});await editor.mouse.up();expect(await editor.locator('canvas').evaluate(c=>c.toDataURL())!==beforeDrag).toBe(true);
 await editor.getByRole('button',{name:'90° 회전',exact:true}).click();await editor.getByRole('button',{name:'90° 회전',exact:true}).click();await editor.getByRole('button',{name:'90° 회전',exact:true}).click();await editor.getByRole('button',{name:'90° 회전',exact:true}).click();
 await editor.screenshot({path:'artifacts/profile-crop-390.png',fullPage:true});await confirmPhoto();await editor.getByLabel('소개 인사말 (선택 · 40자)').fill('필요한 내용을 함께 확인해 드려요.');failPhoto=true;await save().click();await expect(editor.getByRole('status')).toContainText('선택한 사진은 유지');await expect(editor.getByRole('status')).toContainText('소개·선택 항목은 저장했습니다.');expect(profile.biography).toBe('필요한 내용을 함께 확인해 드려요.');await expect(editor.locator('.profile-photo-edit img')).toBeVisible();failPhoto=false;await saved();
 expect(bytes.length).toBeLessThanOrEqual(131072);await writeFile('artifacts/profile-adjusted-thumbnail.jpg',bytes);
 await editor.reload();await editor.getByText('지도 프로필 꾸미기 · 선택',{exact:true}).click();await expect(editor.locator('.profile-photo-edit img')).toBeVisible();expect(await editor.locator('.profile-photo-edit img').evaluate(i=>[i.naturalWidth,i.naturalHeight])).toEqual([192,192]);await expect(editor.locator('.profile-photo-edit svg')).toHaveCount(0);
 // Public map refreshes when a different tab saves a new version; no stale photo URL.
 console.log('CHECK saved photo');await map.goto(base+'/map.html?view=experts&region='+encodeURIComponent(profile.region)+'&planner='+id);await expect(map.locator('#cardBody h2')).toHaveText(profile.name);const oldPhoto=profile.photo_url;
 await choosePhoto(photoFile);await editor.getByLabel('사진 확대').fill('2');await confirmPhoto();await saved();expect(profile.photo_url).not.toBe(oldPhoto);
 await expect(map.locator('#cardBody .expert-avatar img')).toHaveAttribute('src',profile.photo_url);await expect(map.locator('.expert-map-marker img')).toHaveCount(1);await expect(map.locator('.expert-map-marker:has(img) svg')).toHaveCount(0);
 // Photo deletion cancellation, then deletion + reload, preserving all other optional data.
 await editor.getByRole('button',{name:'사진 삭제',exact:true}).click();editor.once('dialog',d=>d.accept());await editor.getByRole('button',{name:'취소',exact:true}).click();await expect(editor.locator('.profile-photo-edit img')).toBeVisible();
 await editor.getByRole('button',{name:'사진 삭제',exact:true}).click();await saved();await editor.reload();await editor.getByText('지도 프로필 꾸미기 · 선택',{exact:true}).click();await expect(editor.locator('.profile-photo-edit img')).toHaveCount(0);await expect(editor.locator('.profile-photo-edit svg')).toBeVisible();expect(deletes).toBe(1);
 await choosePhoto(photoFile);await confirmPhoto();await saved();
 // Dirty form navigation and explicit cancellation preserve stored data.
 await editor.getByLabel('소개 인사말 (선택 · 40자)').fill('저장 전 문장');editor.once('dialog',d=>d.dismiss());await editor.getByRole('link',{name:'지도 보기',exact:true}).click();expect(editor.url()).toContain('/profile-fixture');await expect(editor.getByLabel('소개 인사말 (선택 · 40자)')).toHaveValue('저장 전 문장');editor.once('dialog',d=>d.accept());await editor.getByRole('button',{name:'취소',exact:true}).click();await expect(save()).toBeDisabled();
 // Legacy long and multiline text is kept, fully visible in detail, never truncated on unrelated save.
 profile.name='아주긴이름의지역상담담당전문가박도움';profile.organization='고객의상황을함께확인하는아주긴소속이름지역상담사무소';profile.biography='안녕하세요 🙂\n'+('어려운보험금청구준비를함께확인해드려요'.repeat(6));
 await openEditor();await expect(editor.getByLabel('소개 인사말 (선택 · 40자)')).not.toHaveValue('');await editor.getByLabel('생명보험',{exact:true}).uncheck();await saved();expect(profile.biography).toContain('\n');expect(Array.from(profile.biography).length).toBeGreaterThan(40);
 for(const width of [360,390,430,1440]){
  await editor.setViewportSize({width,height:844});await noOverflow(editor);await editor.locator('.optional-profile').evaluate(el=>el.scrollIntoView());
  if(width===390)await editor.screenshot({path:'artifacts/profile-editor-390.png',fullPage:true});
  await map.setViewportSize({width,height:844});await map.goto(base+'/map.html?view=experts&region='+encodeURIComponent(profile.region)+'&planner='+id);await expect(map.locator('#cardBody h2')).toHaveText(profile.name);
  const marker=map.locator('.expert-map-marker[title="'+profile.name+' · 전문가 활동지역"]');await expect(marker.locator('img')).toBeVisible();expect((await marker.boundingBox()).width).toBe(48);await expect(marker.locator('svg')).toHaveCount(0);
  const mboxes=await map.locator('.expert-map-marker').evaluateAll(els=>els.map(el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom};}));const [a,b]=mboxes;expect(a.right<=b.x||b.right<=a.x||a.bottom<=b.y||b.bottom<=a.y).toBe(true);
  const before=await map.evaluate(()=>({center:window.profileTestMaps[0].getCenter(),zoom:window.profileTestMaps[0].getZoom()}));
  await map.locator('#cardBody').getByRole('link',{name:'프로필 보기',exact:true}).click();const detail=map.getByRole('dialog',{name:'전문가 프로필'});await expect(detail).toBeVisible();await expect(detail.locator('.expert-introduction')).toHaveText(profile.biography);await expect(detail.locator('.expert-introduction')).toHaveCSS('white-space','pre-wrap');await expect(detail.locator('.expert-introduction')).toHaveCSS('overflow','visible');
  await detail.getByRole('link',{name:'상담 요청',exact:true}).scrollIntoViewIfNeeded();await expect(detail.getByRole('link',{name:'상담 요청',exact:true})).toHaveAttribute('href',new RegExp('planner='+id));expect((await detail.getByRole('link',{name:'상담 요청',exact:true}).boundingBox()).height).toBeGreaterThanOrEqual(44);await noOverflow(map);
  if(width===390){await detail.locator('.expert-detail-body').evaluate(el=>el.scrollTop=0);await map.screenshot({path:'artifacts/profile-detail-390.png'});}
  await map.getByRole('button',{name:'프로필 닫고 이전 화면으로',exact:true}).click();await expect(detail).toHaveCount(0);expect(await map.evaluate(()=>({center:window.profileTestMaps[0].getCenter(),zoom:window.profileTestMaps[0].getZoom()}))).toEqual(before);
  // Both photo and name open the same detail. Browser back closes only the detail.
  await map.locator('#cardBody h2 a').click();await expect(detail).toBeVisible();await map.goBack();await expect(detail).toHaveCount(0);await expect(map.locator('#cardBody h2')).toHaveText(profile.name);
  await map.locator('#cardBody .expert-profile-head>.expert-profile-link').click();await expect(detail).toBeVisible();await map.keyboard.press('Escape');await expect(detail).toHaveCount(0);await expect(map.locator('#cardSheet')).toBeVisible();
  await map.locator('.expert-map-marker[title="'+other.name+' · 전문가 활동지역"]').click();await expect(map.locator('#cardBody h2')).toHaveText(other.name);await expect(map.locator('#cardBody .expert-avatar img')).toHaveCount(0);await map.locator('#cardBody').getByRole('link',{name:'프로필 보기',exact:true}).click();await expect(detail.locator('.expert-introduction')).toHaveText(other.biography);await map.keyboard.press('Escape');
  await marker.click();await expect(map.locator('#cardBody h2')).toHaveText(profile.name);if(width===390)await map.screenshot({path:'artifacts/profile-map-390.png'});
  console.log('PASS editor/map/detail, full legacy text, portrait marker, repeated selection and back',width);
 }
 brokenPhoto=true;await map.reload();await expect(map.locator('#cardBody .expert-avatar svg')).toBeVisible();await expect(map.locator('#cardBody .expert-avatar img')).toHaveCount(0);brokenPhoto=false;
 profile.available=false;profile.offices=[{id:'office',name:'방문 보험소',region:profile.region,available:true}];await map.reload();await map.locator('#cardBody').getByRole('link',{name:'프로필 보기',exact:true}).click();const detail=map.getByRole('dialog');await expect(detail.getByRole('link',{name:'상담 요청',exact:true})).toHaveCount(0);await expect(detail.getByRole('link',{name:'보험소 방문예약 · 방문 보험소',exact:true})).toHaveAttribute('href',/office=office/);
 await map.addStyleTag({content:'html{font-size:200%}.expert-detail :is(h2,p,span,a,button){font-size:1rem!important}'});await noOverflow(map);await detail.getByRole('link',{name:'보험소 방문예약 · 방문 보험소',exact:true}).scrollIntoViewIfNeeded();await expect(detail.getByRole('link',{name:'보험소 방문예약 · 방문 보험소',exact:true})).toBeInViewport();await map.keyboard.press('Escape');
 await editor.setViewportSize({width:390,height:410});await editor.getByLabel('소개 인사말 (선택 · 40자)').focus();await expect(editor.getByLabel('소개 인사말 (선택 · 40자)')).toBeInViewport();await editor.getByRole('button',{name:'저장하기',exact:true}).scrollIntoViewIfNeeded();await expect(save()).toBeInViewport();await noOverflow(editor);

 // Final report captures use normal-length example data; stress captures above stay separate.
 profile.name='박도움';profile.organization='함께 확인하는 보험회사';profile.biography='필요한 내용을 차근차근 함께 확인해 드려요.';profile.available=true;profile.offices=[];
 await editor.setViewportSize({width:390,height:844});await openEditor();await editor.locator('.optional-profile').screenshot({path:'artifacts/profile-final-editor.png'});
 await map.setViewportSize({width:390,height:844});await map.goto(base+'/map.html?view=experts&region='+encodeURIComponent(profile.region)+'&planner='+id);await expect(map.locator('#cardBody h2')).toHaveText(profile.name);await map.screenshot({path:'artifacts/profile-final-map.png'});await map.locator('#cardBody').getByRole('link',{name:'프로필 보기',exact:true}).click();await map.screenshot({path:'artifacts/profile-final-detail.png'});
 for(const [page,scope]of [[editor,'.optional-profile'],[map,'.expert-detail']]){
  const lowContrast=await page.locator(scope).evaluate(root=>{
   const parse=c=>(c.match(/[\d.]+/g)||[]).map(Number),lum=c=>c.slice(0,3).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((a,b,i)=>a+b*[.2126,.7152,.0722][i],0);
   const failures=[];for(const el of root.querySelectorAll('h2,h3,p,label,legend,a,button,summary')){if(!el.getClientRects().length||!el.textContent.trim()||el.closest('[hidden],fieldset:disabled')||el.matches(':disabled'))continue;const rect=el.getBoundingClientRect();if(!rect.width||!rect.height)continue;let ancestor=el,bg;while(ancestor){const v=parse(getComputedStyle(ancestor).backgroundColor);if(v.length===3||v[3]===1){bg=v;break;}ancestor=ancestor.parentElement;}bg=bg||[255,255,255];const fg=parse(getComputedStyle(el).color),a=lum(fg),b=lum(bg),ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);if(ratio<4.5)failures.push({text:el.textContent.slice(0,24),ratio});}return failures;
  });expect(lowContrast).toEqual([]);
 }
 expect(errors).toEqual([]);console.log('PASS save failure/retry, duplicate guard, retained values, photo add/adjust/replace/delete/fallback/cache, dirty navigation, OFF/office independence, 200% text and short viewport. No production calls.');
}catch(e){await editor.screenshot({path:'artifacts/profile-error-editor.png',fullPage:true});await map.screenshot({path:'artifacts/profile-error-map.png'});throw e;}finally{await browser.close();}
