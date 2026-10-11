// Loopback review only; users and data are isolated fixtures. No external services.
import http from 'node:http';import path from 'node:path';import {readFile,writeFile} from 'node:fs/promises';
import {setupGrowth,ids} from '../tests/growth-fixture.mjs';
const f=await setupGrowth();const first=await f.first();
await f.owner('select 1');
// Preserve the earlier local conversations and their links when replacing the preview process.
let backup;try{backup=JSON.parse(await readFile('artifacts/support-preview-backup.json','utf8'));}catch{}
await f.owner("select setval(pg_get_serial_sequence('private.support_messages','id'),$1)",[Math.max(1,...(backup?.rows||[]).flatMap(r=>r.messages.map(m=>Number(m.id))))+1]);
for(const r of backup?.rows||[]){
 const actor=r.role==='planner'?ids.planner:ids.customer;
 await f.owner('insert into private.member_rights_requests(id,user_id,kind,detail,response,status,created_at,updated_at) values($1,$2,$3,$4,$5,$6,$7,$8) on conflict do nothing',[r.id,actor,r.kind,r.detail,r.response||'',r.status,r.created_at,r.updated_at]);
 // Only fixture rows created just above are replaced with the saved fixture conversation.
 await f.owner('delete from private.support_messages where request_id=$1',[r.id]);
 for(const m of r.messages)await f.owner('insert into private.support_messages(id,request_id,actor,sender,body,created_at,receipt_notice) overriding system value values($1,$2,$3,$4,$5,$6,$7)',[m.id,r.id,m.sender==='customer'?actor:m.sender==='automatic'?null:ids.admin,m.sender,m.body,m.created_at,!!m.receipt_notice]);
 await f.owner('update private.support_threads set revision=$2,assigned_to=$3,chat_state=$4,topic=$5,requester_role=$6,waiting_since=$7 where request_id=$1',[r.id,r.revision,r.handling==='operator'?ids.admin:null,r.chat_state,r.topic,r.role,r.waiting_since]);
}
await f.owner("select setval(pg_get_serial_sequence('private.support_messages','id'),greatest(coalesce((select max(id) from private.support_messages),0),1))");
let queue=Promise.resolve();const serial=fn=>{const p=queue.then(fn);queue=p.catch(()=>{});return p;};const root=path.resolve('public'),servers=[];
const types={'.js':'text/javascript','.css':'text/css','.html':'text/html; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2'};
for(const [port,actor,label] of [[8894,ids.customer,'소비자'],[8895,ids.admin,'운영자'],[8896,ids.planner,'전문가']]){
 const origin='http://127.0.0.1:'+port;
 const server=http.createServer(async(req,res)=>{const json=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
  try{const u=new URL(req.url,origin),user={id:actor,email:'fixture@example.test',aud:'authenticated'},exp=Math.floor(Date.now()/1000)+3600;
   const session={user,access_token:Buffer.from('{"alg":"HS256"}').toString('base64url')+'.'+Buffer.from(JSON.stringify({sub:actor,exp})).toString('base64url')+'.fixture',refresh_token:'fixture',expires_at:exp,expires_in:3600,token_type:'bearer'};
   if(u.pathname==='/api/config')return json(200,{enabled:true,earlyAccess:true,url:origin,key:'fixture'});
   if(u.pathname==='/auth/v1/user')return json(200,user);if(u.pathname==='/auth/v1/token')return json(200,session);if(u.pathname==='/auth/v1/logout')return json(200,{});
   if(u.pathname.startsWith('/rest/v1/rpc/')){let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>50000)return json(413,{message:'request_too_large'});}const name=u.pathname.split('/').pop(),args=JSON.parse(raw||'{}');
    const allowed=['growth_command','support_command','my_membership','operational_metrics'].includes(name)||name==='early_expert_review'&&args.operation==='list';if(!allowed)return json(400,{message:'preview_unavailable',code:'PGRST202'});
    return json(200,await serial(async()=>{await f.login(actor);return f.rpc(name,Object.values(args));}));
   }
   if(u.pathname.startsWith('/api/'))return json(404,{message:'preview_only'});
   let name=u.pathname==='/'?'/growth.html':u.pathname;if(!path.extname(name))name+='.html';const file=path.resolve(root,'.'+decodeURIComponent(name));if(!file.startsWith(root+path.sep))return json(403,{message:'forbidden'});
   let body=await readFile(file);if(file.endsWith('.html'))body=body.toString().replace('<head>','<head><script>localStorage.setItem("woori-account",'+JSON.stringify(JSON.stringify(session))+');</script>').replace('<main class="container">','<main class="container"><p class="card" role="note">'+label+' 가상 계정 · 검수용 DB. 실제 고객에게 전달되지 않습니다.</p>');
   res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(body);
  }catch(e){json(e.code==='ENOENT'?404:400,{message:e.code==='ENOENT'?'not_found':e.message,code:e.code||'P0001'});}
 });await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});servers.push(server);console.log(label+' '+origin+(actor===ids.admin?'/admin.html#growthAdmin':actor===ids.customer?'/support.html':'/growth.html'));
}
console.log('First content remains review pending: '+first.id);
const close=async()=>{for(const s of servers)s.close();await queue;await f.login(ids.admin);const rows=await f.command('admin_list');const details=[];for(const r of rows)details.push(await f.command('admin_detail',{id:r.id}));await writeFile('artifacts/support-preview-backup.json',JSON.stringify({saved_at:new Date().toISOString(),rows:details},null,2));await f.db.close();process.exit();};process.once('SIGINT',close);process.once('SIGTERM',close);
