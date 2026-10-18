import PW_LAUNCH from './playwright-launch.cjs';
import {chromium} from '@playwright/test';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
const origin='https://bohumso.netlify.app',auth='https://auth.fixture.test';
const user={id:'90000000-0000-4000-8000-000000000001',email:'isolated@example.test',email_confirmed_at:'2026-01-01T00:00:00Z',aud:'authenticated'};
const token=Buffer.from('{"alg":"HS256"}').toString('base64url')+'.'+Buffer.from(JSON.stringify({sub:user.id,exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')+'.fixture';
const browser=await chromium.launch(PW_LAUNCH),results=[];
try{for(let i=0;i<5;i++){
 const context=await browser.newContext(),counts={config:0,user:0,membership:0};
 await context.addInitScript(({token,user})=>localStorage.setItem('woori-account',JSON.stringify({access_token:token,refresh_token:'fixture',expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,token_type:'bearer',user})),{token,user});
 await context.route('**/*',async r=>{const u=new URL(r.request().url());
  const answer=async json=>{await new Promise(resolve=>setTimeout(resolve,120));return r.fulfill({json});};
  if(u.origin===origin){if(u.pathname==='/api/config'){counts.config++;return answer({enabled:true,earlyAccess:true,signupEnabled:true,url:auth,key:'fixture'});}
   if(u.pathname.startsWith('/api/'))return answer({enabled:false});
   try{const file=path.resolve('public','.'+u.pathname);return r.fulfill({body:await readFile(file),contentType:file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.svg')?'image/svg+xml':file.endsWith('.png')?'image/png':'text/html'});}catch{return r.fulfill({status:404,body:''});}}
  if(u.origin===auth){if(u.pathname.endsWith('/user')){counts.user++;return answer(user);}if(u.pathname.endsWith('/my_membership')){counts.membership++;return answer({member:true,state:'ACTIVE_MEMBER',partner_status:null});}return answer({enabled:false,items:[]});}return r.abort();
 });
 const p=await context.newPage(),started=Date.now();await p.goto(origin+'/account.html');await p.locator('#accountContent:not([hidden])').waitFor();const contentMs=Date.now()-started;await p.waitForTimeout(600);results.push({contentMs,...counts});await context.close();
}
await mkdir('outputs/signup-entry-20261018',{recursive:true});await writeFile('outputs/signup-entry-20261018/'+(process.argv[2]||'performance')+'.json',JSON.stringify({fixtureLatencyMs:120,runs:results},null,2));console.log(results);
}finally{await browser.close();}
