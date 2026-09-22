/* Approximate area markers, NOT business addresses. September 2026 district labels. */
const COVERAGE_AREAS = [
  {
    "region": "서울",
    "name": "종로구",
    "lat": 37.573,
    "lng": 126.979,
    "status": "planned"
  },
  {
    "region": "서울",
    "name": "중구",
    "lat": 37.564,
    "lng": 126.998,
    "status": "planned"
  },
  {
    "region": "서울",
    "name": "용산구",
    "lat": 37.532,
    "lng": 126.99,
    "status": "planned"
  },
  {
    "region": "서울",
    "name": "성동구",
    "lat": 37.563,
    "lng": 127.037,
    "status": "planned"
  },
  {
    "region": "서울",
    "name": "광진구",
    "lat": 37.538,
    "lng": 127.082,
    "status": "planned"
  },
  {
    "region": "서울",
    "name": "동대문구",
    "lat": 37.574,
    "lng": 127.04,
    "status": "planned"
  },
  {
    "region": "서울",
    "name": "중랑구",
    "lat": 37.606,
    "lng": 127.093,
    "status": "planned"
  },
  {
    "region": "서울",
    "name": "성북구",
    "lat": 37.589,
    "lng": 127.016,
    "status": "planned"
  },
  {
    "region": "서울",
    "name": "강북구",
    "lat": 37.64,
    "lng": 127.025,
    "status": "planned"
  },
  {
    "region": "서울",
    "name": "도봉구",
    "lat": 37.669,
    "lng": 127.047,
    "status": "planned"
  },
  {
    "region": "서울",
    "name": "노원구",
    "lat": 37.654,
    "lng": 127.056,
    "status": "planned"
  },
  {
    "region": "서울",
    "name": "은평구",
    "lat": 37.602,
    "lng": 126.929,
    "status": "planned"
  },
  {
    "region": "서울",
    "name": "서대문구",
    "lat": 37.579,
    "lng": 126.936,
    "status": "planned"
  },
  {
    "region": "서울",
    "name": "마포구",
    "lat": 37.566,
    "lng": 126.902,
    "status": "planned"
  },
  {
    "region": "서울",
    "name": "양천구",
    "lat": 37.517,
    "lng": 126.866,
    "status": "planned"
  },
  {
    "region": "서울",
    "name": "강서구",
    "lat": 37.551,
    "lng": 126.849,
    "status": "planned"
  },
  {
    "region": "서울",
    "name": "구로구",
    "lat": 37.495,
    "lng": 126.888,
    "status": "planned"
  },
  {
    "region": "서울",
    "name": "금천구",
    "lat": 37.457,
    "lng": 126.896,
    "status": "planned"
  },
  {
    "region": "서울",
    "name": "영등포구",
    "lat": 37.526,
    "lng": 126.896,
    "status": "planned"
  },
  {
    "region": "서울",
    "name": "동작구",
    "lat": 37.512,
    "lng": 126.94,
    "status": "planned"
  },
  {
    "region": "서울",
    "name": "관악구",
    "lat": 37.478,
    "lng": 126.951,
    "status": "planned"
  },
  {
    "region": "서울",
    "name": "서초구",
    "lat": 37.483,
    "lng": 127.032,
    "status": "planned"
  },
  {
    "region": "서울",
    "name": "강남구",
    "lat": 37.518,
    "lng": 127.047,
    "status": "planned"
  },
  {
    "region": "서울",
    "name": "송파구",
    "lat": 37.514,
    "lng": 127.106,
    "status": "planned"
  },
  {
    "region": "서울",
    "name": "강동구",
    "lat": 37.53,
    "lng": 127.124,
    "status": "planned"
  },
  {
    "region": "경기",
    "name": "수원시 장안구",
    "lat": 37.304,
    "lng": 127.01,
    "status": "planned"
  },
  {
    "region": "경기",
    "name": "수원시 권선구",
    "lat": 37.257,
    "lng": 126.972,
    "status": "planned"
  },
  {
    "region": "경기",
    "name": "수원시 팔달구",
    "lat": 37.282,
    "lng": 127.02,
    "status": "planned"
  },
  {
    "region": "경기",
    "name": "수원시 영통구",
    "lat": 37.259,
    "lng": 127.046,
    "status": "planned"
  },
  {
    "region": "경기",
    "name": "성남시 수정구",
    "lat": 37.451,
    "lng": 127.145,
    "status": "planned"
  },
  {
    "region": "경기",
    "name": "성남시 중원구",
    "lat": 37.431,
    "lng": 127.138,
    "status": "planned"
  },
  {
    "region": "경기",
    "name": "성남시 분당구",
    "lat": 37.383,
    "lng": 127.119,
    "status": "planned"
  },
  {
    "region": "경기",
    "name": "고양시 덕양구",
    "lat": 37.637,
    "lng": 126.832,
    "status": "planned"
  },
  {
    "region": "경기",
    "name": "고양시 일산동구",
    "lat": 37.659,
    "lng": 126.774,
    "status": "planned"
  },
  {
    "region": "경기",
    "name": "고양시 일산서구",
    "lat": 37.677,
    "lng": 126.747,
    "status": "planned"
  },
  {
    "region": "경기",
    "name": "용인시 처인구",
    "lat": 37.234,
    "lng": 127.201,
    "status": "planned"
  },
  {
    "region": "경기",
    "name": "용인시 기흥구",
    "lat": 37.28,
    "lng": 127.115,
    "status": "planned"
  },
  {
    "region": "경기",
    "name": "용인시 수지구",
    "lat": 37.322,
    "lng": 127.098,
    "status": "planned"
  },
  {
    "region": "경기",
    "name": "부천시 원미구",
    "lat": 37.498,
    "lng": 126.783,
    "status": "planned"
  },
  {
    "region": "경기",
    "name": "부천시 소사구",
    "lat": 37.48,
    "lng": 126.799,
    "status": "planned"
  },
  {
    "region": "경기",
    "name": "부천시 오정구",
    "lat": 37.528,
    "lng": 126.796,
    "status": "planned"
  },
  {
    "region": "경기",
    "name": "안산시 상록구",
    "lat": 37.301,
    "lng": 126.846,
    "status": "planned"
  },
  {
    "region": "경기",
    "name": "안산시 단원구",
    "lat": 37.319,
    "lng": 126.815,
    "status": "planned"
  },
  {
    "region": "경기",
    "name": "안양시 만안구",
    "lat": 37.386,
    "lng": 126.932,
    "status": "planned"
  },
  {
    "region": "경기",
    "name": "안양시 동안구",
    "lat": 37.393,
    "lng": 126.951,
    "status": "planned"
  },
  {
    "region": "경기",
    "name": "화성시 만세구",
    "lat": 37.2,
    "lng": 126.831,
    "status": "planned"
  },
  {
    "region": "경기",
    "name": "화성시 효행구",
    "lat": 37.22,
    "lng": 126.971,
    "status": "planned"
  },
  {
    "region": "경기",
    "name": "화성시 병점구",
    "lat": 37.206,
    "lng": 127.034,
    "status": "planned"
  },
  {
    "region": "경기",
    "name": "화성시 동탄구",
    "lat": 37.2,
    "lng": 127.097,
    "status": "planned"
  },
  {
    "region": "경기",
    "name": "의정부시",
    "lat": 37.738,
    "lng": 127.034,
    "status": "planned"
  },
  {
    "region": "경기",
    "name": "평택시",
    "lat": 36.993,
    "lng": 127.113,
    "status": "planned"
  },
  {
    "region": "경기",
    "name": "동두천시",
    "lat": 37.903,
    "lng": 127.06,
    "status": "planned"
  },
  {
    "region": "경기",
    "name": "광명시",
    "lat": 37.479,
    "lng": 126.864,
    "status": "planned"
  },
  {
    "region": "경기",
    "name": "과천시",
    "lat": 37.429,
    "lng": 126.987,
    "status": "planned"
  },
  {
    "region": "경기",
    "name": "구리시",
    "lat": 37.594,
    "lng": 127.13,
    "status": "planned"
  },
  {
    "region": "경기",
    "name": "남양주시",
    "lat": 37.636,
    "lng": 127.216,
    "status": "planned"
  },
  {
    "region": "경기",
    "name": "오산시",
    "lat": 37.15,
    "lng": 127.077,
    "status": "planned"
  },
  {
    "region": "경기",
    "name": "시흥시",
    "lat": 37.38,
    "lng": 126.803,
    "status": "planned"
  },
  {
    "region": "경기",
    "name": "군포시",
    "lat": 37.362,
    "lng": 126.935,
    "status": "planned"
  },
  {
    "region": "경기",
    "name": "의왕시",
    "lat": 37.344,
    "lng": 126.969,
    "status": "planned"
  },
  {
    "region": "경기",
    "name": "하남시",
    "lat": 37.54,
    "lng": 127.214,
    "status": "planned"
  },
  {
    "region": "경기",
    "name": "파주시",
    "lat": 37.76,
    "lng": 126.78,
    "status": "planned"
  },
  {
    "region": "경기",
    "name": "이천시",
    "lat": 37.272,
    "lng": 127.435,
    "status": "planned"
  },
  {
    "region": "경기",
    "name": "안성시",
    "lat": 37.008,
    "lng": 127.279,
    "status": "planned"
  },
  {
    "region": "경기",
    "name": "김포시",
    "lat": 37.615,
    "lng": 126.716,
    "status": "planned"
  },
  {
    "region": "경기",
    "name": "광주시",
    "lat": 37.43,
    "lng": 127.255,
    "status": "planned"
  },
  {
    "region": "경기",
    "name": "양주시",
    "lat": 37.785,
    "lng": 127.045,
    "status": "planned"
  },
  {
    "region": "경기",
    "name": "포천시",
    "lat": 37.895,
    "lng": 127.2,
    "status": "planned"
  },
  {
    "region": "경기",
    "name": "여주시",
    "lat": 37.298,
    "lng": 127.637,
    "status": "planned"
  },
  {
    "region": "경기",
    "name": "연천군",
    "lat": 38.096,
    "lng": 127.075,
    "status": "planned"
  },
  {
    "region": "경기",
    "name": "가평군",
    "lat": 37.831,
    "lng": 127.509,
    "status": "planned"
  },
  {
    "region": "경기",
    "name": "양평군",
    "lat": 37.491,
    "lng": 127.488,
    "status": "planned"
  },
  {
    "region": "인천",
    "name": "제물포구",
    "lat": 37.474,
    "lng": 126.632,
    "status": "planned"
  },
  {
    "region": "인천",
    "name": "영종구",
    "lat": 37.489,
    "lng": 126.532,
    "status": "planned"
  },
  {
    "region": "인천",
    "name": "미추홀구",
    "lat": 37.463,
    "lng": 126.65,
    "status": "planned"
  },
  {
    "region": "인천",
    "name": "연수구",
    "lat": 37.41,
    "lng": 126.678,
    "status": "planned"
  },
  {
    "region": "인천",
    "name": "남동구",
    "lat": 37.447,
    "lng": 126.731,
    "status": "planned"
  },
  {
    "region": "인천",
    "name": "부평구",
    "lat": 37.507,
    "lng": 126.721,
    "status": "planned"
  },
  {
    "region": "인천",
    "name": "계양구",
    "lat": 37.537,
    "lng": 126.737,
    "status": "planned"
  },
  {
    "region": "인천",
    "name": "서해구",
    "lat": 37.545,
    "lng": 126.675,
    "status": "planned"
  },
  {
    "region": "인천",
    "name": "검단구",
    "lat": 37.602,
    "lng": 126.657,
    "status": "planned"
  },
  {
    "region": "인천",
    "name": "강화군",
    "lat": 37.747,
    "lng": 126.488,
    "status": "planned"
  },
  {
    "region": "인천",
    "name": "옹진군",
    "lat": 37.254,
    "lng": 126.482,
    "status": "planned"
  }
];

