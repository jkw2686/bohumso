import test from 'node:test';import assert from 'node:assert/strict';import handler from '../netlify/functions/public-config.mjs';
test('only successful anonymous public settings get a short CDN TTL; browsers and failures stay no-store',async()=>{
 const env={...process.env},fetch=globalThis.fetch;try{
 Object.assign(process.env,{ACCOUNTS_ENABLED:'true',OPERATOR_NAME:'Fixture',PRIVACY_CONTACT:'fixture@example.test',SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fixture'});
 globalThis.fetch=async(_url,options)=>{assert.equal(options.headers.Authorization,undefined);return Response.json({serviceStage:'PRODUCTION',signupEnabled:true,policiesApproved:true,user_id:'never-public-user',admin:true,phoneVerified:true});};
 const success=await handler();assert.equal(success.headers.get('cache-control'),'no-store');assert.equal(success.headers.get('netlify-cdn-cache-control'),'public, durable, max-age=10');const body=await success.json();assert.equal(body.enabled,true);for(const field of ['admin','user_id','phoneVerified'])assert.equal(field in body,false);
 globalThis.fetch=async()=>{throw Error('unavailable')};const failed=await handler();assert.equal((await failed.json()).enabled,false);assert.equal(failed.headers.get('netlify-cdn-cache-control'),null);assert.equal(failed.headers.get('cache-control'),'no-store');
 process.env.ACCOUNTS_ENABLED='false';const disabled=await handler();assert.equal(disabled.headers.get('netlify-cdn-cache-control'),null);
 }finally{globalThis.fetch=fetch;for(const key of Object.keys(process.env))if(!(key in env))delete process.env[key];Object.assign(process.env,env);}
});
