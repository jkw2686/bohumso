// ===== 공용 거점 데이터 (모든 페이지 공유) =====
const OFFICES = []; // Operational offices will be added after opening.

function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371, r = (x) => (x * Math.PI) / 180;
  const dLat = r(lat2 - lat1), dLng = r(lng2 - lng1);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

function nearestOffice(lat, lng) {
  let best = null;
  OFFICES.forEach((o) => {
    const d = haversine(lat, lng, o.lat, o.lng);
    if (!best || d < best.dist) best = { office: o, dist: d };
  });
  return best;
}

function setRegionTag(name) { const t=document.querySelector('.region-tag'); if(t&&!t.dataset.fixed)t.textContent='서비스 준비 중'; }

// 홈의 "가까운 보험소" 미니카드 채우기(해당 요소 없는 페이지에선 무시)
function renderNearbyCard() { const card=document.getElementById('nearbyCard'); if(card)card.hidden=true; }

// 위치 기반으로 지역 태그(+ consult 페이지면 지도/목록) 갱신
function locateAndApply(manual) {
  if (!navigator.geolocation) {
    if (manual && typeof showToast === 'function') showToast('이 브라우저는 위치를 지원하지 않아요');
    return;
  }
  navigator.geolocation.getCurrentPosition(
    (p) => {
      const lat = p.coords.latitude, lng = p.coords.longitude;
      const res = nearestOffice(lat, lng);
      if (res) {
        setRegionTag(res.office.name);
        renderNearbyCard(res.office);
        try { localStorage.setItem('woori_nearest', JSON.stringify({ id: res.office.id, name: res.office.name })); } catch (e) {}
        renderDiagNudge();
      }
      if (typeof window.onGeoUpdate === 'function') window.onGeoUpdate(lat, lng);
    },
    () => { if (manual && typeof showToast === 'function') showToast('위치 권한을 허용해야 가까운 거점을 찾을 수 있어요'); },
    { enableHighAccuracy: true, timeout: 8000 }
  );
}

// 모든 페이지: 캐시된 지역 즉시 반영 후 위치 갱신 시도(조용히)
window.addEventListener('load', () => {
  try {
    const c = JSON.parse(localStorage.getItem('woori_nearest') || 'null');
    if (c && c.name) {
      setRegionTag(c.name);
      const cached = OFFICES.find((o) => o.id === c.id);
      if (cached) renderNearbyCard(cached);
    }
  } catch (e) {}
  renderDiagNudge();
  initMap();
  // 위치 권한 팝업은 지도·가까운거점 카드가 있는 페이지에서만
  if (document.getElementById('map') || document.getElementById('nearbyCard')) {
    // Location is requested only when the visitor presses the location button.
  }
});

function toggleTip(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.toggle('show');
}

// 로드 시 게이지/막대 애니메이션 (해당 요소 없는 페이지에선 무시)
window.addEventListener('load', () => {
  // 보장 비교 막대: 0에서 목표 너비로 채워짐
  document.querySelectorAll('.bar-fill').forEach((el) => {
    const target = el.style.width;
    if (!target) return;
    el.style.width = '0';
    requestAnimationFrame(() =>
      requestAnimationFrame(() => { el.style.width = target; })
    );
  });

  // 대시보드 원형 게이지: 링 채우기 + 숫자 카운트업
  const gauge = document.querySelector('.gauge');
  const numEl = document.querySelector('.gauge-num');
  if (gauge) {
    const target = parseFloat(
      getComputedStyle(gauge).getPropertyValue('--val')
    ) || 0;
    gauge.style.setProperty('--val', '0');
    requestAnimationFrame(() =>
      requestAnimationFrame(() => { gauge.style.setProperty('--val', target); })
    );

    if (numEl) {
      const dur = 1100;
      let start = null;
      const tick = (t) => {
        if (start === null) start = t;
        const p = Math.min((t - start) / dur, 1);
        numEl.textContent = Math.round(p * target);
        if (p < 1) requestAnimationFrame(tick);
      };
      numEl.textContent = '0';
      requestAnimationFrame(tick);
    }
  }
});

