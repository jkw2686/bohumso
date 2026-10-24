import {el,input,select,link} from './consultation-ui.js';
import {memberService,memberState,MEMBER,authURL,requireActiveMember} from './member-access.js';
const date=value=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(new Date(value)).replaceAll('-','.');
const rpc=async(client,operation,payload={})=>{const {data,error}=await client.rpc('promotion_command',{operation,payload});if(error)throw error;return data;};
const errors={promotion_not_found:'초대링크를 확인해 주세요.',promotion_stopped:'모집이 중지됐습니다.',promotion_closed:'신청이 마감됐습니다.',promotion_full:'무료혜택 인원이 모두 찼습니다.',existing_free_benefit:'이미 이용 중인 무료혜택을 유지합니다. 기간은 변경하지 않았습니다.',paid_subscription_preserved:'기존 유료 이용과 결제 일정은 유지됩니다. 무료혜택은 중복 적용하지 않습니다.',membership_required:'가입을 마친 뒤 무료혜택을 받을 수 있습니다.',invalid_deadline:'신청 마감일을 다시 확인해 주세요.'};
const stateNames={ACTIVE:'신청 가능',CLOSED:'마감',FULL:'인원 마감',STOPPED:'중지'};
function button(parent,label,fn,primary=false){const b=el('button',label,parent);b.type='button';b.className=primary?'btn':'text-button';b.onclick=fn;return b;}
function conditions(parent,c){const dl=el('dl',undefined,parent);dl.className='promotion-conditions';for(const [label,value]of [['무료기간',c.free_days+'일'],['신청 마감일',date(c.deadline)],['사용 인원',c.used+' / '+(c.capacity??'제한 없음')]]){el('dt',label,dl);el('dd',value,dl);}}
export async function mountPromotionBenefit(client,host){
 const previous=host.querySelector('[data-promotion-benefit]');previous?.remove();
 try{const before=(await client.auth.getSession()).data.session?.user?.id;if(!before)return;const b=await rpc(client,'benefit');if(!b?.active||!host.isConnected||(await client.auth.getSession()).data.session?.user?.id!==before)return;const p=el('p','무료 이용 · '+date(b.ends_at)+'까지',host);p.dataset.promotionBenefit='';p.className='promotion-benefit';}catch{/* Optional benefit does not block account or booking access. */}
}
export function mountPromotionAdminLinks(host,client){
 if(host.querySelector('[data-promotion-admin-links]'))return;const nav=el('nav',undefined,host);nav.dataset.promotionAdminLinks='';nav.className='promotion-admin-links';link(nav,'무료 초대링크','/admin-promotions.html');const regions=link(nav,'지역별 모집 현황','/recruitment-regions.html');if(client)void client.rpc('recruitment_regions').then(({data,error})=>{if(error||!nav.isConnected)return;const count=data?.filter(r=>r.reached_at&&!r.seen_at).length;if(count)regions.textContent='지역별 모집 현황 · 새 소식 '+count;}).catch(()=>{});
}
async function landing(client,host){
 const token=new URLSearchParams(location.search).get('promotion');
 if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(token||''))throw Error('promotion_not_found');
 const {data:c,error}=await client.rpc('promotion_preview',{invite_token:token});if(error)throw error;if(!c)throw Error('promotion_not_found');
 host.replaceChildren();el('h1','우리 동네에서 보험금 청구를 도와주실 설계사님을 모집합니다.',host);
 el('p','우리보험소는 지역별로 서비스를 순차 오픈합니다.',host);
 el('p','같은 구에서 보험금 청구 도움에 참여할 설계사님이 10명 이상 모이면, 해당 지역 서비스를 오픈하고 소비자 대상 지역 광고를 진행할 예정입니다.',host);
 const more=el('details',undefined,host);el('summary','참여 안내',more);
 for(const text of ['소비자는 지도에서 가까운 설계사님을 직접 선택해 상담을 요청할 수 있습니다.','전국 어디서든 먼저 참여하실 수 있습니다. 활동지역은 실제로 상담과 청구 도움을 제공할 수 있는 지역으로 등록해 주세요.','주변 동료 설계사님과 함께 참여해 우리 동네 보험소를 열어주세요.'])el('p',text,more);
 conditions(host,c);el('small','무료기간은 혜택 적용일부터 시작하며, 지역 서비스 오픈일과 다를 수 있습니다. 자동 결제는 없습니다.',host);
 const notice=el('p','혜택을 확인하고 있습니다.',host);notice.setAttribute('role','status');
 const state=await memberState(client);const next='/promotion.html?promotion='+encodeURIComponent(token);
 if(state.state!==MEMBER.active){notice.textContent=c.status==='ACTIVE'?'':stateNames[c.status];if(c.status!=='ACTIVE')return;const a=link(host,'무료혜택 받고 가입하기',authURL(next)+'&roleIntent=expert');a.className='btn';link(host,'이미 가입했다면 로그인',authURL(next,'login')).className='text-button';return;}
 // Entry is an explicit benefit invitation. Successful authenticated return applies it automatically.
 notice.textContent='무료혜택을 적용하고 있습니다.';
 try{const b=await rpc(client,'redeem',{token});notice.textContent=(b.already_applied?'이미 적용된 혜택 · ':'')+(new Date(b.ends_at)>new Date()?'무료 이용 · ':'무료 이용 종료 · ')+date(b.ends_at)+'까지';const a=link(host,'전문가 홈으로','/partner.html?roleIntent=expert');a.className='btn';}
 catch(error){notice.textContent=errors[error.message]||'혜택 적용을 확인하지 못했습니다. 다시 시도해 주세요.';if(!errors[error.message])button(host,'다시 확인',()=>landing(client,host),true);link(host,'내 정보 보기','/account.html').className='text-button';}
}
async function administration(client,host,regions){
 if(!await requireActiveMember({client}))return;const state=await memberState(client);if(!state.membership?.admin)throw Error('admin_required');
 host.replaceChildren();link(host,'‹ 관리자 화면','/admin.html').className='text-button';el('h1',regions?'지역별 모집 현황':'무료 초대링크',host);
 const notice=el('p','',host);notice.setAttribute('role','status');
 if(regions){
  const {data,error}=await client.rpc('recruitment_regions');if(error)throw error;
  el('p','자격 확인된 청구 도움 설계사 · 실제 활동지역 기준',host);
  const reached=data.filter(r=>r.reached_at&&!r.seen_at);if(reached.length){notice.textContent=reached.length+'개 지역 10명 도달 · 오픈 준비를 확인해 주세요.';const ack=button(host,'소식 확인',async()=>{ack.disabled=true;try{await rpc(client,'regions_seen',{areas:reached.map(r=>r.area_id)});notice.textContent='';ack.remove();}catch{notice.textContent='확인 기록을 저장하지 못했습니다.';ack.disabled=false;}});}
  const table=el('table',undefined,host),head=el('tr',undefined,el('thead',undefined,table));for(const h of ['지역명','참여 인원','오픈 상태'])el('th',h,head);
  const body=el('tbody',undefined,table);for(const r of data){const row=el('tr',undefined,body);el('td',r.region,row);el('td',r.participants+'명',row);el('td',r.status,row);}
  el('small','10명 도달 이력은 지역당 한 번 기록됩니다. 서비스 오픈·광고 집행은 운영자가 별도로 진행합니다.',host);return;
 }
 const params=new URLSearchParams(location.search),id=params.get('id');
 if(id){el('h2','혜택 사용 명단',host);const members=await rpc(client,'members',{id});for(const m of members){const row=el('p',m.user_id+' · '+date(m.started_at)+' → '+date(m.ends_at),host);row.className='promotion-member';}if(!members.length)el('p','아직 사용한 회원이 없습니다.',host);link(host,'링크 목록으로','/admin-promotions.html');return;}
 const form=el('form',undefined,host);form.className='promotion-create';
 const days=input(form,'무료기간 (일)','free_days','number','30');days.required=true;days.min=1;days.max=3660;
 const mode=select(form,'사용 가능 인원','capacity_mode',{one:'1명',many:'N명',unlimited:'제한 없음'});
 const capacity=input(form,'인원 수','capacity','number','10');capacity.min=1;capacity.max=1000000;capacity.parentElement.hidden=true;
 mode.onchange=()=>{capacity.parentElement.hidden=mode.value!=='many';capacity.required=mode.value==='many';};
 const deadline=input(form,'신청 마감일','deadline','date');deadline.required=true;deadline.min=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(new Date());
 const create=el('button','초대링크 만들기',form);create.className='btn';create.type='submit';
 const created=el('div',undefined,host);const list=el('div',undefined,host);
 async function copy(token){const url=new URL('/promotion.html?promotion='+token,location.origin).href;try{await navigator.clipboard.writeText(url);notice.textContent='링크를 복사했습니다.';}catch{created.replaceChildren();const field=input(created,'초대링크','copy');field.value=url;field.readOnly=true;field.select();notice.textContent='링크를 길게 눌러 복사해 주세요.';}}
 async function load(){const rows=await rpc(client,'list');list.replaceChildren();el('h2','기존 링크',list);if(!rows.length)el('p','아직 만든 링크가 없습니다.',list);for(const r of rows){const row=el('article',undefined,list);row.className='promotion-row';conditions(row,r.conditions);el('p',stateNames[r.conditions.status]||r.conditions.status,row);const actions=el('div',undefined,row);button(actions,'복사',()=>copy(r.token));if(r.conditions.status==='ACTIVE')button(actions,'중지',async()=>{if(!confirm('새로운 혜택 신청을 중지할까요? 이미 적용된 무료기간은 유지됩니다.'))return;try{await rpc(client,'stop',{id:r.id});await load();}catch{notice.textContent='중지하지 못했습니다. 다시 확인해 주세요.';}});link(actions,'사용 명단','/admin-promotions.html?id='+r.id).className='text-button';}}
 form.onsubmit=async event=>{event.preventDefault();if(!form.reportValidity()||create.disabled)return;create.disabled=true;notice.textContent='';try{const r=await rpc(client,'create',{free_days:Number(days.value),capacity:mode.value==='unlimited'?null:mode.value==='one'?1:Number(capacity.value),deadline:deadline.value+'T23:59:59.999+09:00'});form.hidden=true;created.replaceChildren();button(created,'링크 복사',()=>copy(r.token),true);button(created,'다른 링크 만들기',()=>{created.replaceChildren();form.hidden=false;notice.textContent='';days.focus();});notice.textContent='초대링크를 만들었습니다.';await load();}catch(error){notice.textContent=errors[error.message]||'만들지 못했습니다. 입력을 확인하고 다시 시도해 주세요.';}finally{create.disabled=false;}};
 await load();
}
if(document.body.dataset.promotionPage){
 const host=document.getElementById('promotionContent');let revision=0;
 async function start(){const own=++revision;host.replaceChildren();el('p','불러오는 중입니다.',host);try{const {client}=await memberService();if(own!==revision)return;const identity=(await client.auth.getSession()).data.session?.user?.id;client.auth.onAuthStateChange((event,session)=>{if(event==='SIGNED_OUT'||event==='USER_UPDATED'||event==='SIGNED_IN'&&session?.user?.id!==identity){host.replaceChildren();location.reload();}});await (document.body.dataset.promotionPage==='landing'?landing(client,host):administration(client,host,document.body.dataset.promotionPage==='regions'));}catch(error){host.replaceChildren();el('p',error.message==='admin_required'?'관리자만 이용할 수 있습니다.':errors[error.message]||'불러오지 못했습니다. 다시 확인해 주세요.',host).setAttribute('role','alert');button(host,'다시 시도',start);}}
 void start();
}
