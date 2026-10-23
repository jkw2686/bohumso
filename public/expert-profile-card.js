(function(){
 'use strict';
 var types={life:'생명보험',nonlife:'손해보험'},tasks={claim_documents:'청구서류 안내',policy_check:'가입보험 확인',office_consultation:'보험소 방문상담'};
 var person='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><circle cx="12" cy="7" r="4"/><path d="M4 22v-3a8 8 0 0 1 16 0v3"/></svg>',activeDetail=null;
 function node(tag,text,parent,cls){var n=document.createElement(tag);if(text)n.textContent=text;if(cls)n.className=cls;if(parent)parent.appendChild(n);return n;}
 function photoURL(value){try{var u=new URL(value,location.origin);return u.origin==='https://bohumso.netlify.app'&&u.pathname==='/api/expert-photo'&&/^[a-f0-9-]{36}$/.test(u.searchParams.get('id')||'')&&/^[a-f0-9-]{36}$/.test(u.searchParams.get('v')||'')?u.href:'';}catch{return '';}}
 function setAvatar(box,url){
  if(box.dataset.photo===String(url||'')&&box.childNodes.length)return;box.dataset.photo=String(url||'');
  box.replaceChildren();box.classList.remove('has-photo');
  function fallback(){box.classList.remove('has-photo');box.innerHTML=box.dataset.profession==='tax'?(window.uiIcon?.('tax')||person):person;}
  if(!url){fallback();return;}
  var img=node('img','',box);img.alt='';img.width=img.height=192;img.decoding='async';img.referrerPolicy='no-referrer';
  img.onload=function(){if(img.parentNode===box)box.classList.add('has-photo');};
  img.onerror=function(){if(img.parentNode===box)fallback();};img.src=url;
 }
 function avatar(parent,p){var box=node('span','',parent,'expert-avatar');box.setAttribute('aria-hidden','true');box.dataset.profession=p.profession||'';setAvatar(box,photoURL(p.photo_url));return box;}
 // 직군 표시는 화면 라벨을 우선한다(shared/professions.json과 같은 값). DB 표시명이 달라도 화면은 일관되게 보인다.
 var PROFESSION_LABELS={planner:'보험설계사',tax:'세무사',office:'보험소 운영자',adjuster:'손해사정사',lawyer:'변호사'};
 function professionLabel(p){return PROFESSION_LABELS[p&&p.profession]||(p&&p.profession_name)||'';}
 function query(p,context){return new URLSearchParams({planner:p.id,region:p.region||'',help:context?.help||(p.profession==='tax'?'tax':'claim'),profession:p.profession||'planner',purpose:p.profession==='tax'?'other':context?.purpose||'claim',situation:context?.situation||''});}
 function profileLink(parent,p,context,text){var a=node('a',text,parent,'expert-profile-link');a.href='/find.html?'+query(p,context)+'#profile-'+encodeURIComponent(p.id);a.addEventListener('click',function(e){if(e.button||e.ctrlKey||e.metaKey||e.shiftKey||e.altKey)return;e.preventDefault();openDetail(p,context);});return a;}
 function identity(parent,p,options){
  options=options||{};var root=node('div','',parent,'expert-profile'),head=node('div','',root,'expert-profile-head');
  var photoParent=options.interactive?profileLink(head,p,options.context,''):head;
  if(options.interactive)photoParent.setAttribute('aria-label',(p.name||'전문가')+' 프로필 사진·상세보기');avatar(photoParent,p);
  var text=node('div','',head),title=node('h2','',text);
  if(options.interactive)profileLink(title,p,options.context,p.name||'전문가');else title.textContent=p.name||'전문가';
  var label=professionLabel(p)||(p.profession==='tax'?'세무사':'');if(label&&!options.summary)node('p',label,text,'expert-profession');if(p.region&&!options.summary)node('p',p.region,text,'expert-region');if(p.fee_notice&&!options.summary)node('p',p.fee_notice,root,'expert-profile-note');
  if(p.organization&&!options.summary)node('p',p.organization,text,'expert-organization');
  var chosen=(p.insurance_types||[]).filter(function(k){return types[k];});
  if(chosen.length&&!options.summary){var badges=node('div','',root,'expert-badges');badges.setAttribute('aria-label','보험 취급 구분 · 본인 선택');chosen.forEach(function(k){node('span',types[k],badges);});}
  var help=(p.help_tasks||[]).filter(function(k){return tasks[k]&&(k!=='office_consultation'||p.offices?.some(function(o){return o.available===true;}));}).slice(0,3);
  if(help.length){var jobs=node('div','',root,'expert-help-tasks');jobs.setAttribute('aria-label','도움 가능한 업무');help.forEach(function(k){node('span',tasks[k],jobs);});}
  if(p.biography&&!options.summary)node('p',p.biography,root,'expert-introduction'+(options.summary?' is-summary':''));return root;
 }
 function requestActions(parent,p,context){
  var actions=node('div','',parent,'expert-card-actions'),vq=query(p,context);
  if(p.available){var request=node('a','상담 요청',actions,'btn');request.href='/requests.html?'+vq+'&method='+(p.profession==='tax'?'scheduled':'phone');}
  function loadPhone(){if(!window.bohumsoPublicExpertPhone||!actions.isConnected)return;Promise.resolve().then(function(){return window.bohumsoPublicExpertPhone(p.id);}).then(function(contact){if(!actions.isConnected||contact?.id!==p.id||!/^(0[1-9][0-9]{7,10}|1[568][0-9]{6})$/.test(contact.phone||''))return;var phone=node('a','전화하기',null,'btn ghost');phone.href='tel:'+contact.phone;actions.prepend(phone);}).catch(function(){/* No explicit public contact: no phone button. */});}
  if(window.bohumsoPublicExpertPhone)loadPhone();else window.addEventListener('bohumso-member-ready',loadPhone,{once:true});
  return actions;
 }
 function openDetail(p,context){
  if(activeDetail){activeDetail.replace(p,context);return;}
  var opener=document.activeElement,dialog=node('dialog','',document.body,'card expert-detail'),header=node('div','',dialog,'expert-detail-header');
  var label=node('h2','전문가 프로필',header);label.id='expertDetailTitle';dialog.setAttribute('aria-labelledby',label.id);
  var close=node('button','뒤로',header,'btn ghost');close.type='button';close.setAttribute('aria-label','프로필 닫고 이전 화면으로');
  header.prepend(close);
  var body=node('div','',dialog,'expert-detail-body'),token=crypto.randomUUID(),oldOverflow=document.body.style.overflow;
  function render(profile,ctx){body.replaceChildren();identity(body,profile);
   node('p',profile.available?'상담 요청 가능':profile.newRequestsRestricted?'현재 새 상담 요청을 받을 수 없습니다.':'현재 상담 요청을 받지 않습니다.',body,'expert-detail-status');
   (profile.offices||[]).filter(function(o){return !o.available;}).forEach(function(o){node('p',o.name+' · 방문예약 중지',body,'expert-profile-note');});
   dialog.querySelector('.expert-detail-actions')?.remove();
   requestActions(dialog,profile,ctx).classList.add('expert-detail-actions');body.scrollTop=0;
  }
  render(p,context);history.pushState(Object.assign({},history.state,{bohumsoExpertDetail:token}),'');
  function finish(){window.removeEventListener('popstate',pop);dialog.close();dialog.remove();document.body.style.overflow=oldOverflow;document.body.classList.remove('expert-detail-open');activeDetail=null;if(opener?.isConnected)opener.focus({preventScroll:true});}
  function pop(){if(history.state?.bohumsoExpertDetail!==token)finish();}
  var closing=false;function dismiss(){if(closing)return;closing=true;if(history.state?.bohumsoExpertDetail===token)history.back();else finish();}
  window.addEventListener('popstate',pop);close.onclick=dismiss;dialog.addEventListener('cancel',function(e){e.preventDefault();dismiss();});
  dialog.addEventListener('click',function(e){if(e.target!==dialog)return;var b=dialog.getBoundingClientRect();if(e.clientX<b.left||e.clientX>b.right||e.clientY<b.top||e.clientY>b.bottom)dismiss();});
  activeDetail={id:p.id,replace:function(next,ctx){activeDetail.id=next.id;render(next,ctx||context);}};document.body.style.overflow='hidden';document.body.classList.add('expert-detail-open');dialog.showModal();close.focus();
 }
 function onChange(callback){
  function version(){try{return localStorage.getItem('bohumso-profile-updated')||'';}catch{return '';}}
  var last=version();function check(){var next=version();if(next!==last){last=next;callback();}}
  window.addEventListener('storage',function(e){if(e.key==='bohumso-profile-updated')check();});
  window.addEventListener('pageshow',check);document.addEventListener('visibilitychange',function(){if(!document.hidden)check();});window.addEventListener('bohumso-profile-updated',check);
 }
 function refreshDetail(profiles){if(activeDetail){var p=profiles.find(function(p){return p.id===activeDetail.id;});if(p)activeDetail.replace(p);}}
 function markerIcon(p){var box=node('div');var face=avatar(box,p);if(p.profession==='tax'&&!p.photo_url)face.innerHTML=window.uiIcon?.('tax')||person;box.title=professionLabel(p)||'전문가';return window.L.divIcon({html:box.firstChild,className:'expert-map-marker',iconSize:[48,48],iconAnchor:[24,24],popupAnchor:[0,-28]});}
  window.BohumsoProfile={types:types,tasks:tasks,identity:identity,avatar:avatar,setAvatar:setAvatar,photoURL:photoURL,profileLink:profileLink,requestActions:requestActions,openDetail:openDetail,markerIcon:markerIcon,professionLabel:professionLabel,onChange:onChange,refreshDetail:refreshDetail};
})();
