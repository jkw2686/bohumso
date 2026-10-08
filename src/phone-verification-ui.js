import {PhoneVerificationProvider} from './phone-verification.js';
import {pendingAction} from './member-access.js';
export async function renderPhoneVerification({client,config,root,change=false,onVerified}){
 const provider=new PhoneVerificationProvider(client,config);const state=await provider.getStatus();
 const text=value=>{const p=document.createElement('p');p.textContent=value;root.append(p);return p;};
 const link=(label,url)=>{const a=document.createElement('a');a.textContent=label;a.href=url;a.className='btn';root.append(a);};
 if(state.verified&&!change){if(onVerified){onVerified();return;}text('휴대전화 확인을 마쳤어요.');link('예약 이어가기',pendingAction());const changeButton=document.createElement('button');changeButton.textContent='전화번호 변경';changeButton.onclick=()=>{root.replaceChildren();void renderPhoneVerification({client,config,root,change:true});};root.append(changeButton);return;}
 text('예약 안내와 전문가 연락을 위해 사용됩니다.');
 if(!state.enabled){text('휴대전화 인증 연결을 준비 중이에요. 인증이 열리면 예약을 이어갈 수 있어요.');link('지도 둘러보기','/map.html');return;}
 const form=document.createElement('form');form.className='phone-verification-form';root.append(form);const field=(label,name,type)=>{const l=document.createElement('label');l.textContent=label;const input=document.createElement('input');input.name=name;input.type=type;input.required=true;l.append(input);form.append(l);return input;};
 const phone=field('휴대전화 번호','phone','tel');phone.autocomplete='tel';phone.placeholder='010-0000-0000';
 const token=field('인증번호 6자리','code','text');token.inputMode='numeric';token.autocomplete='one-time-code';token.maxLength=6;token.required=false;token.parentElement.hidden=true;
 const send=document.createElement('button');send.type='button';send.className='btn';send.textContent='인증번호 받기';form.insertBefore(send,token.parentElement);const verify=document.createElement('button');verify.className='btn';verify.textContent='인증 완료하기';verify.hidden=true;form.append(verify);const status=text('휴대전화 번호 입력 → 인증번호 받기 → 6자리 입력');status.setAttribute('role','status');
 const errors={otp_cooldown:'잠시 후 다시 요청해주세요.',otp_rate_limit:'잠시 후 다시 인증해주세요.',otp_expired:'인증번호가 만료됐어요. 새 인증번호를 받아주세요.',otp_locked:'인증 시도 횟수를 초과했어요. 새 인증번호를 받아주세요.',invalid_otp:'인증번호가 맞지 않습니다.',invalid_phone:'휴대전화 번호를 확인해주세요.',phone_not_available:'현재 이 번호의 인증을 준비 중이에요.',sms_unavailable:'문자를 보내지 못했어요. 잠시 후 다시 시도해주세요.'};
 let busy=false;const tick=()=>{const left=provider.sentAt===null?0:Math.max(0,(provider.cooldownSeconds||30)-Math.floor((Date.now()-provider.sentAt)/1000));send.disabled=busy||left>0;verify.disabled=busy;send.textContent=provider.sentAt===null?'인증번호 받기':left?'인증번호 재발송 ('+left+')':'인증번호 재발송';};
 const timer=setInterval(()=>{if(!form.isConnected){clearInterval(timer);return;}tick();},500);window.addEventListener('pagehide',()=>clearInterval(timer),{once:true});
 const run=async fn=>{if(busy)return;busy=true;tick();try{await fn();}catch(e){status.textContent=errors[e.message]||'연결을 확인한 뒤 다시 시도해주세요.';}finally{busy=false;tick();}};
 send.onclick=()=>run(async()=>{await provider.sendOtp(phone.value);token.parentElement.hidden=false;token.required=true;verify.hidden=false;token.value='';status.textContent='문자로 받은 인증번호를 입력해주세요. 인증번호는 '+(provider.expiryMinutes||3)+'분 동안 유효합니다.';token.focus();});
 form.onsubmit=e=>{e.preventDefault();if(token.parentElement.hidden){send.click();return;}run(async()=>{const result=await provider.verifyOtp(token.value);token.value='';if(result.verified){status.textContent='휴대전화 인증이 완료됐어요.';clearInterval(timer);if(onVerified)onVerified();else location.assign(pendingAction());}});};
}
