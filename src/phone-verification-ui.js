import {PhoneVerificationProvider} from './phone-verification.js';
import {pendingAction} from './member-access.js';
export async function renderPhoneVerification({client,config,root}){
 const provider=new PhoneVerificationProvider(client,config);const state=await provider.getStatus();
 const text=value=>{const p=document.createElement('p');p.textContent=value;root.append(p);return p;};
 const link=(label,url)=>{const a=document.createElement('a');a.textContent=label;a.href=url;a.className='btn';root.append(a);};
 if(state.verified){text('휴대전화 확인을 마쳤어요.');link('예약 이어가기',pendingAction());return;}
 text('예약 안내와 전문가 연락에 사용됩니다.');
 if(!state.enabled){text('휴대전화 인증 연결을 준비 중이에요. 인증이 열리면 예약을 이어갈 수 있어요.');link('지도 둘러보기','/map.html');return;}
 const form=document.createElement('form');root.append(form);const field=(label,name,type)=>{const l=document.createElement('label');l.textContent=label;const input=document.createElement('input');input.name=name;input.type=type;input.required=true;l.append(input);form.append(l);return input;};
 const phone=field('휴대전화 번호','phone','tel');phone.autocomplete='tel';phone.placeholder='01012345678';
 const token=field('인증번호 6자리','code','text');token.inputMode='numeric';token.autocomplete='one-time-code';token.maxLength=6;token.required=false;token.parentElement.hidden=true;
 const send=document.createElement('button');send.type='button';send.textContent='인증번호 받기';form.append(send);const verify=document.createElement('button');verify.textContent='확인';verify.hidden=true;form.append(verify);const status=text('');status.setAttribute('role','status');
 const run=async fn=>{send.disabled=verify.disabled=true;try{await fn();}catch(e){status.textContent=e.message==='otp_cooldown'?'1분 후 다시 받을 수 있어요.':e.message==='otp_expired'?'인증번호를 다시 받아 주세요.':'번호와 인증번호를 확인해 주세요. 잠시 후 다시 시도할 수 있어요.';}finally{send.disabled=verify.disabled=false;}};
 send.onclick=()=>run(async()=>{const digits=phone.value.replace(/\D/g,'');await provider.sendOtp(digits.startsWith('82')?'+'+digits:'+82'+digits.replace(/^0/,''));token.parentElement.hidden=false;token.required=true;verify.hidden=false;send.textContent='인증번호 다시 받기';status.textContent='5분 안에 입력해 주세요. 재발송은 1분 후 가능합니다.';});
 form.onsubmit=e=>{e.preventDefault();run(async()=>{const result=await provider.verifyOtp(token.value);token.value='';if(result.verified)location.assign(pendingAction());else status.textContent='인증 상태를 확인하지 못했습니다. 다시 확인해 주세요.';});};
}
