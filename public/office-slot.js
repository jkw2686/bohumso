(function(){
  'use strict';
  window.renderOfficeSlot=function(host,office){
    host.replaceChildren();host.classList.add('office-slot');host.classList.toggle('office-slot-planned',!!office.planned);
    function add(tag,text){var node=document.createElement(tag);if(text)node.textContent=text;host.appendChild(node);return node;}
    function day(value){return new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(value);}
    add('h2',office.name);
    if(office.expert){add('p','지도는 공개 활동지역을 나타내며, 전문가의 현재 위치나 방문할 사무실 주소가 아닙니다.');var visit=add('a','이 지역 방문 가능한 전문가 찾기');visit.className='btn';var vq=new URLSearchParams({region:office.region,purpose:office.purpose||'claim',situation:office.situation||''});visit.href='/urgent.html?'+vq;return;}
    if(office.planned){
      var options=add('div');options.className='office-opening-options';
      function section(title,description){var block=document.createElement('section');options.appendChild(block);block.className='office-opening-section';if(title){var heading=document.createElement('h3');heading.textContent=title;block.appendChild(heading);}if(description){var text=document.createElement('p');text.textContent=description;block.appendChild(text);}return block;}
      function action(block,role,label){var b=document.createElement('button');b.textContent=label;b.type='button';b.className='btn'+(role==='planner'?' ghost':'');b.onclick=function(){if(window.openRegionWaitlist)window.openRegionWaitlist({region:office.region,role:role});else b.textContent='화면을 새로고침한 뒤 다시 시도해 주세요.';};block.appendChild(b);}
      var customer=section(null,'오픈 준비 중이에요. 열리면 알려드릴까요?');action(customer,'consumer','오픈 알림 신청');
      var planner=section();action(planner,'planner','전문가 활동 신청');planner.lastElementChild.setAttribute('aria-label','이 지역에서 활동하고 싶어요');
      var nearby=section();var browse=document.createElement('a');browse.textContent='주변 전문가 보기';browse.setAttribute('aria-label','주변 지역 전문가 보기');browse.className='btn ghost';var query=new URLSearchParams({view:'experts',purpose:office.purpose||'claim'});if(office.situation)query.set('situation',office.situation);browse.href='/map.html?'+query;nearby.appendChild(browse);return;
    }
    add('p','희망 상담시간을 선택하세요. 보험소가 담당자를 배정해요.');
    var dl=add('label','방문 날짜'),date=document.createElement('input');date.type='date';date.min=day(new Date());date.max=day(new Date(Date.now()+89*86400000));date.value=day(new Date(Date.now()+86400000));dl.appendChild(date);
    var tl=add('label','방문 시간'),time=document.createElement('select');tl.appendChild(time);
    var next=add('button','이 시간으로 방문 요청');next.type='button';next.className='btn';
    var version=0,hint=add('p','가능한 시간을 확인합니다.');hint.setAttribute('role','status');
    async function times(){var current=++version;next.disabled=true;time.replaceChildren();for(var m=540;m<=1080;m+=(office.expert?30:60)){var value=String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0');if(new Date(date.value+'T'+value+':00+09:00').getTime()<Date.now()+1800000)continue;var option=document.createElement('option');option.value=value;option.textContent=value;time.appendChild(option);}next.disabled=!date.checkValidity()||!date.value||!time.value;if(office.id&&window.bohumsoSlots){next.disabled=true;try{var slots=await window.bohumsoSlots(office.expert?null:office.id,office.expert?office.id:null,date.value);if(current!==version)return;Array.from(time.options).forEach(function(option){if(!slots.includes(option.value))option.remove();});next.disabled=!date.checkValidity()||!time.value;hint.textContent=slots.length?'예약 가능한 시간입니다.':'이 날짜에는 가능한 시간이 없습니다.';}catch{if(current!==version)return;time.replaceChildren();hint.textContent='시간을 확인하지 못했습니다. 날짜를 다시 선택해 주세요.';next.disabled=true;}}else hint.textContent='희망시간은 담당자 확인 후 확정됩니다.';}
    date.addEventListener('change',times);times();
    next.addEventListener('click',function(){if(!date.checkValidity()||!date.value||!time.value)return;var query=new URLSearchParams({region:office.region,purpose:office.purpose||'claim',method:'scheduled',date:date.value,time:time.value});if(office.situation)query.set('situation',office.situation);if(office.id)query.set(office.expert?'planner':'office',office.id);var a=document.createElement('a');a.href='/requests.html?'+query;a.setAttribute('data-member-action','');host.appendChild(a);a.click();a.remove();});
  };
})();
