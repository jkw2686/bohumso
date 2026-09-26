import http from 'node:http';import {randomBytes} from 'node:crypto';import {readFile,mkdir} from 'node:fs/promises';import {build} from 'esbuild';import {ClaimPreparationStore,CUSTOMERS,HOSPITALS,DOCUMENTS} from '../src/pro/store.mjs';
export async function startProPreview(port=3193){
 await mkdir('artifacts',{recursive:true});await build({entryPoints:['src/pro/ui.js'],bundle:true,format:'esm',outfile:'artifacts/pro-preview.js'});
 const sessions=new Set(),streams=new Map();const store=new ClaimPreparationStore({onChange:owner=>{for(const res of streams.get(owner)||[])res.write('data: changed\n\n');}});
 const json=(res,data,status=200)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data));};
 const body=async(req,limit=32768)=>{const chunks=[];let n=0;for await(const chunk of req){n+=chunk.length;if(n>limit)throw Object.assign(Error('파일이 너무 큽니다.'),{status:413});chunks.push(chunk);}return Buffer.concat(chunks);};
 const server=http.createServer(async(req,res)=>{res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Content-Security-Policy',"default-src 'self'; img-src 'self' blob: data:; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'none'");
  try{
   const origin='http://127.0.0.1:'+server.address().port;if(req.headers.host!==new URL(origin).host)throw Object.assign(Error('Local host only'),{status:403});
   const url=new URL(req.url,origin),route=url.pathname;const cookies=Object.fromEntries((req.headers.cookie||'').split(';').filter(x=>x.includes('=')).map(x=>x.trim().split('=')));let owner=cookies.pro_demo;
   if(route==='/pro'||route==='/'){if(!sessions.has(owner)){owner=randomBytes(24).toString('hex');sessions.add(owner);res.setHeader('Set-Cookie','pro_demo='+owner+'; HttpOnly; SameSite=Strict; Path=/');}res.setHeader('Content-Type','text/html; charset=utf-8');res.end(await readFile('preview/pro/planner.html'));return;}
   if(route==='/customer'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(await readFile('preview/pro/customer.html'));return;}
   const assets={'/pro.js':['artifacts/pro-preview.js','text/javascript'],'/pro.css':['preview/pro/pro.css','text/css'],'/styles.css':['public/styles.css','text/css'],'/account.css':['public/account.css','text/css']};
   if(assets[route]){res.setHeader('Content-Type',assets[route][1]);res.end(await readFile(assets[route][0]));return;}
   if(req.method!=='GET'&&req.headers.origin!==origin)throw Object.assign(Error('잘못된 요청 출처입니다.'),{status:403});
   if(route.startsWith('/api/pro/')){
    if(!sessions.has(owner))throw Object.assign(Error('설계사 가상 화면을 먼저 열어 주세요.'),{status:401});
    if(route==='/api/pro/events'&&req.method==='GET'){res.writeHead(200,{'Content-Type':'text/event-stream'});res.write(': connected\n\n');if(!streams.has(owner))streams.set(owner,new Set());streams.get(owner).add(res);const timer=setInterval(()=>res.write(': keepalive\n\n'),20000);req.on('close',()=>{clearInterval(timer);streams.get(owner)?.delete(res);});return;}
    if(route==='/api/pro/requests'&&req.method==='GET'){json(res,{requests:store.list(owner),customers:CUSTOMERS,hospitals:HOSPITALS,documents:DOCUMENTS});return;}
    if(route==='/api/pro/requests'&&req.method==='POST'){json(res,store.create(owner,JSON.parse(await body(req))));return;}
    const match=route.match(/^\/api\/pro\/requests\/([\w-]+)(\/image)?$/);if(match){if(match[2]&&req.method==='GET'){res.setHeader('Content-Type','image/png');res.setHeader('Content-Disposition','attachment; filename="masked-copy.png"');res.end(store.image(owner,match[1]));return;}if(req.method==='POST'){json(res,store.change(owner,match[1],JSON.parse(await body(req))));return;}}
   }
   if(route==='/api/customer/request'&&req.method==='GET'){json(res,store.customer(req.headers['x-request-token']));return;}
   if(route==='/api/customer/copy'&&req.method==='POST'){store.token(req.headers['x-request-token']);const bytes=await body(req,4*1024*1024);json(res,store.complete(req.headers['x-request-token'],bytes,req.headers['x-mask-confirmed']==='true'));return;}
   json(res,{error:'찾을 수 없습니다.'},404);
  }catch(e){json(res,{error:e.status?e.message:'처리하지 못했습니다. 입력값을 확인해 주세요.'},e.status||400);}
 });
 const cleanup=setInterval(()=>store.expire(),10000);cleanup.unref();server.on('close',()=>clearInterval(cleanup));await new Promise(resolve=>server.listen(port,'127.0.0.1',resolve));return {server,store};
}
if(process.argv[1]?.endsWith('pro-preview.mjs')){await startProPreview();console.log('PRO local only: http://127.0.0.1:3193/pro');}
