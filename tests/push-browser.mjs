import {chromium,expect} from '@playwright/test';
import {build} from 'esbuild';
const bundle=(await build({stdin:{contents:"import {setupPush,PushProvider} from './src/push-provider.js';import {bindingStore} from './src/push-binding.js';window.setupPush=setupPush;window.PushProvider=PushProvider;window.bindingStore=bindingStore;",resolveDir:process.cwd()},bundle:true,format:'esm',external:['/assets/firebase.js'],write:false})).outputFiles[0].text;
const browser=await chromium.launch({channel:'msedge',headless:true});
try {
 const page=await browser.newPage();
 await page.route('https://fixture.invalid/**',route=>route.fulfill({contentType:route.request().url().endsWith('.js')?'text/javascript':'text/html',body:route.request().url().endsWith('test.js')?bundle:route.request().url().endsWith('firebase.js')?`export const isSupported=async()=>true;export const messaging=()=>({});export const getToken=async()=>"fixture-token";export const deleteToken=async()=>true;export const onMessage=(_m,f)=>{window.onPush=f;return ()=>{}};`:'<main><h1>예약 화면</h1></main>'}));
 await page.goto('https://fixture.invalid/');
 await page.addScriptTag({url:'https://fixture.invalid/test.js',type:'module'});
 await page.evaluate(async()=>{
  window.calls=[];window.permissionCalls=0;window.allow='denied';
  window.Notification={permission:'default',requestPermission:async()=>{window.permissionCalls++;return window.allow}};
  window.client={auth:{getUser:async()=>({data:{user:{id:'customer-a'}}}),getSession:async()=>({data:{session:{access_token:'test-only'}}}),onAuthStateChange:f=>{window.authChange=f}}};
  window.cfg={pushNotificationsEnabled:true,firebase:{web:{projectId:'fixture'},vapidKey:'fixture'}};
  Object.defineProperty(navigator,'serviceWorker',{value:{register:async()=>({}),ready:Promise.resolve({}),getRegistration:async()=>({getNotifications:async()=>[],pushManager:{getSubscription:async()=>({unsubscribe:async()=>true})}})}});
  window.fetch=async(_url,options)=>{window.calls.push(JSON.parse(options.body));return Response.json({saved:true})};
  await window.setupPush(window.client,window.cfg);
 });
 expect(await page.evaluate(()=>window.permissionCalls)).toBe(0);
 await expect(page.locator('[data-push-prompt]')).toHaveCount(0);
 await page.evaluate(()=>window.dispatchEvent(new Event('bohumso-reservation-created')));
 await page.getByRole('button',{name:'알림 받기'}).click();
 await expect(page.getByText('알림이 꺼져 있어요. 내 예약에서 진행상황을 확인할 수 있습니다.')).toBeVisible();
 expect(await page.evaluate(()=>window.calls.length)).toBe(0);
 await page.evaluate(()=>window.allow='granted');
 await page.getByRole('button',{name:'알림 받기'}).click();
 await expect(page.getByText('예약 알림을 받을 준비가 됐어요.')).toBeVisible();
 expect(await page.evaluate(()=>window.calls[0].operation)).toBe('register');
 expect(await page.evaluate(()=>Boolean(window.calls[0].userId))).toBe(false);
 await page.evaluate(async()=>{window.received=0;window.addEventListener('bohumso-push-received',()=>window.received++);await window.onPush({data:{binding:'wrong'}});await window.onPush({data:{binding:await window.bindingStore()}})});
 expect(await page.evaluate(()=>window.received)).toBe(1);
 await page.evaluate(async()=>{window.fetch=async()=>{throw Error('offline')};await new window.PushProvider(window.client,window.cfg).unregisterDevice();await window.onPush({data:{binding:window.calls[0].binding}})});
 expect(await page.evaluate(async()=>Boolean(await window.bindingStore()))).toBe(false);
 expect(await page.evaluate(()=>window.received)).toBe(1);
 expect(await page.evaluate(()=>localStorage.getItem('bohumso-push-user'))).toBeNull();
 console.log('PASS: prompt timing, denied permission, authenticated registration, foreground binding, offline logout safety (simulated browser; no real FCM delivery)');
}finally{await browser.close();}
