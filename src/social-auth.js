export const socialProviders=[
 {id:'kakao',provider:'kakao',label:'카카오'},
 {id:'google',provider:'google',label:'Google'},
 {id:'naver',provider:'custom:naver',label:'네이버'},
 {id:'apple',provider:'apple',label:'Apple'},
 {id:'facebook',provider:'facebook',label:'Facebook'}
];
export async function configureSocialAuth(config,mode){
 const items=socialProviders.map(p=>({...p,button:document.getElementById(p.id+(mode==='signup'?'Signup':'Login'))})).filter(p=>p.button);
 let notice=document.getElementById('socialAuthStatus');if(!notice){notice=document.createElement('p');notice.id='socialAuthStatus';notice.setAttribute('role','status');items[0]?.button.closest('.social-auth')?.after(notice);}
 notice.textContent='간편로그인 연결을 확인하고 있습니다.';
 document.getElementById('retrySocialAuth')?.remove();
 for(const {button} of items){button.disabled=true;button.textContent='연결 확인 중';}
 let external={},settingsLoaded=false;
 try{const r=await fetch(config.url.replace(/\/$/,'')+'/auth/v1/settings',{headers:{apikey:config.key},cache:'no-store',signal:AbortSignal.timeout(8000)});if(r.ok){external=(await r.json()).external||{};settingsLoaded=true;}}catch{}
 for(const {id,label,button} of items){const enabled=settingsLoaded&&(id==='naver'?config.naverLogin===true:external[id]===true);button.disabled=!enabled;button.textContent=enabled?label+(mode==='signup'?'로 시작하기':'로 로그인'):label+(settingsLoaded?' 로그인 준비 중':' 연결 확인 실패');}
 notice.textContent=settingsLoaded?(items.some(({button})=>!button.disabled)?'사용 가능한 간편로그인을 선택하세요.':'현재 연결된 간편로그인이 없습니다. 이메일로 가입·로그인할 수 있습니다.'):'간편로그인 연결 상태를 확인하지 못했습니다. 다시 확인하거나 이메일로 진행해 주세요.';
 if(!settingsLoaded){const retry=document.createElement('button');retry.id='retrySocialAuth';retry.type='button';retry.textContent='간편로그인 다시 확인';retry.onclick=()=>configureSocialAuth(config,mode);notice.after(retry);}
}
