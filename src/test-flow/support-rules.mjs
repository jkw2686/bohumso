export const GUIDANCE='정확한 건 전문가 상담에서 도와드려요. 이 고객센터는 이용 안내와 연결만 제공하며 청구 방법이나 보험 판단을 하지 않아요.';
export const SUPPORT_SITUATIONS={death:'사망·상속',cancer:'암·중대질병',denial:'청구 거절·삭감',disability:'후유장해',other:'기타'};
const normalize=s=>String(s).normalize('NFKC').toLowerCase().replace(/[\s?!？!.,·]/g,'');
export function matchFAQ(text,faqs){const q=normalize(text);if(!q)return null;return faqs.map(f=>({f,score:Math.max(0,...[f.question,...f.keywords].map(k=>{const key=normalize(k);return key&&q.includes(key)?key.length:0;}))})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score)[0]?.f||null;}
export function classifySituation(text){if(/사망|상속|돌아가셨/.test(text))return 'death';if(/암(?:\s|진단|보험|$)|중대질병/.test(text))return 'cancer';if(/거절|삭감|거부/.test(text))return 'denial';if(/후유장해|후유장애/.test(text))return 'disability';return null;}
