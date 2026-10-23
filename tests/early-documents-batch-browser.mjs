import {chromium,expect} from '@playwright/test';
import {build} from 'esbuild';
import {readFile} from 'node:fs/promises';
import launch from './playwright-launch.cjs';

// Bundle in memory and intercept every request: no app server, DB, build output or live API.
const bundle=await build({stdin:{contents:`import {renderEarlyDocuments} from './src/early-documents.js';window.renderDocuments=renderEarlyDocuments;`,resolveDir:process.cwd()},bundle:true,write:false,format:'iife'});
const css=(await Promise.all(['styles.css','account.css','service-ui.css','type-system.css'].map(f=>readFile('public/'+f,'utf8')))).join('\n');
const browser=await chromium.launch(launch);
const context=await browser.newContext({viewport:{width:360,height:844},acceptDownloads:true});
let saved=[],uploads=[],actions=[],failKind=null,lostResponse=false,listFailure=false;
await context.route('**/*',async route=>{
 const url=new URL(route.request().url());
 if(url.origin!=='https://documents.test')return route.abort();
 if(url.pathname==='/')return route.fulfill({contentType:'text/html',body:'<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/test.css"><body><main style="max-width:760px;margin:auto;padding:var(--space-4)"><input id="profile" aria-label="profile" value="unsaved profile"><div id="host"></div><p id="message" role="status"></p></main><script src="/test.js"></script></body></html>'});
 if(url.pathname==='/test.css')return route.fulfill({contentType:'text/css',body:css});
 if(url.pathname==='/test.js')return route.fulfill({contentType:'text/javascript',body:bundle.outputFiles[0].text});
 if(url.pathname==='/api/expert-documents'){
  expect(route.request().headers().authorization).toBe('Bearer fixture');
  if(route.request().headers()['content-type'].includes('multipart/form-data')){
   const form=await new Response(route.request().postDataBuffer(),{headers:{'Content-Type':route.request().headers()['content-type']}}).formData();
   const kind=form.get('kind');uploads.push(kind);
   expect(form.get('consent')).toBe('true');expect(form.get('redacted')).toBe('true');
   if(kind===failKind&&!lostResponse){failKind=null;return route.fulfill({status:503,json:{error:'storage_unavailable'}});}
   const doc={id:'doc-'+uploads.length,kind,profession:form.get('profession'),filename:form.get('file').name};saved.push(doc);
   if(lostResponse){lostResponse=false;return route.abort('failed');}
   return route.fulfill({json:doc});
  }
  const action=route.request().postDataJSON();actions.push(action);
  if(action.action==='read')return route.fulfill({contentType:'application/pdf',body:'%PDF-1.4 fixture'});
  saved=saved.filter(d=>d.id!==action.id);return route.fulfill({json:{deleted:true}});
 }
 return route.abort();
});
await context.exposeFunction('documentList',()=>listFailure?{error:{message:'offline'}}:{data:saved});
const page=await context.newPage();page.setDefaultTimeout(8000);
const errors=[];page.on('pageerror',e=>errors.push(e.message));
const row=kind=>page.locator(`[data-document-kind="${kind}"]`);
const file={name:'자료.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4 fixture')};
async function mount(profession='planner',enabled=true){
 await page.goto('https://documents.test/');
 await page.evaluate(async({profession,enabled})=>{window.client={rpc:()=>window.documentList(),auth:{getSession:async()=>({data:{session:{access_token:'fixture'}}})}};await window.renderDocuments(window.client,document.querySelector('#host'),{documentsEnabled:enabled},text=>document.querySelector('#message').textContent=text,profession);},{profession,enabled});
}
async function select(kind='registration',payload=file){await row(kind).locator('input[type=file]').setInputFiles(payload);}
const submit=()=>page.getByRole('button',{name:'제출하기',exact:true}).click();
try{
 for(const [profession,label] of [['planner','설계사 등록증'],['tax','세무사 등록 확인자료'],['office','상담 공간 확인자료']]){
  saved=[];await mount(profession);await expect(page.getByLabel(label,{exact:true})).toBeVisible();
  await expect(page.locator('input[type=checkbox]')).not.toBeChecked();
  await expect(page.getByRole('button',{name:'제출하기',exact:true})).toHaveCount(1);
  await expect(page.getByRole('button',{name:'제출',exact:true})).toHaveCount(0);
  await expect(page.getByRole('link',{name:'개인정보 수집·보관·삭제 자세히 보기'})).toHaveAttribute('href','/expert-terms.html#documents');
  expect(await page.locator('#host').innerText()).not.toContain('목적:');
  for(const width of [360,390,768]){await page.setViewportSize({width,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}
 }
 console.log('PASS profession rows / manual consent / single submit / privacy link / 360,390,768 widths');
 saved=[];uploads=[];await mount();await select();await select('appointment');await submit();
 await expect(page.locator('#message')).toContainText('동의');expect(uploads).toEqual([]);
 await page.locator('input[type=checkbox]').check();failKind='appointment';await submit();
 await expect(page.locator('#message')).toContainText('다시 확인');
 await expect(row('registration').getByRole('status')).toHaveText('제출됨');
 expect(await row('appointment').locator('input').evaluate(e=>e.files[0].name)).toBe(file.name);
 await expect(page.locator('input[type=checkbox]')).toBeChecked();await expect(page.locator('#profile')).toHaveValue('unsaved profile');
 expect(uploads).toEqual(['registration','appointment']);
 listFailure=true;await submit();await expect(page.locator('#message')).toContainText('제출 결과');expect(uploads).toHaveLength(2);
 listFailure=false;await submit();await expect(row('appointment').getByRole('status')).toHaveText('제출됨');
 expect(uploads).toEqual(['registration','appointment','appointment']);await submit();expect(uploads).toHaveLength(3);
 console.log('PASS partial failure retains files, consent and profile / failed reconciliation blocks retry / saved rows never repost');
 const download=page.waitForEvent('download');await row('registration').getByRole('button',{name:'제출자료 보기'}).click();await download;
 expect(actions.at(-1)).toEqual({action:'read',id:saved[0].id});
 page.once('dialog',d=>d.dismiss());await row('registration').getByRole('button',{name:'자료 삭제'}).click();await expect(row('registration').getByRole('status')).toHaveText('제출됨');
 page.once('dialog',d=>d.accept());await row('registration').getByRole('button',{name:'자료 삭제'}).click();await expect(row('registration').getByRole('status')).toHaveText('미제출');
 await expect(row('registration').locator('input')).toBeVisible();await expect(row('appointment').getByRole('status')).toHaveText('제출됨');
 console.log('PASS authorized read / cancel delete / confirmed delete in place');
 saved=[];uploads=[];await mount('tax');await select();await page.locator('input[type=checkbox]').check();lostResponse=true;await submit();
 await expect(page.locator('#message')).toContainText('fetch');expect(saved).toHaveLength(1);await submit();await expect(row('registration').getByRole('status')).toHaveText('제출됨');expect(uploads).toEqual(['registration']);
 console.log('PASS committed upload with lost response reconciles without duplicate upload');
 saved=[];uploads=[];await mount();await page.locator('input[type=checkbox]').check();await submit();await expect(page.locator('#message')).toContainText('파일을 선택');
 await select('registration',{name:'bad.txt',mimeType:'text/plain',buffer:Buffer.from('bad')});await submit();await expect(page.locator('#message')).toContainText('JPG');expect(uploads).toEqual([]);
 expect(await row('registration').locator('input').evaluate(e=>e.files[0].name)).toBe('bad.txt');
 await select('registration',{...file,buffer:Buffer.alloc(4194305)});await submit();await expect(page.locator('#message')).toContainText('4MB');expect(uploads).toEqual([]);
 await mount('planner',false);await expect(page.locator('input[type=file]')).toHaveCount(0);await mount('adjuster');await expect(page.locator('#host')).toBeEmpty();
 expect(errors).toEqual([]);console.log('PASS empty/type/size validation preserves input / disabled and inactive gates / no browser errors');
}finally{await context.close();await browser.close();}
