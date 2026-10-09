import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import handler from '../netlify/functions/send-sms-hook.mts';

test('signed SMS hooks deliver to the pending phone, never the old phone', async () => {
  const names = ['SEND_SMS_HOOK_SECRET','SOLAPI_API_KEY','SOLAPI_API_SECRET','SOLAPI_SENDER_NUMBER'];
  const previous = Object.fromEntries(names.map(name => [name,process.env[name]]));
  const originalFetch = globalThis.fetch;
  const key = Buffer.from('local-test-only-hook-secret');
  Object.assign(process.env, {SEND_SMS_HOOK_SECRET:'v1,whsec_'+key.toString('base64'),SOLAPI_API_KEY:'test-key',SOLAPI_API_SECRET:'test-secret',SOLAPI_SENDER_NUMBER:'01000000000'});
  const sent=[];
  globalThis.fetch=async (url,options)=>{assert.equal(url,'https://api.solapi.com/messages/v4/send');sent.push(JSON.parse(options.body).message);return new Response('{}',{status:200});};
  const request=(payload,valid=true)=>{
    const body=JSON.stringify(payload),id='test-event',timestamp=String(Math.floor(Date.now()/1000));
    const signature=crypto.createHmac('sha256',key).update(`${id}.${timestamp}.${body}`).digest('base64');
    return new Request('https://example.test/api/auth/send-sms',{method:'POST',headers:{'webhook-id':id,'webhook-timestamp':timestamp,'webhook-signature':'v1,'+(valid?signature:'invalid')},body});
  };
  try {
    for(const payload of [
      {user:{phone:'',new_phone:'821000000001'},sms:{otp:'123456'}},
      {user:{phone:'821000000099',new_phone:'821000000001'},sms:{otp:'123456'}},
      {user:{phone:'821000000099',new_phone:'821000000098'},sms:{phone:'+821000000001',otp:'123456'}},
      {user:{phone:'+821000000001'},sms:{otp:'123456'}}
    ]) {assert.equal((await handler(request(payload))).status,200);assert.equal(sent.at(-1).to,'01000000001');}
    assert.equal((await handler(request({user:{new_phone:'821000000001'},sms:{otp:'123456'}},false))).status,401);
    assert.equal((await handler(request({user:{phone:''},sms:{otp:'123456'}}))).status,400);
    assert.equal(sent.length,4);
    globalThis.fetch=async()=>new Response('{}',{status:403});
    assert.equal((await handler(request({user:{new_phone:'821000000001'},sms:{otp:'123456'}}))).status,500);
  } finally {
    globalThis.fetch=originalFetch;
    for(const name of names){if(previous[name]===undefined)delete process.env[name];else process.env[name]=previous[name];}
  }
});
