import {normalizeKoreanPhone} from './phone-number.js';
import {accountReturn} from './member-access.js';

// Anonymous sign-in uses sms; changing a signed-in member's number stays separate.
export class PhoneSignIn {
 constructor(client,config,now=()=>Date.now()){this.client=client;this.config=config;this.now=now;this.phone='';this.sentAt=null;this.busy=false;}
 async send(value){
  const phone=normalizeKoreanPhone(value);
  if(!this.config.phoneVerificationEnabled||!this.config.phoneSignupEnabled)throw Error('phone_disabled');
  if(!/^\+8210\d{8}$/.test(phone))throw Error('invalid_phone');
  if(this.busy||this.sentAt!==null&&this.now()-this.sentAt<60000)throw Error('otp_cooldown');
  this.busy=true;
  try{const {error}=await this.client.auth.signInWithOtp({phone,options:{shouldCreateUser:this.config.signupEnabled===true}});if(error)throw error;this.phone=phone;this.sentAt=this.now();}finally{this.busy=false;}
 }
 async verify(token){
  if(this.busy||!this.phone||this.sentAt===null)throw Error('send_first');
  if(!/^\d{6}$/.test(token))throw Error('invalid_otp');
  this.busy=true;
  try{const {data,error}=await this.client.auth.verifyOtp({phone:this.phone,token,type:'sms'});if(error)throw error;
   if(!data?.session||!data.user?.phone_confirmed_at||normalizeKoreanPhone(data.user.phone)!==this.phone)throw Error('verification_incomplete');
   return data.user;
  }finally{this.busy=false;}
 }
}

export function bindPhoneAuth({client,config,root,onDone=()=>location.assign(accountReturn())}){
 const trigger=root.querySelector('[data-phone-auth]');if(!trigger)return;
 const panel=root.querySelector('[data-phone-panel]');
 trigger.disabled=config.phoneVerificationEnabled!==true||config.phoneSignupEnabled!==true;
 if(trigger.disabled){trigger.querySelector('.auth-method-label').textContent='휴대전화 연결 확인 중';return;}
 const provider=new PhoneSignIn(client,config);let timer;
 trigger.onclick=()=>{
  if(!panel.hidden){panel.hidden=true;trigger.setAttribute('aria-expanded','false');return;}
  panel.hidden=false;trigger.setAttribute('aria-expanded','true');
  if(panel.childElementCount){panel.querySelector('input').focus();return;}
  panel.innerHTML=`<h2>휴대전화로 시작하기</h2><p class="auth-help">비밀번호 없이 문자 인증으로 이용하세요. 처음이라면 인증 후 약관 동의로 가입을 마칩니다.</p><form class="phone-verification-form" novalidate><label class="field">휴대전화 번호<input name="phone" type="tel" inputmode="tel" autocomplete="tel-national" placeholder="010-0000-0000" required aria-describedby="phoneAuthStatus"></label><button class="btn" type="button" data-send>인증번호 받기</button><label class="field">인증번호 6자리<input name="code" type="text" inputmode="numeric" autocomplete="one-time-code" placeholder="문자로 받은 숫자 6자리" maxlength="6" required disabled aria-describedby="phoneAuthStatus"></label><button class="btn" type="submit" disabled>인증하고 계속하기</button><p id="phoneAuthStatus" role="status" aria-live="polite">휴대전화 번호를 입력해 주세요.</p></form>`;
  const form=panel.querySelector('form'),phone=form.elements.phone,code=form.elements.code,send=form.querySelector('[data-send]'),verify=form.querySelector('[type=submit]'),status=form.querySelector('[role=status]');let busy=false,completed=false;
  const sync=()=>{const seconds=provider.sentAt===null?0:Math.max(0,60-Math.floor((Date.now()-provider.sentAt)/1000));phone.disabled=busy||completed;send.disabled=busy||completed||seconds>0;code.disabled=busy||completed||provider.sentAt===null;verify.disabled=busy||completed||!/^\d{6}$/.test(code.value);send.textContent=provider.sentAt===null?'인증번호 받기':seconds?'재발송 ('+seconds+'초)':'인증번호 다시 받기';};
  const errors={invalid_phone:'010으로 시작하는 휴대전화 번호 11자리를 입력해 주세요.',otp_cooldown:'잠시 후 인증번호를 다시 요청해 주세요.',invalid_otp:'인증번호 6자리를 확인해 주세요.',otp_expired:'인증번호가 맞지 않거나 만료됐습니다. 다시 확인하거나 새 번호를 받아주세요.',over_sms_send_rate_limit:'요청이 많습니다. 잠시 후 다시 시도해 주세요.',over_request_rate_limit:'요청이 많습니다. 잠시 후 다시 시도해 주세요.',sms_send_failed:'문자를 보내지 못했습니다. 잠시 후 다시 시도해 주세요.',phone_disabled:'휴대전화 인증 연결을 확인해 주세요.',send_first:'먼저 인증번호를 받아주세요.',verification_incomplete:'인증 결과를 확인하지 못했습니다. 다시 시도해 주세요.'};
  const run=async fn=>{if(busy||completed)return;busy=true;sync();try{await fn();}catch(e){status.textContent=errors[e.code]||errors[e.message]||'인증 요청을 완료하지 못했습니다. 번호와 연결 상태를 확인한 뒤 다시 시도해 주세요.';}finally{busy=false;sync();}};
  send.onclick=()=>run(async()=>{await provider.send(phone.value);code.value='';code.disabled=false;status.textContent='문자를 보냈습니다. 받은 인증번호 6자리를 입력해 주세요.';code.focus();});
  phone.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();send.click();}};
  phone.oninput=()=>{if(provider.phone&&normalizeKoreanPhone(phone.value)!==provider.phone){code.value='';status.textContent='번호를 변경했습니다. 새 번호로 인증번호를 다시 받아주세요.';}sync();};
  code.oninput=sync;
  form.onsubmit=e=>{e.preventDefault();void run(async()=>{if(normalizeKoreanPhone(phone.value)!==provider.phone)throw Error('send_first');await provider.verify(code.value);completed=true;code.value='';status.textContent='휴대전화 인증 완료. 다음 화면으로 이동합니다.';clearInterval(timer);await onDone();});};
  timer=setInterval(()=>{if(!panel.isConnected){clearInterval(timer);return;}sync();},1000);window.addEventListener('pagehide',()=>clearInterval(timer),{once:true});phone.focus();
 };
}