document.querySelectorAll('.options').forEach(group => {
  group.querySelectorAll('.option').forEach(opt => {
    opt.addEventListener('click', () => {
      group.querySelectorAll('.option').forEach(o => o.classList.remove('selected'));
      opt.classList.add('selected');
    });
  });
});

function calcScore() {
  let total = 0;
  let answered = 0;
  document.querySelectorAll('.options').forEach(group => {
    const sel = group.querySelector('.option.selected');
    if (sel) {
      total += Number(sel.dataset.v);
      answered++;
    }
  });

  if (answered < 3) {
    alert('모든 질문에 답해 주세요.');
    return;
  }

  const resultCard = document.getElementById('resultCard');
  const badge = document.getElementById('scoreBadge');
  const desc = document.getElementById('resultDesc');

  resultCard.style.display = 'block';

  let level;
  if (total >= 6) {
    level = 'high';
    badge.textContent = '분쟁 가능성 높음';
    badge.className = 'score-badge high';
    desc.textContent = '유사 사례에서 지급 거절이 뒤집힌 사례가 다수 있습니다. 전문가 검토를 권장합니다.';
  } else if (total >= 3) {
    level = 'mid';
    badge.textContent = '분쟁 가능성 중간';
    badge.className = 'score-badge mid';
    desc.textContent = '약관 해석에 따라 다툼 여지가 있습니다. 서류 검토가 필요합니다.';
  } else {
    level = 'low';
    badge.textContent = '분쟁 가능성 낮음';
    badge.className = 'score-badge low';
    desc.textContent = '현재 입력 기준으로는 분쟁 소지가 크지 않아 보입니다.';
  }

  try { localStorage.setItem('woori_diag', JSON.stringify({ level: level, at: Date.now() })); } catch (e) {}

  resultCard.scrollIntoView({ behavior: 'smooth' });
}

// 홈: 최근 진단이 분쟁 가능성 높음/중간이면 상담 넛지 노출
function renderDiagNudge() {
  const el = document.getElementById('diagNudge');
  if (!el) return;
  let diag = null;
  try { diag = JSON.parse(localStorage.getItem('woori_diag') || 'null'); } catch (e) {}
  if (!diag || (diag.level !== 'high' && diag.level !== 'mid')) return;
  // 30일 이내 결과만 유효
  if (diag.at && Date.now() - diag.at > 30 * 24 * 60 * 60 * 1000) return;

  let office = '가까운 보험소';
  try {
    const c = JSON.parse(localStorage.getItem('woori_nearest') || 'null');
    if (c && c.name) office = c.name;
  } catch (e) {}

  const label = diag.level === 'high' ? '분쟁 가능성 높음' : '분쟁 가능성 중간';
  const txt = document.getElementById('diagNudgeText');
  if (txt) txt.textContent = '샘플 체험 결과 ' + label + ' · ' + office + '에서 상담을 문의할 수 있습니다';
  el.hidden = false;
}

function togglePolicies() {
  const p3 = document.getElementById('policy3');
  const btn = document.getElementById('moreBtn');
  if (!p3 || !btn) return;
  const hidden = p3.style.display === 'none';
  p3.style.display = hidden ? 'block' : 'none';
  btn.textContent = hidden ? '접기' : '보험 1건 더 보기';
}

function showToast(msg) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2600);
}

function pushLead() { showToast('상담·방문 접수 연결을 준비 중입니다. 현재 개인정보를 전송하지 않습니다.'); }

function submitConsult(e) {
  e.preventDefault();
  const f = e.target.elements;
  const body =
    '📩 상담 신청\n' +
    '이름: ' + f['이름'].value + '\n' +
    '연락처: ' + f['연락처'].value + '\n' +
    '유형: ' + f['상담유형'].value + '\n' +
    '내용: ' + (f['상황설명'].value || '-');
  pushLead({
    body: body,
    phone: f['연락처'].value,
    btn: e.target.querySelector('button[type=submit]'),
    okMsg: '사전 상담 문의가 접수되었습니다',
    form: e.target,
  });
  return false;
}

