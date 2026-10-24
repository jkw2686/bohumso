// TOTP is only for administrators; signup/contact entry never invokes this flow.
export async function mountAdminMfa({client,host}){
 host.replaceChildren();const title=document.createElement('h2');title.textContent='관리자 보안 확인';host.append(title);
 const status=document.createElement('p');status.setAttribute('role','status');host.append(status);
 const setup=document.createElement('button');setup.type='button';setup.className='btn';setup.textContent='인증 앱 연결하기';host.append(setup);
 const form=document.createElement('form');form.hidden=true;form.innerHTML='<label class="field">인증 앱의 6자리 코드<input name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required></label><button class="btn">확인하기</button>';host.append(form);
 let factorId,busy=false;
 try{const r=await client.auth.mfa.listFactors();if(r.error)throw r.error;const factor=r.data.totp?.find(f=>f.status==='verified');if(factor){factorId=factor.id;setup.hidden=true;form.hidden=false;}}
 catch{status.textContent='인증 설정을 불러오지 못했어요. 새로고침해 주세요.';setup.disabled=true;return;}
 setup.onclick=async()=>{if(busy)return;busy=true;setup.disabled=true;try{const r=await client.auth.mfa.enroll({factorType:'totp',friendlyName:'우리보험소 관리자'});if(r.error)throw r.error;factorId=r.data.id;const image=document.createElement('img');image.alt='인증 앱에 추가할 QR 코드';image.src=r.data.totp.qr_code;image.width=200;image.height=200;setup.after(image);setup.hidden=true;form.hidden=false;status.textContent='인증 앱에서 QR 코드를 스캔한 뒤 코드를 입력하세요.';}catch{status.textContent='인증 앱 연결에 실패했어요. 다시 시도해 주세요.';setup.disabled=false;}finally{busy=false;}};
 form.onsubmit=async e=>{e.preventDefault();if(busy||!factorId)return;busy=true;form.querySelector('button').disabled=true;try{const r=await client.auth.mfa.challengeAndVerify({factorId,code:form.elements.code.value});if(r.error)throw r.error;const verified=await client.rpc('member_admin_access');if(verified.error||!verified.data?.mfa)throw Error('mfa_required');location.reload();}catch{status.textContent='인증 코드를 확인해 주세요.';}finally{form.elements.code.value='';busy=false;form.querySelector('button').disabled=false;}};
}
