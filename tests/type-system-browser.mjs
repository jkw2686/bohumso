import {chromium,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';
import path from 'node:path';
const phone=(await build({stdin:{contents:`import {renderPhoneVerification} from './src/phone-verification-ui.js';const root=document.querySelector('#accountContent');root.hidden=false;document.querySelector('#accountNotice').textContent='운영: 우리곁에 보험소 · 문의: jkw2686@gmail.com';await renderPhoneVerification({client:{rpc:async()=>({data:{verified:!location.search}})},config:{phoneVerificationEnabled:true},root});`,resolveDir:process.cwd()},bundle:true,format:'esm',write:false})).outputFiles[0].text;
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const page=await browser.newPage();
 await page.route('**/*',async r=>{const u=new URL(r.request().url());if(u.origin!=='https://fixture.test')return r.abort();if(u.pathname.startsWith('/api/'))return r.fulfill({json:{}});if(u.pathname.endsWith('.js'))return r.fulfill({contentType:'text/javascript',body:u.pathname==='/assets/account.js'&&new URL(r.request().headers().referer||'https://fixture.test').pathname==='/phone-verification.html'?phone:''});try{return r.fulfill({body:await readFile(path.resolve('public','.'+u.pathname)),contentType:u.pathname.endsWith('.css')?'text/css':u.pathname.endsWith('.woff2')?'font/woff2':u.pathname.endsWith('.svg')?'image/svg+xml':u.pathname.endsWith('.png')?'image/png':'text/html; charset=utf-8'});}catch{return r.fulfill({status:404,body:''});}});
 for(const width of [320,390,768,1440]){
  await page.setViewportSize({width,height:900});
  for(const name of ['index','signup','login','partner','requests','phone-verification']){
   await page.goto('https://fixture.test/'+name+'.html');await page.evaluate(()=>document.fonts.ready);
   expect(await page.evaluate(()=>document.fonts.check('16px "Bohumso Sans"'))).toBe(true);
   expect(await page.evaluate(()=>getComputedStyle(document.body).fontFamily)).toContain('Bohumso Sans');
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
   if(width===390&&['index','phone-verification'].includes(name))await page.screenshot({path:'artifacts/type-'+name+'.png',fullPage:true});
  }
 }
 console.log('PASS typography: local font loaded, six pages x four widths, no horizontal overflow; mocked data, no live actions');
}finally{await browser.close();}
