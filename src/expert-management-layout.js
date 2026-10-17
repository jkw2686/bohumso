/** Reorder existing management controls without recreating inputs or their handlers. */
export function arrangeExpertManagement(root){
 if(!root)return;
 const instant=root.querySelector('[data-management-priority]')||root.querySelector('[data-instant-settings]')?.parentElement;
 const consult=root.querySelector('.consult-settings');
 const area=root.querySelector('[data-service-area-settings]');
 let menu=root.querySelector('[data-management-menu]');
 if(!menu){menu=document.createElement('nav');menu.dataset.managementMenu='';menu.className='compact-work-menu';menu.setAttribute('aria-label','전문가 업무 메뉴');for(const [title,url]of [['자료실','/claim-resources.html'],['청구 도움 대화·만화','/claim-resources.html#claimScripts'],['받은 요청·예약','/partner-work.html']]){const a=document.createElement('a');a.className='btn ghost';a.textContent=title;a.href=url;menu.append(a);}}
 const existingWork=root.querySelector('[data-work-link]');if(existingWork&&!existingWork.hidden)existingWork.hidden=true;
 const ordered=[instant,consult,area,menu].filter(Boolean);for(const node of ordered.reverse())root.prepend(node);
}
