import {memberService,memberState,requireActiveMember,MEMBER} from './member-access.js';
const purposes={death:'가족 사망',illness:'암·질병',medical:'입원·수술',accident:'사고',claim:'보험금 청구',coverage:'내 보험 확인'};
import {waitlistActions} from './region-waitlist.js';
const labels={REQUESTED:'전문가에게 방문상담을 요청했습니다.',ACCEPTED:'전문가가 요청을 수락했습니다.',CONFIRMED:'방문상담 일정이 확정되었습니다.',PREPARING:'출발 준비',DEPARTED:'상담 장소로 출발',EN_ROUTE:'이동 중',ARRIVED:'도착',COMPLETED:'상담 완료',CANCELLED:'취소',EXPIRED:'요청 시간 만료',REJECTED:'전문가가 요청을 받기 어렵습니다.'};
const errors={phone_verification_required:'휴대전화 인증 후 요청할 수 있어요.',membership_required:'로그인 후 요청할 수 있어요.',expert_verification_required:'전문가 승인·휴대전화 확인·활동지역 설정이 필요해요.',no_available_expert:'선택한 전문가가 지금은 방문할 수 없어요. 목록을 다시 확인해 주세요.',availability_expired:'방문 가능 시간이 끝났거나 위치가 오래됐어요. 현재 위치를 갱신해 주세요.',invalid_location:'위치를 확인하지 못했어요. 권한을 확인하거나 지역을 직접 선택해 주세요.',invalid_visit_time:'희망시간은 지금부터 15분 이후, 4시간 이내로 선택해 주세요.',request_limit:'이미 진행 중인 요청이 있거나 요청 횟수가 많아요. 아래 내역을 확인해 주세요.',offer_unavailable:'이미 처리되었거나 만료된 요청이에요.',customer_confirmation_required:'고객이 일정을 확정한 후 출발할 수 있어요.',invalid_transition:'요청 상태 또는 희망시간이 바뀌었어요. 새로고침해 주세요.',expert_busy:'진행 중인 방문상담을 먼저 마쳐 주세요.'};
function el(tag,text,root,cls){const n=document.createElement(tag);if(text)n.textContent=text;if(cls)n.className=cls;root?.append(n);return n;}
function status(root,text){let n=root.querySelector('.urgent-status');if(!n){n=el('p','',root,'urgent-status');n.setAttribute('role','status');}n.textContent=text;}
function button(text,root,fn,secondary=false){const b=el('button',text,root,'btn'+(secondary?' ghost':''));b.type='button';b.onclick=async()=>{b.disabled=true;try{await fn();}catch(e){status(root,errors[e.message]||'처리하지 못했어요. 입력과 연결 상태를 확인해 주세요.');}finally{b.disabled=false;}};return b;}
function link(text,href,root){const a=el('a',text,root,'btn ghost');a.href=href;return a;}
function field(root,title,type='text'){const l=el('label',title,root,'field'),n=el(type==='textarea'?'textarea':'input','',l);if(type!=='textarea')n.type=type;return n;}
async function rpc(client,op,payload={}){const {data,error}=await client.rpc('urgent_command',{operation:op,payload});if(error)throw Error(error.message);return data;}
async function catalog(client,payload){const {data,error}=await client.rpc('visit_catalog',{payload});if(error)throw Error(error.message);return data;}
function locationOnce(){return new Promise((resolve,reject)=>{if(!navigator.geolocation)return reject(Error('invalid_location'));navigator.geolocation.getCurrentPosition(p=>{if(p.coords.accuracy>3000)return reject(Error('invalid_location'));resolve({latitude:p.coords.latitude,longitude:p.coords.longitude,accuracy:p.coords.accuracy});},()=>reject(Error('invalid_location')),{enableHighAccuracy:true,timeout:20000,maximumAge:0});});}
errors.slot_unavailable='희망시간에 다른 상담이 있어요. 다른 전문가나 시간을 선택해 주세요.';
const time=value=>new Date(value).toLocaleString('ko-KR',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'Asia/Seoul'});
const distance=km=>km<1?'약 '+Math.round(km*1000/100)*100+'m':'약 '+Number(km).toFixed(1)+'km';
export async function renderInstant(client,root){
 const card=el('section','',root,'card urgent-panel');let timer;
 const load=async()=>{const data=await rpc(client,'settings');card.replaceChildren();el('h2','지금 방문 상담 가능',card);const active=data.instant?.enabled;
  el('strong',active?'ON · '+time(data.instant.expires_at)+'까지':'OFF · 필요할 때만 켜세요',card);
  el('p','현재 위치를 기준으로 가까운 고객의 요청을 받습니다. 정확한 위치나 이동경로는 고객에게 공개되지 않아요.',card);
  if(!data.eligible)el('p','전문가 승인·휴대전화 확인·활동지역 설정을 완료해 주세요.',card);
  if(active){const age=(Date.now()-new Date(data.instant.updated_at))/60000;el('p',age>=data.visitConfig.expireMinutes?'위치가 오래되어 검색에서 제외됐어요. 갱신해 주세요.':'마지막 위치 확인 · '+time(data.instant.updated_at),card);
   button('현재 위치 갱신',card,async()=>{await rpc(client,'refresh_location',await locationOnce());await load();});
   button('방문 가능 끄기',card,async()=>{await rpc(client,'stop');await load();},true);
  }else{
   const start=button('방문 가능 켜기',card,()=>{const dialog=el('dialog','',document.body,'card instant-dialog');el('h2','현재 위치를 사용합니다',dialog);el('p','방문 가능 상태인 동안 가까운 고객과의 방문상담 연결에 사용합니다. 고객에게 정확한 위치나 이동경로는 공개되지 않습니다.',dialog);
    const label=el('label','자동 종료',dialog,'field'),duration=el('select','',label);for(const v of [60,120,240]){const o=el('option',v/60+'시간 뒤',duration);o.value=v;}duration.value=String(data.visitConfig?.availabilityMinutes||240);
    const consent=field(dialog,'위치 사용 목적을 확인하고 동의합니다.','checkbox');
    button('위치 사용하고 시작',dialog,async()=>{if(!consent.checked){status(dialog,'위치 사용 동의를 확인해 주세요.');return;}const point=await locationOnce();await rpc(client,'start',{...point,consent:true,duration:duration.value});dialog.close();dialog.remove();await load();});
    button('닫기',dialog,()=>{dialog.close();dialog.remove();},true);dialog.addEventListener('cancel',()=>dialog.remove());dialog.showModal();});start.disabled=!data.eligible;
  }
  el('p','브라우저를 닫으면 위치가 갱신되지 않습니다. 30분 이상 지난 위치는 검색에 사용하지 않아요. 끄더라도 접수한 상담은 유지됩니다.',card,'visit-hint');
  clearTimeout(timer);timer=setTimeout(()=>{if(card.isConnected&&document.visibilityState==='visible')load().catch(()=>{});},60000);
 };try{await load();}catch{status(card,'방문 가능 상태를 불러오지 못했어요.');button('다시 확인',card,load);}
}
export async function renderUrgentWorkspace(client,root){
 const panel=el('section','',root,'card urgent-panel');el('h2','전문가 방문상담 내역',panel);const body=el('div','',panel);let busy=false;
 const load=async()=>{if(busy)return;busy=true;try{const rows=await rpc(client,'workspace');body.replaceChildren();if(!rows.length)el('p','접수한 방문상담이 없습니다.',body);
  for(const r of rows){const c=el('article','',body,'urgent-request');el('h3',(purposes[r.purpose]||'보험 상담')+' · 전문가 방문',c);
   el('strong',r.rejected?labels.REJECTED:r.confirmed&&r.state==='ACCEPTED'?labels.CONFIRMED:labels[r.state],c);
   el('p',r.region+(r.distanceKm!=null?' · 검색 기준 '+distance(r.distanceKm):''),c);if(r.expertName)el('p',r.expertName+' 전문가',c);
   if(r.preferredAt)el('p',(r.confirmed?'확정시간':'희망시간')+' · '+time(r.preferredAt),c);
   if(r.details){el('p','만날 장소 · '+r.details.place,c);link(r.details.phone,'tel:'+r.details.phone,c);if(r.details.note)el('p',r.details.note,c);}else el('p','고객이 일정을 확정한 뒤 방문 주소와 연락처를 확인할 수 있어요.',c,'visit-hint');
   const act=(title,op,payload={})=>button(title,c,async()=>{await rpc(client,op,{id:r.id,...payload});await load();});
   if(!r.mine&&!r.assigned&&r.state==='REQUESTED'){act('희망시간 수락','accept');act('요청 거절','pass');}
   if(r.mine&&r.state==='ACCEPTED'&&!r.confirmed){const agree=field(c,'이 일정으로 확정하고 선택한 전문가에게 방문 주소·연락처·요청내용을 제공합니다.','checkbox');button('방문 일정 확정',c,async()=>{if(!agree.checked){status(c,'주소 제공 동의를 확인해 주세요.');return;}await rpc(client,'confirm_visit',{id:r.id,consent:true});await load();});}
   if(r.assigned&&r.confirmed){if(['ACCEPTED','PREPARING'].includes(r.state))act('출발 알리기','trip',{state:'DEPARTED'});if(['DEPARTED','EN_ROUTE'].includes(r.state))act('도착 알리기','trip',{state:'ARRIVED'});if(r.state==='ARRIVED')act('상담 완료','trip',{state:'COMPLETED'});}
   if((r.mine||r.assigned)&&!['COMPLETED','CANCELLED','EXPIRED'].includes(r.state))act('요청 취소','cancel');
  }
 }finally{busy=false;}};
 button('내역 새로고침',panel,load,true);try{await load();}catch{status(panel,'내역을 불러오지 못했어요. 새로고침해 주세요.');}
 const timer=setInterval(()=>{if(!panel.isConnected){clearInterval(timer);return;}if(document.visibilityState==='visible'&&!document.querySelector('dialog[open]'))load().catch(()=>{});},30000);
}
async function customerPage(client,root){
 const {data:list,error}=await client.rpc('service_area_catalog');if(error)throw error;
 const params=new URLSearchParams(location.search);let searchPoint=null,area=null,revision=0;
 el('h1','내 근처 전문가 찾기',root);el('p','방문 가능한 전문가 한 명을 직접 선택하세요. 요청 → 전문가 수락 → 고객 일정 확정 순서로 진행합니다.',root);
 link('내가 보험소에 방문할게요','/map.html?view=offices',root);
 const browse=el('section','',root,'card urgent-panel'),tracking=el('div','',root);
 const query=()=>({area:area.id,...(searchPoint||{})});
 const selectArea=()=>{revision++;searchPoint=null;browse.replaceChildren();el('h2','어디를 기준으로 찾을까요?',browse);
  button('내 현재 위치로 찾기',browse,async()=>{status(browse,'가까운 전문가를 계산하기 위해 위치를 확인합니다. 실제 방문 주소는 다음 단계에서 따로 입력해요.');const point=await locationOnce();searchPoint=point;area=[...list].sort((a,b)=>(a.latitude-point.latitude)**2+(a.longitude-point.longitude)**2-((b.latitude-point.latitude)**2+(b.longitude-point.longitude)**2))[0];await show();});
  const search=field(browse,'지역 직접 선택');search.placeholder='강남구, 김포시, 분당…';const options=el('div','',browse,'area-options');
  const render=()=>{options.replaceChildren();for(const a of list.filter(a=>(a.region+' '+a.name).includes(search.value.trim())).slice(0,12))button(a.region+' '+a.name,options,async()=>{area=a;searchPoint=null;await show();},true);if(!options.children.length){el('p','아직 서비스 지역에 없는 시·군·구라면 오픈 알림을 신청할 수 있어요.',options);if(search.value.trim().length>=2)waitlistActions(options,search.value.trim(),client);}};search.oninput=render;render();
 };
 const show=async()=>{const version=++revision;browse.replaceChildren();el('h2','지금 방문 가능한 전문가',browse);el('p',searchPoint?'내 위치 기준 · 실제 만날 주소는 별도로 입력해요.':area.region+' '+area.name+' 중심 기준 · 실제 거리와 다를 수 있어요.',browse);el('p','거리·시간은 검색 위치까지의 직선거리 추정입니다. 실제 방문 주소·교통 상황에 따라 달라져요.',browse,'visit-hint');
  const rows=await catalog(client,query());if(version!==revision)return;
  if(!rows.length){
   el('p','이 주변에서 지금 방문 가능한 전문가가 없습니다.',browse);
   const [registered,offices]=await Promise.all([client.rpc('planner_catalog',{area:area.id,wanted:''}),client.rpc('office_catalog')]);if(version!==revision)return;
   const publicProfiles=(registered.data?.planners||[]).filter(p=>!p.is_sample);
   if(!registered.error&&publicProfiles.length){
    el('p','등록된 활동지역 전문가: '+publicProfiles.map(p=>p.name).join(', ')+'. 현재 방문 가능 상태와는 별도입니다.',browse,'visit-hint');
    const mapQuery=new URLSearchParams({view:'experts',region:area.id});if(params.get('situation'))mapQuery.set('situation',params.get('situation'));
    link('이 지역 전문가 지도 보기','/map.html?'+mapQuery,browse);
   }else if(!registered.error&&!offices.error&&!(offices.data||[]).some(o=>o.status==='active'&&o.region===area.id))waitlistActions(browse,area.id,client);
   link('보험소 방문 예약 알아보기','/map.html?view=offices&region='+encodeURIComponent(area.id),browse);
  }
  for(const p of rows){const card=el('article','',browse,'card visit-candidate');el('h3',p.name+' 전문가',card);el('strong',distance(p.distanceKm)+' · 약 '+p.etaMin+'~'+p.etaMax+'분 거리',card);el('p',(p.specialties||[]).map(x=>purposes[x]||x).join(' · '),card);
   const checks=[p.registrationVerified&&'자격 확인',p.organizationVerified&&'소속 확인'].filter(Boolean);if(checks.length)el('p',checks.map(x=>'✓ '+x).join(' · '),card,'visit-verification');
   el('p',p.stale?'방문 가능 · 위치 확인 10분 이상 경과':'지금 방문 가능',card);button('이 전문가에게 방문상담 요청',card,async()=>{if(!await requireActiveMember({client,next:'/urgent.html?region='+encodeURIComponent(area.id)+'&situation='+(params.get('situation')||'claim')}))return;const release=await client.rpc('release_status');if(release.error)throw release.error;if(!release.data.phoneVerified){status(card,'휴대전화 인증을 마치면 요청할 수 있어요.');link('휴대전화 인증하기','/phone-verification.html?next='+encodeURIComponent('/urgent.html?region='+area.id),card);return;}requestFlow(p);});
  }button('검색 위치 변경',browse,selectArea,true);button('목록 새로고침',browse,show,true);
 };
 function requestFlow(expert){const requestKey=crypto.randomUUID();browse.replaceChildren();el('h2',expert.name+' 전문가에게 요청',browse);el('p','검색 기준: '+(searchPoint?'내 현재 위치':area.region+' '+area.name)+' · 방문 장소는 아래에서 따로 정해 주세요.',browse);
  const pl=el('label','상담 분야',browse,'field'),purpose=el('select','',pl);for(const [v,t] of Object.entries(purposes)){const o=el('option',t,purpose);o.value=v;}purpose.value=({cancer:'illness',hospitalization:'medical'})[params.get('situation')]||params.get('situation')||'claim';if(!purpose.value)purpose.value='claim';
  const ml=el('label','어디에서 만날까요?',browse,'field'),kind=el('select','',ml);for(const [v,t] of [['nearby','현재 위치 근처'],['address','직접 주소 입력']]){const o=el('option',t,kind);o.value=v;}kind.value=searchPoint?'nearby':'address';
  const place=field(browse,'실제 방문 주소·만날 장소');place.maxLength=160;place.autocomplete='street-address';place.placeholder='도로명 주소와 건물명·만날 위치';
  el('p','현재 위치를 선택해도 주소가 자동 전달되지 않습니다. 방문할 곳의 주소를 정확히 적어 주세요.',browse,'visit-hint');
  const tl=el('label','오늘 희망시간 (한국 시간)',browse,'field'),slot=el('select','',tl);const start=Math.ceil((Date.now()+20*60000)/1800000)*1800000;for(let t=start;t<Date.now()+4*3600000;t+=1800000){const o=el('option',time(t),slot);o.value=new Date(t).toISOString();}
  const phone=field(browse,'연락 가능한 휴대전화','tel');phone.autocomplete='tel';phone.inputMode='tel';
  const note=field(browse,'요청내용 (선택)','textarea');note.maxLength=300;el('p','주민번호·진단서 등 민감한 정보는 적지 마세요.',browse,'visit-hint');
  const consent=field(browse,'이 전문가 한 명에게 상담 분야·대략 지역·희망시간을 전달하는 데 동의합니다.','checkbox');el('p','정확한 주소·연락처는 전문가 수락 후, 고객님이 일정을 확정할 때 공개됩니다.',browse,'visit-hint');
  button('방문상담 요청 보내기',browse,async()=>{if(place.value.trim().length<2){status(browse,'방문 주소를 입력해 주세요.');place.focus();return;}const number=phone.value.replace(/\D/g,'');if(!/^01\d{8,9}$/.test(number)){status(browse,'연락 가능한 휴대전화를 확인해 주세요.');phone.focus();return;}if(!consent.checked){status(browse,'요청 전달 동의를 확인해 주세요.');return;}
   await rpc(client,'request',{...query(),request_key:requestKey,planner_id:expert.id,purpose:purpose.value,meeting_kind:kind.value,place:place.value.trim(),phone:number,note:note.value.trim(),preferred_at:slot.value,consent:true});
   browse.replaceChildren();el('h2',labels.REQUESTED,browse);el('p','아직 예약 확정 전입니다. 전문가가 수락하면 아래에서 주소 제공에 동의하고 일정을 확정해 주세요.',browse);tracking.replaceChildren();await renderUrgentWorkspace(client,tracking);
  });button('목록으로',browse,show,true);
 }
 const initial=list.find(a=>a.id===params.get('region'));if(initial){area=initial;await show();}else selectArea();
 const state=await memberState(client);if(state.state===MEMBER.active)await renderUrgentWorkspace(client,tracking);else link('내 요청 확인 · 로그인','/login.html?next=%2Furgent.html',tracking);
}
const root=document.querySelector('[data-urgent-page]');if(root)memberService().then(({client})=>customerPage(client,root)).catch(()=>{status(root,'전문가 목록을 불러오지 못했어요. 잠시 후 다시 확인해 주세요.');link('보험소 지도 보기','/map.html?view=offices',root);});
