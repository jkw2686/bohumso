import test from 'node:test';import assert from 'node:assert/strict';
import {PhoneSignIn} from '../src/phone-auth.js';
test('phone entry requires real sms verification, preserves cooldown and does not use phone_change',async()=>{
 let now=0,sends=0,last,verificationError=true;
 const config={phoneSignupEnabled:true,phoneVerificationEnabled:true,signupEnabled:true};
 const client={auth:{signInWithOtp:async value=>{sends++;last=value;return {};},verifyOtp:async value=>{last=value;return verificationError?{error:{code:'otp_expired'}}:{data:{session:{},user:{phone:'821000000000',phone_confirmed_at:'confirmed'}}};}}};
 const p=new PhoneSignIn(client,config,()=>now);
 await assert.rejects(p.send('123'),/invalid_phone/);assert.equal(sends,0);
 await p.send('010-0000-0000');assert.deepEqual(last,{phone:'+821000000000',options:{shouldCreateUser:true}});
 await assert.rejects(p.send('01000000000'),/otp_cooldown/);assert.equal(sends,1);
 await assert.rejects(p.verify('123'),/invalid_otp/);
 await assert.rejects(p.verify('000000'),e=>e.code==='otp_expired');assert.equal(last.type,'sms');
 verificationError=false;assert.ok((await p.verify('123456')).phone_confirmed_at);
 now=61000;config.signupEnabled=false;await p.send('01000000000');assert.equal(last.options.shouldCreateUser,false);
 config.phoneSignupEnabled=false;await assert.rejects(p.send('01000000000'),/phone_disabled/);
});
