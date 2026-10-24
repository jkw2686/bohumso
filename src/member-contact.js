export async function mountMemberContact({client,host,onSaved,required=false,initialType='consumer'}){
 const {data,error}=await client.rpc('member_contact',{operation:'get'});
 // Rollout must not pretend the server has saved fields before the migration exists.
 if(error){if(['PGRST202','42883'].includes(error.code))return {available:false};throw error;}if(!data||typeof data.complete!=='boolean')throw Error('contact_unavailable');
 if(required&&data.complete)return {available:true,complete:true};
 host.querySelector('[data-member-contact]')?.remove();
 const section=document.createElement('section');section.dataset.memberContact='';section.className='member-contact';
 section.innerHTML='<h2>이름과 연락받을 번호</h2><form><label class="field">회원 유형<select name="member_type"><option value="consumer">소비자</option><option value="expert">전문가</option></select></label><label class="field">이름<input name="name" autocomplete="name" minlength="2" maxlength="60" required></label><label class="field">휴대폰번호<input name="phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="01012345678" required></label><p class="muted">입력 정보는 실명·명의 인증 결과가 아닙니다. <a href="/privacy.html">수집·보관 안내</a></p><p role="status"></p><button class="btn" type="submit">저장하기</button></form>';
 const form=section.querySelector('form');if(!data.complete){const label=document.createElement('label');label.className='consent-row';label.innerHTML='<input type="checkbox" name="privacy" required> 이름·전화번호 수집·이용에 동의합니다';form.querySelector('button').before(label);}const status=section.querySelector('[role=status]'),button=form.querySelector('button');
 form.elements.name.value=data.name||'';form.elements.phone.value=data.phone||'';form.elements.member_type.value=data.member_type||initialType;
 status.textContent=data.contact_status==='CALL_CONFIRMED'?'통화 확인 · 실명 인증과 별개':'연락처 미확인';let busy=false;
 form.onsubmit=async e=>{e.preventDefault();if(busy)return;const phone=form.elements.phone.value.replace(/[ -]/g,'');if(!/^010\d{8}$/.test(phone)){status.textContent='010으로 시작하는 휴대폰번호 11자리를 입력해 주세요.';return;}busy=true;button.disabled=true;
  try{const r=await client.rpc('member_contact',{operation:'save',payload:{name:form.elements.name.value.trim(),phone,member_type:form.elements.member_type.value,privacy_accepted:form.elements.privacy?.checked===true}});if(r.error)throw r.error;status.textContent=r.data.contact_status==='CALL_CONFIRMED'?'저장했어요 · 통화 확인':'저장했어요 · 연락처 미확인';await onSaved?.(r.data);}
  catch{status.textContent='저장하지 못했어요. 입력을 유지했습니다. 다시 시도해 주세요.';}finally{busy=false;button.disabled=false;}
 };host.prepend(section);return {available:true,complete:data.complete,section};
}
