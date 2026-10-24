// Presentation routing only; server RPC authorization remains mandatory.
export function isExpertMember(m){return !!m?.member&&m.profession!=='office'&&!!(m.partner_status||m.beta_role==='EXPERT'||/^EXPERT_/.test(m.state||''));}
const consumer=new Set(['/','/index','/map','/find','/urgent','/visit','/claim','/consult','/requests','/reserve','/my-reservations','/consultation/new']);
export function roleDestination(m,path,{preview=false}={}){
 const u=new URL(path,'https://internal.invalid'),p=u.pathname.replace(/\.html$/,'');
 if(!isExpertMember(m))return m?.member&&['/','/index'].includes(p)&&!preview?'/map.html':null;
 if(consumer.has(p)&&!preview)return p==='/requests'||p==='/my-reservations'?m.partner_status==='approved'?'/partner-work.html':'/partner.html':'/partner.html';
 if(p==='/partner-work'&&m.partner_status!=='approved')return '/partner.html';
 return null;
}
