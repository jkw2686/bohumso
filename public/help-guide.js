(function(){
 'use strict';
 var root=document.querySelector('[data-guide-situation]');if(!root)return;
 function revealDocuments(){if(location.hash!=='#documents')return;var panel=document.getElementById('documents');panel.open=true;panel.querySelector('summary').focus({preventScroll:true});panel.scrollIntoView({block:'start'});}
 root.querySelectorAll('a[href="#documents"]').forEach(function(a){a.addEventListener('click',function(){if(a.getAttribute('href')!=='#documents')return;document.getElementById('documents').open=true;requestAnimationFrame(revealDocuments);});});
 window.addEventListener('hashchange',revealDocuments);revealDocuments();
 var choices=root.querySelector('.guide-situation-choice');if(!choices)return;
 var allowed=['illness','hospitalization','accident','death','claim'];
 function update(){var selected=choices.querySelector('input:checked')?.value;if(!allowed.includes(selected))return;
  root.querySelector('[data-guide-primary]').href='/map.html?'+new URLSearchParams({view:'experts',purpose:'claim',situation:selected});
  root.querySelector('[data-guide-secondary]').href=['claim','illness'].includes(selected)?'#documents':'/help/'+selected+'.html#documents';
 }
 choices.addEventListener('change',update);window.addEventListener('pageshow',update);update();
})();
