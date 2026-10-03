(function(){
  'use strict';
  window.renderOfficeSlot=function(host,office){
    host.replaceChildren();host.classList.add('office-slot');
    function add(tag,text){var node=document.createElement(tag);if(text)node.textContent=text;host.appendChild(node);return node;}
    function day(value){return new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(value);}
    add('h2',office.name);
    if(office.planned){add('p','개설 예정 · 현재 방문예약을 준비하고 있습니다.');var browse=add('a','주변 전문가 보기');browse.className='btn';var query=new URLSearchParams({region:office.region,view:'experts',purpose:office.purpose||'claim'});if(office.situation)query.set('situation',office.situation);browse.href='/map.html?'+query;return;}
    add('p','희망 상담시간을 선택하세요. 보험소가 담당자를 배정해요.');
    var dl=add('label','방문 날짜'),date=document.createElement('input');date.type='date';date.min=day(new Date());date.max=day(new Date(Date.now()+89*86400000));date.value=day(new Date(Date.now()+86400000));dl.appendChild(date);
    var tl=add('label','방문 시간'),time=document.createElement('select');tl.appendChild(time);
    var next=add('button','이 시간으로 방문 요청');next.type='button';next.className='btn';
    function times(){time.replaceChildren();for(var m=540;m<=1080;m+=30){var value=String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0');if(new Date(date.value+'T'+value+':00+09:00').getTime()<Date.now()+1800000)continue;var option=document.createElement('option');option.value=value;option.textContent=value;time.appendChild(option);}next.disabled=!date.checkValidity()||!date.value||!time.value;}
    date.addEventListener('change',times);times();
    next.addEventListener('click',function(){if(!date.checkValidity()||!date.value||!time.value)return;var query=new URLSearchParams({region:office.region,purpose:office.purpose||'claim',method:'scheduled',date:date.value,time:time.value});if(office.situation)query.set('situation',office.situation);if(office.id)query.set(office.expert?'planner':'office',office.id);var a=document.createElement('a');a.href='/requests.html?'+query;a.setAttribute('data-member-action','');host.appendChild(a);a.click();a.remove();});
  };
})();
