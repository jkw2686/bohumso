/* 소비자 위치기반 지도 — 최소착수(Leaflet/OSM). 지도 레이어는 한 곳(tileLayer)에서 정의해 카카오맵 전환을 쉽게 한다.
   합법구조(CLAUDE.md §1): 소비자가 목록에서 직접 선택하고 본인이 연락을 개시한다. 정보 자동전송·자동매칭 없음.
   노출 순서: 거리·평점·전문분야 (서류량 연동 금지). */
(function () {
  'use strict';
  var SEOUL = [37.5665, 126.9780];

  /* ── 카카오맵 키 자리 (나중에 콘솔에서 발급 후 여기에 꽂기) ──
     KAKAO_MAP_KEY가 비어 있으면 현행 Leaflet/OSM으로 동작(임시).
     키를 넣고 카카오맵으로 전환하려면 initMap의 '지도 타일' 부분만 카카오맵 초기화로 교체하면 된다.
     (카카오 개발자콘솔 → 앱 → 플랫폼 Web에 도메인 등록 + 지도 API 활성화 필요) */
  var KAKAO_MAP_KEY = ''; // TODO: 카카오맵 JavaScript 키

  // 홈 상황선택에서 넘어온 목적(claim/management/coverage/other) — 실데이터 필터에 사용
  var PURPOSE = '';var SITUATION='';
  try { PURPOSE = new URLSearchParams(location.search).get('purpose') || '';SITUATION=new URLSearchParams(location.search).get('situation')||''; } catch (e) {}

  // 지인 테스트용 샘플 거점(실데이터 아님, 삭제 가능). 실제 목록은 추후 planner_catalog 연동.
  var SPOTS = [];
  var PLANNED = (window.COVERAGE_AREAS || []).map(function(o,i){return {id:'planned-'+i,name:officeName(o.name),job:'오픈 예정 보험소',specialty:'지역 상담 거점',region:o.region+' '+o.name,lat:o.lat,lng:o.lng,rating:0,planned:true};});
  var AVAIL = { now: '지금 상담 가능', today: '오늘 상담 가능', scheduled: '예약 상담', unavailable: '상담 준비 중' };
  // 전문분야 코드→한글 (consultation-ui.js와 동일)
  var SPECIALTY = { death: '사망보험금', illness: '암·질병', medical: '실손보험', claim: '보험금 청구', accident: '자동차·상해', life: '생명보험', nonlife: '손해보험', corporate: '법인보험', remodel: '보험 리모델링', management: '기존 보험 관리', coverage: '보장 점검', new: '신규 가입', other: '기타 문의' };
  // 지도 방식 → 기존 요청 흐름의 method 값 매핑(전화 통화 / 바로 만나기 / 시간 예약)
  var WAY_METHOD = { visit_office: 'scheduled', request_visit: 'nearby', call: 'phone', message: 'phone' };

  var GU = {}; (window.COVERAGE_AREAS||[]).forEach(function(o){(GU[o.region]||(GU[o.region]=[])).push(o.name);});
  var REGION_CENTER = { '서울': [37.5665, 126.9780], '경기': [37.4138, 127.5183], '인천': [37.4563, 126.7052] };
  var PURPOSE_LABELS = { claim: '보험금 청구', management: '가입한 보험 확인', coverage: '받을 보험금 확인', other: '필요한 도움' };

  var cancelLocate = null, regionRevision = 0, spotsRevision = 0, cardOpener = null;
  var map, meMarker, accuracyCircle, userLoc = null, sortBy = 'distance', current = null, usingSamples = false;
  var showExperts=false;var SAMPLES = [], spotMarkers = [], selectedArea = '';
  var $ = function (id) { return document.getElementById(id); };

  function haversine(a, b) {
    var R = 6371, dLat = (b[0] - a[0]) * Math.PI / 180, dLng = (b[1] - a[1]) * Math.PI / 180;
    var s = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(a[0] * Math.PI / 180) * Math.cos(b[0] * Math.PI / 180) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
  }
  function distText(km) { return km < 1 ? Math.round(km * 1000) + 'm' : km.toFixed(1) + 'km'; }
  // 받침 유무로 은/는 선택 (받침 있으면 '은', 없으면 '는')
  function eun(word) { var c = word ? word.charCodeAt(word.length - 1) : 0; return (c >= 0xAC00 && c <= 0xD7A3 && (c - 0xAC00) % 28 !== 0) ? '은' : '는'; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }
  function thumbHtml(s, cls) { return s.photo ? '<img class="' + cls + ' thumb-img" src="' + esc(s.photo) + '" alt="" loading="lazy">' : '<span class="' + cls + '" aria-hidden="true">' + esc(s.name.charAt(0)) + '</span>'; }
  function availHtml(s) { return (s.availability && AVAIL[s.availability]) ? '<span class="avail avail-' + s.availability + '">' + AVAIL[s.availability] + '</span>' : ''; }
  function spotDist(s) { if (!Number.isFinite(s.lat) || !Number.isFinite(s.lng)) return Infinity; var ref = userLoc || SEOUL; return haversine(ref, [s.lat, s.lng]); }
  function distLabel(s) { var d = spotDist(s); return isFinite(d) ? distText(d) : '위치 미등록'; }

  function pinIcon(me,planned) {
    if(planned)return L.divIcon({html:'<span class="planned-pin">'+(window.uiIcon?.('clock')||'')+'</span>',className:'',iconSize:[32,32],iconAnchor:[16,16]});
    // 색은 토큰으로. presentation attribute(fill=)는 var()를 못 받으므로 style로 지정한다.
    var color = me ? 'var(--accent)' : 'var(--brand)';
    var html = '<svg class="' + (me ? 'pin-me' : 'pin-marker') + '" width="34" height="42" viewBox="0 0 34 42" xmlns="http://www.w3.org/2000/svg">' +
      '<path style="fill:' + color + '" d="M17 0C7.6 0 0 7.5 0 16.8 0 29 17 42 17 42s17-13 17-25.2C34 7.5 26.4 0 17 0z"/>' +
      '<path style="fill:var(--card, #fff)" d="M17 8l7 6v9h-4v-6h-6v6H10v-9l7-6z"/></svg>';
    return L.divIcon({ html: html, className: '', iconSize: [34, 42], iconAnchor: [17, 42], popupAnchor: [0, -38] });
  }

  function initMap(center, zoom) {
    map = L.map('map', { zoomControl: true, attributionControl: false }).setView(center, zoom || 13);
    // ── 지도 타일: 이 한 곳만 바꾸면 카카오맵 등으로 교체 가능 ──
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);
    drawMarkers();
    map.zoomControl.setPosition("topright");
    new ResizeObserver(function(){map.invalidateSize();}).observe($("mapStage"));
  }

  // 현재 SPOTS로 마커를 다시 그리고 지도 범위를 맞춘다(지역 재조회 시 재사용).
  function drawMarkers() {
    spotMarkers.forEach(function (m) { map.removeLayer(m); });
    spotMarkers = [];
    var coords = [];
    SPOTS.forEach(function (s) {
      if (!Number.isFinite(s.lat) || !Number.isFinite(s.lng)) return; // 좌표 없으면 목록에만 표시
      coords.push([s.lat, s.lng]);
      s._marker = L.marker([s.lat, s.lng], { icon: pinIcon(false,s.planned), title: s.name+(s.planned?' · 오픈 예정':' · 전문가') }).addTo(map);
      s._marker.on('click', function () { openCard(s); });
      spotMarkers.push(s._marker);
    });
    // 전문가 위치에 맞춰 범위 자동 조정(위치 권한 허용 시 locate가 다시 내 위치로 이동)
    if (coords.length > 1) map.fitBounds(L.latLngBounds(coords).pad(0.25));
    else if (coords.length === 1) map.setView(coords[0], 14);
  }

  // 지역 선택 등으로 SPOTS를 다시 불러온다(실데이터 area 필터, 없으면 샘플을 지역으로 필터).
  async function reloadSpots(area) {
    var revision=++spotsRevision;
    selectedArea = area || '';
    var real = await loadReal(selectedArea);
    if(revision!==spotsRevision)return;
    if (real) { SPOTS = real; usingSamples = false; }
    else { SPOTS = []; usingSamples = false; }
    SPOTS = SPOTS.concat(PLANNED.filter(function(s){return !selectedArea || s.region.indexOf(selectedArea)===0;}));
    if (map) drawMarkers();
    renderList();
  }

  function setMe(loc,accuracy) {
    userLoc = loc;const nearest=PLANNED.slice().sort((a,b)=>haversine(loc,[a.lat,a.lng])-haversine(loc,[b.lat,b.lng]))[0];if(nearest)selectedArea=nearest.region;
    if (meMarker) meMarker.setLatLng(loc); else meMarker = L.marker(loc, { icon: pinIcon(true), title: '내 위치', zIndexOffset: 1000 }).addTo(map);
    if(accuracyCircle)map.removeLayer(accuracyCircle);if(accuracy)accuracyCircle=L.circle(loc,{radius:accuracy,interactive:false,color:'var(--brand)'}).addTo(map);
    if (map) map.setView(loc, accuracy>5000?10:13);
    renderList();
  }

  function sortedSpots() {
    var arr = SPOTS.filter(function(s){return !showExperts||!s.planned;});
    if (sortBy === 'rating') arr.sort(function (a, b) { return b.rating - a.rating; });
    else if (sortBy === 'specialty') arr.sort(function (a, b) { return a.specialty.localeCompare(b.specialty, 'ko'); });
    else arr.sort(function (a, b) { return spotDist(a) - spotDist(b); });
    return arr;
  }

  function renderList() {
    var body = $('listBody'); body.innerHTML = '';

    var arr = sortedSpots();var areaLink=$('areaRequest');if(areaLink){areaLink.hidden=!selectedArea;areaLink.href='/requests.html?purpose='+encodeURIComponent(PURPOSE||'claim')+'&region='+encodeURIComponent(selectedArea);areaLink.textContent='이 지역에서 시간 정하기';}
    if (!arr.length) {
      $('listCount').textContent = '지금 바로 가능한 전문가는 없어요.';
      var empty = document.createElement('p');
      empty.className = 'list-empty';
      empty.textContent = '보험소에 상담 시간을 남겨 주시면 담당자를 확인할게요.';
      body.appendChild(empty);var request=document.createElement('a');request.className='btn';request.href='/requests.html?purpose='+encodeURIComponent(PURPOSE||'claim')+'&region='+encodeURIComponent(selectedArea||'');request.textContent='상담 시간 정하기';body.appendChild(request);var wider=document.createElement('button');wider.type='button';wider.className='card-more';wider.textContent='전체 지역 보기';wider.onclick=function(){showExperts=false;reloadSpots('');};body.appendChild(wider);return;
    }
    $('listCount').textContent = showExperts?'주변 전문가 '+arr.length+'명':'전문가·보험소 '+arr.length+'곳';
    arr.forEach(function (s) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'spot';
      b.innerHTML =
        thumbHtml(s, 'thumb') +
        '<span class="info">' +
          '<span class="name">' + esc(s.name) + '</span>' +
          '<span class="sub">' + esc(s.job) + ' · ' + esc(s.specialty) + '</span>' +
          '<span class="meta">' + (s.planned ? '오픈 예정 · '+esc(s.region) : '★ '+s.rating.toFixed(1)) + (userLoc?' · '+distLabel(s):'') + '</span>' +
          availHtml(s) +
          (s.pledge ? '<span class="badge-pledge">소비자보호 서약</span>' : '') +
        '</span>';
      b.addEventListener('click', function () { if (map && Number.isFinite(s.lat) && Number.isFinite(s.lng)) map.setView([s.lat, s.lng], 15); openCard(s); });
      body.appendChild(b);
    });
  }

  /* 마커/목록 탭 → 하단 카드(요약). 다른 마커 탭하면 내용만 교체. */
  function openCard(s) {
    current = s;
    if(s.planned){$('cardBody').innerHTML='<span class="booking-kind">오픈 예정</span><h2>'+esc(s.name)+'</h2><p>곧 만나요.</p><p>이 지역의 방문상담 서비스를 준비하고 있어요.</p><button class="btn" type="button" id="nearbyExperts">주변 전문가 보기</button>';$('nearbyExperts').onclick=function(){closeCard();showList();selectedArea=s.region;showExperts=true;renderList();};showCard();return;}
    $('cardBody').innerHTML='<div class="card-top">'+thumbHtml(s,'thumb')+'<div><h2>'+esc(s.name)+'</h2><p>'+esc(s.specialty)+'</p></div></div><p>'+esc(s.region)+(userLoc?' · '+distLabel(s):'')+'</p><button class="btn" id="requestTime" type="button">상담 시간 정하기</button><details><summary>소개 더보기</summary><p>'+esc(s.hours||'가능 일정은 신청 후 확인해요.')+'</p><p>보험소에서 담당 전문가를 배정합니다.</p></details>';
    $('requestTime').onclick=function(){chooseWay(s,'visit_office');};showCard();
  }
  function showCard(){var sheet=$('cardSheet'),scrim=$('cardScrim');cardOpener=document.activeElement;sheet.style.height='';sheet.hidden=false;sheet.classList.remove('detail');scrim.hidden=false;void sheet.offsetHeight;sheet.classList.add('show');scrim.classList.add('show');$('cardClose').focus();}

  function closeCard() {
    var sheet = $('cardSheet'), scrim = $('cardScrim');
    sheet.classList.remove('show', 'detail'); scrim.classList.remove('show');
    var wasOpen=!sheet.hidden;sheet.hidden=true;scrim.hidden=true;
    if(wasOpen&&cardOpener&&cardOpener.isConnected)cardOpener.focus();
  }

  function chooseWay(s, way) {
    // 소비자가 직접 고른 전문가·방식으로 기존 요청 흐름(requests.html, 로그인 게이트)에 넘긴다.
    // 전문가에게 정보 자동 전송·자동매칭 없음 — 소비자가 요청을 개시한다(CLAUDE.md §1).
    var params = 'purpose=' + encodeURIComponent(PURPOSE || 'other') +
      '&method=' + (WAY_METHOD[way] || 'scheduled');
    if (s.region) params += '&region=' + encodeURIComponent(s.region);if(SITUATION)params+='&situation='+encodeURIComponent(SITUATION);
    location.href = '/requests.html?' + params;
  }

  // Keyboard buttons and drag share the same sheet; suppress the post-drag click.
  function bindGrip(gripId, sheetId, toggle, collapse) {
    var grip=$(gripId), sheet=$(sheetId), start=null, dragged=false;
    grip.addEventListener('click',function(){if(dragged){dragged=false;return;}toggle();});
    grip.addEventListener('pointerdown',function(e){start={y:e.clientY,height:sheet.getBoundingClientRect().height};dragged=false;grip.setPointerCapture(e.pointerId);});
    grip.addEventListener('pointermove',function(e){if(!start)return;var dy=start.y-e.clientY;if(Math.abs(dy)<8&&!dragged)return;dragged=true;var limit=$('mapStage').clientHeight-16;sheet.style.height=Math.max(100,Math.min(limit,start.height+dy))+'px';sheet.style.maxHeight='calc(100% - 16px)';});
    grip.addEventListener('pointerup',function(e){if(start&&dragged&&e.clientY-start.y>start.height-85)collapse();start=null;});
    grip.addEventListener('pointercancel',function(){start=null;});
  }
  function showList(){var sheet=$('listSheet');sheet.hidden=false;$('listReopen').hidden=true;}
  function hideList(){closeCard();$('listSheet').hidden=true;$('listReopen').hidden=false;$('listReopen').focus();}
  function toggleList(){var sheet=$('listSheet');sheet.style.height='';sheet.style.maxHeight='';var open=sheet.classList.toggle('open');$('listGrip').textContent=open?'↕ 목록 작게':'↕ 목록 크게';$('listGrip').setAttribute('aria-expanded',String(open));}

  // 실제 등록 전문가 로드(planner_catalog, anon). 위경도 있는 것만. 실패·없음이면 null → 샘플 유지.
  async function loadReal(area) {
    try {
      var r = await fetch('/api/config', { cache: 'no-store', signal:AbortSignal.timeout(8000) });
      if (!r.ok) return null;
      var cfg = await r.json();
      if (!cfg.enabled || !cfg.url || !cfg.key) return null;
      var rr = await fetch(cfg.url.replace(/\/$/, '') + '/rest/v1/rpc/planner_catalog', {
        method: 'POST', signal:AbortSignal.timeout(8000), headers: { apikey: cfg.key, 'Content-Type': 'application/json' }, body: JSON.stringify({ area: area || '', wanted: PURPOSE || '' })
      });
      if (!rr.ok) return null;
      var data = await rr.json();
      var list = ((data && data.planners) || []).filter(function(p){return !p.is_sample;});
      var spots = list.map(function (p) {
        return {
          id: p.id, name: p.name || p.organization || '보험소',
          job: p.organization || '보험 전문가',
          specialty: (Array.isArray(p.specialties) && p.specialties.length ? p.specialties.map(function (x) { return SPECIALTY[x] || x; }).join('·') : '상담'),
          region: p.region || '',
          lat: Number.isFinite(p.latitude) ? p.latitude : null, lng: Number.isFinite(p.longitude) ? p.longitude : null,
          rating: p.rating || 0, pledge: !!p.verified,
          hours: p.hours || '', completed: p.completed_count || 0, reviews: Array.isArray(p.reviews) ? p.reviews.length : 0,
          photo: p.photo_url || '', availability: p.availability_status || ''
        };
      });
      return spots; // 실전문가가 하나라도 있으면 샘플 폴백 안 함(좌표 없어도 목록엔 표시)
    } catch (e) { return null; }
  }

  async function boot() {
    // 홈 상황선택에서 넘어왔으면 안내 칩 표시
    if (PURPOSE && PURPOSE_LABELS[PURPOSE]) {
      var chip = document.createElement('div');
      chip.className = 'purpose-chip';
      chip.setAttribute('role', 'note');
      chip.textContent = ({death:'가족 사망 관련 도움',cancer:'진단 후 보험 확인',hospitalization:'입원·수술 후 보험 확인',accident:'사고 후 보험 확인'}[SITUATION]||PURPOSE_LABELS[PURPOSE])+' · 가까운 곳에서';
      var nav = document.querySelector('.map-nav');
      if (nav) nav.after(chip);
    }
    if (PURPOSE) { var ll = $('listLink'); if (ll) ll.href = '/find.html?purpose=' + encodeURIComponent(PURPOSE); }
    SAMPLES = SPOTS.slice(); // 지역 재필터용 원본 샘플 보관
    SPOTS = PLANNED.slice();
    initMap(SEOUL, 12);
    renderList();
    reloadSpots(new URLSearchParams(location.search).get('region')||'');

    // 정렬 탭
    document.querySelectorAll('.sort-tabs button').forEach(function (t) {
      t.addEventListener('click', function () {
        sortBy = t.getAttribute('data-sort');showExperts=sortBy==='rating';
        document.querySelectorAll('.sort-tabs button').forEach(function (x) { x.setAttribute('aria-selected', x === t ? 'true' : 'false'); });
        renderList();
      });
    });

    bindGrip('listGrip','listSheet',toggleList,hideList);
    $('listClose').addEventListener('click',hideList);
    $('listReopen').addEventListener('click',function(){showList();$('listGrip').focus();});
    bindGrip('cardGrip','cardSheet',function(){$('cardSheet').classList.toggle('detail');},closeCard);
    $('cardClose').addEventListener('click',closeCard);
    $('cardScrim').addEventListener('click',closeCard);
    document.addEventListener('keydown',function(e){if(e.key==='Escape'){if(!$('cardSheet').hidden)closeCard();else hideList();}});

    // 현재 위치
    $('locateFab').addEventListener('click', locate);

    // 지역 선택 폴백
    var city = $('regionCity'), gu = $('regionGu');
    city.addEventListener('change', function () {
      gu.innerHTML = '<option value="">구/군</option>';
      (GU[city.value] || []).forEach(function (g) { var o = document.createElement('option'); o.value = g; o.textContent = g; gu.appendChild(o); });
    });
    function applyRegion(){
      regionRevision++;if(cancelLocate)cancelLocate();$('locateFab').disabled=false;userLoc=null;if(meMarker){map.removeLayer(meMarker);meMarker=null;}if(accuracyCircle){map.removeLayer(accuracyCircle);accuracyCircle=null;}showList();document.querySelector('.region-title').textContent='선택한 지역의 보험소를 보여드려요.';
      var chosen=(window.COVERAGE_AREAS||[]).find(function(o){return o.region===city.value&&o.name===gu.value;}); var center = chosen?[chosen.lat,chosen.lng]:(REGION_CENTER[city.value] || SEOUL); // 구/군 지오코딩은 후속, 우선 시/도 중심
      if (map) map.setView(center, city.value ? 12 : 11);
      $('regionPicker').hidden = false;
      reloadSpots(city.value+(gu.value?' '+gu.value:''));
    }
    $('regionApply').addEventListener('click',applyRegion);gu.addEventListener('change',applyRegion);

  }

  function locate() {
    if(cancelLocate)cancelLocate();
    var revision=++regionRevision,notice=document.querySelector('.region-title');
    $('locateFab').disabled=true;
    cancelLocate=window.findBohumsoLocation({
      progress:function(message){notice.textContent=message;},
      success:async function(pos){
        if(revision!==regionRevision)return;
        await reloadSpots('');if(revision!==regionRevision)return;
        $('regionCity').value='';$('regionGu').innerHTML='<option value="">구/군</option>';
        setMe([pos.coords.latitude,pos.coords.longitude],pos.coords.accuracy);showList();
        notice.textContent=pos.coords.accuracy>5000?'대략적인 위치예요. 지역을 선택해 범위를 좁힐 수 있어요.':'내 위치를 찾았어요. 위치 오차 약 '+Math.round(pos.coords.accuracy)+'m';
        $('locateFab').disabled=false;
      },
      error:function(message){if(revision!==regionRevision)return;notice.textContent=message;$('locateFab').disabled=false;}
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
