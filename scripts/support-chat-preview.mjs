// Loopback-only, in-memory review environment. It never connects to production services.
import http from 'node:http';
import path from 'node:path';
import {readFile} from 'node:fs/promises';
import {setupSupport,ids} from '../tests/support-integration-fixture.mjs';
const f=await setupSupport();await f.owner('select 1');await f.db.exec(await readFile('supabase/060_support_chat.sql','utf8'));
const mutate=async(actor,op,p={})=>{await f.login(actor);return f.send(op,p);};
const first=await mutate(ids.customer,'create',{body:'지도에서 전문가를 선택한 뒤에는 어떻게 진행하나요?',topic:'booking'});
await f.login(ids.admin);let row=await f.command('admin_detail',{id:first.id});await f.send('take',{id:first.id,revision:row.revision});row=await f.command('admin_detail',{id:first.id});
await f.send('reply',{id:first.id,revision:row.revision,body:'전문가를 직접 선택해 요청한 다음 연락과 일정을 조율할 수 있습니다. 현재 화면의 어느 부분에서 막히셨는지 알려 주세요.',state:'WAITING_CUSTOMER'});
row=await f.command('admin_detail',{id:first.id});await f.send('note',{id:first.id,revision:row.revision,body:'가상 문의 검수용 내부 메모입니다. 고객에게 표시되지 않습니다.'});
await mutate(ids.planner,'create',{body:'프로필 소개를 수정한 내용이 저장됐는지 확인하고 싶어요.',topic:'profile'});
let queue=Promise.resolve();const serial=fn=>{const p=queue.then(fn);queue=p.catch(()=>{});return p;};
const root=path.resolve('public'),servers=[];
const types={'.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2','.html':'text/html; charset=utf-8'};
for(const [port,actor,label]of [[8894,ids.customer,'소비자'],[8895,ids.admin,'운영자'],[8896,ids.planner,'설계사']]){
 const host='http://127.0.0.1:'+port;
 const server=http.createServer(async(req,res)=>{
  res.setHeader('Cache-Control','no-store');const json=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(data));};
  try{
   const url=new URL(req.url,host);
   if(url.pathname==='/api/config')return json(200,{enabled:true,earlyAccess:true,url:host,key:'fixture'});
   const user={id:actor,email:label==='운영자'?'operator@example.test':'member@example.test',aud:'authenticated'};
   const exp=Math.floor(Date.now()/1000)+3600,session={user,access_token:Buffer.from('{"alg":"HS256"}').toString('base64url')+'.'+Buffer.from(JSON.stringify({sub:actor,exp})).toString('base64url')+'.fixture',refresh_token:'fixture',expires_at:exp,expires_in:3600,token_type:'bearer'};
   if(url.pathname==='/auth/v1/user')return json(200,user);
   if(url.pathname==='/auth/v1/token')return json(200,session);
   if(url.pathname==='/auth/v1/logout')return json(200,{});
   if(url.pathname.startsWith('/rest/v1/rpc/')){
    let body='';for await(const chunk of req){body+=chunk;if(body.length>20000)return json(413,{message:'request_too_large'});}
    const name=url.pathname.split('/').pop(),args=JSON.parse(body||'{}');
    const allowed=name==='support_command'||name==='my_membership'||name==='operational_metrics'||name==='early_expert_review'&&args.operation==='list';
    if(!allowed)return json(400,{message:'preview_readonly_or_unavailable',code:'PGRST202'});
    const data=await serial(async()=>{await f.login(actor);return f.rpc(name,Object.values(args));});return json(200,data);
   }
   if(url.pathname.startsWith('/api/'))return json(404,{message:'preview_only'});
   let name=url.pathname==='/'?'/support.html':url.pathname;if(!path.extname(name))name+='.html';const file=path.resolve(root,'.'+decodeURIComponent(name));
   if(!file.startsWith(root+path.sep))return json(403,{message:'forbidden'});
   let body=await readFile(file);if(file.endsWith('.html')){
    body=body.toString().replace('<head>','<head><script>localStorage.setItem("woori-account",'+JSON.stringify(JSON.stringify(session))+');</script>')
     .replace('<main class="container">','<main class="container"><p class="card" role="note">'+label+' 가상 계정 · 격리 DB 미리보기. 실제 고객에게 전달되지 않습니다.</p>');
   }
   res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream'});res.end(body);
  }catch(e){json(e.code==='ENOENT'?404:400,{message:e.code==='ENOENT'?'not_found':e.message,code:e.code||'P0001'});}
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});servers.push(server);
 console.log(label+' '+host+(actor===ids.admin?'/admin.html':'/support.html'));
}
const close=async()=>{for(const s of servers)s.close();await queue;await f.db.close();process.exit();};process.once('SIGINT',close);process.once('SIGTERM',close);
