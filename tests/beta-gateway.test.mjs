import test from 'node:test';import assert from 'node:assert/strict';import handler from '../netlify/functions/beta-join.mts';
test('beta gateway requires origin and verified session; forwards trusted IP and never exposes its secret',async()=>{
 const before=globalThis.Netlify,native=globalThis.fetch;const env={CLOSED_BETA:'true',BETA_GATEWAY_SECRET:'test-gateway-secret-'.repeat(4),SUPABASE_URL:'https://db.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fixture'};globalThis.Netlify={env:{get:k=>env[k]}};const calls=[];let validUser=true;
 globalThis.fetch=async(input,options={})=>{const url=String(input);calls.push({url,options});if(url.endsWith('/auth/v1/user'))return Response.json(validUser?{id:'00000000-0000-4000-8000-000000000001'}:{message:'invalid'},{status:validUser?200:401});if(url.endsWith('/rpc/beta_join'))return Response.json({member:true,beta:true});throw Error('unexpected call');};
 const body={code:'a'.repeat(64),ageAccepted:true,termsVersion:'2026-10-05-beta-v1',privacyVersion:'2026-10-05-beta-v1',ipAddress:'1.1.1.1'};
 const request=(token=true,origin='https://site.test',value=body)=>new Request('https://site.test/api/beta/join',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','User-Agent':'Browser evidence',...(token?{Authorization:'Bearer fixture'}:{}),'x-beta-ip':'1.1.1.1'},body:JSON.stringify(value)});
 try{
  assert.equal((await handler(request(false),{ip:'192.0.2.50'})).status,401);assert.equal(calls.length,0);
  assert.equal((await handler(request(true,'https://evil.test'),{ip:'192.0.2.50'})).status,403);assert.equal(calls.length,0);
  assert.equal((await handler(request(true,undefined,{...body,ageAccepted:false}),{ip:'192.0.2.50'})).status,400);
  validUser=false;assert.equal((await handler(request(),{ip:'192.0.2.50'})).status,401);assert.equal(calls.filter(c=>c.url.endsWith('/rpc/beta_join')).length,0);
  validUser=true;const response=await handler(request(),{ip:'192.0.2.50'});assert.equal(response.status,200);assert.ok(!(await response.text()).includes(env.BETA_GATEWAY_SECRET));const sent=calls.find(c=>c.url.endsWith('/rpc/beta_join'));const headers=new Headers(sent.options.headers);assert.equal(headers.get('x-beta-ip'),'192.0.2.50');assert.equal(headers.get('x-beta-user-agent'),'Browser%20evidence');assert.equal(headers.get('x-beta-gateway'),env.BETA_GATEWAY_SECRET);assert.equal(JSON.parse(sent.options.body).ipAddress,undefined);
  env.CLOSED_BETA='false';assert.equal((await handler(request(),{ip:'192.0.2.50'})).status,503);
 }finally{globalThis.Netlify=before;globalThis.fetch=native;}
});
