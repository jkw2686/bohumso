// Phone contact verification never changes the Google/email Auth identity.
export class PhoneVerificationProvider {
 constructor(client,config,now=()=>Date.now(),fetcher=(...args)=>fetch(...args)){Object.assign(this,{client,config,now,fetcher,sentAt:null,phone:'',busy:false});}
 async call(action,body={}){const {data}=await this.client.auth.getSession();if(!data.session)throw Error('login_required');const response=await this.fetcher('/api/phone/'+action,{method:'POST',headers:{Authorization:'Bearer '+data.session.access_token,'Content-Type':'application/json'},body:JSON.stringify(body)});const result=await response.json();if(!response.ok||result.error)throw Object.assign(Error(result.error||'sms_unavailable'),{retryAfter:result.retryAfter});return result;}
 async getStatus(){const {data,error}=await this.client.rpc('my_phone_status');if(error)return {verified:false,enabled:this.config.phoneVerificationEnabled===true};return {...data,enabled:this.config.phoneVerificationEnabled===true};}
 async sendOtp(phone){if(!this.config.phoneVerificationEnabled)throw Error('phone_provider_disabled');if(this.busy||this.sentAt!==null&&this.now()-this.sentAt<30000)throw Error('otp_cooldown');this.busy=true;try{const result=await this.call(this.sentAt===null?'send-otp':'resend-otp',{phone});this.phone=phone;this.sentAt=this.now();return result;}finally{this.busy=false;}}
 resendOtp(){return this.sendOtp(this.phone);}
 async verifyOtp(otp){if(!this.config.phoneVerificationEnabled)throw Error('phone_provider_disabled');if(this.busy||!this.phone)throw Error('otp_expired');this.busy=true;try{return await this.call('verify-otp',{phone:this.phone,otp});}finally{this.busy=false;}}
}
