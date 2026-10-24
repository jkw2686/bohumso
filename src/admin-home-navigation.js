// Navigation only: existing authenticated management components and handlers are retained.
export function mountAdminHomeNavigation(host){
 const old=host.querySelector('[data-admin-home-menu]');if(old){for(const n of old.querySelectorAll('.admin-home-shortcuts,[data-promotion-admin-links]'))host.append(n);old.remove();}
 const applications=host.querySelector('#applications');
 const nodes=[...(applications?.children||[]),...host.children].filter(n=>n!==applications&&!n.matches('.admin-home-shortcuts,[data-promotion-admin-links],[data-admin-home-menu]'));
 const menu=document.createElement('nav');menu.dataset.adminHomeMenu='';menu.setAttribute('aria-label','관리 업무');host.prepend(menu);
 const back=document.createElement('a');back.href='#home';back.textContent='‹ 관리자 홈';back.className='admin-section-back';menu.append(back);
 const tools=document.createElement('details'),toolsTitle=document.createElement('summary');toolsTitle.textContent='운영 도구';tools.append(toolsTitle);
 const entries=[];
 for(const [i,node] of nodes.entries()){
  if(node.matches('.admin-open-summary'))continue;
  const title=node.querySelector('h2,h3,summary')?.textContent?.trim()||'기타 운영 안내';
  const link=document.createElement('a');link.href='#section-'+i;link.textContent=title+' ›';(/전문가|문의/.test(title)?menu:tools).append(link);entries.push({node,link,id:'section-'+i,title});
 }
 const external=host.querySelector('.admin-home-shortcuts');if(external)menu.append(external);
 const promotions=host.querySelector('[data-promotion-admin-links]');if(promotions)menu.append(promotions);
 if(tools.children.length>1)menu.append(tools);
 const paint=()=>{
  const selected=entries.find(e=>location.hash==='#'+e.id);back.hidden=!selected;tools.hidden=!!selected;
  entries.forEach(e=>{e.node.hidden=e!==selected;e.link.hidden=!!selected;});
  if(external)external.hidden=!!selected;if(promotions)promotions.hidden=!!selected;
  applications?.querySelectorAll('.admin-open-summary').forEach(n=>n.hidden=!!selected);
  const heading=document.querySelector('.admin-home-heading h1');if(heading)heading.textContent=selected?selected.title:'관리자 홈';
 };
 host._adminNavCleanup?.();window.addEventListener('hashchange',paint);host._adminNavCleanup=()=>window.removeEventListener('hashchange',paint);paint();
}
