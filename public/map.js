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
  var AVAIL = { now: '지금 상담 가능', today: '오늘 상담 가능', scheduled: '예약 상담', unavailable: '상담 요청 중지' };
  // 전문분야 코드→한글 (consultation-ui.js와 동일)
  var SPECIALTY = { death: '사망보험금', illness: '암·질병', medical: '실손보험', claim: '보험금 청구', accident: '자동차·상해', life: '생명보험', nonlife: '손해보험', corporate: '법인보험', remodel: '보험 리모델링', management: '기존 보험 관리', coverage: '보장 점검', new: '신규 가입', other: '기타 문의' };
  // 지도 방식 → 기존 요청 흐름의 method 값 매핑(전화 통화 / 바로 만나기 / 시간 예약)
  var WAY_METHOD = { visit_office: 'scheduled', request_visit: 'nearby', call: 'phone', message: 'phone' };

  var GU = {}; (window.COVERAGE_AREAS||[]).forEach(function(o){(GU[o.region]||(GU[o.region]=[])).push(o.name);});
  var REGION_CENTER = { '서울': [37.5665, 126.9780], '경기': [37.4138, 127.5183], '인천': [37.4563, 126.7052] };
  var PURPOSE_LABELS = { claim: '보험금 청구', management: '가입한 보험 확인', coverage: '받을 보험금 확인', other: '필요한 도움' };

  var cancelLocate = null, regionRevision = 0, spotsRevision = 0, cardOpener = null;
  var map, meMarker, accuracyCircle, userLoc = null, sortBy = 'distance', current = null, usingSamples = false;
  var showExperts=new URLSearchParams(location.search).get('view')==='experts',showOffices=new URLSearchParams(location.search).get('view')==='offices';var SAMPLES = [], spotMarkers = [], selectedArea = '';
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
  function thumbHtml(s, cls) { return '<span class="' + cls + '" aria-hidden="true">' + (window.uiIcon?.(s.office||s.planned?'home':'person')||esc(s.name.charAt(0))) + '</span>'; }
  // src/availability.js 의 availabilityOf 와 같은 규칙. map.js 는 번들 밖 일반 스크립트라
  // import 할 수 없어 복제했다. 두 결과가 같은지는 tests/availability.test.mjs 가 검증한다.
  // 렌더 시점마다 다시 계산하므로, 화면을 열어둔 채 유효시간이 지나면 배지가 내려간다.
  function availOf(s, now) {
    if (!s.available) return 'unavailable';
    if (['now', 'today'].indexOf(s.availabilityStatus) >= 0 && Date.parse(s.availabilityUntil) > (now || Date.now())) return s.availabilityStatus;
    return 'scheduled';
  }
  function availHtml(s) {
    if (s.office || s.planned) return '';
    var a = availOf(s);
    return AVAIL[a] ? '<span class="avail avail-' + a + '">' + AVAIL[a] + '</span>' : '';
  }
  function spotDist(s) { if (!Number.isFinite(s.lat) || !Number.isFinite(s.lng)) return Infinity; var ref = userLoc || SEOUL; return haversine(ref, [s.lat, s.lng]); }
  function distLabel(s) { var d = spotDist(s); return isFinite(d) ? distText(d) : '위치 미등록'; }

  function pinIcon(me,office,planned,profile) {
    if(office)return L.divIcon({html:'<span class="planned-pin'+(planned?' is-planned':'')+'">'+(window.uiIcon?.('home')||'')+'</span>',className:'',iconSize:[32,32],iconAnchor:[16,16]});
    if(!me)return window.BohumsoProfile.markerIcon({photo_url:profile?.photo});
    // 색은 토큰으로. presentation attribute(fill=)는 var()를 못 받으므로 style로 지정한다.
    var color = me ? 'var(--accent)' : 'var(--brand)';
    var html = '<svg class="' + (me ? 'pin-me' : 'pin-marker') + '" width="34" height="42" viewBox="0 0 34 42" xmlns="http://www.w3.org/2000/svg">' +
      '<path style="fill:' + color + '" d="M17 0C7.6 0 0 7.5 0 16.8 0 29 17 42 17 42s17-13 17-25.2C34 7.5 26.4 0 17 0z"/>' +
      '<path style="fill:var(--card, #fff)" d="M17 8l7 6v9h-4v-6h-6v6H10v-9l7-6z"/></svg>';
    return L.divIcon({ html: html, className: '', iconSize: [34, 42], iconAnchor: [17, 42], popupAnchor: [0, -38] });
  }

  function initMap(center, zoom) {
    map = L.map('map', { zoomControl: true, attributionControl: false, zoomSnap:0.25, zoomDelta:0.5, wheelPxPerZoomLevel:120, wheelDebounceTime:40, touchZoom:true }).setView(center, zoom || 13);
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
    var visibleSpots=SPOTS.filter(function(s){return Number.isFinite(s.lat)&&Number.isFinite(s.lng)&&(showOffices?(s.office||s.planned):!showExperts||(!s.office&&!s.planned));});
    var groups={};
    visibleSpots.forEach(function(s){var key=s.lat.toFixed(4)+','+s.lng.toFixed(4);(groups[key]||(groups[key]=[])).push(s);});
    visibleSpots.forEach(function (s) {
      if (!Number.isFinite(s.lat) || !Number.isFinite(s.lng)) return; // 좌표 없으면 목록에만 표시
      coords.push([s.lat, s.lng]);
      var icon=pinIcon(false,s.planned||s.office,s.planned,s), group=groups[s.lat.toFixed(4)+','+s.lng.toFixed(4)];
      // Separate shared reference points visually without changing stored coordinates or distance calculations.
      if(group.length>1){var index=group.indexOf(s),columns=Math.min(group.length,4),row=Math.floor(index/columns),rowCount=Math.ceil(group.length/columns);icon.options.iconAnchor=[icon.options.iconAnchor[0]-(index%columns-(Math.min(columns,group.length-row*columns)-1)/2)*56,icon.options.iconAnchor[1]-(row-(rowCount-1)/2)*56];}
      s._marker = L.marker([s.lat, s.lng], { icon: icon, title: s.name+(s.planned?' · 개설 예정 보험소':s.office?' · 보험소':' · 전문가 활동지역') }).addTo(map);
      s._marker.on('click', function () { openCard(s); });
      s._marker.getElement().addEventListener('keydown',function(event){if(event.key==='Enter'||event.key===' '){event.preventDefault();event.stopPropagation();openCard(s);}});
      spotMarkers.push(s._marker);
    });
    // 전문가 위치에 맞춰 범위 자동 조정(위치 권한 허용 시 locate가 다시 내 위치로 이동)
    if (coords.length > 1) map.fitBounds(L.latLngBounds(coords).pad(0.25));
    else if (coords.length === 1) map.setView(coords[0], 14);
  }

  // 지역 선택 등으로 SPOTS를 다시 불러온다(실데이터 area 필터, 없으면 샘플을 지역으로 필터).
  async function reloadSpots(area,preserve) {
    var previous=preserve&&map?{center:map.getCenter(),zoom:map.getZoom(),id:current?.id}:null;
    var revision=++spotsRevision;
    selectedArea = area || '';
    var real = await loadReal(selectedArea);
    if(revision!==spotsRevision)return;
    if (real) { SPOTS = real; usingSamples = false; }
    // 재조회 실패(preserve)에서는 목록을 비우지 않고 마지막으로 확인한 상태를 유지한다.
    // 다시 그리기만 하므로 availabilityUntil 이 지난 '지금 가능' 배지는 내려간다.
    else if (preserve) { if (map) drawMarkers(); renderList(); return; }
    else { SPOTS = []; usingSamples = false; }
    SPOTS = SPOTS.concat(PLANNED.filter(function(s){return !selectedArea || s.region.indexOf(selectedArea)===0;}));
    if (map) drawMarkers();
    renderList();
    if(previous){map.setView(previous.center,previous.zoom,{animate:false});var next=SPOTS.find(function(s){return s.id===previous.id;});if(next&&!$('cardSheet').hidden)openCard(next,true);window.BohumsoProfile.refreshDetail(SPOTS.filter(function(s){return !s.office&&!s.planned;}).map(function(s){return {...s,photo_url:s.photo,organization:s.job};}));}
  }

  function setMe(loc,accuracy,approximate) {
    userLoc = loc;const nearest=PLANNED.slice().sort((a,b)=>haversine(loc,[a.lat,a.lng])-haversine(loc,[b.lat,b.lng]))[0];if(nearest&&!approximate&&accuracy<=500)selectedArea=nearest.region;
    if (meMarker) meMarker.setLatLng(loc); else meMarker = L.marker(loc, { icon: pinIcon(true), title: approximate?'접속 지역 · 대략':accuracy>500?'기기 추정 위치':'내 위치', zIndexOffset: 1000 }).addTo(map);
    if(accuracyCircle)map.removeLayer(accuracyCircle);if(accuracy)accuracyCircle=L.circle(loc,{radius:accuracy,interactive:false,color:'var(--brand)'}).addTo(map);
    if (map) map.setView(loc, approximate||accuracy>500?10:13);
    renderList();
  }

  function sortedSpots() {
    var arr = SPOTS.filter(function(s){return showOffices?(s.office||s.planned):!showExperts||(!s.planned&&!s.office);});
    if (sortBy === 'rating') arr.sort(function (a, b) { return b.rating - a.rating; });
    else if (sortBy === 'specialty') arr.sort(function (a, b) { return a.specialty.localeCompare(b.specialty, 'ko'); });
    else arr.sort(function (a, b) { return spotDist(a) - spotDist(b); });
    return arr;
  }

  function renderList() {
    var body = $('listBody'); body.innerHTML = '';

    var arr = sortedSpots(),sheet=$('listSheet'),areaLink=$('areaRequest');
    sheet.classList.toggle('is-empty',!arr.length);
    areaLink.hidden=showOffices;areaLink.href='/urgent.html?purpose='+encodeURIComponent(PURPOSE||'claim')+'&situation='+encodeURIComponent(SITUATION||'claim')+'&region='+encodeURIComponent(selectedArea||'');areaLink.textContent='이 지역 방문 가능한 전문가 찾기';
    if (!arr.length) {
      $('listCount').textContent = showOffices?'이 지역에 등록된 보험소가 없습니다.':'이 지역에 등록된 전문가가 없습니다.';
      return;
    }
    $('listCount').textContent = showOffices?'보험소 거점 '+arr.length+'곳':showExperts?'공개 활동지역 · 전문가 '+arr.length+'명':'전문가·보험소 '+arr.length+'곳';
    arr.forEach(function (s) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'spot';
      b.innerHTML =
        thumbHtml(s, 'thumb') +
        '<span class="info">' +
          '<span class="name">' + esc(s.name) + '</span>' +
          '<span class="sub">' + esc(String(s.specialty||s.job||'').split(/[·,]/).slice(0,2).join(' · ')) + '</span>' +
          '<span class="meta">' + (s.planned ? '오픈 예정 · '+esc(s.region) : esc(s.region)) + (userLoc?' · '+(!s.office&&!s.planned?'활동지역까지 ':'')+distLabel(s):'') + '</span>' +
          availHtml(s) +
          '<span class="spot-action">'+(s.planned?'거점 안내':s.office?'방문 예약':'전문가 선택')+' →</span>' +
        '</span>';
      b.addEventListener('click', function () { if (map && Number.isFinite(s.lat) && Number.isFinite(s.lng)) map.setView([s.lat, s.lng], 15); openCard(s); });
      body.appendChild(b);
      if(!s.office&&!s.planned){var thumbnail=b.querySelector('.thumb'),avatar=window.BohumsoProfile.avatar(null,{photo_url:s.photo});avatar.classList.add('thumb');thumbnail.replaceWith(avatar);}
    });
  }

  /* 마커/목록 탭 → 하단 카드(요약). 다른 마커 탭하면 내용만 교체. */
  function openCard(s,preserveView) {
    if(!s.planned&&!s.office)window.bohumsoTrack?.('expert_viewed');
    current = s;spotMarkers.forEach(function(m){m.getElement()?.classList.toggle('is-selected',m===s._marker);m.setZIndexOffset(m===s._marker?900:0);});var context=new URLSearchParams(location.search);if(!s.planned&&!s.office)context.set('planner',s.id);else context.delete('planner');history.replaceState(history.state,'',location.pathname+'?'+context);
    window.renderOfficeSlot($('cardBody'),{name:s.name,region:s.region,planned:s.planned,id:s.id,expert:!s.planned&&!s.office,purpose:PURPOSE,situation:SITUATION,newRequestsRestricted:s.newRequestsRestricted,available:s.available,organization:s.job,specialty:s.specialty,photo_url:s.photo,biography:s.biography,insurance_types:s.insurance_types,help_tasks:s.help_tasks,offices:s.offices});
    $('cardSheet').classList.toggle('expert-card-sheet',!s.planned&&!s.office);if(!preserveView)showCard();
  }
  function showCard(){
    var sheet=$('cardSheet');cardOpener=document.activeElement;
    $('listSheet').hidden=true;$('listReopen').hidden=true;
    $('cardScrim').hidden=true;sheet.style.height='';sheet.style.maxHeight='';sheet.hidden=false;$('cardBody').scrollTop=0;
    sheet.classList.remove('detail');sheet.classList.add('show');$('cardClose').focus();
    if(map&&current&&Number.isFinite(current.lat)&&Number.isFinite(current.lng)){
      var point=map.project([current.lat,current.lng],map.getZoom());
      point.y+=sheet.getBoundingClientRect().height/2;
      map.panTo(map.unproject(point,map.getZoom()),{animate:false});
    }
  }
  function closeCard() {
    var sheet=$('cardSheet'),wasOpen=!sheet.hidden;
    sheet.classList.remove('show','detail');sheet.hidden=true;$('cardScrim').hidden=true;
    if(wasOpen){$('listReopen').hidden=false;$('listReopen').focus();}
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
    grip.addEventListener('pointermove',function(e){if(!start)return;var dy=start.y-e.clientY;if(Math.abs(dy)<8&&!dragged)return;dragged=true;var limit=sheetId==='listSheet'?Math.min(innerHeight*.52,520,$('mapStage').clientHeight-16):$('mapStage').clientHeight-16;sheet.style.height=Math.max(140,Math.min(limit,start.height+dy))+'px';sheet.style.maxHeight=limit+'px';if(sheetId==='listSheet'){sheet.classList.toggle('open',parseFloat(sheet.style.height)>150);sheet.dataset.sheetState=sheet.classList.contains('open')?'expanded':'collapsed';grip.setAttribute('aria-expanded',String(sheet.classList.contains('open')));grip.textContent=sheet.classList.contains('open')?'목록 접기 ⌄':'목록 펼치기 ⌃';}});
    grip.addEventListener('pointerup',function(e){if(start&&dragged&&e.clientY-start.y>start.height-85)collapse();start=null;});
    grip.addEventListener('pointercancel',function(){start=null;});
    grip.addEventListener('wheel',function(e){e.preventDefault();var limit=sheetId==='listSheet'?Math.min(innerHeight*.52,520,$('mapStage').clientHeight-16):$('mapStage').clientHeight-16;sheet.style.height=Math.max(140,Math.min(limit,sheet.getBoundingClientRect().height-e.deltaY*.4))+'px';sheet.style.maxHeight=limit+'px';if(sheetId==='listSheet'){sheet.classList.toggle('open',parseFloat(sheet.style.height)>150);sheet.dataset.sheetState=sheet.classList.contains('open')?'expanded':'collapsed';grip.setAttribute('aria-expanded',String(sheet.classList.contains('open')));grip.textContent=sheet.classList.contains('open')?'목록 접기 ⌄':'목록 펼치기 ⌃';}},{passive:false});
  }
  function showList(){closeCard();var sheet=$('listSheet');sheet.hidden=false;sheet.classList.remove('open');sheet.style.height='';sheet.style.maxHeight='';sheet.dataset.sheetState='collapsed';$('listGrip').textContent='목록 펼치기 ⌃';$('listGrip').setAttribute('aria-expanded','false');$('listReopen').hidden=true;}
  function hideList(){closeCard();$('listSheet').hidden=true;$('listSheet').dataset.sheetState='closed';$('listReopen').hidden=false;$('listReopen').focus();}
  function toggleList(){var sheet=$('listSheet');sheet.style.height='';sheet.style.maxHeight='';var open=sheet.classList.toggle('open');sheet.dataset.sheetState=open?'expanded':'collapsed';$('listGrip').textContent=open?'목록 접기 ⌄':'목록 펼치기 ⌃';$('listGrip').setAttribute('aria-expanded',String(open));}

  // 실제 등록 전문가 로드(planner_catalog, anon). 위경도 있는 것만. 실패·없음이면 null → 샘플 유지.
  async function loadReal(area) {
    try {
      var r = await fetch('/api/config', { cache: 'no-store', signal:AbortSignal.timeout(8000) });
      if (!r.ok) return null;
      var cfg = await r.json();
      if (!cfg.enabled || !cfg.url || !cfg.key) return null;
      if (!window.bohumsoCatalog) await new Promise(function(resolve){var timer;function ready(){clearTimeout(timer);window.removeEventListener('bohumso-member-ready',ready);resolve();}window.addEventListener('bohumso-member-ready',ready);timer=setTimeout(ready,3000);});
      var data;
      if (window.bohumsoCatalog) data=await window.bohumsoCatalog(area||'',PURPOSE||'');
      else {var rr = await fetch(cfg.url.replace(/\/$/, '') + '/rest/v1/rpc/planner_catalog', {
        method: 'POST', signal:AbortSignal.timeout(8000), headers: { apikey: cfg.key, 'Content-Type': 'application/json' }, body: JSON.stringify({ area: area || '', wanted: PURPOSE || '' })
      });
      if (!rr.ok) return null;
      data = await rr.json();}
      var list = ((data && data.planners) || []).filter(function(p){return !p.is_sample;});
      var spots = list.map(function (p) {
        return {
          id: p.id, name: (p.beta?'[베타] ':'')+(p.name || p.organization || '보험소'),
          job: p.organization || '보험 전문가',
          specialty: (Array.isArray(p.specialties) && p.specialties.length ? p.specialties.map(function (x) { return SPECIALTY[x] || x; }).join('·') : '상담'),
          region: p.region || '',
          lat: Number.isFinite(p.area_latitude) ? p.area_latitude : null, lng: Number.isFinite(p.area_longitude) ? p.area_longitude : null,
          rating: p.rating || 0, pledge: !!p.verified,
          hours: p.hours || '', completed: p.completed_count || 0, reviews: Array.isArray(p.reviews) ? p.reviews.length : 0,
          biography:p.biography,insurance_types:p.insurance_types,help_tasks:p.help_tasks,offices:p.offices,newRequestsRestricted:!!p.newRequestsRestricted,available: !!p.available, photo: p.photo_url || '', availabilityStatus: p.availability_status || 'scheduled', availabilityUntil: p.availability_until || null
        };
      });
      if(window.bohumsoOffices){const offices=await window.bohumsoOffices();const active=offices.filter(o=>o.status==='active'&&Number.isFinite(o.latitude)&&Number.isFinite(o.longitude));PLANNED=PLANNED.filter(p=>!active.some(o=>o.region===p.region));spots=spots.concat(active.filter(o=>!area||o.region.indexOf(area)===0).map(o=>({id:o.id,name:o.name,region:o.region,job:'보험소',specialty:o.address,lat:o.latitude,lng:o.longitude,rating:0,planned:false,office:true})));}
      return spots; // 실전문가가 하나라도 있으면 샘플 폴백 안 함(좌표 없어도 목록엔 표시)
    } catch (e) { return null; }
  }

  async function boot() {
    // 홈 상황선택에서 넘어왔으면 안내 칩 표시
    var situationLabels={death:'사망보험금 확인·청구 도움',cancer:'암 진단 · 보험금 청구 도움',illness:'진단 후 보험금 청구 도움',hospitalization:'입원·수술 보험금 청구 도움',accident:'사고 보험금 확인·청구 도움',claim:'받을 보험금·필요서류 확인',coverage:'가입보험·받을 보험금 확인'};
    if (Object.hasOwn(situationLabels,SITUATION) || (PURPOSE && PURPOSE_LABELS[PURPOSE])) {
      var chip = document.createElement('div');
      chip.className = 'purpose-chip';
      chip.setAttribute('role', 'note');
      chip.textContent = (Object.hasOwn(situationLabels,SITUATION)?situationLabels[SITUATION]:PURPOSE_LABELS[PURPOSE])+' · 가까운 전문가를 찾아보세요.';
      var nav = document.querySelector('.map-nav');
      if (nav) nav.after(chip);
    }
    var guideQuery=new URLSearchParams();if(PURPOSE)guideQuery.set('purpose',PURPOSE);if(SITUATION)guideQuery.set('situation',SITUATION);
    if (guideQuery.size) { var ll = $('listLink'); if (ll) ll.href = '/find.html?' + guideQuery;var visitLink=document.querySelector('.urgent-map-link');if(visitLink)visitLink.href='/urgent.html?'+guideQuery; }
    SAMPLES = SPOTS.slice(); // 지역 재필터용 원본 샘플 보관
    SPOTS = PLANNED.slice();
    initMap(SEOUL, 12);
    renderList();
    reloadSpots(new URLSearchParams(location.search).get('region')||'').then(function(){var selected=new URLSearchParams(location.search).get('planner');var spot=SPOTS.find(function(s){return s.id===selected&&!s.planned&&!s.office;});if(spot)openCard(spot);});

    window.BohumsoProfile.onChange(function(){reloadSpots(selectedArea,true);});
    // 목록(src/directory.js)과 같은 60초 주기. 화면이 보일 때만 다시 받아오고,
    // reloadSpots 의 spotsRevision 이 늦게 도착한 이전 응답을 버린다.
    var spotsTimer=setInterval(function(){if(!document.hidden)reloadSpots(selectedArea,true);},60000);
    window.addEventListener('pagehide',function(){clearInterval(spotsTimer);},{once:true});

    // 정렬 탭
    document.querySelectorAll('.sort-tabs button').forEach(function (t) {
      t.addEventListener('click', function () {
        sortBy = t.getAttribute('data-sort');showExperts=sortBy==='rating';showOffices=sortBy==='offices';
        document.querySelectorAll('.sort-tabs button').forEach(function (x) { x.setAttribute('aria-selected', x === t ? 'true' : 'false'); });
        drawMarkers();renderList();
      });
    });

    bindGrip('listGrip','listSheet',toggleList,hideList);
    $('listClose').addEventListener('click',hideList);
    $('listReopen').addEventListener('click',function(){showList();$('listGrip').focus();});
    $('cardGrip').addEventListener('click',function(){showList();$('listGrip').focus();});
    $('cardClose').addEventListener('click',closeCard);
    $('cardScrim').addEventListener('click',closeCard);
    document.addEventListener('keydown',function(e){if(e.key==='Escape'&&!document.querySelector('dialog[open]')){if(!$('cardSheet').hidden)closeCard();else hideList();}});

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
      window.BohumsoLocationStore.set({source:'MANUAL',latitude:center[0],longitude:center[1],label:city.value+(gu.value?' '+gu.value:'')});
      $('regionPicker').hidden = false;
      reloadSpots(city.value+(gu.value?' '+gu.value:''));
    }
    $('regionApply').addEventListener('click',applyRegion);gu.addEventListener('change',applyRegion);
    if(!new URLSearchParams(location.search).has('region'))window.startBohumsoLocation(locate,function(saved){
      map.setView([saved.latitude,saved.longitude],saved.source==='DEVICE'?13:11);
      if(saved.source==='DEVICE')setMe([saved.latitude,saved.longitude],saved.accuracy,false);
      document.querySelector('.region-title').textContent=saved.source==='MANUAL'?'선택한 지역 · '+(saved.label||'지도에서 확인'):saved.source==='NETWORK'?'최근 접속 지역 · 대략적인 위치예요.':'최근 확인한 내 위치예요. 위치 버튼으로 갱신할 수 있어요.';
      if(saved.source==='MANUAL'&&saved.label)reloadSpots(saved.label);
    });
    var initialOffice=new URLSearchParams(location.search).get('office');if(initialOffice){var office=PLANNED.find(function(s){return s.region===initialOffice;});if(office)openCard(office);}

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
        setMe([pos.coords.latitude,pos.coords.longitude],pos.coords.accuracy,pos.source==='network');showList();
        notice.textContent=pos.source==='network'?'접속 지역 기준의 대략적인 지도예요. 정확한 위치는 브라우저·기기 위치 권한을 켜 주세요.':pos.coords.accuracy>500?'위치 오차가 약 '+Math.round(pos.coords.accuracy)+'m로 큽니다. 지역을 직접 선택해 주세요.':'내 위치를 찾았어요. 위치 오차 약 '+Math.round(pos.coords.accuracy)+'m';
        $('locateFab').disabled=false;
      },
      error:function(message){if(revision!==regionRevision)return;notice.textContent=message;$('locateFab').disabled=false;}
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
