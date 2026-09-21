import test from 'node:test';import assert from 'node:assert/strict';import {build} from 'esbuild';import {mkdir,readFile} from 'node:fs/promises';import {fixture,ids} from './commerce-fixture.mjs';
await mkdir('artifacts/functions',{recursive:true});await build({entryPoints:['netlify/functions/admin-redeploy.mts'],bundle:true,platform:'node',format:'esm',packages:'external',outfile:'artifacts/functions/admin-redeploy.js'});
const {default:handler}=await import('../artifacts/functions/admin-redeploy.js');
test('Redeploy endpoint verifies admin, origin, confirmation and idempotency; never leaks hook or retries timeout',async()=>{
 const oldFetch=globalThis.fetch,oldNetlify=globalThis.Netlify;let admin=true,mode='accepted',hooks=0,finish;
 const env={APP_ORIGIN:'https://site.test',SUPABASE_URL:'https://db.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fixture',SUPABASE_SERVICE_ROLE_KEY:'server-only-fixture',ADMIN_REDEPLOY_ENABLED:'true',NETLIFY_ADMIN_BUILD_HOOK:'https://api.netlify.com/build_hooks/SECRET_HOOK_FIXTURE',SITE_NAME:'bohumso'};globalThis.Netlify={env:{get:k=>env[k]}};
 globalThis.fetch=async(input,options={})=>{const url=String(input);if(url.startsWith('https://api.netlify.com/')){hooks++;if(mode==='timeout')throw Error('SECRET_HOOK_FIXTURE');return Response.json({}, {status:200});}
 if(url.includes('/auth/v1/user'))return Response.json({id:ids.admin,email:'fixture@example.test'});
 if(url.endsWith('/rpc/my_membership'))return Response.json({admin});
 if(url.endsWith('/rpc/admin_deploy_status'))return Response.json({});
 if(url.endsWith('/rpc/admin_deploy_claim'))return Response.json(mode==='cooldown'?{send:false,next_allowed_at:new Date(Date.now()+600000).toISOString()}:mode==='replay'?{send:false,replay:true,state:'accepted'}:{send:true});
 if(url.endsWith('/rpc/admin_deploy_finish')){finish=JSON.parse(options.body);return Response.json(null);}throw Error('unexpected endpoint');};
 const request=(body={requestId:'40000000-0000-4000-8000-000000000001',confirmation:'DEPLOY'},origin='https://site.test',token='fixture')=>new Request('https://site.test/api/admin/redeploy',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body)});
 try{
 assert.equal((await handler(request(undefined,undefined,''))).status,401);assert.equal(hooks,0);
 assert.equal((await handler(request(undefined,'https://evil.test'))).status,403);admin=false;assert.equal((await handler(request())).status,403);admin=true;
 assert.equal((await handler(request({confirmation:'NO'}))).status,400);
 env.ADMIN_REDEPLOY_ENABLED='false';assert.equal((await handler(request())).status,503);env.ADMIN_REDEPLOY_ENABLED='true';assert.equal(hooks,0);
 mode='cooldown';assert.equal((await handler(request())).status,429);assert.equal(hooks,0);
 mode='accepted';let r=await handler(request());assert.equal(r.status,202);assert.equal((await r.json()).state,'accepted');assert.equal(hooks,1);assert.equal(finish.result_state,'accepted');
 mode='replay';await handler(request());assert.equal(hooks,1);
 mode='timeout';r=await handler(request());const text=await r.text();assert.ok(text.includes('unknown'));assert.ok(!text.includes('SECRET'));assert.equal(hooks,2);assert.equal(finish.result_state,'unknown');
 r=await handler(new Request('https://site.test/api/admin/redeploy',{headers:{Authorization:'Bearer fixture'}}));assert.ok(!(await r.text()).includes('SECRET'));
 }finally{globalThis.fetch=oldFetch;globalThis.Netlify=oldNetlify;}
});
test('Deployment ledger restricts roles and serializes cooldown and repeated request IDs',async()=>{
 const f=await fixture();try{await f.db.exec('reset role');await f.db.exec(await readFile('supabase/008_admin_deploy.sql','utf8'));const request='40000000-0000-4000-8000-000000000001';
 await f.login(ids.customer);await assert.rejects(()=>f.rpc('admin_deploy_status'),/admin_required/);await assert.rejects(()=>f.rpc('admin_deploy_claim',[request,ids.admin]));
 await f.login(ids.admin);await assert.rejects(()=>f.rpc('admin_deploy_claim',[request,ids.admin]));
 await f.login(null,'service_role');assert.equal((await f.rpc('admin_deploy_claim',[request,ids.admin])).send,true);assert.equal((await f.rpc('admin_deploy_claim',[request,ids.admin])).replay,true);
 assert.equal((await f.rpc('admin_deploy_claim',['40000000-0000-4000-8000-000000000002',ids.admin])).send,false);
 await f.rpc('admin_deploy_finish',[request,'accepted']);await f.rpc('admin_deploy_finish',[request,'unknown']);
 await f.login(ids.admin);assert.equal((await f.rpc('admin_deploy_status')).latest.state,'accepted');await assert.rejects(()=>f.db.query('select * from private.admin_deploy_requests'));
 }finally{await f.db.close();}
});
