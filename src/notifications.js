import {memberService,memberState,MEMBER,safeNext} from './member-access.js';
const date=value=>new Date(value).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'});
function el(tag,text,parent,cls){const n=document.createElement(tag);n.textContent=text;if(cls)n.className=cls;parent.append(n);return n;}
export async function startNotifications(client){
 if(document.querySelector('[data-flow-notifications]'))return;
 const nav=document.querySelector('.nav');if(!nav)return;
 const open=el('a','알림',nav,'notification-bell');open.dataset.flowNotifications='';open.href='/notifications.html';
 async function update(){const {data,error}=await client.rpc('notification_inbox',{operation:'list'});if(error){open.textContent='알림';return;}open.textContent=data.unread?'알림 '+data.unread:'알림';open.setAttribute('aria-label',data.unread?'읽지 않은 알림 '+data.unread+'개':'알림함');}
 await update();const timer=setInterval(()=>{if(!document.hidden)update().catch(()=>{});},30000);window.addEventListener('pagehide',()=>clearInterval(timer),{once:true});
}
export async function renderNotifications(client,root){
 const tools=el('div','',root,'review-actions'),list=el('div','',root),notice=el('p','',root);notice.role='status';
 async function load(operation='list',notification_id=null){const {data,error}=await client.rpc('notification_inbox',{operation,notification_id});if(error){notice.textContent='알림을 불러오지 못했어요. 다시 확인해 주세요.';return;}notice.textContent='읽지 않은 알림 '+data.unread+'개';list.replaceChildren();if(!data.items.length)el('p','새 알림이 없어요. 상담이 진행되면 여기에 표시됩니다.',list,'card');for(const item of data.items){const card=el('article','',list,'card notification-item');el('h2',(item.read_at?'':'● ')+item.title,card);el('p',item.body,card);el('small',date(item.created_at),card);const actions=el('div','',card,'review-actions');const a=el('a','예약 확인',actions,'btn ghost');a.href=safeNext(item.deep_link,'/requests.html');a.onclick=()=>{void client.rpc('notification_inbox',{operation:'read',notification_id:item.id});};if(!item.read_at){const b=el('button','읽음',actions,'btn ghost');b.onclick=()=>load('read',item.id);}}}
 for(const [title,op] of [['새로고침','list'],['모두 읽음','read_all']]){const b=el('button',title,tools,'btn ghost');b.type='button';b.onclick=()=>load(op);}
 await load();const reservation=new URLSearchParams(location.search).get('reservation');if(reservation&&/^[0-9a-f-]{36}$/i.test(reservation)){const {data,error}=await client.rpc('notification_reservation',{reservation_id:reservation});if(!error&&data?.workspace){const a=el('a','이전 알림의 예약 확인',root,'btn ghost');a.href=safeNext(data.workspace,'/requests.html')+'?request='+encodeURIComponent(reservation);}}
 const timer=setInterval(()=>{if(!document.hidden)load().catch(()=>{});},30000);window.addEventListener('pagehide',()=>clearInterval(timer),{once:true});
}
const root=document.querySelector('[data-notification-page]');if(root)memberService().then(async({client})=>{const user=await memberState(client);if(user.state!==MEMBER.active){const a=el('a','로그인하고 알림 확인',root,'btn');a.href='/login.html?next=%2Fnotifications.html';return;}await startNotifications(client);await renderNotifications(client,root);}).catch(()=>{root.textContent='알림을 불러오지 못했어요. 새로고침해 주세요.';});
