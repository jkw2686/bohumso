import {chromium,expect} from '@playwright/test';
import launch from './playwright-launch.cjs';
import {readFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {conversations,commonReplies} from '../public/claim-conversations-data.js';
const browser=await chromium.launch(launch),origin='https://comic.fixture.test',errors=[];
await mkdir('artifacts/claim-conversations',{recursive:true});
try{
 const context=await browser.newContext();await context.route('**/*',async route=>{const u=new URL(route.request().url());if(u.origin!==origin)return route.abort();try{const f=path.resolve('public','.'+u.pathname);return route.fulfill({body:await readFile(f),contentType:f.endsWith('.js')?'text/javascript':f.endsWith('.css')?'text/css':f.endsWith('.svg')?'image/svg+xml':f.endsWith('.woff2')?'font/woff2':'text/html;charset=utf-8'});}catch{return route.fulfill({status:404,body:''});}});
 await context.addInitScript(()=>{window.copies=[];Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{if(window.failCopy)throw Error('denied');window.copies.push(text);}}});});
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.goto(origin+'/claim-resources.html#claimScripts');await expect(page.locator('#claimScripts')).toHaveAttribute('open','');await page.getByRole('button',{name:'24초 애니메이션 재생',exact:true}).click();await page.evaluate(()=>{window.motionChanges=[];matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change',e=>window.motionChanges.push(e.matches));});await page.emulateMedia({reducedMotion:'reduce'});await expect(page.locator('.conversation-player')).toBeHidden({timeout:20000});console.log('PASS live reduced-motion event',await page.evaluate(()=>({matches:matchMedia('(prefers-reduced-motion: reduce)').matches,events:window.motionChanges,hidden:document.hidden})));
}finally{await browser.close();}