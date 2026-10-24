// Presentation routing only; server RPC authorization remains mandatory.
export function isExpertMember(m){return !!m?.member&&m.profession!=='office'&&!!(m.partner_status||m.beta_role==='EXPERT'||/^EXPERT_/.test(m.state||''));}
// 어느 로그인 버튼(as)으로 들어왔는지와 계정 종류가 다른지 판단한다. 화면 안내 전용.
export function roleMismatch(as,m){
 if(as!=='customer'&&as!=='expert')return '';
 const expert=isExpertMember(m);
 if(as==='customer'&&expert)return 'expert_account';   // 전문가 계정인데 일반회원 로그인
 if(as==='expert'&&!expert&&!m?.admin)return 'customer_account'; // 일반 계정인데 전문가 로그인 (관리자는 제외)
 return '';
}
const consumer=new Set(['/','/index','/map','/find','/urgent','/visit','/claim','/consult','/requests','/reserve','/my-reservations','/consultation/new']);
export function roleDestination(m,path,{preview=false}={}){
 const u=new URL(path,'https://internal.invalid'),p=u.pathname.replace(/\.html$/,'');
 if(!isExpertMember(m))return m?.member&&['/','/index'].includes(p)&&!preview?'/map.html':null;
 if(consumer.has(p)&&!preview)return p==='/requests'||p==='/my-reservations'?m.partner_status==='approved'?'/partner-work.html':'/partner.html':'/partner.html';
 if(p==='/partner-work'&&m.partner_status!=='approved')return '/partner.html';
 return null;
}
