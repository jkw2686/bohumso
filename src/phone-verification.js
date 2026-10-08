// Supabase Auth owns OTP generation, expiry, rate limits and audit history.
// This client never stores OTPs. Test mode is disabled, not a fake verification bypass.
export class PhoneVerificationProvider {
 constructor(client,config,now=()=>Date.now()){this.client=client;this.config=config;this.now=now;this.sentAt=null;this.cooldownSeconds=60;this.expiryMinutes=5;this.attempts=0;this.busy=false;this.phone='';}
 async getStatus(){if(this.client.rpc){const result=await this.client.rpc('my_phone_status');if(!result.error&&typeof result.data?.verified==='boolean')return {...result.data,enabled:this.config.phoneVerificationEnabled===true};}const {data,error}=await this.client.auth.getUser();if(error)throw error;return {verified:Boolean(data.user?.phone_confirmed_at),enabled:this.config.phoneVerificationEnabled===true};}
 async sendOtp(phone){const digits=phone.replace(/\D/g,'');phone=digits.startsWith('82')?'+'+digits:'+82'+digits.replace(/^0/,'');
  if(!this.config.phoneVerificationEnabled)throw Error('phone_provider_disabled');
  if(this.busy||this.sentAt!==null&&this.now()-this.sentAt<60000)throw Error('otp_cooldown');
  if(!/^\+82\d{9,10}$/.test(phone))throw Error('invalid_phone');
  this.phone=phone;this.busy=true;try{const {error}=await this.client.auth.updateUser({phone});if(error)throw error;this.phone=phone;this.sentAt=this.now();this.attempts=0;}finally{this.busy=false;}
 }
 resendOtp(){return this.sendOtp(this.phone);}
 async verifyOtp(token,enteredPhone){if(!this.phone&&enteredPhone){const digits=enteredPhone.replace(/\D/g,'');this.phone=digits.startsWith('82')?'+'+digits:'+82'+digits.replace(/^0/,'');}
  if(!this.config.phoneVerificationEnabled)throw Error('phone_provider_disabled');
  if(this.busy||!this.phone||this.attempts>=5||this.sentAt!==null&&this.now()-this.sentAt>300000)throw Error('otp_expired');
  if(!/^\d{6}$/.test(token))throw Error('invalid_otp');
  this.busy=true;this.attempts++;try{const {error}=await this.client.auth.verifyOtp({phone:this.phone,token,type:'phone_change'});if(error)throw error;return this.getStatus();}finally{this.busy=false;}
 }
}