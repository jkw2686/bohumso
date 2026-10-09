// Public, verified operating information only. Never put credentials here.
// Business registration checklist: BUSINESS_SETUP.md. Empty fields are not rendered.
export const BUSINESS_INFO=Object.freeze({legalName:'',representativeName:'',businessRegistrationNumber:'',ecommerceRegistrationNumber:'',address:'',phone:''});
export const COMPANY_INFO=Object.freeze({serviceName:'우리곁에 보험소',companyName:BUSINESS_INFO.legalName,representative:BUSINESS_INFO.representativeName,businessNumber:BUSINESS_INFO.businessRegistrationNumber,ecommerceNumber:BUSINESS_INFO.ecommerceRegistrationNumber,address:BUSINESS_INFO.address,phone:BUSINESS_INFO.phone,supportEmail:'jkw2686@gmail.com',privacyOfficer:'보험소 운영팀'});
export const POLICY_INFO=Object.freeze({status:'active',version:'2026-10-09-v1',effectiveDate:'2026-10-09'});
export function renderCompanyInfo(root,info=COMPANY_INFO){
 root.replaceChildren();const labels={companyName:'운영사',representative:'대표자',businessNumber:'사업자등록번호',ecommerceNumber:'통신판매업 신고번호',address:'주소',phone:'대표 전화',supportEmail:'고객·개인정보 문의',privacyOfficer:'개인정보 문의 담당부서'};
 for(const [key,label]of Object.entries(labels)){const value=info[key];if(typeof value!=='string'||!value.trim())continue;const p=document.createElement('p');p.textContent=label+' · ';if(key==='supportEmail'&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)){const a=document.createElement('a');a.href='mailto:'+value;a.textContent=value;p.append(a);}else p.append(document.createTextNode(value));root.append(p);}root.hidden=!root.childElementCount;
}
document.querySelectorAll('[data-company-info]').forEach(root=>renderCompanyInfo(root));
