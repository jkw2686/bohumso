import {randomBytes,randomUUID,createHash,timingSafeEqual} from 'node:crypto';
export const CUSTOMERS=[{id:'sample-a',name:'가상 고객 A'},{id:'sample-b',name:'가상 고객 B'}];
export const HOSPITALS=[{id:'sample-hospital-a',name:'가상 ○○병원'},{id:'sample-hospital-b',name:'가상 △△병원'}];
export const DOCUMENTS=['진료비 영수증','진료비 세부내역서','진단서','입퇴원 확인서'];
const hash=x=>createHash('sha256').update(x).digest('hex');
const reject=(message,status=400)=>{throw Object.assign(Error(message),{status});};
export class ClaimPreparationStore{
 constructor({now=()=>Date.now(),ttl=15*60*1000,onChange=()=>{}}={}){this.now=now;this.ttl=ttl;this.onChange=onChange;this.rows=new Map();this.keys=new Map();}
 event(r,action){r.revision++;r.history.push({action,at:new Date(this.now()).toISOString(),actor:action==='copy_prepared'?'고객(가상)':'설계사/시스템(가상)'});this.onChange(r.owner);}
 owned(owner,id){const r=this.rows.get(id);if(!r||r.owner!==owner)reject('요청을 찾을 수 없습니다.',404);return r;}
 view(r){return {id:r.id,customer:r.customer,hospital:r.hospital,documents:r.documents,situation:r.situation,identity:r.identity,mandate:r.mandate,consent:r.consent,delivery:'local_link_only',cancelled:r.cancelled,expired:this.now()>=r.expiresAt,expiresAt:new Date(r.expiresAt).toISOString(),revision:r.revision,history:r.history};}
 list(owner){this.expire();return [...this.rows.values()].filter(r=>r.owner===owner).map(r=>this.view(r)).reverse();}
 create(owner,p){
  const customer=CUSTOMERS.find(c=>c.id===p.customer),hospital=HOSPITALS.find(h=>h.id===p.hospital);
  if(!customer||!hospital||!Array.isArray(p.documents)||!p.documents.length||new Set(p.documents).size!==p.documents.length||p.documents.some(d=>!DOCUMENTS.includes(d))||!['청구 서류 준비','추가 서류 준비'].includes(p.situation)||p.needConfirmed!==true||!/^[-\w]{16,80}$/.test(p.requestKey||''))reject('고객·병원·서류와 대리발급 필요 확인을 선택해 주세요.');
  if(!['unknown','required','not_required'].includes(p.mandate)||!['unknown','required','not_required'].includes(p.consent))reject('후속 작업 상태를 확인해 주세요.');
  const key=owner+':'+p.requestKey,fingerprint=hash(JSON.stringify({...p,requestKey:undefined}));
  if(this.keys.has(key)){const old=this.rows.get(this.keys.get(key));if(old.fingerprint!==fingerprint)reject('요청 내용이 변경되었습니다. 새 요청을 만들어 주세요.',409);return {request:this.view(old),duplicate:true};}
  if(this.list(owner).length>=30)reject('가상 요청은 30건까지 체험할 수 있습니다.');
  const token=randomBytes(32).toString('base64url');const r={id:randomUUID(),owner,customer,hospital,documents:p.documents,situation:p.situation,mandate:p.mandate,consent:p.consent,identity:'requested',cancelled:false,tokenHash:hash(token),expiresAt:this.now()+this.ttl,revision:0,history:[],image:null,fingerprint};
  this.rows.set(r.id,r);this.keys.set(key,r.id);this.event(r,'request_created');return {request:this.view(r),token};
 }
 token(token){if(typeof token!=='string'||token.length!==43)reject('링크를 확인해 주세요.',404);const digest=Buffer.from(hash(token),'hex');const r=[...this.rows.values()].find(r=>timingSafeEqual(Buffer.from(r.tokenHash,'hex'),digest));if(!r)reject('유효하지 않은 링크입니다. 담당 전문가에게 새 링크를 요청해 주세요.',404);if(r.cancelled||this.now()>=r.expiresAt)reject('만료되었거나 취소된 링크입니다. 담당 전문가에게 다시 요청해 주세요.',410);return r;}
 customer(token){const r=this.token(token);return {hospital:r.hospital.name,documents:r.documents,identity:r.identity,expiresAt:new Date(r.expiresAt).toISOString()};}
 complete(token,bytes,confirmed){const r=this.token(token);if(confirmed!==true||!Buffer.isBuffer(bytes)||bytes.length<24||bytes.length>4*1024*1024||!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))reject('보호처리한 PNG 이미지와 결과 확인이 필요합니다.');if(r.identity==='prepared')return this.customer(token);r.image=Buffer.from(bytes);r.identity='prepared';this.event(r,'copy_prepared');return this.customer(token);}
 change(owner,id,p){this.expire();const r=this.owned(owner,id);if(p.revision!==r.revision)reject('상태가 변경되었습니다. 최신 화면에서 다시 시도해 주세요.',409);
  if(p.action==='cancel'){r.cancelled=true;r.image=null;this.event(r,'request_cancelled');return {request:this.view(r)};}
  if(r.cancelled)reject('취소된 요청입니다.',409);
  if(p.action==='renew'){const token=randomBytes(32).toString('base64url');r.tokenHash=hash(token);r.expiresAt=this.now()+this.ttl;this.event(r,'link_renewed');return {request:this.view(r),token};}
  if(p.action==='delete_copy'){r.image=null;r.identity='deleted';this.event(r,'copy_deleted');return {request:this.view(r)};}
  if(p.action==='followup'&&['mandate','consent'].includes(p.kind)&&['unknown','required','original_required','confirmed','not_required'].includes(p.state)&&typeof p.reason==='string'&&p.reason.trim().length>=5&&p.reason.length<=300){r[p.kind]=p.state;this.event(r,p.kind+':'+p.state);r.history.at(-1).reason=p.reason.trim();return {request:this.view(r)};}
  reject('후속 작업 상태와 확인 근거(5자 이상)를 입력해 주세요.');
 }
 expire(){for(const r of this.rows.values())if(this.now()>=r.expiresAt&&r.image){r.image=null;r.identity='deleted';this.event(r,'copy_expired');}}
 image(owner,id){this.expire();const r=this.owned(owner,id);if(!r.image)reject('준비된 사본이 없거나 보관 시간이 끝났습니다.',404);return r.image;}
}
