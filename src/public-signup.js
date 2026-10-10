import {trackEvent,accountReturn,pendingAction,rememberAction} from './member-access.js';
import {configureSocialAuth,authMethodsMarkup} from './social-auth.js';
import {bindPhoneAuth} from './phone-auth.js';
export const PRODUCTION_ORIGIN='https://bohumso.netlify.app';
const intentKey='bohumso-public-consent-intent';
export async function finishPublicSignup(client){
 let intent;try{intent=JSON.parse(localStorage.getItem(intentKey)||'null');}catch{return false;}
 if(!intent)return false;if(!Number.isFinite(intent.at)||Date.now()-intent.at>86400000){localStorage.removeItem(intentKey);return false;}
 const {data}=await client.auth.getUser();if(!data.user?.email_confirmed_at||data.user.email?.toLowerCase()!==intent.email)return false;
 const {error}=await client.rpc('complete_membership',{terms_accepted:true,privacy_accepted:true,age_accepted:true,marketing_accepted:intent.marketing});
 if(error)throw error;trackEvent('signup_completed');localStorage.removeItem(intentKey);return true;
}
export async function renderPublicSignup({client,config,root,message}){
 document.querySelector('h1').textContent='보험소에 오신 것을 환영합니다.';
 document.getElementById('accountNotice').textContent='가입 후 가까운 전문가를 찾고 예약·상담 내용을 안전하게 관리할 수 있습니다.';
 const expert=new URLSearchParams(location.search).get('roleIntent')==='expert'||pendingAction().startsWith('/partner.html');
 if(expert)rememberAction('/partner.html?roleIntent=expert');
 root.innerHTML=`<section class="card auth-card public-signup"><div class="signup-roles" aria-label="가입 목적"><button type="button" data-role="customer" aria-pressed="${!expert}">일반회원 가입</button><button type="button" data-role="expert" aria-pressed="${expert}">전문가 가입</button></div><p id="roleHelp">${expert?'가입 후 활동지역·전문분야를 등록하세요.':'무료로 가입하고 상담·예약을 이용하세요.'}</p>${authMethodsMarkup("signup")}<details class="email-auth"><summary>이메일로 가입하기</summary><form id="publicSignupForm" novalidate><label class="field">이메일<input name="email" aria-label="이메일" type="email" autocomplete="email" required maxlength="254" aria-describedby="emailError"><span class="field-error" id="emailError" hidden></span></label><label class="field">비밀번호<input name="password" aria-label="비밀번호" type="password" autocomplete="new-password" minlength="10" maxlength="128" required placeholder="10자 이상" aria-describedby="passwordHint passwordError"><small id="passwordHint">10자 이상 입력해주세요.</small><span class="field-error" id="passwordError" hidden></span></label><fieldset class="signup-consents"><legend>약관 동의</legend><label class="consent-row"><input type="checkbox" name="age" required><span>만 14세 이상입니다 (필수)</span></label><div class="consent-line"><label class="consent-row"><input type="checkbox" name="terms" required><span>이용약관 동의 (필수)</span></label><button type="button" data-policy="terms" aria-label="이용약관 보기">보기</button></div><div class="consent-line"><label class="consent-row"><input type="checkbox" name="privacy" required><span>개인정보 수집·이용 동의 (필수)</span></label><button type="button" data-policy="privacy" aria-label="개인정보 수집·이용 보기">보기</button></div><label class="consent-row"><input type="checkbox" name="marketing"><span>마케팅 안내 수신 (선택)</span></label></fieldset><button id="signupSubmit" class="btn" type="submit" disabled>이메일로 가입하기</button></form></details><p class="auth-help">이미 가입하셨나요? <a id="publicLoginLink">로그인</a></p><p id="signupProgress" role="status" aria-live="polite"></p><dialog class="policy-dialog" aria-labelledby="policyTitle"><header><strong id="policyTitle">약관</strong><button type="button" id="policyClose" aria-label="약관 닫기">닫기 ×</button></header><article class="policy-content" aria-live="polite"></article></dialog></section>`;
 const loginLink=root.querySelector('#publicLoginLink'),form=root.querySelector('#publicSignupForm'),submit=root.querySelector('#signupSubmit');
 const initialCustomerNext=expert?'/account.html':pendingAction();
 function setRole(isExpert){const next=rememberAction(isExpert?'/partner.html?roleIntent=expert':initialCustomerNext);const url=new URL(location.href);url.searchParams.set('next',next);if(isExpert)url.searchParams.set('roleIntent','expert');else url.searchParams.delete('roleIntent');history.replaceState(null,'',url);loginLink.href='/login.html?next='+encodeURIComponent(next);root.querySelectorAll('[data-role]').forEach(b=>b.setAttribute('aria-pressed',String((b.dataset.role==='expert')===isExpert)));root.querySelector('#roleHelp').textContent=isExpert?'가입 후 활동지역·전문분야를 등록하세요.':'무료로 가입하고 상담·예약을 이용하세요.';}
 setRole(expert);root.querySelectorAll('[data-role]').forEach(b=>b.onclick=()=>setRole(b.dataset.role==='expert'));
 const requiredConsents=()=>['age','terms','privacy'].every(key=>form.elements[key].checked);
 const syncSubmit=()=>{submit.disabled=form.dataset.busy==='true'||!requiredConsents();};form.addEventListener('change',syncSubmit);
 function validateField(input){const output=root.querySelector('#'+input.name+'Error'),valid=input.checkValidity();input.setAttribute('aria-invalid',String(!valid));output.hidden=valid;output.textContent=valid?'':input.name==='email'?'이메일 주소를 확인해주세요.':'비밀번호를 10자 이상 입력해주세요.';return valid;}
 for(const key of ['email','password']){const input=form.elements[key];input.addEventListener('blur',()=>{if(input.value)validateField(input);});input.addEventListener('input',()=>{if(input.getAttribute('aria-invalid')==='true')validateField(input);});}
 const dialog=root.querySelector('dialog');let policyRevision=0;root.querySelectorAll('[data-policy]').forEach(b=>b.onclick=async()=>{const revision=++policyRevision;root.querySelector('#policyTitle').textContent=b.dataset.policy==='terms'?'이용약관':'개인정보 수집·이용';const article=dialog.querySelector('article');article.textContent='내용을 불러오고 있습니다.';dialog.showModal();try{const response=await fetch('/'+b.dataset.policy+'.html');if(!response.ok)throw Error('policy_unavailable');const parsed=new DOMParser().parseFromString(await response.text(),'text/html'),main=parsed.querySelector('main');if(!main)throw Error('policy_unavailable');if(revision!==policyRevision)return;article.replaceChildren();for(const node of main.querySelectorAll('h1,h2,h3,p,li')){const item=document.createElement(node.matches('h1,h2,h3')?'h3':'p');item.textContent=(node.tagName==='LI'?'• ':'')+node.textContent;article.append(item);}}catch{article.textContent='약관을 불러오지 못했습니다. 닫은 뒤 다시 시도해주세요.';}});root.querySelector('#policyClose').onclick=()=>dialog.close();
 const progress=root.querySelector('#signupProgress');
 if(!config.signupEnabled){root.querySelectorAll('button,input').forEach(e=>e.disabled=true);progress.textContent='현재 신규 가입 연결을 준비 중입니다. 기존 회원은 로그인할 수 있습니다.';return;}
 // Begin authentication on the canonical origin so PKCE storage and callback share an origin.
 const canonical=()=>{if(location.origin===PRODUCTION_ORIGIN)return true;location.assign(PRODUCTION_ORIGIN+'/signup.html?next='+encodeURIComponent(pendingAction()));return false;};
 root.querySelector('#googleSignup').onclick=async()=>{if(!canonical())return;const b=root.querySelector('#googleSignup');b.disabled=true;const {error}=await client.auth.signInWithOAuth({provider:'google',options:{redirectTo:PRODUCTION_ORIGIN+accountReturn()}});if(error){trackEvent('google_auth_failed');message('Google 연결을 확인하지 못했습니다. 다시 시도해 주세요.');b.disabled=false;}};
 void configureSocialAuth(config,'signup');
 bindPhoneAuth({client,config,root});
 form.onsubmit=async event=>{event.preventDefault();const form=event.currentTarget;if(!validateField(form.elements.email)||!validateField(form.elements.password)||!requiredConsents()||form.dataset.busy==='true'||!canonical())return;const button=submit;form.dataset.busy='true';button.disabled=true;button.textContent='가입 처리 중…';const data=new FormData(form),email=String(data.get('email')).trim().toLowerCase();try{
 trackEvent('signup_started');localStorage.setItem(intentKey,JSON.stringify({email,marketing:data.has('marketing'),at:Date.now()}));
 const {data:result,error}=await client.auth.signUp({email,password:String(data.get('password')),options:{emailRedirectTo:PRODUCTION_ORIGIN+accountReturn()}});
 if(error)throw error;
 form.elements.password.value='';
 if(result.session){await finishPublicSignup(client);location.assign(accountReturn());return;}
 progress.textContent='받은 메일에서 가입 완료를 눌러주세요. 이 브라우저에서 열면 선택한 화면으로 이어집니다.';
 }catch{trackEvent('email_auth_failed');progress.textContent='가입 요청을 완료하지 못했습니다. 이메일과 비밀번호를 확인하거나 잠시 후 다시 시도해 주세요.';}finally{form.dataset.busy='false';button.textContent='이메일로 가입하기';syncSubmit();}};
}
