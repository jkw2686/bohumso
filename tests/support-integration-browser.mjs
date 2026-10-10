import {chromium,expect} from '@playwright/test';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {setupSupport,ids} from './support-integration-fixture.mjs';

const f=await setupSupport(),origin='https://support.example.test',api='https://fixture.supabase.co';
const browser=await chromium.launch({channel:'msedge',headless:true});let queue=Promise.resolve();const serial=fn=>{const next=queue.then(fn);queue=next.catch(()=>{});return next;};
const errors=[],calls=[];let failMine=false,failCreate=false,loseReceipt=false,loseReplyReceipt=false,delayCreate=false,legacy=false,failExpertReview=false,failLegacyList=false;
async function context(actor,width=390){
 const ctx=await browser.newContext({viewport:{width,height:844}});const session={access_token:Buffer.from('{"alg":"HS256"}').toString('base64url')+'.'+Buffer.from(JSON.stringify({sub:actor,exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')+'.fixture',refresh_token:'fixture',expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,token_type:'bearer',user:{id:actor,email:'fixture@example.test',email_confirmed_at:new Date().toISOString(),aud:'authenticated'}};
 await ctx.addInitScript(s=>localStorage.setItem('woori-account',JSON.stringify(s)),session);
 // Every resource is intercepted. No real auth, database, AI, SMS or payment request can leave this browser.
 await ctx.route('**/*',async route=>{const req=route.request(),u=new URL(req.url());
  if(u.origin===origin){if(u.pathname==='/api/config')return route.fulfill({json:{enabled:true,earlyAccess:true,signupEnabled:true,url:api,key:'sb_publishable_fixture',operator:'가상 운영자',contact:'support@example.test'}});
   const file=path.resolve('public','.'+(u.pathname==='/'?'/support.html':u.pathname));if(!file.startsWith(path.resolve('public')+path.sep))return route.abort();try{return route.fulfill({body:await readFile(file),contentType:file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.svg')?'image/svg+xml':file.endsWith('.woff2')?'font/woff2':'text/html'});}catch{return route.fulfill({status:404,body:''});}}
  if(u.origin!==api)return route.abort();if(u.pathname.endsWith('/user'))return route.fulfill({json:session.user});
  if(!u.pathname.includes('/rpc/'))return route.fulfill({status:404,json:{message:'fixture route not enabled'}});
  const name=u.pathname.split('/').pop(),payload=req.postDataJSON()||{};calls.push({actor,name,...payload});
  if(name==='support_command'&&legacy)return route.fulfill({status:404,json:{code:'PGRST202',message:'missing function'}});
  if(name==='member_rights'&&payload.operation==='list'&&failLegacyList){failLegacyList=false;return route.fulfill({status:503,json:{message:'fixture history unavailable'}});}
  if(name==='early_expert_review'&&failExpertReview)return route.fulfill({status:503,json:{message:'fixture expert screen unavailable'}});
  if(name==='support_command'&&payload.operation==='mine'&&failMine){failMine=false;return route.fulfill({status:503,json:{message:'fixture unavailable'}});}
  if(name==='support_command'&&payload.operation==='create'&&failCreate){failCreate=false;return route.fulfill({status:503,json:{message:'fixture save failed'}});}
  if(name==='support_command'&&payload.operation==='create'&&delayCreate)await new Promise(resolve=>setTimeout(resolve,200));
  if(name==='appointment_care')return route.fulfill({status:404,json:{code:'PGRST202',message:'missing function'}});
  if(name==='admin_access')return route.fulfill({json:{owner:false,members:[]}});
  const safe=['support_command','my_membership','early_expert_review','operational_metrics','admin_member_rights','member_rights'];if(!safe.includes(name))return route.fulfill({status:404,json:{code:'PGRST202',message:'fixture denies '+name}});
  return serial(async()=>{try{await f.login(actor);const data=await f.rpc(name,Object.values(payload));if(name==='support_command'&&payload.operation==='create'&&loseReceipt){loseReceipt=false;return route.abort('failed');}if(name==='support_command'&&payload.operation==='reply'&&loseReplyReceipt){loseReplyReceipt=false;return route.abort('failed');}return route.fulfill({json:data});}catch(e){return route.fulfill({status:400,json:{message:e.message,code:e.code}});}});
 });return ctx;
}
try{
 await mkdir('artifacts',{recursive:true});
 const consumerCtx=await context(ids.customer),expertCtx=await context(ids.planner),adminCtx=await context(ids.admin,1280);
 const p=await consumerCtx.newPage(),ep=await expertCtx.newPage(),ad=await adminCtx.newPage();for(const page of [p,ep,ad]){page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(12000);page.on('dialog',d=>d.accept());}
 const booking=await serial(async()=>{await f.owner('select 1');return (await f.owner("insert into private.consultations(customer_id,planner_id,purpose,region,method,preferred_at) values($1,$2,'claim','경기 분당','phone',now()+interval '2 days') returning id",[ids.customer,ids.planner]))[0].id;});
 await p.goto(origin+'/support.html');await expect(p.getByLabel('문의 내용',{exact:true})).toBeVisible();await p.getByLabel('관련 예약 (선택)').selectOption(booking);
 failCreate=true;await p.getByLabel('문의 내용',{exact:true}).fill('가상 소비자 문의 · 모바일 화면을 확인하고 싶어요.');await p.getByRole('button',{name:'문의 접수',exact:true}).click();await expect(p.getByLabel('문의 내용',{exact:true})).toHaveValue('가상 소비자 문의 · 모바일 화면을 확인하고 싶어요.');await expect(p.getByRole('status').filter({hasText:'저장 여부'})).toBeVisible();
 failMine=true;delayCreate=true;await p.getByRole('button',{name:'문의 접수',exact:true}).evaluate(b=>{b.click();b.closest('form').requestSubmit();});
 await expect(p.getByText('대화를 불러오지 못했습니다. 작성한 내용은 유지됩니다. 다시 새로고침해 주세요.')).toBeVisible();expect(await p.getByText('접수하지 못했습니다.',{exact:true}).count()).toBe(0);
 await p.getByRole('button',{name:'대화 새로고침'}).click();await expect(p.locator('.support-ticket')).toHaveCount(1);
 const ticket=await p.locator('.support-ticket').getAttribute('data-inquiry-id');
 await p.reload();await expect(p.locator('.support-ticket')).toHaveCount(1);await p.getByLabel('추가 메시지',{exact:true}).fill('검토 중에 남기는 추가 가상 질문');await p.getByRole('button',{name:'이 문의에 이어서 보내기'}).click();await expect(p.getByText('검토 중에 남기는 추가 가상 질문',{exact:true})).toBeVisible();
 await ep.goto(origin+'/support.html');await ep.getByLabel('문의 내용',{exact:true}).fill('가상 전문가 문의 · 업무 화면 안내');await ep.getByRole('button',{name:'문의 접수',exact:true}).click();await expect(ep.locator('.support-ticket')).toHaveCount(1);
 await ad.goto(origin+'/admin.html');await ad.getByText('문의·개인정보 요청',{exact:true}).click();await ad.locator('button[data-inquiry-id="'+ticket+'"]').click();const detail=ad.getByRole('region',{name:'문의 처리'});
 await expect(detail.getByText('검토 중에 남기는 추가 가상 질문',{exact:true})).toBeVisible();await detail.getByRole('button',{name:'문의 맡기',exact:true}).click();await expect(detail.getByLabel('고객에게 보낼 답변')).toBeVisible();
 await expect(detail.getByText('예약 번호 '+booking,{exact:true})).toBeVisible();
 await detail.getByLabel('고객에게 보낼 답변').fill('메모 저장 중 보존할 가상 답변 초안');await detail.getByText('내부 메모 · 고객에게 보이지 않음',{exact:true}).click();await detail.getByLabel('내부 메모 내용').fill('가상 내부 확인 기록 · 고객 비공개');await detail.getByRole('button',{name:'내부 메모 저장'}).click();await expect(detail.getByText('가상 내부 확인 기록 · 고객 비공개',{exact:true})).toBeVisible();await expect(detail.getByLabel('고객에게 보낼 답변')).toHaveValue('메모 저장 중 보존할 가상 답변 초안');
 await detail.getByLabel('고객에게 보낼 답변').fill('가상 운영자 답변입니다. 같은 대화에서 추가 문의를 남겨 주세요.');
 await p.getByLabel('추가 메시지').fill('답변 작성 중의 가상 추가 질문');await p.getByRole('button',{name:'이 문의에 이어서 보내기'}).click();await expect(p.getByText('답변 작성 중의 가상 추가 질문',{exact:true})).toBeVisible();
 await detail.getByRole('button',{name:'답변 전송',exact:true}).click();await expect(detail.getByText('새 메시지나 변경이 있습니다. 대화를 새로고침한 뒤 다시 확인해 주세요.')).toBeVisible();await expect(detail.getByLabel('고객에게 보낼 답변')).toHaveValue('가상 운영자 답변입니다. 같은 대화에서 추가 문의를 남겨 주세요.');
 // Save failure retains the draft; explicit refresh then resubmit with current revision.
 await detail.getByRole('button',{name:'대화 최신 내용 확인'}).click();await expect(detail.getByLabel('고객에게 보낼 답변')).toHaveValue('가상 운영자 답변입니다. 같은 대화에서 추가 문의를 남겨 주세요.');loseReplyReceipt=true;await detail.getByRole('button',{name:'답변 전송',exact:true}).click();await expect(detail.getByRole('status')).toContainText('저장 여부');await detail.getByRole('button',{name:'대화 최신 내용 확인'}).click();await detail.getByRole('button',{name:'답변 전송',exact:true}).click();await expect(detail.getByText('가상 운영자 답변입니다. 같은 대화에서 추가 문의를 남겨 주세요.',{exact:true})).toHaveCount(1);
 await p.getByRole('button',{name:'대화 새로고침'}).click();await expect(p.getByText('가상 운영자 답변입니다. 같은 대화에서 추가 문의를 남겨 주세요.',{exact:true})).toBeVisible();expect(await p.getByText('가상 내부 확인 기록 · 고객 비공개',{exact:true}).count()).toBe(0);await p.getByRole('button',{name:'해결됐어요'}).click();await expect(p.getByText('고객이 해결을 확인했어요',{exact:true})).toBeVisible();
 for(const width of [360,390,430,1280]){await p.setViewportSize({width,height:844});expect(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await p.screenshot({path:'artifacts/support-customer-'+width+'.png',fullPage:true});}
 await p.setViewportSize({width:360,height:520});await p.getByLabel('추가 메시지').focus();await p.getByLabel('추가 메시지').press('Tab');await expect(p.getByRole('button',{name:'이 문의에 이어서 보내기'})).toBeFocused();expect(await p.getByRole('button',{name:'이 문의에 이어서 보내기'}).evaluate(n=>getComputedStyle(n).outlineStyle!=='none')).toBe(true);
 await p.evaluate(()=>document.documentElement.style.setProperty('--type-body','24px'));expect(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await p.evaluate(()=>document.documentElement.style.removeProperty('--type-body'));
 for(const button of await p.locator('.support-workspace button:visible').all()){const b=await button.boundingBox();expect(b.height).toBeGreaterThanOrEqual(44);}
 await ad.setViewportSize({width:360,height:800});expect(await ad.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await detail.scrollIntoViewIfNeeded();await ad.screenshot({path:'artifacts/support-operator-360.png',fullPage:true});await ad.setViewportSize({width:1280,height:900});await ad.screenshot({path:'artifacts/support-operator-desktop.png',fullPage:true});
 const reconnected=await consumerCtx.newPage();reconnected.on('dialog',d=>d.accept());await reconnected.goto(origin+'/support.html');await expect(reconnected.getByText('고객이 해결을 확인했어요',{exact:true})).toBeVisible();
 // Lost response after commit: reload and retry the same payload uses the stored attempt key.
 loseReceipt=true;const lost='가상 통신 끊김 문의';await reconnected.getByLabel('문의 내용',{exact:true}).fill(lost);await reconnected.getByRole('button',{name:'문의 접수',exact:true}).click();await expect(reconnected.getByRole('status').filter({hasText:'저장 여부'})).toBeVisible();await reconnected.reload();await reconnected.getByLabel('문의 내용',{exact:true}).fill(lost);await reconnected.getByRole('button',{name:'문의 접수',exact:true}).click();await expect(reconnected.locator('.support-ticket')).toHaveCount(2);
 const blocked=await consumerCtx.newPage();await blocked.goto(origin+'/admin.html');await expect(blocked.locator('#accountMessage')).toContainText('관리자 권한이 필요합니다.');await expect(blocked.locator('#accountContent')).toBeHidden();
 failExpertReview=true;await ad.reload();await ad.getByText('문의·개인정보 요청',{exact:true}).click();await expect(ad.locator('button[data-inquiry-id="'+ticket+'"]').first()).toBeVisible();failExpertReview=false;
 legacy=true;const old=await consumerCtx.newPage();await old.goto(origin+'/support.html');await expect(old.locator('#rightsForm')).toBeVisible();await expect(old.locator('#rightsHistory')).toContainText('문의');failLegacyList=true;await old.locator('[name=detail]').fill('기존 화면에서 저장 후 목록 실패 확인');await old.getByRole('button',{name:'요청 접수'}).click();await expect(old.locator('#rightsStatus')).toContainText('문의는 저장됐지만');legacy=false;
 expect(errors).toEqual([]);expect(calls.filter(c=>c.name==='support_command'&&c.operation==='create'&&c.payload.body.includes('모바일 화면'))).toHaveLength(2);
 await writeFile('artifacts/support-integration-browser.json',JSON.stringify({passed:true,database:'isolated PGlite',authentication:'mocked separate consumer/expert/admin sessions',liveAI:false,productionModified:false,checks:['consumer and expert intake','failed save preserves draft','double submit','saved but history unavailable','same ticket follow-up','admin original conversation','internal note privacy','stale reply preserves draft','operator reply customer visibility','customer confirmation','reload and new tab','lost receipt retry','360/390/430/1280 widths','customer denied admin address','missing migration compatibility'],externalRequests:0},null,2));
 console.log('PASS support browser: isolated intake, operator reply, privacy, delayed/failed requests, persistence, responsive layouts and admin gate.');
}finally{await browser.close();await f.db.close();}
