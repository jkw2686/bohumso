(function () {
  'use strict';
  var host = document.getElementById('homeMap');
  if (!host || !window.L) return;
  var map = L.map(host, {scrollWheelZoom:false,zoomAnimation:false}).setView([37.5,127.1],9);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap 기여자'}).addTo(map);
  var areas = window.COVERAGE_AREAS || [];
  areas.forEach(function(area){
    var content=document.createElement('div'),title=document.createElement('strong'),link=document.createElement('a');
    title.textContent=window.officeName(area.name)+' · 오픈 예정';
    link.textContent='이 지역 보기 →';link.href='/map.html?region='+encodeURIComponent(area.region+' '+area.name);
    content.append(title,document.createElement('br'),link);
    L.marker([area.lat,area.lng],{title:window.officeName(area.name),icon:L.divIcon({className:'home-office-pin',html:window.uiIcon('clock'),iconSize:[30,30]})}).addTo(map).bindPopup(content);
  });
  var button=document.getElementById('homeLocate'),notice=document.getElementById('homeLocationStatus'),me,circle;
  button.addEventListener('click',function(){
    button.disabled=true;
    window.findBohumsoLocation({progress:function(text){notice.textContent=text;},error:function(text){notice.textContent=text;button.disabled=false;},success:function(pos){
      var point=[pos.coords.latitude,pos.coords.longitude];
      if(me)map.removeLayer(me);if(circle)map.removeLayer(circle);
      me=L.circleMarker(point,{radius:8,color:'#1E4FD6',fillOpacity:1}).addTo(map).bindTooltip('내 위치');
      circle=L.circle(point,{radius:pos.coords.accuracy,interactive:false}).addTo(map);
      map.setView(point,pos.coords.accuracy>5000?10:13,{animate:false});
      notice.textContent=pos.coords.accuracy>5000?'대략적인 위치예요. 지도를 움직여 지역을 확인하세요.':'내 위치를 찾았어요.';button.disabled=false;
    }});
  });
  document.getElementById('homeMapResize').addEventListener('click',function(){var large=host.classList.toggle('large');this.textContent=large?'지도 작게':'지도 크게';this.setAttribute('aria-expanded',String(large));map.invalidateSize();});
  new ResizeObserver(function(){map.invalidateSize();}).observe(host);
})();
