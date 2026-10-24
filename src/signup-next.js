// Presentation only: application/workspace RPCs remain the authority.
export function signupNext(membership){
 if(!membership?.member)return null;
 if(membership.admin)return {href:'/admin.html',label:'관리자 화면'};
 if(membership.partner_status==='approved')return {href:'/partner.html',label:membership.profession==='office'?'보험소 관리':'전문가 홈'};
 if(membership.partner_status==='rejected')return {href:'/partner.html',label:'보완 내용 확인'};
 if(membership.partner_status==='pending'||['EXPERT_PENDING','EXPERT_VERIFICATION_PENDING'].includes(membership.state))return {href:'/partner.html',label:'심사 현황 확인'};
 if(membership.state==='EXPERT_DRAFT')return {href:'/partner.html',label:'전문가 등록 이어하기'};
 return {href:'/map.html?view=experts',label:'가까운 전문가 찾기'};
}
