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
  var PURPOSE = '';
  try { PURPOSE = new URLSearchParams(location.search).get('purpose') || ''; } catch (e) {}

  // 지인 테스트용 샘플 거점(실데이터 아님, 삭제 가능). 실제 목록은 추후 planner_catalog 연동.
  var SPOTS = [
    { id: 's1', name: '마포 보험소', job: '보험설계사', specialty: '보험금 청구', region: '서울 마포구', lat: 37.5563, lng: 126.9236, rating: 4.8, pledge: true, hours: '평일 10:00~18:00', completed: 128, reviews: 34, availability: 'now' },
    { id: 's2', name: '여의도 보험소', job: '손해사정사', specialty: '분쟁·과소지급', region: '서울 영등포구', lat: 37.5219, lng: 126.9245, rating: 4.6, pledge: true, hours: '평일 09:30~19:00', completed: 96, reviews: 21, availability: 'today' },
    { id: 's3', name: '강남 보험소', job: '보험설계사', specialty: '보장 점검', region: '서울 강남구', lat: 37.4979, lng: 127.0276, rating: 4.9, pledge: false, hours: '평일·토 10:00~17:00', completed: 210, reviews: 58, availability: 'scheduled' },
    { id: 's4', name: '용산 보험소', job: '기업보험 컨설턴트', specialty: '기업·단체보험', region: '서울 용산구', lat: 37.5326, lng: 126.9905, rating: 4.4, pledge: true, hours: '평일 10:00~18:00', completed: 45, reviews: 9, availability: 'now' },
    { id: 's5', name: '성동 보험소', job: '보험설계사', specialty: '신규 가입 상담', region: '서울 성동구', lat: 37.5636, lng: 127.0369, rating: 4.7, pledge: true, hours: '평일 11:00~20:00', completed: 73, reviews: 16, availability: 'scheduled' }
  ];
  var AVAIL = { now: '지금 상담 가능', today: '오늘 상담 가능', scheduled: '예약 상담', unavailable: '상담 준비 중' };
  // 지도 방식 → 기존 요청 흐름의 method 값 매핑(전화 통화 / 바로 만나기 / 시간 예약)
  var WAY_METHOD = { visit_office: 'scheduled', request_visit: 'nearby', call: 'phone', message: 'phone' };

  var GU = {
    '서울': ['마포구', '영등포구', '강남구', '용산구', '성동구'],
    '경기': ['성남시', '고양시', '수원시', '부천시'],
    '인천': ['부평구', '연수구', '남동구']
  };
  var REGION_CENTER = { '서울': [37.5665, 126.9780], '경기': [37.4138, 127.5183], '인천': [37.4563, 126.7052] };
  var PURPOSE_LABELS = { claim: '보험금 청구', management: '가입한 보험 확인', coverage: '받을 보험금 확인', other: '필요한 도움' };

  var map, meMarker, userLoc = null, sortBy = 'distance', current = null;
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
  function spotDist(s) { var ref = userLoc || SEOUL; return haversine(ref, [s.lat, s.lng]); }

  function pinIcon(me) {
    // 색은 토큰으로. presentation attribute(fill=)는 var()를 못 받으므로 style로 지정한다.
    var color = me ? 'var(--accent, #477cff)' : 'var(--brand, #1a56db)';
    var html = '<svg class="' + (me ? 'pin-me' : 'pin-marker') + '" width="34" height="42" viewBox="0 0 34 42" xmlns="http://www.w3.org/2000/svg">' +
      '<path style="fill:' + color + '" d="M17 0C7.6 0 0 7.5 0 16.8 0 29 17 42 17 42s17-13 17-25.2C34 7.5 26.4 0 17 0z"/>' +
      '<path style="fill:var(--card, #fff)" d="M17 8l7 6v9h-4v-6h-6v6H10v-9l7-6z"/></svg>';
    return L.divIcon({ html: html, className: '', iconSize: [34, 42], iconAnchor: [17, 42], popupAnchor: [0, -38] });
  }

  function initMap(center, zoom) {
    map = L.map('map', { zoomControl: false, attributionControl: false }).setView(center, zoom || 13);
    // ── 지도 타일: 이 한 곳만 바꾸면 카카오맵 등으로 교체 가능 ──
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);
    SPOTS.forEach(function (s) {
      s._marker = L.marker([s.lat, s.lng], { icon: pinIcon(false), title: s.name }).addTo(map);
      s._marker.on('click', function () { openCard(s); });
    });
  }

  function setMe(loc) {
    userLoc = loc;
    if (meMarker) meMarker.setLatLng(loc); else meMarker = L.marker(loc, { icon: pinIcon(true), title: '내 위치', zIndexOffset: 1000 }).addTo(map);
    if (map) map.setView(loc, 14);
    renderList();
  }

  function sortedSpots() {
    var arr = SPOTS.slice();
    if (sortBy === 'rating') arr.sort(function (a, b) { return b.rating - a.rating; });
    else if (sortBy === 'specialty') arr.sort(function (a, b) { return a.specialty.localeCompare(b.specialty, 'ko'); });
    else arr.sort(function (a, b) { return spotDist(a) - spotDist(b); });
    return arr;
  }

  function renderList() {
    var body = $('listBody'); body.innerHTML = '';
    var arr = sortedSpots();
    if (!arr.length) {
      $('listCount').textContent = '주변 보험소 없음';
      var empty = document.createElement('p');
      empty.className = 'list-empty';
      empty.textContent = '이 지역에 표시할 보험소가 아직 없어요. 다른 지역을 선택하거나 위치를 사용해 보세요.';
      body.appendChild(empty);
      return;
    }
    $('listCount').textContent = '주변 보험소 ' + arr.length + '곳';
    arr.forEach(function (s) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'spot';
      b.innerHTML =
        thumbHtml(s, 'thumb') +
        '<span class="info">' +
          '<span class="name">' + esc(s.name) + '</span>' +
          '<span class="sub">' + esc(s.job) + ' · ' + esc(s.specialty) + '</span>' +
          '<span class="meta">★ ' + s.rating.toFixed(1) + ' · ' + distText(spotDist(s)) + '</span>' +
          availHtml(s) +
          (s.pledge ? '<span class="badge-pledge">소비자보호 서약</span>' : '') +
        '</span>';
      b.addEventListener('click', function () { if (map) map.setView([s.lat, s.lng], 15); openCard(s); });
      body.appendChild(b);
    });
  }

  /* 마커/목록 탭 → 하단 카드(요약). 다른 마커 탭하면 내용만 교체. */
  function openCard(s) {
    current = s;
    $('cardBody').innerHTML =
      '<div class="card-top">' +
        thumbHtml(s, 'thumb') +
        '<span><span class="name">' + esc(s.name) + '</span><br><span class="job">' + esc(s.job) + '</span></span>' +
      '</div>' +
      '<div class="card-stats"><span>★ <b>' + s.rating.toFixed(1) + '</b></span><span><b>' + distText(spotDist(s)) + '</b> 거리</span><span>' + esc(s.specialty) + '</span></div>' +
      '<div class="card-badges">' + availHtml(s) + (s.pledge ? '<span class="badge-pledge">소비자보호 서약</span>' : '') + '</div>' +
      '<div class="card-actions">' +
        '<button class="btn" type="button" data-way="visit_office">제가 방문할게요</button>' +
        '<button class="btn secondary" type="button" data-way="request_visit">와주실 수 있나요?</button>' +
        '<div class="card-subrow"><button class="btn secondary" type="button" data-way="call">전화 상담</button><button class="btn secondary" type="button" data-way="message">메시지 상담</button></div>' +
      '</div>' +
      '<button class="card-more" type="button" id="cardMore">전문가 소개 더보기</button>' +
      '<div class="card-detail" id="cardDetail" hidden>' +
        (s.hours ? '<p>🕑 상담 가능 시간 · ' + s.hours + '</p>' : '') +
        '<p>✅ 완료 상담 ' + (s.completed || 0) + '건 · 공개 후기 ' + (s.reviews || 0) + '건</p>' +
        '<p>' + s.name + eun(s.name) + ' ' + s.specialty + ' 상담을 도와드립니다. 방문 상담에서 약관·서류를 함께 확인합니다.</p>' +
        '<p class="card-note">연결은 소비자가 직접 개시합니다. 신청 전까지 어떤 전문가에게도 정보가 전달되지 않습니다.</p>' +
      '</div>' +
      '<p class="card-note">상담 방식을 고르면 신청 단계로 이동합니다. 보험 가입을 권하지 않으며, 소비자는 무료입니다.</p>';

    $('cardBody').querySelectorAll('[data-way]').forEach(function (btn) {
      btn.addEventListener('click', function () { chooseWay(s, btn.getAttribute('data-way')); });
    });
    $('cardMore').addEventListener('click', function () {
      var d = $('cardDetail'); d.hidden = false; $('cardSheet').classList.add('detail'); this.hidden = true;
    });

    var sheet = $('cardSheet'), scrim = $('cardScrim');
    sheet.hidden = false; sheet.classList.remove('detail'); scrim.hidden = false;
    void sheet.offsetHeight; // 강제 reflow: 백그라운드 탭에서도 transition이 확실히 동작
    sheet.classList.add('show'); scrim.classList.add('show');
  }

  function closeCard() {
    var sheet = $('cardSheet'), scrim = $('cardScrim');
    sheet.classList.remove('show', 'detail'); scrim.classList.remove('show');
    setTimeout(function () { sheet.hidden = true; scrim.hidden = true; }, 260);
  }

  function chooseWay(s, way) {
    // 소비자가 직접 고른 전문가·방식으로 기존 요청 흐름(requests.html, 로그인 게이트)에 넘긴다.
    // 전문가에게 정보 자동 전송·자동매칭 없음 — 소비자가 요청을 개시한다(CLAUDE.md §1).
    var params = 'planner=' + encodeURIComponent(s.id) +
      '&purpose=' + encodeURIComponent(PURPOSE || 'other') +
      '&method=' + (WAY_METHOD[way] || 'scheduled');
    if (s.region) params += '&region=' + encodeURIComponent(s.region);
    location.href = '/requests.html?' + params;
  }

  /* 시트 드래그(그립) — 간단한 열기/닫기 */
  function bindGrip(gripId, onUp, onDown) {
    var grip = $(gripId), startY = null;
    grip.addEventListener('click', function () { onUp(true); });
    grip.addEventListener('pointerdown', function (e) { startY = e.clientY; grip.setPointerCapture(e.pointerId); });
    grip.addEventListener('pointerup', function (e) {
      if (startY == null) return; var dy = e.clientY - startY; startY = null;
      if (dy < -24) onUp(false); else if (dy > 24) onDown();
    });
  }

  // 실제 등록 전문가 로드(planner_catalog, anon). 위경도 있는 것만. 실패·없음이면 null → 샘플 유지.
  async function loadReal() {
    try {
      var r = await fetch('/api/config', { cache: 'no-store' });
      if (!r.ok) return null;
      var cfg = await r.json();
      if (!cfg.enabled || !cfg.url || !cfg.key) return null;
      var rr = await fetch(cfg.url.replace(/\/$/, '') + '/rest/v1/rpc/planner_catalog', {
        method: 'POST', headers: { apikey: cfg.key, 'Content-Type': 'application/json' }, body: JSON.stringify({ area: '', wanted: PURPOSE || '' })
      });
      if (!rr.ok) return null;
      var data = await rr.json();
      var list = (data && data.planners) || [];
      var spots = list.filter(function (p) { return p.latitude && p.longitude; }).map(function (p) {
        return {
          id: p.id, name: p.name || p.organization || '보험소',
          job: p.organization || '보험 전문가',
          specialty: (Array.isArray(p.specialties) && p.specialties.length ? p.specialties.join('·') : '상담'),
          region: p.region || '', lat: p.latitude, lng: p.longitude, rating: p.rating || 0, pledge: !!p.verified,
          hours: p.hours || '', completed: p.completed_count || 0, reviews: Array.isArray(p.reviews) ? p.reviews.length : 0,
          photo: p.photo_url || '', availability: p.availability_status || ''
        };
      });
      return spots.length ? spots : null;
    } catch (e) { return null; }
  }

  async function boot() {
    // 홈 상황선택에서 넘어왔으면 안내 칩 표시
    if (PURPOSE && PURPOSE_LABELS[PURPOSE]) {
      var chip = document.createElement('div');
      chip.className = 'purpose-chip';
      chip.setAttribute('role', 'note');
      chip.textContent = PURPOSE_LABELS[PURPOSE] + ' 도와드릴게요 · 가까운 전문가부터';
      var nav = document.querySelector('.map-nav');
      if (nav) nav.after(chip);
    }
    if (PURPOSE) { var ll = $('listLink'); if (ll) ll.href = '/find.html?purpose=' + encodeURIComponent(PURPOSE); }
    var real = await loadReal();
    if (real) SPOTS = real; // 실데이터 있으면 교체, 없으면 샘플 유지
    initMap(SEOUL, 12);
    renderList();

    // 정렬 탭
    document.querySelectorAll('.sort-tabs button').forEach(function (t) {
      t.addEventListener('click', function () {
        sortBy = t.getAttribute('data-sort');
        document.querySelectorAll('.sort-tabs button').forEach(function (x) { x.setAttribute('aria-selected', x === t ? 'true' : 'false'); });
        renderList();
      });
    });

    // 목록 시트 그립: 위로=열기, 아래로=닫기, 클릭=토글
    var listSheet = $('listSheet');
    $('listGrip').addEventListener('click', function () { listSheet.classList.toggle('open'); });
    bindGrip('listGrip', function (toggle) { if (toggle) return; listSheet.classList.add('open'); }, function () { listSheet.classList.remove('open'); });

    // 카드 시트 그립: 위로=상세, 아래로=닫기
    bindGrip('cardGrip', function (toggle) { if (toggle) { $('cardSheet').classList.toggle('detail'); return; } $('cardSheet').classList.add('detail'); }, function () { closeCard(); });
    $('cardScrim').addEventListener('click', closeCard);

    // 현재 위치
    $('locateFab').addEventListener('click', locate);

    // 지역 선택 폴백
    var city = $('regionCity'), gu = $('regionGu');
    city.addEventListener('change', function () {
      gu.innerHTML = '<option value="">구/군</option>';
      (GU[city.value] || []).forEach(function (g) { var o = document.createElement('option'); o.value = g; o.textContent = g; gu.appendChild(o); });
    });
    $('regionApply').addEventListener('click', function () {
      var center = REGION_CENTER[city.value] || SEOUL; // 구/군 지오코딩은 후속, 우선 시/도 중심
      if (map) map.setView(center, city.value ? 12 : 11);
      $('regionPicker').hidden = true;
      renderList();
    });

    locate();
  }

  function locate() {
    if (!navigator.geolocation) { $('regionPicker').hidden = false; return; }
    navigator.geolocation.getCurrentPosition(
      function (pos) { $('regionPicker').hidden = true; setMe([pos.coords.latitude, pos.coords.longitude]); },
      function () { $('regionPicker').hidden = false; }, // 거부 → 지역 직접 선택
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
    );
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
