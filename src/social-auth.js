export const socialProviders=[
 {id:'kakao',provider:'kakao',label:'카카오'},
 {id:'google',provider:'google',label:'Google'},
 {id:'naver',provider:'custom:naver',label:'네이버'},
 {id:'apple',provider:'apple',label:'Apple'},
 {id:'facebook',provider:'facebook',label:'Facebook'}
];
export async function configureSocialAuth(config,mode){
 const items=socialProviders.map(p=>({...p,button:document.getElementById(p.id+(mode==='signup'?'Signup':'Login'))})).filter(p=>p.button);
 for(const {button} of items)button.disabled=true;
 let external={},settingsLoaded=false;
 try{const r=await fetch(config.url.replace(/\/$/,'')+'/auth/v1/settings',{headers:{apikey:config.key},cache:'no-store',signal:AbortSignal.timeout(8000)});if(r.ok){external=(await r.json()).external||{};settingsLoaded=true;}}catch{}
 for(const {id,label,button} of items){const enabled=settingsLoaded&&(id==='naver'?config.naverLogin===true:external[id]===true);button.disabled=!enabled;button.textContent=enabled?label+(mode==='signup'?'로 시작하기':'로 로그인'):label+' 로그인 준비 중';}
}
