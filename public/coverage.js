/* Approximate area markers, NOT business addresses. September 2026 district labels. */
const COVERAGE_AREAS = window.COVERAGE_AREAS;

let coverageLayer;
function renderCoverage(region='전체') {
 if (!map || typeof L === 'undefined') return;
 if (!coverageLayer) coverageLayer=L.layerGroup().addTo(map);
 coverageLayer.clearLayers();
 const items=COVERAGE_AREAS.filter(o=>region==='전체'||o.region===region);
 const icon=L.divIcon({className:'coverage-marker',html:'<span aria-hidden="true">보</span>',iconSize:[27,31],iconAnchor:[13,31]});
 items.forEach(o=>L.marker([o.lat,o.lng],{icon,title:officeName(o.name)+' · 개설 예정'}).addTo(coverageLayer)
 .bindTooltip(officeName(o.name),{direction:'top'})
 .bindPopup('<div class="mk-pop"><div class="mk-name">'+officeName(o.name)+'</div><p class="coverage-status">오픈 예정 · 상세 주소는 개설 시 안내</p><p>시간을 정하면 보험소가 담당 전문가를 배정해요.</p><button class="btn" onclick="bookArea(\''+o.region+'\',\''+o.name+'\')">전문가 찾아보기</button><a href="signup.html#expert" class="btn secondary" style="margin-top:8px;">전문가로 참여</a></div>'));
 if(items.length)map.fitBounds(L.latLngBounds(items.map(o=>[o.lat,o.lng])).pad(.08));
 document.querySelectorAll('[data-coverage-region]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.coverageRegion===region)));
 const c=document.getElementById('coverageCount');if(c)c.textContent=items.length+'곳 오픈 예정';
}
window.addEventListener('load',()=>{
 if(!document.getElementById('map'))return;
 document.querySelectorAll('[data-coverage-region]').forEach(b=>b.addEventListener('click',()=>renderCoverage(b.dataset.coverageRegion)));
 if(map)renderCoverage();
 else {const c=document.getElementById('coverageCount');if(c)c.textContent='지도를 불러오지 못했습니다. 네트워크 연결을 확인해 주세요.';}
});
