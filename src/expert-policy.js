import {el} from './consultation-ui.js';
export const PLANNER_POLICY='planner-protection-2026-10-12-v2';
export const TAX_POLICY='tax-service-2026-10-12-v1';
export const PROTECTION_RULES=[
 '첫 만남에서는 보험 가입을 먼저 권유하지 않습니다.',
 '보험금 청구 도움을 우선합니다.',
 '신규 보험 가입 상담은 고객이 먼저 명시적으로 요청한 경우에만 진행합니다.',
 '청구 도움을 마쳤다는 이유만으로 가입을 먼저 권유하지 않습니다.'
];
export const PROTECTION_PENALTIES=['1회 위반: 지도 노출 정지 1개월','2회 위반: 지도 노출 정지 3개월','3회 위반: 영구 제명'];
export const PLANNER_CHECK='청구 도움 우선, 첫 만남에서의 선제적 보험 가입 권유 금지, 고객의 명시적 요청에 따른 가입 상담 원칙과 위반 시 조치에 동의합니다.';
export function operatingPrinciples(parent,profession,checked,onchange){
 const box=el('section',undefined,parent);box.className='expert-meeting-notice';el('h3','필수 운영 원칙',box);
 if(profession==='tax'){
  el('strong','세무 상담을 보험 가입 권유의 우회 경로로 사용하지 않습니다.',box);
  el('p','확인된 자격 범위에서 상담하며 비용과 범위를 먼저 안내합니다. 보험 가입을 상담의 조건으로 요구하지 않고 고객의 동의 없이 후속 영업을 하지 않습니다.',box);
 }else{
  for(const rule of PROTECTION_RULES)el('p',rule,box).className='operating-prohibition';
  el('p','고객이 먼저 가입 관련 질문을 하면 답할 수 있습니다. 이를 빌미로 청구 도움을 중단하거나 가입 상담을 강요하지 않습니다. 동의 없는 후속 영업을 하지 않습니다.',box);
  el('p','청구 도움을 보험 가입·계약·상품 상담 수락의 조건으로 제공하지 않습니다. 세무 상담을 보험 가입 권유의 우회 경로로 사용하지 않습니다.',box);
  const list=el('ul',undefined,box);list.className='operating-prohibition';for(const p of PROTECTION_PENALTIES)el('li',p,list);
  el('p','신고만으로 정지하지 않습니다. 사실관계와 당사자 설명 확인 → 운영자 결정·사유 안내 → 이의 신청 순서로 처리합니다. 노쇼·지각 횟수와 합산하지 않습니다.',box);
 }
 const label=el('label',undefined,box);label.className='consent-row';const input=el('input',undefined,label);input.type='checkbox';input.required=true;input.checked=checked;input.onchange=()=>onchange(input.checked);
 label.append(document.createTextNode('[필수] '+(profession==='tax'?'자격 범위·상담 비용 사전 안내와 보험 가입 권유 우회 금지 원칙에 동의합니다.':PLANNER_CHECK)));
 const a=el('a','운영 원칙 변경안 전체 보기',box);a.href='/expert-policy-preview.html';a.target='_blank';a.rel='noopener';
 return input;
}
