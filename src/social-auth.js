export const socialProviders=[
 {id:'google',provider:'google',label:'구글'},
 {id:'kakao',provider:'kakao',label:'카카오'}
];
export function authMethodsMarkup(mode){
 const suffix=mode==='signup'?'Signup':'Login';
 return `<div class="social-auth auth-methods" aria-label="가입 및 로그인 방법"><button id="google${suffix}" type="button" class="btn auth-method auth-google" disabled><img src="/brand/google-g.png" alt="" width="20" height="20"><span class="auth-method-label">Google 계정으로 계속하기</span></button><button id="kakao${suffix}" type="button" class="btn auth-method auth-kakao" data-coming-soon="true" disabled><span class="auth-method-label">카카오로 계속하기</span><span class="auth-method-badge">준비 중</span></button><button type="button" class="btn auth-method" data-phone-auth aria-expanded="false" aria-controls="phoneAuthPanel"><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="6" y="2" width="12" height="20" rx="3"/><path d="M10 5h4M11 18h2"/></svg><span class="auth-method-label">휴대전화 번호로 계속하기</span></button></div><section id="phoneAuthPanel" data-phone-panel hidden></section>`;
}
function setLabel(button,text){const label=button.querySelector('.auth-method-label');if(label)label.textContent=text;else button.textContent=text;}
export async function configureSocialAuth(config,mode){
 const items=socialProviders.map(p=>({...p,button:document.getElementById(p.id+(mode==='signup'?'Signup':'Login'))})).filter(p=>p.button);
 let notice=document.getElementById('socialAuthStatus');if(!notice){notice=document.createElement('p');notice.id='socialAuthStatus';notice.setAttribute('role','status');items[0]?.button.closest('.social-auth')?.after(notice);}
 notice.textContent='간편로그인 연결을 확인하고 있습니다.';
 document.getElementById('retrySocialAuth')?.remove();
 for(const {button} of items){button.disabled=true;if(button.dataset.comingSoon!=='true')setLabel(button,'Google 계정으로 계속하기');}
 let external={},settingsLoaded=false;
 try{const r=await fetch(config.url.replace(/\/$/,'')+'/auth/v1/settings',{headers:{apikey:config.key},cache:'no-store',signal:AbortSignal.timeout(8000)});if(r.ok){external=(await r.json()).external||{};settingsLoaded=true;}}catch{}
 for(const {id,label,button} of items){if(button.dataset.comingSoon==='true'){button.disabled=true;continue;}const enabled=settingsLoaded?(id==='naver'?config.naverLogin===true:external[id]===true):true;button.disabled=!enabled;setLabel(button,enabled?'Google 계정으로 계속하기':label+' 연결 확인 중');}
 notice.textContent=settingsLoaded&&items.some(({button})=>!button.disabled)?'':settingsLoaded?'구글 연결을 확인 중입니다. 다른 방법을 선택해 주세요.':'구글 연결 확인이 늦어지고 있습니다. 버튼을 눌러 다시 연결할 수 있습니다.';
 if(!settingsLoaded){const retry=document.createElement('button');retry.id='retrySocialAuth';retry.type='button';retry.textContent='간편로그인 다시 확인';retry.onclick=()=>configureSocialAuth(config,mode);notice.after(retry);}
}
