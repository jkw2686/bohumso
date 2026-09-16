import {purposes,specialties,el,input,select,link,sortedProfiles} from './consultation-ui.js';
const samples=[{id:'sample-seoul',name:'가상 설계사 A',organization:'테스트 소속',region:'서울 마포구',specialties:['claim','management'],biography:'프로필 비교를 위한 가상 예시입니다. 실제 상담을 받는 설계사가 아닙니다.',experience:0,photo_url:'',hours:'예시: 평일 09:00~18:00',latitude:37.566,longitude:126.902,is_sample:true,available:true,completed_count:0,reviews:[],rating:null},{id:'sample-gyeonggi',name:'가상 설계사 B',organization:'테스트 소속',region:'경기 성남시',specialties:['coverage','new'],biography:'전문가 모집 중인 지역의 화면 예시입니다.',experience:0,photo_url:'',hours:'예시: 일정 협의',latitude:37.42,longitude:127.12,is_sample:true,available:true,completed_count:0,reviews:[],rating:null}];
export async function renderDirectory(client){
 const host=document.getElementById('directory'),form=document.getElementById('findForm'),notice=document.getElementById('directoryNotice');let position=null,profiles=[],map=null,markers=[];
 const region=form.elements.region,purpose=form.elements.purpose;const params=new URLSearchParams(location.search);if(params.has('purpose'))purpose.value=params.get('purpose');
 function draw(){
  host.replaceChildren();const list=sortedProfiles(profiles,position);
  if(!list.length)el('p','선택한 지역·분야는 보험소 개설 예정 · 전문가 모집 중입니다. 다른 지역을 선택해 주세요.',host);
  for(const p of list){const card=el('article',undefined,host);card.className='card planner-card';
   if(p.photo_url){const img=el('img',undefined,card);img.src=p.photo_url;img.alt=p.name+' 프로필';img.loading='lazy';img.className='profile-photo';}else el('div','사진 미등록',card).className='profile-placeholder';
   el('span',p.is_sample?'샘플 · 실제 상담 불가':'관리자 등록 확인',card).className='sample-tag';
   el('h2',p.name,card);el('p',p.organization+' · '+p.region+(p.distance!==null?' · 약 '+p.distance.toFixed(1)+'km':''),card);
   el('p',p.specialties.map(s=>specialties[s]||s).join(' · '),card);el('p',p.biography||'자기소개 준비 중',card);
   el('p',(p.experience?'경력 '+p.experience+'년':'경력 정보 미등록')+' · 완료 상담 '+p.completed_count+'건',card);
   el('p',p.hours||'상담가능 시간 확인 필요',card);el('p',p.rating?('평점 '+p.rating+' / 5 · 공개 후기 '+p.reviews.length+'건'):'후기 없음 · 평점 미집계',card);for(const r of p.reviews||[]){el('blockquote',r.rating+'점 · '+r.body,card);}
   for(const [method,label]of [['phone','지금 통화 요청'],['nearby','근처에서 만나기'],['scheduled','시간 약속하기']]){
    const a=link(card,label,'/requests.html?planner='+encodeURIComponent(p.id)+'&purpose='+encodeURIComponent(purpose.value||'other')+'&method='+method+'&region='+encodeURIComponent(p.region));a.className='btn ghost';
    if(!client||p.id.startsWith('sample-')||!p.available){a.removeAttribute('href');a.setAttribute('aria-disabled','true');a.textContent=label+(!p.available?' · 현재 요청 중지':' · 샘플');}
   }
   if(p.is_sample&&client&&!p.id.startsWith('sample-'))el('p','테스트 계정의 가상 예약만 가능합니다.',card);
  }
  if(window.L){
   if(!map){map=window.L.map('plannerMap').setView([37.5,127],9);const layer=window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap contributors',maxZoom:19}).addTo(map);layer.on('tileerror',()=>document.getElementById('mapNotice').textContent='지도 배경을 불러오지 못했습니다. 아래 목록에서 지역과 프로필을 확인할 수 있습니다.');new ResizeObserver(()=>map.invalidateSize()).observe(document.getElementById('plannerMap'));}
   document.getElementById('plannerMap').hidden=!list.some(p=>Number.isFinite(p.latitude)&&Number.isFinite(p.longitude));if(document.getElementById('plannerMap').hidden)document.getElementById('mapNotice').textContent='공개 거점 좌표가 아직 등록되지 않았습니다. 지역별 목록에서 확인해 주세요.';else map.invalidateSize();markers.forEach(m=>m.remove());markers=[];
   list.filter(p=>Number.isFinite(p.latitude)&&Number.isFinite(p.longitude)).forEach(p=>{const box=document.createElement('div');el('strong',p.name,box);el('p',p.region+(p.is_sample?' · 샘플 위치':''),box);el('p',p.specialties.map(x=>specialties[x]||x).join(' · '),box);const a=link(box,'프로필 보기','#directory');a.onclick=()=>{[...host.querySelectorAll('h2')].find(x=>x.textContent===p.name)?.scrollIntoView({behavior:'smooth'});};markers.push(window.L.marker([p.latitude,p.longitude]).addTo(map).bindPopup(box));});
   if(position)map.setView([position.lat,position.lng],11);
  }else document.getElementById('mapNotice').textContent='지도를 불러오지 못했습니다. 아래 목록에서 같은 전문가를 확인할 수 있습니다.';
 }
 async function refresh(){notice.textContent='전문가 정보를 확인하고 있습니다.';try{if(client){const {data,error}=await client.rpc('planner_catalog',{area:region.value,wanted:purpose.value});if(error)throw error;profiles=data.planners;notice.textContent='소비자 가입·탐색·상담 요청 무료 · 보험 가입 의무 없음';}else{profiles=samples.filter(p=>(!region.value||p.region.startsWith(region.value))&&(!purpose.value||p.specialties.includes(purpose.value)));notice.textContent='샘플 체험 · 실제 등록 설계사와 운영 지역이 아닙니다.';}draw();}catch{notice.textContent='전문가 정보를 불러오지 못했습니다. 다시 시도해 주세요.';host.replaceChildren();}}
 form.onsubmit=e=>{e.preventDefault();refresh();};
 document.getElementById('locatePlanners').onclick=()=>{if(!form.elements.location_consent.checked){notice.textContent='위치 사용 동의를 선택하거나 지역을 직접 선택해 주세요.';return;}if(!navigator.geolocation){notice.textContent='지역을 직접 선택해 주세요.';return;}navigator.geolocation.getCurrentPosition(p=>{position={lat:p.coords.latitude,lng:p.coords.longitude};notice.textContent='현재 위치는 거리 정렬에만 사용하며 저장하지 않습니다.';draw();},()=>{position=null;notice.textContent='위치를 사용하지 않고 지역 선택으로 찾을 수 있습니다.';draw();},{timeout:8000});};
 await refresh();
}
