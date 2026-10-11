import {chromium,expect} from '@playwright/test';
import {readFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import PW_LAUNCH from './playwright-launch.cjs';
import {setupSupport,ids} from './support-integration-fixture.mjs';
const f=await setupSupport();await f.owner('select 1');await f.db.exec(await readFile('supabase/060_support_chat.sql','utf8'));
const browser=await chromium.launch(PW_LAUNCH);await mkdir('artifacts',{recursive:true});
const origin='https://support.fixture.test',auth='https://auth.fixture.test',errors=[];
let queue=Promise.resolve();const serial=fn=>{const next=queue.then(fn);queue=next.catch(()=>{});return next;};
const as=(actor,operation,payload={})=>serial(async()=>{await f.login(actor);return f.command(operation,payload);});
const send=(actor,op,p={})=>as(actor,op,{request_key:crypto.randomUUID(),...p});
const failures=new Map();let createCalls=0;
async function open(actor){
 const context=await browser.newContext({viewport:{width:390,height:844}});context.setDefaultTimeout(12000);
 const exp=Math.floor(Date.now()/1000)+3600,user=actor?{id:actor,email:'fixture@example.test',aud:'authenticated'}:null;
 const session={user,access_token:Buffer.from('{"alg":"HS256"}').toString('base64url')+'.'+Buffer.from(JSON.stringify({sub:actor,exp})).toString('base64url')+'.fixture',refresh_token:'fixture',expires_at:exp,token_type:'bearer'};
 if(actor)await context.addInitScript(s=>localStorage.setItem('woori-account',JSON.stringify(s)),session);
 await context.route('**/*',async r=>{
  const u=new URL(r.request().url());if(u.origin===origin){
   if(u.pathname==='/api/config')return r.fulfill({json:{enabled:true,earlyAccess:true,url:auth,key:'fixture'}});
   try{const file=path.resolve('public','.'+(u.pathname==='/'?'/index.html':u.pathname));return r.fulfill({body:await readFile(file),contentType:file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.svg')?'image/svg+xml':file.endsWith('.png')?'image/png':file.endsWith('.woff2')?'font/woff2':'text/html; charset=utf-8'});}catch{return r.fulfill({status:404,body:''});}
  }
  if(u.origin!==auth)return r.abort();if(u.pathname.endsWith('/user'))return r.fulfill({json:user});if(u.pathname.endsWith('/token'))return r.fulfill({json:session});
  const name=u.pathname.split('/').pop(),args=r.request().postDataJSON()||{},key=actor+':'+args.operation,fail=failures.get(key);if(name==='support_command'&&args.operation==='create')createCalls++;
  if(fail==='before'){failures.delete(key);return r.abort('failed');}
  try{const data=await serial(async()=>{await f.login(actor);return f.rpc(name,Object.values(args));});if(fail==='after'){failures.delete(key);return r.abort('failed');}return r.fulfill({json:data});}
  catch(e){return r.fulfill({status:400,json:{message:e.message,code:e.code||'P0001'}});}
 });
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());return {page,context};
}
const check=(label)=>console.log('PASS '+label);
const tick=page=>page.evaluate(()=>{const now=Date.now;Date.now=()=>now()+61000;window.dispatchEvent(new Event('focus'));});
let customerId;
try{
 const consumer=await open(ids.customer),expert=await open(ids.planner),operator=await open(ids.admin);
 const c=consumer.page,a=operator.page,e=expert.page;
 await c.goto(origin+'/support.html');await expect(c.getByRole('button',{name:'1:1 문의',exact:true})).toBeVisible();
 await c.getByRole('button',{name:'1:1 문의',exact:true}).press('Enter');
 await c.getByLabel('문의 내용',{exact:true}).fill('가상 소비자 문의 <img src=x onerror=alert(1)>');
 failures.set(ids.customer+':mine','before');await tick(c);
 await expect(c.getByText(/문의 내역을 불러오지 못했습니다/)).toBeVisible();await expect(c.getByLabel('문의 내용',{exact:true})).toHaveValue(/가상 소비자/);
 failures.set(ids.customer+':create','before');await c.locator('#supportCreate').getByRole('button',{name:'보내기',exact:true}).click();
 await expect(c.getByText(/전송하지 못했습니다/)).toBeVisible();await expect(c.getByLabel('문의 내용',{exact:true})).toHaveValue(/가상 소비자/);{
  const rows=await as(ids.customer,'mine');if(rows.length)throw Error('false save');}
 await c.getByRole('button',{name:'다시 보내기',exact:true}).click();
 await expect(c.locator('#supportHistory')).toBeVisible();customerId=(await as(ids.customer,'mine'))[0].id;
 await expect(c.getByText('문의를 보냈어요. 답변이 오면 이곳에서 대화창이 열립니다.',{exact:true})).toBeVisible();
 await c.locator('button[data-inquiry-id="'+customerId+'"]').click();
 await expect(c.locator('#supportThread .automatic')).toHaveCount(1);await expect(c.locator('#supportThread img')).toHaveCount(0);check('consumer save failure preserves input; retry, one receipt, safe text rendering');
 await e.goto(origin+'/support.html');await e.getByRole('button',{name:'1:1 문의',exact:true}).click();await e.getByText('문의 유형·개인정보 요청 (선택)',{exact:true}).click();await e.getByLabel('문의 유형 (선택)').selectOption('profile');await e.getByLabel('문의 내용',{exact:true}).fill('가상 설계사 문의');
 const callsBefore=createCalls;failures.set(ids.planner+':create','after');await e.locator('#supportCreate').evaluate(form=>{form.requestSubmit();form.requestSubmit();});await expect(e.locator('#supportHistory')).toBeVisible();
 if((await as(ids.planner,'mine')).length!==1||createCalls!==callsBefore+1)throw Error('duplicate expert inquiry');check('expert rapid submission and response-loss reconciliation');await expert.context.close();
 await a.goto(origin+'/admin.html');await expect(a.getByRole('heading',{name:'고객센터 문의',exact:true})).toBeVisible();
 await a.locator('button[data-inquiry-id="'+customerId+'"]').click();await a.getByRole('button',{name:'검토 시작 · 문의 맡기'}).click();
 const reply=a.getByLabel('답변 내용',{exact:true});await expect(reply).toBeVisible();await reply.fill('가상 운영자 답변입니다.');
 await a.getByLabel('답변 후 상태').selectOption('WAITING_CUSTOMER');failures.set(ids.admin+':reply','before');await a.getByRole('button',{name:'답변 전송',exact:true}).click();await expect(a.getByText(/전송하지 못했습니다/)).toBeVisible();await expect(reply).toHaveValue('가상 운영자 답변입니다.');
 await a.getByRole('button',{name:'다시 보내기',exact:true}).click();await expect(a.getByText('답변 전송 완료',{exact:true})).toBeVisible();

 await a.getByLabel('내부 메모 내용',{exact:true}).fill('가상 내부 메모 비공개');await a.getByRole('button',{name:'내부 메모 저장',exact:true}).click();await expect(a.getByText('내부 메모를 저장했습니다. 고객에게 보내지 않았습니다.',{exact:true})).toBeVisible();
 await a.getByLabel('답변 내용',{exact:true}).fill('새 메시지 확인 전 작성한 답변');
 await send(ids.customer,'message',{id:customerId,body:'답변 작성 중 도착한 추가 질문'});
 await a.evaluate(()=>{const now=Date.now;Date.now=()=>now()+61000;window.dispatchEvent(new Event('focus'));});
 await expect(a.getByText('작성 중 새 메시지나 변경이 있습니다. 대화 최신 내용 확인을 누른 뒤 답변해 주세요.',{exact:true})).toBeVisible();
 await a.getByRole('button',{name:'답변 전송',exact:true}).click();await expect(a.getByText(/대화를 새로고침한 뒤 다시 확인/)).toBeVisible();
 await expect(a.getByLabel('답변 내용',{exact:true})).toHaveValue('새 메시지 확인 전 작성한 답변');
 if((await as(ids.admin,'admin_detail',{id:customerId})).chat_state!=='WAITING')throw Error('new message overwritten by stale draft');
 await a.getByRole('button',{name:'대화 최신 내용 확인',exact:true}).click();await a.getByLabel('답변 내용',{exact:true}).fill('추가 질문을 확인하고 보내는 답변');await a.getByRole('button',{name:'다시 보내기',exact:true}).click();
 await expect(a.getByText('답변 전송 완료',{exact:true})).toBeVisible();check('background refresh cannot approve stale draft; explicit review preserves then sends draft');
 if((await as(ids.customer,'unread')).count!==1)throw Error('missing unread before opening');
 await c.goto(origin+'/support.html');await expect(c.locator('#supportThread')).toBeVisible();check('existing unread reply opens conversation on support entry');
 await expect(c.getByText('가상 운영자 답변입니다.',{exact:true})).toBeVisible();await expect(c.locator('#supportThread [data-chat-state]')).toBeVisible();await expect(c.getByText('가상 내부 메모 비공개',{exact:true})).toHaveCount(0);
 await c.locator('#supportThread .operator small').last().scrollIntoViewIfNeeded();await expect.poll(async()=>(await as(ids.customer,'unread')).count).toBe(0);check('actual admin page: take, reply failure/retry, info request, private note, customer unread and viewed cursor');
 await c.screenshot({path:'artifacts/support-chat-customer-390.png'});await a.locator('.support-reply').scrollIntoViewIfNeeded();await a.screenshot({path:'artifacts/support-chat-admin-390.png'});
 await expect(c.locator('.support-date')).toHaveCount(1);await expect(c.locator('#supportFollow button[type=submit]')).toBeInViewport();
 const bubbleLayout=await c.evaluate(()=>{const own=document.querySelector('#supportThread .customer .support-bubble').getBoundingClientRect(),reply=document.querySelector('#supportThread .operator .support-bubble').getBoundingClientRect();return own.right>reply.right;});
 if(!bubbleLayout)throw Error('message alignment');check('right customer / left operator bubbles, Korean date, fixed composer');
 for(const width of [360,390,430,1440]){
  await c.setViewportSize({width,height:844});await expect(c.locator('#supportFollow button[type=submit]')).toBeInViewport();await expect(c.getByRole('button',{name:'대화창 닫기',exact:true})).toBeInViewport();
  await c.screenshot({path:'artifacts/support-messenger-'+width+'.png'});
 }await c.setViewportSize({width:390,height:844});
 const contrast=await c.evaluate(()=>{
  const lum=rgb=>rgb.slice(0,3).map(c=>{c/=255;return c<=.04045?c/12.92:((c+.055)/1.055)**2.4;}).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
  const color=token=>{const n=document.createElement('span');n.style.color='var('+token+')';document.body.append(n);const value=getComputedStyle(n).color.match(/[\d.]+/g).map(Number);n.remove();return lum(value);};
  return [['--card','--brand'],['--brand','--card'],['--ink-body','--brand-soft'],['--ink-body','--bg'],['--ink-heading','--card'],['--ink-muted','--card']].map(([a,b])=>{a=color(a);b=color(b);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);});
 });if(contrast.some(r=>r<4.5))throw Error('text contrast '+contrast);check('text contrast >=4.5:1 '+contrast.map(n=>n.toFixed(2)).join(', '));
 await c.getByRole('button',{name:'해결됐어요',exact:true}).click();await expect(c.locator('[data-chat-state]')).toHaveText('종료');
 await c.getByLabel('추가 메시지',{exact:true}).fill('종료한 문의를 다시 여는 질문');await c.locator('#supportFollow button[type=submit]').click();await expect(c.locator('#supportHistory')).toBeVisible();
 await c.locator('button[data-inquiry-id="'+customerId+'"]').click();await expect(c.locator('[data-chat-state]')).toHaveText('답변 대기');check('solution confirmation, send closes conversation, same-thread follow-up');
 // Reauthentication reuses saved backend data, not a browser-local transcript.
 const again=await open(ids.customer);await again.page.goto(origin+'/support.html?thread='+customerId);await expect(again.page.getByText('종료한 문의를 다시 여는 질문',{exact:true})).toBeVisible();await again.context.close();
 const other=await open(ids.other);await other.page.goto(origin+'/support.html?thread='+customerId);await expect(other.page.getByText('이 문의를 확인할 권한이 없습니다.',{exact:true})).toBeVisible();await expect(other.page.getByText('가상 운영자 답변입니다.',{exact:true})).toHaveCount(0);
 await other.page.goto(origin+'/admin.html');await expect(other.page.getByText('관리자 권한이 필요합니다.',{exact:true})).toBeVisible();await expect(other.page.getByRole('heading',{name:'고객센터 문의',exact:true})).toHaveCount(0);await other.context.close();check('fresh login history, foreign ticket and actual non-admin page denied');
 // Long conversation; preserve scroll when refreshing instead of forcing the last reply into view.
 for(let i=0;i<5;i++)await send(ids.customer,'message',{id:customerId,body:('긴문장https://example.test/'+i).repeat(40)});
 await c.getByRole('button',{name:'새로고침',exact:true}).click();await c.locator('#supportThread .support-scroll').evaluate(n=>n.scrollTop=0);
 const before=await c.locator('#supportThread .support-scroll').evaluate(n=>n.scrollTop);
 let row=await as(ids.admin,'admin_detail',{id:customerId});await send(ids.admin,'reply',{id:customerId,revision:row.revision,body:'읽는 중에 도착한 새 답변'});
 await c.getByRole('button',{name:'새로고침',exact:true}).click();await expect(c.getByRole('button',{name:'새 메시지 보기'})).toBeVisible();
 if(Math.abs(await c.locator('#supportThread .support-scroll').evaluate(n=>n.scrollTop)-before)>5)throw Error('scroll jumped');
 if((await as(ids.customer,'unread')).count!==1)throw Error('unseen reply incorrectly read');await c.getByRole('button',{name:'새 메시지 보기'}).click();await expect.poll(async()=>(await as(ids.customer,'unread')).count).toBe(0);check('old-message scroll preserved; read occurs only after new reply is visible');
 for(const width of [360,390,430,1440]){for(const page of [c,a]){await page.setViewportSize({width,height:844});if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('overflow '+width);const sizes=await page.locator('.support-workspace button:visible').evaluateAll(ns=>ns.map(n=>n.getBoundingClientRect().height));if(sizes.some(h=>h<44))throw Error('small target '+width);}check('layout and touch targets '+width);}
 await c.setViewportSize({width:390,height:844});await operator.context.close();
 await c.getByRole('button',{name:'대화창 닫기',exact:true}).click();await c.getByRole('button',{name:'1:1 문의',exact:true}).click();await c.getByLabel('문의 내용',{exact:true}).fill('작성 중에는 새 답변으로 화면을 바꾸지 않아요');
 row=await as(ids.admin,'admin_detail',{id:customerId});await send(ids.admin,'reply',{id:customerId,revision:row.revision,body:'새로 도착한 가상 운영자 답변'});await tick(c);
 await expect(c.locator('#supportNew')).toBeVisible();await expect(c.getByLabel('문의 내용',{exact:true})).toHaveValue('작성 중에는 새 답변으로 화면을 바꾸지 않아요');
 await c.getByRole('button',{name:'대화창 닫기',exact:true}).click();await expect(c.getByText('새 답변',{exact:true})).toBeVisible();await c.getByRole('button',{name:'새로고침',exact:true}).click();await expect(c.locator('#supportHistory')).toBeVisible();
 await c.getByRole('button',{name:'1:1 문의',exact:true}).click();await expect(c.getByLabel('문의 내용',{exact:true})).toHaveValue(/작성 중/);await c.getByLabel('문의 내용',{exact:true}).fill('');await c.getByRole('button',{name:'대화창 닫기',exact:true}).click();
 await tick(c);await expect(c.locator('#supportThread')).toBeVisible();await expect(c.getByText('새로 도착한 가상 운영자 답변',{exact:true})).toBeVisible();
 await c.getByRole('button',{name:'대화창 닫기',exact:true}).click();await tick(c);await expect(c.locator('#supportHistory')).toBeVisible();check('reply opens after refresh; drafts protected; dismissed reply does not keep reopening');
 await c.locator('button[data-inquiry-id="'+customerId+'"]').click();await c.getByLabel('추가 메시지',{exact:true}).fill('실패해도 대화창과 내용 유지');failures.set(ids.customer+':message','before');await c.locator('#supportFollow button[type=submit]').click();
 await expect(c.getByText(/전송하지 못했습니다/)).toBeVisible();await expect(c.getByLabel('추가 메시지',{exact:true})).toHaveValue('실패해도 대화창과 내용 유지');await c.getByRole('button',{name:'다시 보내기',exact:true}).click();await expect(c.locator('#supportHistory')).toBeVisible();check('follow-up failure stays open; successful retry closes');
 await c.locator('button[data-inquiry-id="'+customerId+'"]').click();
 await c.getByLabel('추가 메시지',{exact:true}).fill('닫아도 이어서 작성할 수 있어요');await c.getByLabel('추가 메시지',{exact:true}).press('Escape');await expect(c.locator('#supportHistory')).toBeVisible();await c.locator('button[data-inquiry-id="'+customerId+'"]').click();await expect(c.getByLabel('추가 메시지',{exact:true})).toHaveValue('닫아도 이어서 작성할 수 있어요');check('Escape closes and reopening preserves unsent draft');
 await c.setViewportSize({width:360,height:500});await c.getByLabel('추가 메시지',{exact:true}).focus();await c.getByLabel('추가 메시지',{exact:true}).fill('작은 화면 입력 유지');await expect(c.locator('#supportFollow button[type=submit]')).toBeInViewport();
 if(await c.getByLabel('추가 메시지',{exact:true}).evaluate(n=>n.scrollHeight>n.clientHeight+1))throw Error('single line composer unnecessary scrollbar');
 await c.evaluate(()=>document.documentElement.style.fontSize='200%');if(await c.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('zoom overflow');check('short viewport input/button and text enlargement simulation');
 await consumer.context.close();const anonymous=await open(null);await anonymous.page.goto(origin+'/support.html');await expect(anonymous.page.getByRole('link',{name:'로그인',exact:true})).toHaveAttribute('href','/login.html?next=%2Fsupport.html');await anonymous.context.close();check('anonymous support return URL');
 if(errors.length)throw Error('page errors: '+errors.join(' / '));check('no page exceptions; all requests routed to isolated fixture');
}finally{await browser.close();await queue;await f.db.close();}
