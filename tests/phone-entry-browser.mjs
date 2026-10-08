import {build} from 'esbuild';
import {chromium,expect} from '@playwright/test';
import {readFile,mkdir} from 'node:fs/promises';
const bundled=await build({entryPoints:['src/phone-signup-panel.js'],bundle:true,format:'esm',write:false});
const origin='https://phone-ui.example.test';
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const context=await browser.newContext();let sends=0,verified=false;
 await context.route('**/*',async route=>{
  const u=new URL(route.request().url());
  if(u.pathname.startsWith('/api/phone/')){
   if(u.pathname.endsWith('verify-otp')){
    if(route.request().postDataJSON().otp!=='123456')return route.fulfill({status:400,json:{error:'invalid_otp'}});
    return route.fulfill({json:{verified:true}});
   }
   sends++;return route.fulfill({json:{sent:true}});
  }
  if(u.pathname==='/panel.js')return route.fulfill({contentType:'text/javascript; charset=utf-8',body:bundled.outputFiles[0].text});
  if(u.pathname==='/')return route.fulfill({contentType:'text/html',body:`<html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="/public/styles.css"><link rel="stylesheet" href="/public/account.css"><main style="max-width:760px;margin:auto;padding:16px"><form id="profile"><label>이름<input name="name" value="작성 중인 프로필"></label></form></main><script type="module">import {renderPhoneSignupPanel} from '/panel.js';window.phoneVerified=${verified};const client={rpc:async()=>({data:{verified:window.phoneVerified}}),auth:{getSession:async()=>({data:{session:{access_token:'fixture'}}}),getUser:async()=>({data:{user:{phone_confirmed_at:window.phoneVerified?'verified':null}}}),updateUser:async()=>{await fetch('/api/phone/send-otp',{method:'POST'});return {};},verifyOtp:async({token})=>{if(token!=='123456')return {error:{message:'invalid_otp'}};window.phoneVerified=true;return {};}}};await renderPhoneSignupPanel({client,config:{phoneVerificationEnabled:true},before:document.querySelector('#profile')});</script></html>`});
  if(!/^\/(src|public)\/[\w.-]+$/.test(u.pathname))return route.abort();
  return route.fulfill({body:await readFile('.'+u.pathname),contentType:u.pathname.endsWith('.css')?'text/css':'text/javascript'});
 });
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await mkdir('artifacts',{recursive:true});
 for(const width of [320,390,1440]){
  await page.setViewportSize({width,height:844});await page.goto(origin);
  await expect(page.getByRole('heading',{name:'휴대전화 인증',exact:true})).toBeVisible();
  await expect(page.getByLabel('휴대전화 번호',{exact:true})).toBeVisible();await expect(page.getByLabel('인증번호 6자리')).toBeVisible();await expect(page.getByRole('button',{name:'인증 완료하기'})).toBeDisabled();
  expect(await page.locator('form form').count()).toBe(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  await page.screenshot({path:`artifacts/phone-entry-${width}.png`,fullPage:true});
 }
 await page.setViewportSize({width:390,height:844});
 await page.getByLabel('휴대전화 번호',{exact:true}).fill('01000000000');
 await page.getByLabel('휴대전화 번호',{exact:true}).press('Enter');
 await expect(page.getByLabel('인증번호 6자리')).toBeFocused();
 await expect(page.getByRole('button',{name:/인증번호 재발송/})).toBeDisabled();
 await page.getByLabel('인증번호 6자리').fill('000000');await page.getByRole('button',{name:'인증 완료하기'}).click();
 await expect(page.getByRole('status')).toContainText('인증번호가 맞지 않습니다');
 await page.getByLabel('인증번호 6자리').fill('123456');await page.getByRole('button',{name:'인증 완료하기'}).click();
 await expect(page.getByRole('status')).toHaveText('✓ 휴대전화 인증 완료');
 await expect(page.getByLabel('이름',{exact:true})).toHaveValue('작성 중인 프로필');
 expect(page.url()).toBe(origin+'/');expect(sends).toBe(1);
 verified=true;await page.reload();await expect(page.getByRole('status')).toHaveText('✓ 휴대전화 인증 완료');
 await expect(page.getByRole('button',{name:'인증번호 받기'})).toHaveCount(0);expect(errors).toEqual([]);
 console.log('PASS phone entry: 320/390/1440, inline OTP, error/retry, cooldown, Enter, draft preserved, verified state; MOCKED SMS ONLY');
}finally{await browser.close();}
