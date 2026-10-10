import {chromium,expect} from '@playwright/test';
import {readFile,mkdir} from 'node:fs/promises';import path from 'node:path';
const origin='https://fixture.test',auth='https://auth.fixture.test',calls=[],errors=[];
const day=n=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(new Date(Date.now()+n*86400000));
const user={id:'40000000-0000-4000-8000-000000000052',email:'customer@example.test',aud:'authenticated'};
const session={access_token:Buffer.from('{"alg":"HS256"}').toString('base64url')+'.'+Buffer.from(JSON.stringify({sub:user.id,exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')+'.fixture',refresh_token:'fixture',expires_in:3600,token_type:'bearer',user};
let member=false,verified=false,unavailable=false,offline=false,failOnce=true,bookings=[];
const browser=await chromium.launch({channel:'msedge',headless:true});await mkdir('artifacts',{recursive:true});
try{
 const context=await browser.newContext();await context.route('**/*',async route=>{
  const req=route.request(),u=new URL(req.url()),body=req.postDataJSON()||{};
  if(u.origin===origin){
   if(u.pathname==='/api/config')return route.fulfill({json:{enabled:true,earlyAccess:true,signupEnabled:true,phoneVerificationEnabled:true,closedBeta:false,url:auth,key:'fixture'}});
   try{const file=path.resolve('public','.'+u.pathname);return route.fulfill({body:await readFile(file),contentType:file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.woff2')?'font/woff2':file.endsWith('.svg')?'image/svg+xml':'text/html; charset=utf-8'});}catch{return route.fulfill({status:404,body:''});}
  }
  if(u.origin!==auth)return route.abort();
  const name=u.pathname.split('/').pop();
  if(name==='token')return route.fulfill({json:session});
  if(name==='user')return route.fulfill({json:user});
  if(name==='settings')return route.fulfill({json:{external:{google:true}}});
  if(name==='verify'){expect(body.type).toBe('phone_change');expect(body.token).toBe('123456');verified=true;return route.fulfill({json:session});}
  if(name==='my_membership')return route.fulfill({json:{member,admin:false,state:member?'ACTIVE_MEMBER':'AUTHENTICATED_INCOMPLETE'}});
  if(name==='complete_membership'){expect(body.terms_accepted&&body.privacy_accepted&&body.age_accepted).toBe(true);member=true;return route.fulfill({json:{ok:true}});}
  if(name==='release_status')return route.fulfill({json:{policiesApproved:true,betaAllowed:true,phoneVerified:verified}});
  if(name==='my_phone_status')return route.fulfill({json:{verified}});
  if(name==='member_rights')return route.fulfill({json:{requests:[]}});
  if(name==='planner_catalog')return route.fulfill({json:{planners:[{id:'expert-a',name:'선택 전문가 A',region:'경기 김포시',available:!offline},{id:'expert-b',name:'선택 전문가 B',region:'경기 하남시',available:true}]}});
  if(name==='office_catalog')return route.fulfill({json:[{id:'office-a',name:'방문 보험소',region:'경기 김포시',address:'방문 사무실',status:'active'}]});
  if(name==='reservation_slots')return route.fulfill({json:['14:00','18:00']});
  if(name==='consultation_workspace')return route.fulfill({json:{bookings,scheduleProposalsEnabled:true}});
  if(name==='consultation_command'){
   calls.push(body);if(unavailable)return route.fulfill({status:400,json:{message:'invalid_partner'}});
   if(failOnce){failOnce=false;return route.fulfill({status:500,json:{message:'connection_lost'}});}
   return route.fulfill({json:{id:'request-one'}});
  }
  return route.fulfill({json:[]});
 });
 const page=await context.newPage();page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));await page.setViewportSize({width:390,height:844});
 const selection='/requests.html?'+new URLSearchParams({planner:'expert-a',region:'경기 김포시',purpose:'claim',situation:'cancer',method:'phone',date:day(2),time:'14:00'});
 await page.goto(origin+selection+'&phone=01000000000&address=private&note=private');await page.waitForURL('**/login.html?**');
 const next=new URL(page.url()).searchParams.get('next');expect(Object.fromEntries(new URL(next,origin).searchParams)).toEqual(Object.fromEntries(new URL(selection,origin).searchParams));expect(calls).toHaveLength(0);
 await page.locator('details').filter({has:page.locator('#loginForm')}).locator('summary').click();await page.locator('#loginForm [name=email]').fill(user.email);await page.locator('#loginForm [name=password]').fill('fixture-password');await page.locator('#loginForm [name=password]').press('Enter');
 await page.waitForURL('**/account.html?**');await expect(page.locator('#membershipForm')).toBeVisible();for(const name of ['age','terms','privacy'])await page.locator('#membershipForm [name='+name+']').check();await page.getByRole('button',{name:'동의하고 가입 완료'}).click();
 await page.waitForURL('**/requests.html?**');await page.getByRole('link',{name:'휴대전화 확인',exact:true}).click();await expect(page.getByLabel('인증번호 6자리')).toBeVisible();await page.getByLabel('휴대전화 번호',{exact:true}).fill('01000000000');await page.getByRole('button',{name:'인증번호 받기',exact:true}).click();await page.getByLabel('인증번호 6자리').fill('123456');await page.getByRole('button',{name:'인증 완료하기'}).click();await expect(page.getByText('✓ 휴대전화 인증 완료',{exact:true})).toBeVisible();expect(calls).toHaveLength(0);await page.getByRole('link',{name:'이어서 진행하기'}).click();
 await expect(page.locator('#requestForm')).toContainText('선택 전문가 A');await expect(page.getByRole('button',{name:'14:00',exact:true})).toHaveAttribute('aria-pressed','true');await expect(page.locator('#requestForm')).toContainText('전화상담');await expect(page.locator('#requestForm')).toContainText('(확정 전)');expect(calls).toHaveLength(0);
 await page.screenshot({path:'artifacts/connection-review-mobile.png',fullPage:true});
 await page.getByRole('button',{name:'이 시간으로 신청',exact:true}).click();await expect(page.locator('#requestForm')).toContainText('연결을 확인');await page.reload();await page.getByRole('button',{name:'이 시간으로 신청',exact:true}).click();await expect(page.locator('#requestForm')).toContainText('접수되었습니다');expect(calls).toHaveLength(2);expect(calls[0].payload.request_key).toBe(calls[1].payload.request_key);expect(calls[1].payload.planner_id).toBe('expert-a');expect(calls[1].payload).not.toHaveProperty('phone');
 await page.goto(origin+'/requests.html?planner=expert-b&region='+encodeURIComponent('경기 하남시')+'&method=scheduled');await expect(page.locator('#requestForm')).toContainText('선택 전문가 B');await expect(page.locator('#requestForm')).not.toContainText('선택 전문가 A');await expect(page.getByRole('button',{name:'이 시간으로 신청'})).toHaveCount(0);expect(new URL(page.url()).searchParams.has('time')).toBe(false);
 await page.goto(origin+selection);unavailable=true;await page.getByRole('button',{name:'이 시간으로 신청'}).click();await expect(page.locator('#requestForm')).toContainText('현재 요청을 받을 수 없습니다');await expect(page.getByRole('link',{name:'다른 전문가 선택'})).toBeVisible();await expect(page.getByRole('button',{name:'이 시간으로 신청'})).toBeDisabled();unavailable=false;offline=true;await page.reload();await expect(page.locator('#requestForm')).toContainText('현재 요청할 수 없는');await expect(page.getByRole('button',{name:'이 시간으로 신청'})).toHaveCount(0);offline=false;
 for(const width of [320,390,1440]){
  await page.setViewportSize({width,height:900});await page.goto(origin+'/requests.html?office=office-a&date='+day(3)+'&time=18:00');await expect(page.locator('#requestForm')).toContainText('고객이 보험소에 방문 · 방문 사무실');await expect(page.getByRole('button',{name:'18:00',exact:true})).toHaveAttribute('aria-pressed','true');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 }
 await page.getByRole('button',{name:'이 시간으로 신청'}).click();expect(calls.at(-1).payload.office_id).toBe('office-a');expect(calls.at(-1).payload).not.toHaveProperty('planner_id');
 await page.goto(origin+'/requests.html');await expect(page.getByRole('link',{name:'가까운 전문가 선택',exact:true})).toBeVisible();await expect(page.getByRole('link',{name:'방문할 보험소 선택',exact:true})).toBeVisible();
 bookings=[{id:'pending-change',purpose:'claim',region:'경기 김포시',method:'phone',planner_id:'expert-a',planner_name:'선택 전문가 A',state:'scheduled',preferred_at:day(2)+'T14:00:00+09:00',revision:2,schedule_proposal:{preferred_at:day(3)+'T18:00:00+09:00',can_accept:true,mine:false}}];await page.reload();await expect(page.locator('.booking-card')).toContainText('확정시간');await expect(page.locator('.booking-card')).toContainText('기존 일정 유지');await expect(page.getByRole('button',{name:'변경 일정 수락'})).toBeVisible();bookings[0].state='cancelled';bookings[0].schedule_proposal=null;await page.reload();await expect(page.locator('.booking-timeline')).toHaveCount(0);await expect(page.getByRole('button',{name:'변경 일정 수락'})).toHaveCount(0);
 await page.goto(origin+'/support.html?resource=snubh');await expect(page.locator('#rightsForm [name=kind]')).toHaveValue('REPORT');await expect(page.locator('#rightsForm [name=detail]')).toHaveValue(/분당서울대학교병원/);await expect(page.locator('#rightsStatus')).toContainText('아직 전송되지 않았습니다');await page.evaluate(()=>localStorage.clear());await page.goto(origin+'/support.html?resource=snubh');await expect(page.getByRole('link',{name:'로그인',exact:true})).toHaveAttribute('href','/login.html?next=%2Fsupport.html%3Fresource%3Dsnubh');
 expect(errors).toEqual([]);console.log('PASS actual login, explicit signup consent, phone verification return, no automatic submission, A/B selection, replay key, OFF/reselection, office direction, schedule/cancel display, 320/390/1440, report draft/auth return. All providers intercepted; no live SMS or accounts.');
}finally{await browser.close();}
