(function(){
 'use strict';
 var types={life:'생명보험',nonlife:'손해보험'},tasks={claim_documents:'청구서류 안내',policy_check:'가입보험 확인',office_consultation:'보험소 방문상담'};
 function node(tag,text,parent,cls){var n=document.createElement(tag);if(text)n.textContent=text;if(cls)n.className=cls;if(parent)parent.appendChild(n);return n;}
 function photoURL(value){try{var u=new URL(value,location.origin);return u.origin==='https://bohumso.netlify.app'&&u.pathname==='/api/expert-photo'&&/^[a-f0-9-]{36}$/.test(u.searchParams.get('id')||'')&&/^[a-f0-9-]{36}$/.test(u.searchParams.get('v')||'')?u.href:'';}catch{return '';}}
 function avatar(parent,p){var box=node('span','',parent,'expert-avatar');box.setAttribute('aria-hidden','true');box.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="7" r="4"/><path d="M4 22v-3a8 8 0 0 1 16 0v3"/></svg>';var url=photoURL(p.photo_url);if(url){var img=node('img','',box);img.src=url;img.alt='';img.width=48;img.height=48;img.loading='lazy';img.referrerPolicy='no-referrer';img.onerror=function(){img.remove();};}return box;}
 function identity(parent,p){var root=node('div','',parent,'expert-profile'),head=node('div','',root,'expert-profile-head');avatar(head,p);var text=node('div','',head);node('h2',p.name||'전문가',text);if(p.organization)node('p',p.organization,text,'expert-organization');
  var chosen=(p.insurance_types||[]).filter(function(k){return types[k];});if(chosen.length){var badges=node('div','',root,'expert-badges');badges.setAttribute('aria-label','보험 취급 구분 · 본인 선택');chosen.forEach(function(k){node('span',types[k],badges);});node('p','보험 취급 구분 · 본인 선택',root,'expert-profile-note');}
  var help=(p.help_tasks||[]).filter(function(k){return tasks[k]&&(k!=='office_consultation'||p.offices?.length);}).slice(0,3);if(help.length){var jobs=node('div','',root,'expert-help-tasks');jobs.setAttribute('aria-label','도움 가능한 업무');help.forEach(function(k){node('span',tasks[k],jobs);});}
  if(p.biography)node('p',Array.from(p.biography).slice(0,40).join(''),root,'expert-introduction');return root;
 }
 window.BohumsoProfile={types:types,tasks:tasks,identity:identity,avatar:avatar,photoURL:photoURL};
})();
