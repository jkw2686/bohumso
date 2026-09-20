import test from 'node:test';import assert from 'node:assert/strict';import {build} from 'esbuild';
const built=await build({entryPoints:['netlify/functions/naver-userinfo.mts'],bundle:true,platform:'node',format:'esm',write:false});
const {default:handler}=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'));
test('NAVER userinfo stays disabled by default, validates tokens and never asserts unverified identity',async()=>{
 const originalFetch=globalThis.fetch,originalNetlify=globalThis.Netlify;let enabled=false,calls=0;
 globalThis.Netlify={env:{get:()=>enabled?'true':'false'}};
 globalThis.fetch=async(url,options)=>{calls++;assert.equal(url,'https://openapi.naver.com/v1/nid/me');assert.equal(options.headers.Authorization,'Bearer fixture-token');assert.equal(options.redirect,'error');return Response.json({resultcode:'00',response:{id:'naver-subject',email:'fixture@example.test',name:'PRIVATE',mobile:'PRIVATE',birthyear:'PRIVATE'}})};
 try{
  assert.equal((await handler(new Request('https://site.test/api/auth/naver/userinfo'))).status,503);assert.equal(calls,0);enabled=true;
  assert.equal((await handler(new Request('https://site.test/api/auth/naver/userinfo?access_token=fixture-token'))).status,401);assert.equal(calls,0);
  const response=await handler(new Request('https://site.test/api/auth/naver/userinfo',{headers:{Authorization:'Bearer fixture-token'}}));
  assert.equal(response.headers.get('cache-control'),'no-store');assert.deepEqual(await response.json(),{sub:'naver-subject',email:'fixture@example.test',email_verified:false});
  globalThis.fetch=async()=>Response.json({resultcode:'00',response:{email:'fixture@example.test'}});assert.equal((await handler(new Request('https://site.test/api/auth/naver/userinfo',{headers:{Authorization:'Bearer fixture-token'}}))).status,422);
  globalThis.fetch=async()=>{throw Error('secret-token-should-not-leak')};const failure=await handler(new Request('https://site.test/api/auth/naver/userinfo',{headers:{Authorization:'Bearer fixture-token'}}));assert.equal(failure.status,502);assert.ok(!(await failure.text()).includes('secret-token'));
 }finally{globalThis.fetch=originalFetch;globalThis.Netlify=originalNetlify;}
});
