import '../public/expert-profile-card.js';
import {pledgeDialog,PROFESSIONS} from './expert-shared.js';
import {availabilityLabels,availabilityOf} from './availability.js';
import {renderSponsored} from './sponsored.js';
import {purposes,specialties,el,input,select,link,sortedProfiles} from './consultation-ui.js';

export async function renderDirectory(client){
 const host=document.getElementById('directory'),form=document.getElementById('findForm'),notice=document.getElementById('directoryNotice');let position=null,profiles=[],map=null,markers=[];
 const region=form.elements.region,purpose=form.elements.purpose;const params=new URLSearchParams(location.search);if(params.has('purpose'))purpose.value=params.get('purpose');if(params.has('region'))region.value=params.get('region');if(params.has('availability'))form.elements.availability.value=params.get('availability');
 const sponsored=document.createElement('section');sponsored.hidden=true;host.before(sponsored);
 function draw(){
  host.replaceChildren();const list=sortedProfiles(profiles,position,purpose.value).filter(p=>!form.elements.availability.value||availabilityOf(p)===form.elements.availability.value);
  if(!list.length)el('p','선택한 지역·분야는 보험소 개설 예정 · 전문가 모집 중입니다. 다른 지역을 선택해 주세요.',host);
  for(const p of list){const card=el('article',undefined,host);card.className='card planner-card';card.id='profile-'+p.id;
   window.BohumsoProfile.identity(card,p,{interactive:true,context:{purpose:purpose.value,situation:params.get('situation')}});
   window.BohumsoProfile.profileLink(card,p,{purpose:purpose.value,situation:params.get('situation')},'프로필 보기');
   el('span',p.is_sample?'샘플 · 실제 상담 불가':p.verified?'등록 확인':'등록 전문가',card).className='sample-tag';
   if(p.profession)el('p',PROFESSIONS[p.profession]?.name||p.profession,card);if(p.protection_pledge){const badge=el('button','소비자보호 서약',card);badge.type='button';badge.className='pledge-badge';badge.onclick=pledgeDialog;}el('p',[p.organization,p.region].filter(Boolean).join(' · ')+(p.distance!==null?' · 활동지역 기준 약 '+(p.distance<1?Math.round(p.distance*1000)+'m':p.distance.toFixed(1)+'km'):''),card);
   el('p',(p.specialties||[]).map(s=>specialties[s]||s).join(' · '),card);
   if(Number.isFinite(p.completed_count)&&p.completed_count>0)el('p','완료 상담 '+p.completed_count+'건',card);
   el('p',(p.is_sample?'샘플 상태 · ': '')+availabilityLabels[availabilityOf(p)],card).className='availability-status';el('p','전문가가 설정한 상태입니다. 실제 통화·만남은 응답 후 확정됩니다.',card);el('p',p.hours||'상담가능 시간 확인 필요',card);el('p',p.rating?('평점 '+p.rating+' / 5 · 공개 후기 '+(p.reviews||[]).length+'건'):'아직 공개 후기가 없어요',card);for(const r of p.reviews||[]){el('blockquote',r.rating+'점 · '+r.body,card);}
   for(const [method,label]of [['phone','전화상담 요청'],['scheduled','상담 예약']]){
    const a=link(card,label,'/requests.html?planner='+encodeURIComponent(p.id)+'&purpose='+encodeURIComponent(purpose.value||'')+'&method='+method+'&region='+encodeURIComponent(p.region)+(params.get('situation')?'&situation='+encodeURIComponent(params.get('situation')):''));a.className='btn ghost';
    if(!client||p.is_sample||p.id.startsWith('sample-')||!p.available){a.removeAttribute('href');a.setAttribute('aria-disabled','true');a.textContent=label+(!p.available?' · 현재 요청 중지':' · 샘플');}
   }
   const visit=link(card,'이 전문가의 방문 가능 여부','/urgent.html?'+new URLSearchParams({planner:p.id,region:p.region,purpose:purpose.value||'claim',situation:params.get('situation')||''}));visit.className='btn ghost';
   if(p.is_sample&&client&&!p.id.startsWith('sample-'))el('p','테스트 계정의 가상 예약만 가능합니다.',card);
  }
  if(window.L){
   if(!map){map=window.L.map('plannerMap').setView([37.5,127],9);const layer=window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap contributors',maxZoom:19}).addTo(map);layer.on('tileerror',()=>document.getElementById('mapNotice').textContent='지도 배경을 불러오지 못했습니다. 아래 목록에서 지역과 프로필을 확인할 수 있습니다.');new ResizeObserver(()=>map.invalidateSize()).observe(document.getElementById('plannerMap'));}
   document.getElementById('plannerMap').hidden=!list.some(p=>Number.isFinite(p.latitude)&&Number.isFinite(p.longitude));if(document.getElementById('plannerMap').hidden)document.getElementById('mapNotice').textContent='공개 활동지역 정보가 없습니다. 지역별 목록에서 확인해 주세요.';else map.invalidateSize();markers.forEach(m=>m.remove());markers=[];
   list.filter(p=>Number.isFinite(p.latitude)&&Number.isFinite(p.longitude)).forEach(p=>{const box=document.createElement('div');el('strong',p.name,box);el('p',p.region+(p.is_sample?' · 샘플 위치':''),box);el('p',availabilityLabels[availabilityOf(p)]+(p.distance!==null?' · 약 '+p.distance.toFixed(1)+'km':''),box);el('p',p.specialties.map(x=>specialties[x]||x).join(' · '),box);window.BohumsoProfile.profileLink(box,p,{purpose:purpose.value,situation:params.get('situation')},'프로필 보기');const group=list.filter(x=>x.latitude===p.latitude&&x.longitude===p.longitude),index=group.findIndex(x=>x.id===p.id),columns=Math.min(group.length,4),icon=window.BohumsoProfile.markerIcon(p);icon.options.iconAnchor=[24-(index%columns-(columns-1)/2)*56,24-(Math.floor(index/columns)-(Math.ceil(group.length/columns)-1)/2)*56];markers.push(window.L.marker([p.latitude,p.longitude],{icon,title:p.name+' · 전문가 활동지역'}).addTo(map).bindPopup(box));});
   if(position){markers.push(window.L.circleMarker([position.lat,position.lng],{radius:8}).addTo(map).bindPopup('내 현재 위치 · 저장하지 않음'));map.setView([position.lat,position.lng],11);}
  }else document.getElementById('mapNotice').textContent='지도를 불러오지 못했습니다. 아래 목록에서 같은 전문가를 확인할 수 있습니다.';
 }
 async function refresh(){notice.textContent='전문가 정보를 확인하고 있습니다.';try{if(client){const {data,error}=await client.rpc('planner_catalog',{area:region.value,wanted:purpose.value});if(error)throw error;profiles=(data.planners||[]).filter(p=>!p.is_sample).map(p=>({...p,latitude:p.area_latitude??null,longitude:p.area_longitude??null}));notice.textContent='소비자 가입·탐색·상담 요청 무료 · 보험 가입 의무 없음';}else{profiles=[];notice.textContent='등록된 전문가를 준비하고 있습니다.';}draw();window.BohumsoProfile.refreshDetail(profiles);await renderSponsored(sponsored,region.value);}catch{notice.textContent='전문가 정보를 불러오지 못했습니다. 다시 시도해 주세요.';host.replaceChildren();}}
 form.elements.location_consent.onchange=()=>{if(!form.elements.location_consent.checked){position=null;draw();}};
 form.onsubmit=e=>{e.preventDefault();params.set('region',region.value);params.set('purpose',purpose.value);params.set('availability',form.elements.availability.value);history.replaceState(null,'',location.pathname+'?'+params);refresh();};
 document.getElementById('locatePlanners').onclick=()=>{if(!form.elements.location_consent.checked){notice.textContent='위치 사용 동의를 선택하거나 지역을 직접 선택해 주세요.';return;}if(!navigator.geolocation){notice.textContent='지역을 직접 선택해 주세요.';return;}navigator.geolocation.getCurrentPosition(p=>{if(!form.elements.location_consent.checked)return;position={lat:p.coords.latitude,lng:p.coords.longitude};notice.textContent='현재 위치는 거리 정렬에만 사용하며 저장하지 않습니다.';draw();},()=>{position=null;notice.textContent='위치를 사용하지 않고 지역 선택으로 찾을 수 있습니다.';draw();},{timeout:8000});};
 window.BohumsoProfile.onChange(refresh);
 await refresh();
 if(params.get('planner'))document.getElementById('profile-'+params.get('planner'))?.scrollIntoView({block:'start'});
 const timer=setInterval(()=>{if(!document.hidden)draw();},60000);window.addEventListener('pagehide',()=>clearInterval(timer),{once:true});
}
