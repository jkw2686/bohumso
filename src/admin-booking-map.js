// Receives only the existing authenticated admin workspace result. No extra data access.
let map,layer,visibleBounds=[],rows=[],mode='office',selected='',state='',initialized=false;
const $=id=>document.getElementById(id);
const normalize=value=>String(value||'').replace(/서울특별시/g,'서울').replace(/경기도/g,'경기').replace(/인천광역시/g,'인천').replace(/\s/g,'');
const center=row=>(window.COVERAGE_AREAS||[]).find(a=>normalize(a.region+a.name)===normalize(row.region));
const key=row=>mode==='planner'?(row.planner_id||'unassigned'):(row.region||'unknown');
const name=row=>mode==='planner'?(row.planner_name||'배정 대기'):(center(row)?window.officeName(center(row).name):row.region||'지역 미등록');
const statusNames={requested:'요청',coordinating:'조율 중',scheduled:'예약 확정',confirmed:'예약 확정',completed:'완료',cancelled:'취소',awaiting_completion:'완료 확인',dispute:'분쟁',no_show:'노쇼',unmatched:'요청 종료'};
function element(tag,text,parent){const node=document.createElement(tag);if(text!=null)node.textContent=text;if(parent)parent.appendChild(node);return node;}
function filtered(){return rows.filter(r=>(!selected||key(r)===selected)&&(!state||r.state===state));}
function choose(value){selected=value;draw();}
function draw(){
 if(!map)return;layer.clearLayers();
 const groups=new Map();for(const row of rows){if(state&&row.state!==state)continue;const id=key(row);if(!groups.has(id))groups.set(id,{title:name(row),count:0});groups.get(id).count++;}
 if(selected&&!groups.has(selected))selected='';
 const groupHost=$('adminMapGroups');groupHost.replaceChildren();
 const all=element('button','전체 '+rows.filter(r=>!state||r.state===state).length+'건',groupHost);all.type='button';all.setAttribute('aria-pressed',String(!selected));all.onclick=()=>choose('');
 for(const [id,group]of groups){const b=element('button',group.title+' · '+group.count+'건',groupHost);b.type='button';b.setAttribute('aria-pressed',String(id===selected));b.onclick=()=>choose(id);}
 const current=filtered(),regions=new Map(),missing=[];
 for(const row of current){const area=center(row);if(!area){missing.push(row);continue;}const id=normalize(area.region+area.name);if(!regions.has(id))regions.set(id,{area,bookings:[]});regions.get(id).bookings.push(row);}
 const bounds=[];
 for(const {area,bookings} of regions.values()){
   const point=[area.lat,area.lng];bounds.push(point);
   const waiting=bookings.every(r=>!r.planner_id),icon=window.L.divIcon({className:'admin-booking-pin'+(waiting?' waiting':''),html:'<span>'+bookings.length+'</span>',iconSize:[38,38],iconAnchor:[19,19]});
   const popup=element('div');element('strong',window.officeName(area.name),popup);element('p',bookings.length+'건 · 예약 지역 중심',popup);
   for(const row of bookings){const b=element('button',new Date(row.preferred_at).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'})+' · '+(row.planner_name||'배정 대기'),popup);b.type='button';b.className='admin-map-reservation';b.onclick=()=>{document.dispatchEvent(new CustomEvent('admin-map-filter',{detail:[row.id]}));const card=[...document.querySelectorAll('[data-booking-id]')].find(c=>c.dataset.bookingId===row.id);card?.scrollIntoView({behavior:'smooth',block:'start'});};}
   window.L.marker(point,{icon,title:window.officeName(area.name)+' '+bookings.length+'건'}).addTo(layer).bindPopup(popup,{maxWidth:300});
 }
 visibleBounds=bounds;
 if(bounds.length)map.fitBounds(bounds,{padding:[35,35],maxZoom:12});
 $('adminMapCount').textContent=current.length+'건 · '+regions.size+'개 지역'+(missing.length?' · 위치 미등록 '+missing.length+'건':'');
 $('adminMapEmpty').hidden=current.length>0;$('adminMapEmpty').textContent=rows.length?'선택한 조건의 예약이 없어요.':'아직 접수된 예약이 없어요.';
 $('adminMapMissing').hidden=!missing.length;$('adminMapMissing').textContent=missing.length?'지역을 찾지 못한 '+missing.length+'건은 아래 예약 목록에서 확인하세요.':'';
 for(const b of document.querySelectorAll('[data-map-group]'))b.setAttribute('aria-pressed',String(b.dataset.mapGroup===mode));
 document.dispatchEvent(new CustomEvent('admin-map-filter',{detail:selected||state?current.map(r=>r.id):null}));
 map.invalidateSize();
}
export function renderAdminBookingMap(bookings){
 if(!$('adminBookingMap')||!window.L)return;rows=bookings;
 if(!initialized){
  initialized=true;map=window.L.map('adminBookingMap',{scrollWheelZoom:false}).setView([37.5,127.05],9);window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap 기여자'}).addTo(map);layer=window.L.layerGroup().addTo(map);
  new ResizeObserver(()=>{map.invalidateSize();if(visibleBounds.length)map.fitBounds(visibleBounds,{padding:[35,35],maxZoom:12});}).observe($('adminBookingMap'));
  for(const b of document.querySelectorAll('[data-map-group]'))b.onclick=()=>{mode=b.dataset.mapGroup;selected='';draw();};
  $('adminMapState').onchange=e=>{state=e.target.value;draw();};
  $('adminMapReset').onclick=()=>{state='';selected='';$('adminMapState').value='';draw();};
 }
 draw();
}
