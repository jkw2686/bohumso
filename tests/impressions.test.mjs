import {test} from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
import {impressionToken,verifyImpressionToken} from '../netlify/functions/_shared/impressions.mjs';
import ads from '../artifacts/functions/ads.js';
test('Signed impressions reject tampering, wrong secrets and expiry without exposing signing material',()=>{
 const secret='fixture-only-signing-secret-32-characters',id=randomUUID(),now=1000000,token=impressionToken(secret,id,now);
 assert.equal(verifyImpressionToken(secret,token,now).subscriptionId,id);
 assert.ok(!token.includes(secret));
 assert.throws(()=>verifyImpressionToken('different',token,now));
 assert.throws(()=>verifyImpressionToken(secret,token+'.extra',now));
 assert.throws(()=>verifyImpressionToken(secret,token,now+600000));
 const [body,sig]=token.split('.');const changed=Buffer.from(JSON.stringify({...JSON.parse(Buffer.from(body,'base64url')),subscriptionId:randomUUID()})).toString('base64url');
 assert.throws(()=>verifyImpressionToken(secret,changed+'.'+sig,now));
});
test('Advertising collection stays off by default; forged reports and cross-origin posts never reach DB',async()=>{
 const before=globalThis.Netlify,oldFetch=globalThis.fetch;let calls=0;const values={};
 globalThis.Netlify={env:{get:k=>values[k]}};globalThis.fetch=async()=>{calls++;throw Error('unexpected_network');};
 try{
 assert.equal((await (await ads(new Request('http://localhost:3100/api/ads'))).json()).enabled,false);
 Object.assign(values,{AD_EXPOSURE_ENABLED:'true',AD_IMPRESSION_SECRET:'fixture-only-signing-secret-32-characters',SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'fixture-only',APP_ORIGIN:'http://localhost:3100'});
 const req=origin=>new Request('http://localhost:3100/api/ads',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({token:'forged'})});
 assert.equal((await ads(req('https://untrusted.example'))).status,403);
 assert.equal((await ads(req('http://localhost:3100'))).status,400);assert.equal(calls,0);
 }finally{globalThis.Netlify=before;globalThis.fetch=oldFetch;}
});
