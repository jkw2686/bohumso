// Public, verified operating information only. Never put credentials here.
// TODO(operator): confirm missing legal entity fields and policy effective dates.
export const COMPANY_INFO=Object.freeze({serviceName:'우리곁에 보험소',companyName:'',representative:'',businessNumber:'',address:'',supportEmail:'jkw2686@gmail.com',privacyOfficer:''});
export const POLICY_INFO=Object.freeze({status:'review',version:'2026-10-05-early-access-v1',effectiveDate:''});
export function renderCompanyInfo(root,info=COMPANY_INFO){
 root.replaceChildren();const labels={companyName:'운영사',representative:'대표자',businessNumber:'사업자등록번호',address:'주소',supportEmail:'문의',privacyOfficer:'개인정보 보호책임자'};
 for(const [key,label]of Object.entries(labels)){const value=info[key];if(typeof value!=='string'||!value.trim())continue;const p=document.createElement('p');p.textContent=label+' · ';if(key==='supportEmail'&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)){const a=document.createElement('a');a.href='mailto:'+value;a.textContent=value;p.append(a);}else p.append(document.createTextNode(value));root.append(p);}root.hidden=!root.childElementCount;
}
document.querySelectorAll('[data-company-info]').forEach(root=>renderCompanyInfo(root));
