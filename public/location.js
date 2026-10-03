/* Coordinates stay in this page; the first visit requests permission; later visits respect the saved browser choice. */
(function () {
  'use strict';
  window.startBohumsoLocation = async function (locate) {
    var asked=false;try{asked=sessionStorage.getItem('bohumso-location-asked')==='1';}catch{}
    var state='prompt';try{state=(await navigator.permissions.query({name:'geolocation'})).state;}catch{}
    if(state==='granted'||!asked){try{sessionStorage.setItem('bohumso-location-asked','1');}catch{}locate();}
  };
  window.findBohumsoLocation = function (handlers) {
    var stopped = false, timer;
    function cancel() { stopped = true; clearTimeout(timer); }
    async function fail(code) {
      if (stopped) return;
      clearTimeout(timer);
      if(code!==1)handlers.progress('접속 지역을 확인하고 있어요…');
      try{
        var response=await fetch('/api/approximate-location',{cache:'no-store',signal:AbortSignal.timeout(5000)}),data=await response.json();
        if(stopped)return;
        if(data.available&&Number.isFinite(data.latitude)&&Number.isFinite(data.longitude)){cancel();handlers.success({source:'network',coords:{latitude:data.latitude,longitude:data.longitude,accuracy:null}});return;}
      }catch{}
      if(stopped)return;cancel();
      handlers.error(code === 1
        ? '위치 권한이 꺼져 있어요. 주소창의 사이트 권한과 기기의 위치 서비스를 켠 뒤 다시 눌러 주세요. 지역 선택도 가능해요.'
        : '이 브라우저에서 위치를 받지 못했어요. 휴대폰의 Chrome·Safari에서 위치를 허용해 다시 시도하거나 지역을 선택해 주세요.');
    }
    if (!window.isSecureContext || !navigator.geolocation) { fail(2); return cancel; }
    function attempt(precise) {
      if (stopped) return;
      handlers.progress(precise ? '기기의 위치를 다시 확인하고 있어요… 지역을 직접 선택해도 돼요.' : '내 위치를 확인하고 있어요…');
      clearTimeout(timer);
      // A separate watchdog also handles embedded browsers that never call back.
      var settled = false;
      function error(e) {
        if (settled || stopped) return;
        settled = true; clearTimeout(timer);
        if (e.code === 1 || precise) fail(e.code); else attempt(true);
      }
      timer = setTimeout(function () { error({code:3}); }, precise ? 9000 : 5000);
      navigator.geolocation.getCurrentPosition(function (position) {
        if (settled || stopped) return;
        if (!Number.isFinite(position.coords.latitude) || !Number.isFinite(position.coords.longitude)) { error({code:2}); return; }
        settled = true; cancel(); handlers.success(position);
      }, error, {enableHighAccuracy: precise, timeout: precise ? 8000 : 4000, maximumAge: precise ? 0 : 300000});
    }
    attempt(false);
    return cancel;
  };
})();
