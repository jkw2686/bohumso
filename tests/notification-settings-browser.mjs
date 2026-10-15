import {build} from 'esbuild';
import {chromium,expect} from '@playwright/test';
import launch from './playwright-launch.cjs';
import {mkdir} from 'node:fs/promises';
const origin='https://push.fixture.test';
const bundle=await build({stdin:{contents:`import {mountNotificationSettings} from './src/notification-settings.js';import {installPushIdentityGuard} from './src/reservation-push.js';installPushIdentityGuard(window.fixture.client);await mountNotificationSettings({client:window.fixture.client,host:document.querySelector('main'),user:{id:'actor-a'}});`,resolveDir:process.cwd()},bundle:true,write:false,format:'esm'});
const browser=await chromium.launch(launch);
const context=await browser.newContext();
let preference=true,failSet=false,failRegister=false,registered=null;
const operations=[];
await context.addInitScript(()=>{
 const f=window.fixture={actor:'actor-a',binding:null,sub:null,permission:'default',listeners:[],permissionRequests:0};
 Object.defineProperty(window,'Notification',{value:{get permission(){return f.permission;},requestPermission(){f.permissionRequests++;f.permission='granted';return Promise.resolve('granted');}},configurable:true});
 window.PushManager=class{};
 const reg={scope:location.origin+'/reservation-push/',active:{postMessage(data,ports){if(data.type==='set-binding'){f.binding=data.binding;if(data.binding&&f.switchOnBind){f.switchOnBind=false;f.switchAccount();}}ports[0].postMessage(data.type==='get-binding'?{binding:f.binding}:{saved:true});}},pushManager:{async getSubscription(){return f.sub;},async subscribe(){f.sub={toJSON:()=>({endpoint:'https://fcm.googleapis.com/fake',keys:{auth:'fixture',p256dh:'fixture'}}),async unsubscribe(){f.sub=null;return true;}};return f.sub;}}};
 Object.defineProperty(navigator,'serviceWorker',{value:{async getRegistrations(){return [reg];},async register(){return reg;}},configurable:true});
 f.client={auth:{async getSession(){return {data:{session:{access_token:f.actor}}};},async getUser(){return {data:{user:{id:f.actor}}};},onAuthStateChange(cb){f.listeners.push(cb);cb('INITIAL_SESSION',{user:{id:f.actor}});return {data:{subscription:{unsubscribe(){}}}};},async signOut(){f.actor=null;f.listeners.forEach(cb=>cb('SIGNED_OUT',null));return {error:null};}},async rpc(name,args){const r=await fetch('/fixture/settings',{method:'POST',body:JSON.stringify(args)});return r.json();}};
 f.switchAccount=()=>{f.actor='actor-b';f.listeners.forEach(cb=>cb('SIGNED_IN',{user:{id:f.actor}}));};
});
await context.route('**/*',async route=>{
 const req=route.request(),u=new URL(req.url());if(u.origin!==origin)return route.abort();
 if(u.pathname==='/fixture/settings'){const args=req.postDataJSON();if(args.operation==='set'){if(failSet)return route.fulfill({json:{error:{message:'fixture save failed'}}});preference=args.payload.enabled;}return route.fulfill({json:{data:{enabled:preference,saved:true},error:null}});}
 if(u.pathname==='/api/reservation-push'){
  if(req.method()==='GET')return route.fulfill({json:{enabled:true,publicKey:'BAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'}});
  const args=req.postDataJSON();operations.push(args.operation);
  if(args.operation==='register'){if(failRegister)return route.fulfill({status:503,json:{error:'fixture save failed'}});registered={active:true,saved:true,enabled:true,binding:args.binding};}
  if(args.operation==='unregister')registered=null;
  return route.fulfill({json:registered||{active:false,saved:false,enabled:preference}});
 }
 if(u.pathname==='/fixture.js')return route.fulfill({body:bundle.outputFiles[0].text,contentType:'text/javascript'});
 return route.fulfill({body:'<!doctype html><meta name="viewport" content="width=device-width"><style>body{margin:16px;font:16px sans-serif}button{min-height:44px;max-width:100%;margin:4px}dialog{max-width:calc(100% - 64px)}main{max-width:760px}</style><main></main><script type="module" src="/fixture.js"></script>',contentType:'text/html'});
});
const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await mkdir('artifacts/notification-settings',{recursive:true});
 for(const width of [360,390,768,1440]){await page.setViewportSize({width,height:900});await page.goto(origin);await expect(page.getByText('앱 내 예약 알림: 켜짐',{exact:true})).toBeVisible();await expect(page.getByText(/기기 연결 전/)).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:`artifacts/notification-settings/settings-${width}.png`,fullPage:true});}
 await page.getByRole('button',{name:'예약 알림 끄기',exact:true}).click();await expect(page.getByRole('dialog')).toContainText('새 상담 요청과 예약 변경·취소 안내를 알림으로 받지 못합니다.');await expect(page.getByRole('dialog')).toContainText('예약 진행 상황은 내 예약에서 직접 확인해야 합니다.');await page.getByRole('button',{name:'알림 유지하기',exact:true}).click();expect(preference).toBe(true);
 failSet=true;await page.getByRole('button',{name:'예약 알림 끄기',exact:true}).click();await page.getByRole('button',{name:'끄기',exact:true}).click();await expect(page.getByText('설정을 저장하지 못했습니다. 다시 시도해 주세요.',{exact:true})).toBeVisible();expect(preference).toBe(true);failSet=false;
 await page.getByRole('button',{name:'예약 알림 끄기',exact:true}).click();await page.getByRole('button',{name:'끄기',exact:true}).click();await expect(page.getByText(/예약 알림 설정 OFF/)).toBeVisible();expect(preference).toBe(false);await page.getByRole('button',{name:'앱 내 예약 알림 다시 켜기',exact:true}).click();await expect(page.getByText('앱 내 예약 알림: 켜짐',{exact:true})).toBeVisible();
 failRegister=true;await page.getByRole('button',{name:'예약 알림 켜기',exact:true}).click();await expect(page.getByText('설정을 저장하지 못했습니다. 다시 시도해 주세요.',{exact:true})).toBeVisible();expect(await page.evaluate(()=>fixture.binding)).toBe(null);expect(await page.evaluate(()=>fixture.sub)).toBe(null);await expect(page.getByRole('button',{name:'이 기기로 시험 알림 받기'})).toBeDisabled();failRegister=false;
 await page.getByRole('button',{name:'예약 알림 켜기',exact:true}).click();await expect(page.getByText(/푸시 수신 준비 완료 · 로그인 계정/)).toBeVisible();expect(await page.evaluate(()=>!!fixture.binding)).toBe(true);
 await page.evaluate(()=>fixture.switchAccount());await expect(page.getByText(/계정이 변경되었습니다/)).toBeVisible();await expect.poll(()=>page.evaluate(()=>fixture.binding)).toBe(null);await expect.poll(()=>page.evaluate(()=>fixture.sub)).toBe(null);
 await page.reload();await page.getByRole('button',{name:'예약 알림 켜기',exact:true}).click();await expect(page.getByText(/푸시 수신 준비 완료 · 로그인 계정/)).toBeVisible();const result=await page.evaluate(()=>fixture.client.auth.signOut());expect(result.error).toBe(null);expect(await page.evaluate(()=>fixture.binding)).toBe(null);expect(await page.evaluate(()=>fixture.sub)).toBe(null);
 await page.reload();await expect(page.getByRole('button',{name:'예약 알림 켜기',exact:true})).toBeEnabled();await page.evaluate(()=>fixture.switchOnBind=true);await page.getByRole('button',{name:'예약 알림 켜기',exact:true}).click();await expect.poll(()=>page.evaluate(()=>fixture.binding)).toBe(null);await expect.poll(()=>page.evaluate(()=>fixture.sub)).toBe(null);
 await page.reload();await page.evaluate(()=>fixture.permission='denied');await page.getByRole('button',{name:'설정 다시 확인'}).click();await expect(page.getByText(/권한 차단/)).toBeVisible();await expect(page.getByRole('button',{name:'예약 알림 켜기',exact:true})).toBeDisabled();
 expect(operations.includes('test')).toBe(false);expect(errors).toEqual([]);console.log('PASS 4 widths, OFF confirm/keep/save failure, permission alone not ready, subscription failure cleanup, ready after binding, account switch/logout disarm, denied permission. Mocked push only; no actual device delivery.');
}finally{await browser.close();}
