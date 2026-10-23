// Only pass the profession returned by memberState/expert_profile_command.
export function expertNavigation(profession){
 return profession==='tax'
  ? [['받은 예약','/partner-work.html'],['상담시간','/partner.html?from=menu&edit=hours#partnerState'],['상담료·사무실 정보','/partner.html?from=menu#partnerState']]
  : [['받은 요청·예약','/partner-work.html'],['청구 자료실','/claim-resources.html'],['내 정보·상담 설정','/partner.html?from=menu#consult-settings']];
}
export function renderExpertNavigation(host,profession){
 if(!host)return;host.replaceChildren();
 for(const [label,href] of expertNavigation(profession)){
  const a=document.createElement('a');a.className='btn ghost';a.textContent=label;a.href=href;host.append(a);
 }
}
