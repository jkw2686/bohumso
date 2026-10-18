import PW_LAUNCH from './playwright-launch.cjs';import {chromium,expect} from '@playwright/test';import {readFile,mkdir} from 'node:fs/promises';import path from 'node:path';
const browser=await chromium.launch(PW_LAUNCH),origin='https://notifications.fixture.test',auth='https://auth.fixture.test';
const actor='40000000-0000-4000-8000-000000000052',expert='40000000-0000-4000-8000-000000000053',booking='50000000-0000-4000-8000-000000000001';
let settingsHanging=false,careHanging=false;const heldSettings=[],heldCare=[];
let slowUser=false;let hanging=false;const held=[];
let legacyLink=false,visitLink=false,receipt=false;let signedIn=true,fail=false,foreign=false,care='missing',workspace='/partner-work.html';const calls=[],errors=[];
const user={id:actor,email:'fixture@example.test',aud:'authenticated'},session={access_token:Buffer.from('{"alg":"HS256"}').toString('base64url')+'.'+Buffer.from(JSON.stringify({sub:actor,exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')+'.fixture',refresh_token:'fixture',expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,token_type:'bearer',user};
const context=await browser.newContext();await context.addInitScript(s=>{localStorage.setItem('woori-account',JSON.stringify(s));sessionStorage.setItem('bohumso-push-prompt:reservation:'+s.user.id,'1');},session);
await context.route('**/*',async route=>{const req=route.request(),u=new URL(req.url());
 if(u.origin===origin){if(u.pathname==='/api/reservation-push')return route.fulfill({json:{enabled:true,publicKey:'fixture'}});if(u.pathname==='/api/config')return route.fulfill({json:{enabled:true,earlyAccess:true,signupEnabled:true,paymentsEnabled:false,url:auth,key:'fixture'}});if(u.pathname.startsWith('/api/'))return route.fulfill({json:{}});try{const f=path.resolve('public','.'+(u.pathname==='/'?'/index.html':u.pathname));return route.fulfill({body:process.env.QA_ASSET_ORIGIN?Buffer.from(await (await fetch(process.env.QA_ASSET_ORIGIN+(u.pathname==='/'?'/index.html':u.pathname))).arrayBuffer()):await readFile(f),contentType:f.endsWith('.js')?'text/javascript':f.endsWith('.css')?'text/css':f.endsWith('.svg')?'image/svg+xml':f.endsWith('.woff2')?'font/woff2':'text/html;charset=utf-8'});}catch{return route.fulfill({status:404,body:''});}}
 if(u.origin!==auth)return route.abort();const name=u.pathname.split('/').pop(),args=req.postDataJSON()||{};if(name==='token'){if(u.searchParams.get('grant_type')==='password')signedIn=true;return route.fulfill({json:session});}if(name==='user'&&slowUser){held.push(route);return;}if(name==='user')return route.fulfill({status:signedIn?200:401,json:signedIn?user:{message:'session expired'}});
 calls.push({name,args});
 if(name==='reservation_notification_settings'&&settingsHanging){heldSettings.push(route);return;}if(name==='reservation_notification_settings')return route.fulfill({json:{enabled:true,saved:true}});if(name==='notification_inbox'){expect(args.operation).toBe('list');if(hanging){held.push(route);return;}if(fail)return route.fulfill({status:500,json:{message:'fixture error'}});return route.fulfill({json:{unread:1,items:[{id:'notification-1',title:'새 상담 요청이 도착했어요.',body:'가능한 일정인지 확인해주세요.',deep_link:(visitLink?'/urgent.html?request=':legacyLink?'/partner-work.html?request=':'/notifications.html?reservation=')+booking,created_at:new Date().toISOString(),read_at:null}]}});}
 if(name==='notification_reservation')return route.fulfill({status:foreign?403:200,json:foreign?{message:'reservation_not_found'}:{id:booking,workspace,state:receipt?'DECLINED':'requested',receipt_only:receipt,office_name:'격리 보험소',preferred_at:'2030-01-16T05:00:00Z'}});
 if(name==='appointment_care'&&careHanging){heldCare.push(route);return;}if(name==='appointment_care')return route.fulfill(care==='missing'?{status:404,json:{code:'PGRST202',message:'function unavailable'}}:care==='error'?{status:500,json:{message:'optional error'}}:{json:{enabled:false}});
 const data={my_membership:{member:true,admin:false,partner_status:'approved',profession:'planner'},release_status:{},consultation_workspace:{profile:{},bookings:[{id:booking,region:'경기 김포시',purpose:'claim',state:'requested',planner_id:expert,planner_name:'격리 전문가',preferred_at:new Date(Date.now()+86400000).toISOString(),method:'phone',revision:1}],summary:{}},planner_catalog:{planners:[]},office_catalog:[],service_area_catalog:[],notification_list:[],expert_optional_profile:null};
 if(name==='urgent_command')return route.fulfill({json:args.operation==='workspace'?(visitLink?[{id:booking,state:'REQUESTED',mine:true,purpose:'claim',region:'격리 방문 지역',expertName:'격리 전문가',preferredAt:'2030-01-16T05:00:00Z'}]:[]):{eligible:false,areas:null,visitConfig:{expireMinutes:30}}});return route.fulfill({json:data[name]??{enabled:false,items:[]}});
});

try{await mkdir('outputs/member-mobile-20261018',{recursive:true});const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
for(const route of ['account','notifications','requests'])for(const width of [320,360,390,430]){
 await page.setViewportSize({width,height:850});await page.goto(origin+'/'+route+'.html');await expect(page.locator('#accountContent')).toBeVisible();
 if(route==='notifications')await expect(page.getByText('새 상담 요청이 도착했어요.',{exact:true})).toBeVisible();
 if(route==='requests')await expect(page.locator('[data-booking-id]')).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await page.screenshot({path:'outputs/member-mobile-20261018/'+route+'-'+width+'.png',fullPage:true});
 await page.evaluate(()=>document.documentElement.style.fontSize='200%');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await page.screenshot({path:'outputs/member-mobile-20261018/'+route+'-'+width+'-text200.png',fullPage:true});
}
fail=true;await page.goto(origin+'/notifications.html');await expect(page.getByText('알림을 불러오지 못했습니다',{exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'재시도',exact:true})).toBeVisible();
expect(calls.filter(x=>x.name==='notification_inbox').every(x=>x.args.operation==='list')).toBe(true);expect(errors).toEqual([]);console.log('PASS 3 member screens x 4 widths, 200% text, notification error; isolated data, no real accounts or sends.');
}finally{await browser.close();}
