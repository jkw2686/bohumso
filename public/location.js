/* Tab-local location, expires after 15 minutes. Never sent to profile storage. */
(function () {
  'use strict';
  var key='bohumso-location-v1',ttl=15*60*1000;
  window.BohumsoLocationStore={
    set:function(value){if(!value||!Number.isFinite(value.latitude)||!Number.isFinite(value.longitude)||Math.abs(value.latitude)>90||Math.abs(value.longitude)>180)return;try{sessionStorage.setItem(key,JSON.stringify(Object.assign({},value,{at:Date.now()})));}catch{}},
    get:function(){try{var value=JSON.parse(sessionStorage.getItem(key));if(value&&Date.now()-value.at>=0&&Date.now()-value.at<ttl&&['DEVICE','MANUAL','NETWORK'].includes(value.source)&&Number.isFinite(value.latitude)&&Number.isFinite(value.longitude))return Object.assign({},value,{state:'SAVED'});sessionStorage.removeItem(key);}catch{}return null;},
    clear:function(){try{sessionStorage.removeItem(key);}catch{}}
  };
  window.startBohumsoLocation = async function (locate,restore) {
    var saved=window.BohumsoLocationStore.get();if(saved&&restore){restore(saved);if(saved.source==='MANUAL'||(saved.source==='DEVICE'&&saved.accuracy<=500&&Date.now()-saved.at<30000))return;}
    var asked=false;try{asked=sessionStorage.getItem('bohumso-location-asked')==='1';}catch{}
    var state='prompt';try{state=(await navigator.permissions.query({name:'geolocation'})).state;}catch{}
    if(state==='granted'||!asked){try{sessionStorage.setItem('bohumso-location-asked','1');}catch{}locate();}
  };
  window.findBohumsoLocation = function (handlers) {
    var stopped = false, timer, best;
    function cancel() { stopped = true; clearTimeout(timer); }
    function finish(position){cancel();window.bohumsoTrack?.('location_success');window.BohumsoLocationStore.set({source:'DEVICE',latitude:position.coords.latitude,longitude:position.coords.longitude,accuracy:position.coords.accuracy});handlers.success(position);}
    async function fail(code) {
      window.bohumsoTrack?.(code===1?'location_denied':'location_failed');
      if (stopped) return;
      clearTimeout(timer);
      if(best&&code!==1){finish(best);return;}
      if(code!==1)handlers.progress('접속 지역을 확인하고 있어요…');
      try{
        var response=await fetch('/api/approximate-location',{cache:'no-store',signal:AbortSignal.timeout(5000)}),data=await response.json();
        if(stopped)return;
        if(data.available&&Number.isFinite(data.latitude)&&Number.isFinite(data.longitude)){cancel();window.BohumsoLocationStore.set({source:'NETWORK',latitude:data.latitude,longitude:data.longitude,accuracy:null});handlers.success({source:'network',coords:{latitude:data.latitude,longitude:data.longitude,accuracy:null}});return;}
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
        if(!Number.isFinite(position.coords.accuracy)||position.coords.accuracy<0){error({code:2});return;}if(!best||position.coords.accuracy<best.coords.accuracy)best=position;settled=true;clearTimeout(timer);if(!precise&&position.coords.accuracy>500){attempt(true);return;}finish(best);
      }, error, {enableHighAccuracy: true, timeout: precise ? 8000 : 4000, maximumAge: 0});
    }
    attempt(false);
    return cancel;
  };
})();
