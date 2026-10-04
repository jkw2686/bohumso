import test from 'node:test';import assert from 'node:assert/strict';import {PhoneVerificationProvider} from '../src/phone-verification.js';
test('phone provider fails closed before SMS contract, throttles duplicate sends and caps attempts',async()=>{
 let calls=0,now=100000,verified=false;const client={auth:{updateUser:async()=>{calls++;return {};},verifyOtp:async()=>({error:Error('wrong code')}),getUser:async()=>({data:{user:{phone_confirmed_at:verified?new Date():null}}})}};
 const off=new PhoneVerificationProvider(client,{phoneVerificationEnabled:false},()=>now);await assert.rejects(off.sendOtp('+821000000000'),/disabled/);assert.equal(calls,0);
 const on=new PhoneVerificationProvider(client,{phoneVerificationEnabled:true},()=>now);await on.sendOtp('+821000000000');await assert.rejects(on.resendOtp(),/cooldown/);assert.equal(calls,1);
 for(let i=0;i<5;i++)await assert.rejects(on.verifyOtp('000000'),/wrong code/);await assert.rejects(on.verifyOtp('000000'),/expired/);now+=60001;await on.resendOtp();assert.equal(calls,2);assert.equal((await on.getStatus()).verified,false);
});
