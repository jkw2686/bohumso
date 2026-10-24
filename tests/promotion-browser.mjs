import PW_LAUNCH from './playwright-launch.cjs';import {chromium,expect} from '@playwright/test';import {readFile,mkdir} from 'node:fs/promises';import path from 'node:path';
const origin='https://bohumso.netlify.app',auth='https://promotion.fixture.test',invite='40000000-0000-4000-8000-000000000001';
const user={id:'90000000-0000-4000-8000-000000000002',email:'isolated@example.test',email_confirmed_at:'2026-01-01T00:00:00Z',aud:'authenticated'};
const token=Buffer.from('{"alg":"HS256"}').toString('base64url')+'.'+Buffer.from(JSON.stringify({sub:user.id,exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')+'.fixture';
const next='/promotion.html?promotion='+invite;
let active=true,admin=false,benefit=false,status='ACTIVE',fail=false,rows=[],seen=false;const writes=[],errors=[];
const browser=await chromium.launch(PW_LAUNCH);try{await mkdir('artifacts/promotion',{recursive:true});const ctx=await browser.newContext();
await ctx.route('**/*',async route=>{const u=new URL(route.request().url());if(u.origin===origin){if(u.pathname==='/api/config')return route.fulfill({json:{enabled:true,earlyAccess:true,signupEnabled:true,phoneVerificationEnabled:true,phoneSignupEnabled:true,url:auth,key:'fixture'}});try{const file=path.resolve('public','.'+u.pathname);return route.fulfill({body:await readFile(file),contentType:file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.svg')?'image/svg+xml':'text/html'});}catch{return route.fulfill({status:404,body:''});}}
if(u.origin!==auth)return route.abort();const name=u.pathname.split('/').pop(),payload=route.request().postDataJSON?.()||{};
if(name==='settings')return route.fulfill({json:{external:{google:true}}});if(name==='user')return route.fulfill({json:user});
if(name==='my_membership')return route.fulfill({json:{member:active,state:'ACTIVE_MEMBER',admin}});
if(name==='complete_membership'){active=true;return route.fulfill({json:{member:true}});}
if(name==='promotion_preview')return route.fulfill({json:{free_days:30,capacity:10,used:2,deadline:'2030-01-31T14:59:59Z',status}});
if(name==='recruitment_regions')return route.fulfill({json:[{area_id:'서울 마포구',region:'서울 마포구',participants:10,status:'오픈 준비',reached_at:'2030-01-01',seen_at:seen?'2030-01-02':null}]});
if(name==='promotion_command'){
 const op=payload.operation;if(fail&&op==='redeem')return route.fulfill({status:400,json:{message:'promotion_full'}});
 if(['create','stop','regions_seen','redeem'].includes(op))writes.push(payload);
 if(op==='redeem'){benefit=true;return route.fulfill({json:{applied:true,started_at:'2030-01-01',ends_at:'2030-01-31T14:59:59Z'}});}
 if(op==='benefit')return route.fulfill({json:benefit?{active:true,ends_at:'2030-01-31T14:59:59Z'}:null});
 if(op==='create'){rows.push({id:invite,token:invite,conditions:{free_days:payload.payload.free_days,capacity:payload.payload.capacity,used:0,deadline:payload.payload.deadline,status:'ACTIVE'}});return route.fulfill({json:{id:invite,token:invite}});}
 if(op==='list')return route.fulfill({json:rows});if(op==='members')return route.fulfill({json:[{user_id:user.id,started_at:'2030-01-01',ends_at:'2030-01-31'}]});
 if(op==='regions_seen')seen=true;if(op==='stop')rows[0].conditions.status='STOPPED';return route.fulfill({json:{saved:true}});
}return route.fulfill({json:{enabled:false,items:[]}});});
const page=await ctx.newPage();page.on('pageerror',error=>errors.push(error.message));
await page.goto(origin+next);await expect(page.getByRole('link',{name:'무료혜택 받고 가입하기'})).toBeVisible();
await page.getByRole('link',{name:'무료혜택 받고 가입하기'}).click();await expect(page.getByRole('button',{name:/Google로 계속하기|구글로 시작/})).toBeVisible();
expect(new URL(page.url()).searchParams.get('next')).toBe(next);
await page.getByRole('button',{name:'일반회원 가입',exact:true}).click();expect(new URL(page.url()).searchParams.get('next')).toBe(next);await page.getByRole('button',{name:'전문가 가입',exact:true}).click();expect(new URL(page.url()).searchParams.get('next')).toBe(next);await page.getByLabel('전문가 직군').selectOption('planner');expect(new URL(page.url()).searchParams.get('next')).toBe(next);
console.log('PASS invite survives signup role/profession selection and login URL');
await page.evaluate(({token,user})=>localStorage.setItem('woori-account',JSON.stringify({access_token:token,refresh_token:'fixture',expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,token_type:'bearer',user})),{token,user});
active=false;await page.goto(origin+'/account.html?next='+encodeURIComponent(next));await expect(page.locator('#membershipForm')).toBeVisible();for(const name of ['age','terms','privacy'])await page.locator('#membershipForm [name='+name+']').check();await page.getByRole('button',{name:'동의하고 가입 완료',exact:true}).click();await expect(page).toHaveURL(origin+next);await expect(page.getByText(/무료 이용 · 2030.01.31까지/)).toBeVisible();console.log('PASS new membership mandatory consents → preserved invite → automatic benefit');
for(const width of [360,390,430,1440]){await page.setViewportSize({width,height:844});await page.goto(origin+'/account.html?next='+encodeURIComponent(next));await expect(page).toHaveURL(origin+next);await expect(page.getByText(/무료 이용 · 2030.01.31까지/)).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await page.screenshot({path:'artifacts/promotion/applied-'+width+'.png'});}
console.log('PASS account return → automatic redemption, four widths');
await page.goto(origin+'/account.html');await expect(page.locator('[data-promotion-benefit]')).toContainText('무료 이용');
fail=true;await page.goto(origin+next);await expect(page.getByText('무료혜택 인원이 모두 찼습니다.',{exact:true})).toBeVisible();fail=false;
await page.evaluate(()=>localStorage.clear());status='CLOSED';await page.goto(origin+next);await expect(page.getByRole('link',{name:'무료혜택 받고 가입하기'})).toHaveCount(0);status='ACTIVE';
await page.goto(origin+next);for(const width of [360,390,430,1440]){await page.setViewportSize({width,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await page.screenshot({path:'artifacts/promotion/invite-'+width+'.png'});}
await page.evaluate(({token,user})=>localStorage.setItem('woori-account',JSON.stringify({access_token:token,refresh_token:'fixture',expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,token_type:'bearer',user})),{token,user});
admin=false;await page.goto(origin+'/admin-promotions.html');await expect(page.getByText('관리자만 이용할 수 있습니다.',{exact:true})).toBeVisible();admin=true;
await page.goto(origin+'/admin-promotions.html');await page.getByLabel('사용 가능 인원').selectOption('many');await page.getByLabel('인원 수').fill('10');await page.getByLabel('신청 마감일').fill('2030-01-31');await page.getByRole('button',{name:'초대링크 만들기',exact:true}).click();await expect(page.getByRole('button',{name:'링크 복사',exact:true})).toBeVisible();expect(writes.filter(r=>r.operation==='create')).toHaveLength(1);expect(rows[0].conditions.capacity).toBe(10);
for(const width of [360,390,430,1440]){await page.setViewportSize({width,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await page.screenshot({path:'artifacts/promotion/admin-'+width+'.png'});}
await page.getByRole('link',{name:'사용 명단'}).click();await expect(page.getByRole('heading',{name:'혜택 사용 명단'})).toBeVisible();
await page.goto(origin+'/recruitment-regions.html');await expect(page.getByRole('cell',{name:'10명',exact:true})).toBeVisible();await page.getByRole('button',{name:'소식 확인',exact:true}).click();await expect(page.getByRole('button',{name:'소식 확인',exact:true})).toHaveCount(0);
await page.goto(origin+'/recruitment-regions.html');await expect(page.getByRole('button',{name:'소식 확인',exact:true})).toHaveCount(0);
expect(errors).toEqual([]);console.log('PASS closed/full/authorization/admin three inputs/list/detail/milestone ack; no production requests');
}finally{await browser.close();}
