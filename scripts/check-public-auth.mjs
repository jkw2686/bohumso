import {mkdir,writeFile} from 'node:fs/promises';
// Public read-only checks. Never persist keys, email addresses or server responses.
const origin=new URL(process.argv[2]||'https://bohumso.netlify.app').origin;
if(!origin.startsWith('https://'))throw Error('HTTPS site origin required');
const report={checkedAt:new Date().toISOString(),origin,checks:[],manualChecks:['Supabase Site URL and redirect allowlist','Email delivery and confirmation','Password recovery completion','OAuth provider return and session','Operator details and policies'],deployed:false,emailsSent:false,paymentAttempted:false};
const add=(name,status,details={})=>report.checks.push({name,status,...details});
const request=(url,options={})=>fetch(url,{...options,redirect:'error',signal:AbortSignal.timeout(10000)});
for(const path of ['/','/signup.html','/login.html','/account.html','/reset-password.html']){
 try{const r=await request(origin+path);add(path,r.ok?'passed':'failed',{http:r.status});await r.body?.cancel();}catch{add(path,'unavailable');}
}
try{
 const r=await request(origin+'/api/config');const config=await r.json();
 add('public_config',r.ok&&config.enabled===true?'passed':'failed');
 if(r.ok&&config.enabled&&config.url&&config.key){
  const authOrigin=new URL(config.url).origin;
  let publicKey=String(config.key).startsWith('sb_publishable_');
  if(!publicKey){try{publicKey=JSON.parse(Buffer.from(String(config.key).split('.')[1],'base64url')).role==='anon';}catch{}}
  if(!authOrigin.startsWith('https://')||!publicKey)throw Error('Invalid public configuration');
  const headers={apikey:config.key};
  const settingsResponse=await request(authOrigin+'/auth/v1/settings',{headers});
  if(settingsResponse.ok){const settings=await settingsResponse.json();
   add('email_signup',settings.external?.email===true&&settings.disable_signup===false?'passed':'not_enabled');
   for(const provider of ['kakao','google'])add(provider,settings.external?.[provider]===true?'enabled_not_verified':'not_enabled');
  }else add('auth_settings','failed',{http:settingsResponse.status});
  const catalog=await request(authOrigin+'/rest/v1/rpc/planner_catalog',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({area:'',wanted:''})});
  const data=await catalog.json();add('public_planner_catalog',catalog.ok&&Array.isArray(data?.planners)?'passed':'failed',{http:catalog.status});
 }
}catch{add('backend_check','unavailable');}
await mkdir('artifacts',{recursive:true});
await writeFile('artifacts/public-readiness.json',JSON.stringify(report,null,2)+'\n');
for(const check of report.checks)console.log(check.name+': '+check.status);
console.log('Manual dashboard/email/OAuth checks remain unverified. Report: artifacts/public-readiness.json');
process.exitCode=report.checks.some(c=>['failed','unavailable'].includes(c.status))?1:0;
