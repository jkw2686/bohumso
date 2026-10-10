(function(){
 'use strict';
 var types={life:'생명보험',nonlife:'손해보험'},tasks={claim_documents:'청구서류 안내',policy_check:'가입보험 확인',office_consultation:'보험소 방문상담'};
 var person='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><circle cx="12" cy="7" r="4"/><path d="M4 22v-3a8 8 0 0 1 16 0v3"/></svg>',activeDetail=null;
 function node(tag,text,parent,cls){var n=document.createElement(tag);if(text)n.textContent=text;if(cls)n.className=cls;if(parent)parent.appendChild(n);return n;}
 function photoURL(value){try{var u=new URL(value,location.origin);return u.origin==='https://bohumso.netlify.app'&&u.pathname==='/api/expert-photo'&&/^[a-f0-9-]{36}$/.test(u.searchParams.get('id')||'')&&/^[a-f0-9-]{36}$/.test(u.searchParams.get('v')||'')?u.href:'';}catch{return '';}}
 function setAvatar(box,url){
  if(box.dataset.photo===String(url||'')&&box.childNodes.length)return;box.dataset.photo=String(url||'');
  box.replaceChildren();box.classList.remove('has-photo');
  function fallback(){box.classList.remove('has-photo');box.innerHTML=person;}
  if(!url){fallback();return;}
  var img=node('img','',box);img.alt='';img.width=img.height=192;img.decoding='async';img.referrerPolicy='no-referrer';
  img.onload=function(){if(img.parentNode===box)box.classList.add('has-photo');};
  img.onerror=function(){if(img.parentNode===box)fallback();};img.src=url;
 }
 function avatar(parent,p){var box=node('span','',parent,'expert-avatar');box.setAttribute('aria-hidden','true');setAvatar(box,photoURL(p.photo_url));return box;}
 function query(p,context){return new URLSearchParams({planner:p.id,region:p.region||'',purpose:context?.purpose||'claim',situation:context?.situation||''});}
 function profileLink(parent,p,context,text){var a=node('a',text,parent,'expert-profile-link');a.href='/find.html?'+query(p,context)+'#profile-'+encodeURIComponent(p.id);a.addEventListener('click',function(e){if(e.button||e.ctrlKey||e.metaKey||e.shiftKey||e.altKey)return;e.preventDefault();openDetail(p,context);});return a;}
 function identity(parent,p,options){
  options=options||{};var root=node('div','',parent,'expert-profile'),head=node('div','',root,'expert-profile-head');
  var photoParent=options.interactive?profileLink(head,p,options.context,''):head;
  if(options.interactive)photoParent.setAttribute('aria-label',(p.name||'전문가')+' 프로필 사진·상세보기');avatar(photoParent,p);
  var text=node('div','',head),title=node('h2','',text);
  if(options.interactive)profileLink(title,p,options.context,p.name||'전문가');else title.textContent=p.name||'전문가';
  if(p.organization)node('p',p.organization,text,'expert-organization');
  var chosen=(p.insurance_types||[]).filter(function(k){return types[k];});
  if(chosen.length){var badges=node('div','',root,'expert-badges');badges.setAttribute('aria-label','보험 취급 구분 · 본인 선택');chosen.forEach(function(k){node('span',types[k],badges);});node('p','보험 취급 구분 · 본인 선택',root,'expert-profile-note');}
  var help=(p.help_tasks||[]).filter(function(k){return tasks[k]&&(k!=='office_consultation'||p.offices?.some(function(o){return o.available===true;}));}).slice(0,3);
  if(help.length){var jobs=node('div','',root,'expert-help-tasks');jobs.setAttribute('aria-label','도움 가능한 업무');help.forEach(function(k){node('span',tasks[k],jobs);});}
  if(p.biography)node('p',p.biography,root,'expert-introduction'+(options.summary?' is-summary':''));return root;
 }
 function requestActions(parent,p,context){
  var actions=node('div','',parent,'expert-card-actions'),vq=query(p,context);
  if(p.available){var request=node('a','상담 요청',actions,'btn');request.href='/requests.html?'+vq+'&method=phone';}
  (p.offices||[]).forEach(function(o){if(o.available){var a=node('a','보험소 방문예약 · '+o.name,actions,'btn ghost');a.href='/requests.html?'+new URLSearchParams({office:o.id,region:o.region,purpose:context?.purpose||'claim',situation:context?.situation||'',method:'scheduled'});}});
  var visit=node('a','이 전문가의 방문 가능 여부',actions,'expert-visit-link');visit.href='/urgent.html?'+vq;return actions;
 }
 function openDetail(p,context){
  if(activeDetail){activeDetail.replace(p,context);return;}
  var opener=document.activeElement,dialog=node('dialog','',document.body,'card expert-detail'),header=node('div','',dialog,'expert-detail-header');
  var label=node('h2','전문가 프로필',header);label.id='expertDetailTitle';dialog.setAttribute('aria-labelledby',label.id);
  var close=node('button','닫기',header,'btn ghost');close.type='button';close.setAttribute('aria-label','프로필 닫고 이전 화면으로');
  var body=node('div','',dialog,'expert-detail-body'),token=crypto.randomUUID(),oldOverflow=document.body.style.overflow;
  function render(profile,ctx){body.replaceChildren();identity(body,profile);if(profile.region)node('p',profile.region+' · 공개 활동지역 기준',body,'expert-profile-note');
   node('p',profile.available?'상담 요청 가능 · 통화 후 일정 조율':profile.newRequestsRestricted?'현재 새 상담 요청을 받을 수 없습니다.':'현재 상담 요청을 받지 않습니다.',body,'expert-detail-status');
   (profile.offices||[]).filter(function(o){return !o.available;}).forEach(function(o){node('p',o.name+' · 방문예약 중지',body,'expert-profile-note');});
   requestActions(body,profile,ctx);body.scrollTop=0;
  }
  render(p,context);history.pushState(Object.assign({},history.state,{bohumsoExpertDetail:token}),'');
  function finish(){window.removeEventListener('popstate',pop);dialog.close();dialog.remove();document.body.style.overflow=oldOverflow;activeDetail=null;if(opener?.isConnected)opener.focus({preventScroll:true});}
  function pop(){if(history.state?.bohumsoExpertDetail!==token)finish();}
  var closing=false;function dismiss(){if(closing)return;closing=true;if(history.state?.bohumsoExpertDetail===token)history.back();else finish();}
  window.addEventListener('popstate',pop);close.onclick=dismiss;dialog.addEventListener('cancel',function(e){e.preventDefault();dismiss();});
  dialog.addEventListener('click',function(e){if(e.target!==dialog)return;var b=dialog.getBoundingClientRect();if(e.clientX<b.left||e.clientX>b.right||e.clientY<b.top||e.clientY>b.bottom)dismiss();});
  activeDetail={id:p.id,last:p,replace:function(next,ctx){activeDetail.id=next.id;activeDetail.last=next;render(next,ctx||context);}};document.body.style.overflow='hidden';dialog.showModal();close.focus();
 }
 function onChange(callback){
  function version(){try{return localStorage.getItem('bohumso-profile-updated')||'';}catch{return '';}}
  var last=version();function check(){var next=version();if(next!==last){last=next;callback();}}
  window.addEventListener('storage',function(e){if(e.key==='bohumso-profile-updated')check();});
  window.addEventListener('pageshow',check);document.addEventListener('visibilitychange',function(){if(!document.hidden)check();});window.addEventListener('bohumso-profile-updated',check);
 }
 // 목록에서 사라진 선택 전문가를 다른 전문가로 자동 교체하지 않는다.
 // 마지막으로 확인한 정보를 그대로 유지하고 새 요청만 막는다.
 function refreshDetail(profiles){
  if(!activeDetail)return;
  var p=(profiles||[]).find(function(p){return p.id===activeDetail.id;});
  if(p){activeDetail.replace(p);return;}
  if(!activeDetail.last||activeDetail.last.newRequestsRestricted)return;
  activeDetail.replace(Object.assign({},activeDetail.last,{available:false,newRequestsRestricted:true}));
 }
 function markerIcon(p){var box=node('div');avatar(box,p);return window.L.divIcon({html:box.firstChild,className:'expert-map-marker',iconSize:[48,48],iconAnchor:[24,24],popupAnchor:[0,-28]});}
 window.BohumsoProfile={types:types,tasks:tasks,identity:identity,avatar:avatar,setAvatar:setAvatar,photoURL:photoURL,profileLink:profileLink,openDetail:openDetail,markerIcon:markerIcon,onChange:onChange,refreshDetail:refreshDetail};
})();