// ===== 지도 + 방문예약 (공용, #map / 예약시트 있는 페이지에서만 동작) =====
let map = null;
const markers = {};
let nearestId = null;
let currentOffice = null;

function popupHtml(o) {
  const telDigits = (o.tel || '').replace(/[^0-9]/g, '');
  return '<div class="mk-pop">' +
    '<div class="mk-name">' + o.name + (o.operator ? ' <span class="mk-op">(' + o.operator + ')</span>' : '') + '</div>' +
    (o.addr ? '<div class="mk-row">📍 ' + o.addr + '</div>' : '') +
    (o.hours ? '<div class="mk-row">🕘 ' + o.hours + '</div>' : '') +
    (o.tel ? '<div class="mk-row">📞 ' + o.tel + '</div>' : '') +
    '<button class="mk-btn" onclick="openBooking(\'' + o.id + '\')">예약하기</button>' +
    '</div>';
}

function renderOffices() { const el=document.getElementById('officeList'); if(el)el.textContent='모든 보험소는 개설 예정입니다. 실제 위치는 개설 시 안내됩니다.'; }

// script.js가 위치를 얻으면 호출 → 지도/목록을 가까운 순으로 갱신
window.onGeoUpdate = function(lat,lng) { if(map)map.setView([lat,lng],11); };

function initMap() {
  if (typeof L === 'undefined') return;
  if (!document.getElementById('map')) return;
  map = L.map('map', {
    scrollWheelZoom: true,    // 데스크톱: 마우스 스크롤로 확대/축소
    touchZoom: true,          // 모바일: 두 손가락 핀치로 확대/축소
    doubleClickZoom: true,    // 더블탭 확대
    bounceAtZoomLimits: true,
    tap: true,
    attributionControl: false,
  });
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);

  const icon = L.divIcon({
    className: '',
    html: '<div class="map-pin"></div>',
    iconSize: [36, 36],
    iconAnchor: [18, 36],
    popupAnchor: [0, -34],
  });

  map.setView([37.5,127.0],9);
  renderOffices();
}

function openBooking(id) {
  const o = OFFICES.find((x) => x.id === id);
  if (!o || !document.getElementById('bookOverlay')) return;
  currentOffice = o;
  document.getElementById('bookTitle').textContent = o.name + (o.operator ? ' (' + o.operator + ')' : '') + ' 방문 예약';
  document.getElementById('bookMeta').textContent = o.meta;
  const telDigits = (o.tel || '').replace(/[^0-9]/g, '');
  document.getElementById('bookInfo').innerHTML =
    (o.addr ? '<div class="bi-row">📍 ' + o.addr + '</div>' : '') +
    (o.hours ? '<div class="bi-row">🕘 ' + o.hours + '</div>' : '') +
    (o.tel ? '<div class="bi-row">📞 <a href="tel:' + telDigits + '">' + o.tel + '</a></div>' : '');
  document.getElementById('bookOverlay').classList.add('show');
}

function closeBooking() {
  const el = document.getElementById('bookOverlay');
  if (el) el.classList.remove('show');
}

function submitBooking() {
  const body =
    '📅 방문 예약\n' +
    '거점: ' + (currentOffice ? currentOffice.name : '-') + '\n' +
    '희망일: ' + (document.getElementById('bookDate').value || '-') + '\n' +
    '시간대: ' + document.getElementById('bookTime').value + '\n' +
    '이름: ' + (document.getElementById('bookName').value || '-') + '\n' +
    '연락처: ' + (document.getElementById('bookPhone').value || '-');
  const phone = document.getElementById('bookPhone').value;
  closeBooking();
  pushLead({ body: body, phone: phone, okMsg: '방문 예약이 접수되었습니다' });
}
