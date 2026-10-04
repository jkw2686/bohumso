// Supabase Auth owns OTP generation, expiry, rate limits and audit history.
// This client never stores OTPs. Test mode is disabled, not a fake verification bypass.
export class PhoneVerificationProvider {
 constructor(client,config,now=()=>Date.now()){this.client=client;this.config=config;this.now=now;this.sentAt=0;this.attempts=0;this.busy=false;this.phone='';}
 async getStatus(){const {data,error}=await this.client.auth.getUser();if(error)throw error;return {verified:Boolean(data.user?.phone_confirmed_at),enabled:this.config.phoneVerificationEnabled===true};}
 async sendOtp(phone){
  if(!this.config.phoneVerificationEnabled)throw Error('phone_provider_disabled');
  if(this.busy||this.now()-this.sentAt<60000)throw Error('otp_cooldown');
  if(!/^\+82\d{9,10}$/.test(phone))throw Error('invalid_phone');
  this.busy=true;try{const {error}=await this.client.auth.updateUser({phone});if(error)throw error;this.phone=phone;this.sentAt=this.now();this.attempts=0;}finally{this.busy=false;}
 }
 resendOtp(){return this.sendOtp(this.phone);}
 async verifyOtp(token){
  if(!this.config.phoneVerificationEnabled)throw Error('phone_provider_disabled');
  if(this.busy||!this.phone||this.attempts>=5||this.now()-this.sentAt>300000)throw Error('otp_expired');
  if(!/^\d{6}$/.test(token))throw Error('invalid_otp');
  this.busy=true;this.attempts++;try{const {error}=await this.client.auth.verifyOtp({phone:this.phone,token,type:'phone_change'});if(error)throw error;return this.getStatus();}finally{this.busy=false;}
 }
}