let coverageLayer;
function renderCoverage(region='전체') {
 if (!map || typeof L === 'undefined') return;
 if (!coverageLayer) coverageLayer=L.layerGroup().addTo(map);
 coverageLayer.clearLayers();
 const items=COVERAGE_AREAS.filter(o=>region==='전체'||o.region===region);
 const icon=L.divIcon({className:'coverage-marker',html:'<span aria-hidden="true">보</span>',iconSize:[27,31],iconAnchor:[13,31]});
 items.forEach(o=>L.marker([o.lat,o.lng],{icon,title:o.region+' '+o.name+' 보험소 · 개설 예정'}).addTo(coverageLayer)
 .bindTooltip(o.name+' 보험소',{direction:'top'})
 .bindPopup('<div class="mk-pop"><div class="mk-name">'+o.region+' '+o.name+' 보험소</div><p class="coverage-status">개설 구상 · 실제 운영 거점 아님</p><p>등록 전문가를 직접 선택하고 만날 장소와 일정을 협의하세요.</p><button class="btn" onclick="bookArea(\''+o.region+'\',\''+o.name+'\')">전문가 찾아보기</button><a href="signup.html#expert" class="btn secondary" style="margin-top:8px;">전문가로 참여</a></div>'));
 if(items.length)map.fitBounds(L.latLngBounds(items.map(o=>[o.lat,o.lng])).pad(.08));
 document.querySelectorAll('[data-coverage-region]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.coverageRegion===region)));
 const c=document.getElementById('coverageCount');if(c)c.textContent=items.length+'개 지역 확장 구상';
}
window.addEventListener('load',()=>{
 if(!document.getElementById('map'))return;
 document.querySelectorAll('[data-coverage-region]').forEach(b=>b.addEventListener('click',()=>renderCoverage(b.dataset.coverageRegion)));
 if(map)renderCoverage();
 else {const c=document.getElementById('coverageCount');if(c)c.textContent='지도를 불러오지 못했습니다. 네트워크 연결을 확인해 주세요.';}
});
