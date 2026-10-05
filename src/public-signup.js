import {trackEvent,accountReturn,pendingAction} from './member-access.js';
import {configureSocialAuth} from './social-auth.js';
export const PRODUCTION_ORIGIN='https://bohumso.netlify.app';
const intentKey='bohumso-public-consent-intent';
export async function finishPublicSignup(client){
 let intent;try{intent=JSON.parse(sessionStorage.getItem(intentKey)||'null');}catch{return false;}
 if(!intent||Date.now()-intent.at>86400000)return false;
 const {data}=await client.auth.getUser();if(!data.user?.email_confirmed_at||data.user.email?.toLowerCase()!==intent.email)return false;
 const {error}=await client.rpc('complete_membership',{terms_accepted:true,privacy_accepted:true,age_accepted:true,marketing_accepted:intent.marketing});
 if(error)throw error;trackEvent('signup_completed');sessionStorage.removeItem(intentKey);return true;
}
export async function renderPublicSignup({client,config,root,message}){
 document.querySelector('h1').textContent='상담을 이어가려면 가입해주세요.';
 root.innerHTML=`<section class="card auth-card public-signup"><div class="social-auth"><button id="googleSignup" type="button" class="btn">Google로 시작하기</button><button id="kakaoSignup" type="button" class="btn secondary" data-coming-soon="true" disabled>카카오 · 준비중</button></div><p class="auth-divider">또는 이메일로 가입</p><form id="publicSignupForm"><label class="field">이메일<input name="email" type="email" autocomplete="email" required maxlength="254"></label><label class="field">비밀번호<input name="password" type="password" autocomplete="new-password" minlength="10" maxlength="128" required placeholder="10자 이상"></label><label class="consent-row"><input type="checkbox" name="age" required>만 14세 이상입니다 (필수)</label><label class="consent-row"><input type="checkbox" name="terms" required><a href="/terms.html" target="_blank" rel="noopener">이용약관</a> 동의 (필수)</label><label class="consent-row"><input type="checkbox" name="privacy" required><a href="/privacy.html" target="_blank" rel="noopener">개인정보 수집·이용</a> 동의 (필수)</label><label class="consent-row"><input type="checkbox" name="marketing">마케팅 안내 수신 (선택)</label><button class="btn" type="submit">이메일로 가입하기</button></form><p>이미 가입하셨나요? <a id="publicLoginLink">이메일 로그인</a></p><p id="signupProgress" role="status" aria-live="polite"></p></section>`;
 root.querySelector('#publicLoginLink').href='/login.html?next='+encodeURIComponent(pendingAction());
 const progress=root.querySelector('#signupProgress');
 if(!config.signupEnabled){root.querySelectorAll('button,input').forEach(e=>e.disabled=true);progress.textContent='현재 신규 가입 연결을 준비 중입니다. 기존 회원은 로그인할 수 있습니다.';return;}
 // Begin authentication on the canonical origin so PKCE storage and callback share an origin.
 const canonical=()=>{if(location.origin===PRODUCTION_ORIGIN)return true;location.assign(PRODUCTION_ORIGIN+'/signup.html?next='+encodeURIComponent(pendingAction()));return false;};
 root.querySelector('#googleSignup').onclick=async()=>{if(!canonical())return;const b=root.querySelector('#googleSignup');b.disabled=true;const {error}=await client.auth.signInWithOAuth({provider:'google',options:{redirectTo:PRODUCTION_ORIGIN+accountReturn()}});if(error){trackEvent('google_auth_failed');message('Google 연결을 확인하지 못했습니다. 다시 시도해 주세요.');b.disabled=false;}};
 void configureSocialAuth(config,'signup');
 root.querySelector('form').onsubmit=async event=>{event.preventDefault();const form=event.currentTarget;if(!form.reportValidity()||!canonical())return;const button=form.querySelector('button');button.disabled=true;const data=new FormData(form),email=String(data.get('email')).trim().toLowerCase();try{
 trackEvent('signup_started');sessionStorage.setItem(intentKey,JSON.stringify({email,marketing:data.has('marketing'),at:Date.now()}));
 const {data:result,error}=await client.auth.signUp({email,password:String(data.get('password')),options:{emailRedirectTo:PRODUCTION_ORIGIN+accountReturn()}});
 if(error)throw error;
 form.elements.password.value='';
 if(result.session){await finishPublicSignup(client);location.assign(accountReturn());return;}
 progress.textContent='받은 메일에서 가입 완료를 눌러주세요. 이 브라우저에서 열면 선택한 화면으로 이어집니다.';
 }catch{trackEvent('email_auth_failed');progress.textContent='가입 요청을 완료하지 못했습니다. 이메일과 비밀번호를 확인하거나 잠시 후 다시 시도해 주세요.';}finally{button.disabled=false;}};
}
