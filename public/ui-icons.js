(function(){
 const paths={home:'M3 10 12 3l9 7v11H3z M9 21v-8h6v8',pin:'M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z M15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0',calendar:'M5 5h14a2 2 0 0 1 2 2v13H3V7a2 2 0 0 1 2-2 M7 3v4 M17 3v4 M3 11h18 M8 16l3 3 5-5',person:'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0 M4 21v-3a8 8 0 0 1 16 0v3',family:'M9 7a3 3 0 1 1-6 0 3 3 0 0 1 6 0 M21 7a3 3 0 1 1-6 0 3 3 0 0 1 6 0 M2 20v-4a4 4 0 0 1 8 0v4 M14 20v-4a4 4 0 0 1 8 0v4 M10 17h4',medical:'M8 3h8v5h5v8h-5v5H8v-5H3V8h5z',hospital:'M5 21V3h14v18 M2 21h20 M9 7h6 M12 4v6 M9 21v-6h6v6',shield:'M12 3 3 7v5c0 5 9 10 9 10s9-5 9-10V7z M8 12l3 3 5-6',document:'M14 2H4v20h16V8z M14 2v6h6 M8 12h8 M8 16h5',search:'M16 10a6 6 0 1 1-12 0 6 6 0 0 1 12 0 M15 15l6 6',check:'M5 12l4 4L20 5',clock:'M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0 M12 6v6l4 2',send:'m3 3 19 9-19 9 4-9z M7 12h15',car:'m4 9 2-5h12l2 5 M3 9h18v9H3z M6 18v3 M18 18v3 M6 13h2 M16 13h2',card:'M3 5h18v14H3z M3 10h18 M7 15h4',arrow:'M4 12h16 M14 6l6 6-6 6',support:'M21 12c0 4.1-4 7.5-9 7.5-.9 0-1.8-.1-2.7-.4L4 21l1.4-3.6A6.9 6.9 0 0 1 3 12c0-4.1 4-7.5 9-7.5s9 3.4 9 7.5z M9.7 9.9a2.4 2.4 0 0 1 4.7.6c0 1.6-2 1.9-2 3.1 M12.4 16h.01'};
 paths.menu='M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z';
 paths.settings='M4 6h16 M4 12h16 M4 18h16 M8 3v6 M16 9v6 M10 15v6';
 paths.chevron='m9 6 6 6-6 6';

 paths.claim='M13 3H4v18h12 M13 3v6h6V9l-6-6 M7 12h5 M7 16h3 M15 17l2 2 4-5';
 paths.coverage='M13 3H4v18h7 M13 3v6h6V9l-6-6 M7 12h3 M20 16a4 4 0 1 1-8 0 4 4 0 0 1 8 0 M19 19l3 3';
 paths.experts='M10 7a3 3 0 1 1-6 0 3 3 0 0 1 6 0 M2 21v-5a5 5 0 0 1 8-4 M22 13c0 4-5 8-5 8s-5-4-5-8a5 5 0 1 1 10 0 M17 13h.01';
 paths.office='M3 21V4h10v17 M6 8h3 M6 12h3 M7 21v-5h4 M23 14c0 4-5 8-5 8s-5-4-5-8a5 5 0 1 1 10 0 M18 14h.01';
 paths.visit='M10 6a3 3 0 1 1-6 0 3 3 0 0 1 6 0 M2 21v-5a5 5 0 0 1 10 0v5 M14 13h8 M18 9l4 4-4 4';
 paths.calendar='M5 5h12a2 2 0 0 1 2 2v4 M7 3v4 M15 3v4 M3 11h12 M13 21H3V7a2 2 0 0 1 2-2 M23 17a6 6 0 1 1-12 0 6 6 0 0 1 12 0 M17 13v4l2 1';
 paths.availability='M12 7a3 3 0 1 1-6 0 3 3 0 0 1 6 0 M3 21v-4a6 6 0 0 1 12 0v4 M23 9a4 4 0 1 1-8 0 4 4 0 0 1 8 0 M17 9l1 1 3-3';
 paths.library='M3 7V4h7l3 3h8v14H3z M7 11h10v7H7z M10 14h4';
 paths.tax='M4 3h16v18H4z M8 7h8 M8 11h2 M14 11h2 M8 15h2 M14 15h2 M8 18h2 M14 18h2';
 paths.adjuster='M3 3h12v18H3z M6 7h6 M6 11h4 M22 15a4 4 0 1 1-8 0 4 4 0 0 1 8 0 M21 18l2 3';
 paths.lawyer='M12 3v18 M7 21h10 M4 6h16 M4 6l-3 7h6L4 6 M20 6l-3 7h6l-3-7';
 window.uiIcon=function(name){return '<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="'+(paths[name]||paths.pin)+'"/></svg>';};
 // 공통 '그림 자리'(3-6). 캐릭터는 넣지 않고 지금은 기존 아이콘만 보여 준다.
 window.artSlot=function(name,parent){const n=document.createElement('div');n.className='art-slot';n.innerHTML=window.uiIcon(name);if(parent)parent.prepend(n);return n;};
 function init(){document.querySelectorAll('[data-icon]').forEach(el=>el.innerHTML=window.uiIcon(el.dataset.icon));const nav=document.querySelector('[data-customer-nav]');if(nav){document.body.classList.add('has-bottom-nav');const active=nav.dataset.customerNav==='person'?'menu':nav.dataset.customerNav;nav.innerHTML=[['home','홈','/'],['pin','지도','/map.html'],['calendar','예약','/requests.html'],['support','고객센터','/support.html'],['menu','메뉴','/menu.html']].map(([icon,label,url])=>'<a href="'+url+'"'+(active===icon?' aria-current="page"':'')+'>'+window.uiIcon(icon)+'<span>'+label+'</span></a>').join('');}}
 // Read-only in-app answer count on existing support links. No external notifications.
 function supportBadge(){if(!document.querySelector('a[href="/support.html"],a[href="/support"]')||document.querySelector('[data-support-badge-script]'))return;const s=document.createElement('script');s.type='module';s.src='/assets/support-badge.js';s.dataset.supportBadgeScript='';document.body.append(s);}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',supportBadge);else supportBadge();
 const adjust=()=>{const v=window.visualViewport;const typing=/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName||'');document.body.classList.toggle('keyboard-open',Boolean(v&&typing&&window.innerHeight-v.height>120));};window.visualViewport?.addEventListener('resize',adjust);document.addEventListener('focusin',adjust);document.addEventListener('focusout',()=>setTimeout(adjust,0));
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
// Reveal invalid fields inside an existing disclosure before native validation focuses them.
document.addEventListener('invalid',event=>{
 let node=event.target?.parentElement;
 while(node){if(node.tagName==='DETAILS')node.open=true;node=node.parentElement;}
},true);
