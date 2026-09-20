export const purposes={claim:'보험금 청구 관련 문의',management:'기존 보험 관리·담당자 찾기',coverage:'보장 점검',new:'신규 가입 상담',other:'기타 문의'};
export const states={requested:'요청',coordinating:'일정 조율',confirmed:'양측 확정 · 1차 미결제',scheduled:'미팅 예정',awaiting_completion:'완료 확인 대기',completed:'완료',cancelled:'취소',no_show:'노쇼 신고',dispute:'분쟁',unmatched:'요청 종료 · 직접 다시 선택'};
export const payments={free:'무료',unpaid:'미결제',confirming:'승인 확인 중',first_paid:'1차 완료',balance_due:'잔금 대기',paid:'전액 완료',failed:'실패',refund_requested:'환불 요청',refunding:'환불 처리 중',refunded:'환불 완료',refund_failed:'환불 실패'};
export const kst=value=>new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',dateStyle:'medium',timeStyle:'short'}).format(new Date(value));
export const won=value=>new Intl.NumberFormat('ko-KR').format(value)+'원';
export function el(tag,text,parent){const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(parent)parent.append(node);return node;}
export function input(parent,label,name,type='text',value=''){const wrap=el('label',label,parent),node=el('input',undefined,wrap);node.type=type;node.name=name;node.value=value;return node;}
export function select(parent,label,name,choices,value){const wrap=el('label',label,parent),node=el('select',undefined,wrap);node.name=name;for(const [key,title]of Object.entries(choices)){const option=el('option',title,node);option.value=key;}if(value)node.value=value;return node;}
export function link(parent,text,href){const a=el('a',text,parent);a.href=href;return a;}
export function distance(a,b){if(!a||!Number.isFinite(b.latitude)||!Number.isFinite(b.longitude))return null;const rad=n=>n*Math.PI/180,x=Math.sin(rad(b.latitude-a.lat)/2)**2+Math.cos(rad(a.lat))*Math.cos(rad(b.latitude))*Math.sin(rad(b.longitude-a.lng)/2)**2;return 6371*2*Math.asin(Math.sqrt(x));}
export function sortedProfiles(profiles,position){return [...profiles].map(p=>({...p,distance:distance(position,p)})).sort((a,b)=>(a.distance??Infinity)-(b.distance??Infinity)||a.name.localeCompare(b.name,'ko'));}

export const specialties={death:'사망보험금',illness:'암·질병',medical:'실손보험',claim:'보험금 청구',accident:'자동차·상해',life:'생명보험',nonlife:'손해보험',corporate:'법인보험',remodel:'보험 리모델링',management:'기존 보험 관리',coverage:'보장 점검',new:'신규 가입',other:'기타 문의'};
