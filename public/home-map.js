(function () {
  'use strict';
  var host = document.getElementById('homeMap');
  if (!host || !window.L) return;
  var map = L.map(host, {scrollWheelZoom:true,zoomAnimation:true,zoomSnap:0.25,zoomDelta:0.5,wheelPxPerZoomLevel:120,wheelDebounceTime:40,touchZoom:true,dragging:!L.Browser.mobile}).setView([37.5,127.1],9);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap 기여자'}).addTo(map);
  var areas = window.COVERAGE_AREAS || [];
  areas.forEach(function(area){
    var content=document.createElement('div');
    window.renderOfficeSlot(content,{name:window.officeName(area.name),region:area.region+' '+area.name,planned:true});
    L.marker([area.lat,area.lng],{title:window.officeName(area.name),icon:L.divIcon({className:'home-office-pin',html:window.uiIcon('home'),iconSize:[30,30]})}).addTo(map).bindPopup(content,{maxWidth:320,minWidth:230});
  });
  var button=document.getElementById('homeLocate'),notice=document.getElementById('homeLocationStatus'),me,circle;
  function locate(){
    button.disabled=true;
    window.findBohumsoLocation({progress:function(text){notice.textContent=text;},error:function(text){notice.textContent=text;button.disabled=false;},success:function(pos){
      var point=[pos.coords.latitude,pos.coords.longitude];
      if(me)map.removeLayer(me);if(circle)map.removeLayer(circle);
      var approximate=pos.source==='network';
      me=L.circleMarker(point,{radius:8,color:'#1E4FD6',fillOpacity:approximate?0.15:1}).addTo(map).bindTooltip(approximate?'접속 지역 · 대략':'내 위치');
      if(!approximate)circle=L.circle(point,{radius:pos.coords.accuracy,interactive:false}).addTo(map);
      map.setView(point,approximate||pos.coords.accuracy>5000?10:13,{animate:false});
      notice.textContent=approximate?'접속 지역 기준의 대략적인 지도예요. 정확한 위치는 브라우저·기기 위치 권한을 켜 주세요.':pos.coords.accuracy>5000?'대략적인 위치예요. 지도를 움직여 지역을 확인하세요.':'내 위치를 찾았어요.';button.disabled=false;
    }});
  }
  button.addEventListener('click',locate);
  window.startBohumsoLocation(locate);
  document.getElementById('homeMapResize').addEventListener('click',function(){var large=host.classList.toggle('large');this.textContent=large?'지도 작게':'지도 크게';this.setAttribute('aria-expanded',String(large));map.invalidateSize();});
  new ResizeObserver(function(){map.invalidateSize();}).observe(host);
})();
