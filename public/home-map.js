(function () {
  'use strict';
  var host = document.getElementById('homeMap');
  if (!host || !window.L) return;
  var map = L.map(host, {scrollWheelZoom:true,zoomAnimation:true,zoomSnap:0.25,zoomDelta:0.5,wheelPxPerZoomLevel:120,wheelDebounceTime:40,touchZoom:true,dragging:!L.Browser.mobile}).setView([37.5,127.1],9);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap 기여자'}).addTo(map);
  map.zoomControl.setPosition('bottomright');
  map.on('popupopen',function(){host.classList.add('popup-open');});
  map.on('popupclose',function(){host.classList.remove('popup-open');});
  var planned = (window.COVERAGE_AREAS || []).map(function(area){
    return {name:window.officeName(area.name),region:area.region+' '+area.name,planned:true,latitude:area.lat,longitude:area.lng};
  });
  var offices=[],experts=[],markers=[],expertMarkers=new Map(),officeLoading=false,expertLoading=false;
  var expertPanel=document.getElementById('homeExperts'),expertList=document.getElementById('homeExpertList');
  function hasPoint(s){return Number.isFinite(s.latitude)&&Number.isFinite(s.longitude);}
  function expertURL(s){return '/map.html?view=experts&region='+encodeURIComponent(s.region||'')+'&planner='+encodeURIComponent(s.id);}
  function expertContent(s){
    var content=document.createElement('div');content.className='office-slot';
    function add(tag,text){var el=document.createElement(tag);el.textContent=text;content.appendChild(el);return el;}
    window.BohumsoProfile.identity(content,s);add('p',s.region);
    add('p','공개 활동지역입니다. 현재 위치나 방문할 사무실 주소가 아닙니다.');
    var link=add('a','전문가 지도에서 보기');link.className='btn';link.href=expertURL(s);
    return content;
  }
  function drawMarkers(){
    markers.forEach(function(marker){map.removeLayer(marker);});markers=[];expertMarkers.clear();
    var spots=planned.concat(offices,experts).filter(hasPoint),groups=new Map();
    spots.forEach(function(s){var key=s.latitude.toFixed(4)+','+s.longitude.toFixed(4);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(s);});
    groups.forEach(function(group){group.forEach(function(s,index){
      var columns=Math.min(group.length,4),rows=Math.ceil(group.length/columns);
      var x=(index%columns-(columns-1)/2)*44,y=(Math.floor(index/columns)-(rows-1)/2)*44;
      var size=s.expert?36:30,content;
      if(s.expert)content=expertContent(s);else{content=document.createElement('div');window.renderOfficeSlot(content,s);}
      var marker=L.marker([s.latitude,s.longitude],{
        title:s.name+(s.expert?' · 전문가 활동지역':s.planned?'':' · 운영 중'),
        zIndexOffset:s.expert?100:0,
        icon:L.divIcon({className:s.expert?'home-expert-pin':'home-office-pin',html:window.uiIcon(s.expert?'person':'home'),iconSize:[size,size],iconAnchor:[size/2-x,size/2-y],popupAnchor:[x,y-size/2]})
      }).addTo(map).bindPopup(content,{maxWidth:280,minWidth:220,autoPanPaddingTopLeft:[16,16],autoPanPaddingBottomRight:[16,24]});
      if(s.expert)expertMarkers.set(s.id,marker);markers.push(marker);
    });});
  }
  function renderExperts(){
    if(!expertPanel||!expertList)return;
    expertList.replaceChildren();expertPanel.hidden=!experts.length;
    experts.forEach(function(s){
      var item=document.createElement(hasPoint(s)?'button':'a');item.className='btn ghost';item.textContent=s.name+' · '+s.region;
      if(hasPoint(s)){
        item.type='button';item.setAttribute('aria-label',s.name+' · '+s.region+' 활동지역 보기');
        item.addEventListener('click',function(){var marker=expertMarkers.get(s.id);if(!marker)return;map.setView(marker.getLatLng(),13,{animate:false});marker.openPopup();host.scrollIntoView({block:'center',behavior:'instant'});marker.getElement()?.focus({preventScroll:true});});
      }else item.href=expertURL(s);
      expertList.appendChild(item);
    });
  }
  async function actualOffices(){
    if(officeLoading||!window.bohumsoOffices)return;officeLoading=true;
    try{offices=(await window.bohumsoOffices()).filter(function(o){return o.status==='active'&&hasPoint(o);});drawMarkers();}catch{}finally{officeLoading=false;}
  }
  async function publicExperts(){
    if(expertLoading||!window.bohumsoCatalog)return;expertLoading=true;
    try{
      var catalog=await window.bohumsoCatalog('','');
      experts=(catalog.planners||[]).filter(function(p){return !p.is_sample;}).map(function(p){return {id:p.id,name:p.name,region:p.region,organization:p.organization,photo_url:p.photo_url,biography:p.biography,insurance_types:p.insurance_types,help_tasks:p.help_tasks,offices:p.offices,latitude:p.area_latitude,longitude:p.area_longitude,expert:true};});
      drawMarkers();renderExperts();
    }catch{}finally{expertLoading=false;}
  }
  function loadPublicMap(){actualOffices();publicExperts();}
  drawMarkers();window.addEventListener('bohumso-member-ready',loadPublicMap,{once:true});loadPublicMap();
  var button=document.getElementById('homeLocate'),notice=document.getElementById('homeLocationStatus'),me,circle;
  function locate(){
    button.disabled=true;
    window.findBohumsoLocation({progress:function(text){notice.textContent=text;},error:function(text){notice.textContent=text;button.disabled=false;},success:function(pos){
      var point=[pos.coords.latitude,pos.coords.longitude];
      if(me)map.removeLayer(me);if(circle)map.removeLayer(circle);
      var approximate=pos.source==='network';
      me=L.circleMarker(point,{radius:8,color:'#1E4FD6',fillOpacity:approximate?0.15:1}).addTo(map).bindTooltip(approximate?'접속 지역 · 대략':pos.coords.accuracy>500?'기기 추정 위치':'내 위치');
      if(!approximate)circle=L.circle(point,{radius:pos.coords.accuracy,interactive:false}).addTo(map);
      map.setView(point,approximate||pos.coords.accuracy>500?10:13,{animate:false});
      notice.textContent=approximate?'접속 지역 기준의 대략적인 지도예요. 정확한 위치는 브라우저·기기 위치 권한을 켜 주세요.':pos.coords.accuracy>500?'위치 오차가 약 '+Math.round(pos.coords.accuracy)+'m로 큽니다. 실제 위치와 다를 수 있어요.':'내 위치 · 오차 약 '+Math.round(pos.coords.accuracy)+'m';button.disabled=false;
    }});
  }
  button.addEventListener('click',locate);
  window.startBohumsoLocation(locate,function(saved){
    var point=[saved.latitude,saved.longitude];map.setView(point,saved.source==='DEVICE'?13:11);
    notice.textContent=saved.source==='MANUAL'?'선택한 지역 · '+(saved.label||'지도에서 확인'):saved.source==='NETWORK'?'최근 접속 지역 · 대략적인 위치예요.':'최근 확인한 내 위치예요. 위치 버튼으로 갱신할 수 있어요.';
    if(saved.source==='DEVICE')me=L.circleMarker(point,{radius:8}).addTo(map).bindTooltip('최근 확인한 위치');
  });
  document.getElementById('homeMapResize').addEventListener('click',function(){var large=host.classList.toggle('large');this.textContent=large?'지도 작게':'지도 크게';this.setAttribute('aria-expanded',String(large));map.invalidateSize();});
  function fitOfficePopup(){host.style.setProperty('--office-popup-content-height',Math.max(120,Math.min(240,host.clientHeight*.7-26))+'px');map.invalidateSize();}
  fitOfficePopup();new ResizeObserver(fitOfficePopup).observe(host);
})();
