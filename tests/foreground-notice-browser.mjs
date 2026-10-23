import {build} from 'esbuild';
import {chromium,expect} from '@playwright/test';
import launch from './playwright-launch.cjs';
const js=await build({stdin:{contents:`import {mountForegroundNotice} from './src/foreground-notice.js';
window.f={enabled:true,rows:[],calls:[],callbacks:[]};
f.client={rpc:async(name,args)=>{f.calls.push([name,args]);if(name==='reservation_notification_settings')return {data:{enabled:f.enabled}};if(f.delay)await new Promise(r=>f.release=r);return {data:{items:f.rows}};},auth:{onAuthStateChange(cb){f.callbacks.push(cb);return {data:{subscription:{unsubscribe(){}}}};}}};
f.control=await mountForegroundNotice({client:f.client,host:document.body,user:{id:'a'}});`,resolveDir:process.cwd()},bundle:true,write:false,format:'esm'});
const browser=await chromium.launch(launch);
try{
 const page=await browser.newPage();await page.route('**/*',route=>route.fulfill({contentType:route.request().url().endsWith('.js')?'text/javascript':'text/html',body:route.request().url().endsWith('.js')?js.outputFiles[0].text:'<!doctype html><script type="module" src="/fixture.js"></script>'}));
 await page.goto('https://notice.fixture.test');await page.waitForFunction(()=>window.f?.control);
 const banner=page.locator('[data-foreground-notice]');await expect(banner).toBeHidden();
 await page.evaluate(async()=>{f.rows=[{id:'1',deep_link:'/partner-work.html?request=10af21cc-838f-4cd7-8c3c-cc8152791ed8'}];await f.control.poll();});
 await expect(banner).toBeVisible();await expect(banner.getByRole('link')).toHaveAttribute('href','/notifications.html?reservation=10af21cc-838f-4cd7-8c3c-cc8152791ed8');
 await banner.getByRole('button',{name:'닫기'}).click();await page.evaluate(()=>f.control.poll());await expect(banner).toBeHidden();
 await page.evaluate(async()=>{f.enabled=false;f.rows.push({id:'2',deep_link:f.rows[0].deep_link});window.dispatchEvent(new Event('bohumso-notification-preference'));});await expect(banner).toBeHidden();
 await page.evaluate(async()=>{f.enabled=true;await f.control.poll();});
 await page.evaluate(()=>{f.delay=true;void f.control.poll();});await page.waitForFunction(()=>!!f.release);
 await page.evaluate(()=>{f.callbacks.forEach(cb=>cb('SIGNED_IN',{user:{id:'b'}}));f.release();});await expect(banner).toBeHidden();await expect(banner).toBeEmpty();
 const calls=await page.evaluate(()=>f.calls);expect(calls.every(([name,args])=>name==='reservation_notification_settings'?args.operation==='get':name==='notification_inbox'&&args.operation==='list')).toBe(true);
 console.log('PASS foreground read-only new alert, safe reservation link, once per notice, OFF, account change invalidates pending response.');
}finally{await browser.close();}
