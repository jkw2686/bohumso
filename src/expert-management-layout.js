import {renderExpertNavigation} from './expert-navigation.js';
/** Move existing UI nodes; never recreate inputs or change stored settings. */
export function arrangeExpertManagement(root,{approved=!!root?.querySelector('[data-instant-settings]'),profession}={}){
 if(!root)return;
 root.dataset.managementState=approved?'approved':'registration';
 const instant=root.querySelector('[data-management-priority]')||root.querySelector('[data-instant-settings]')?.parentElement;
 const consult=root.querySelector('.consult-settings'),area=root.querySelector('[data-service-area-settings]');
 let menu=root.querySelector('[data-management-menu]');
 if(!menu){menu=document.createElement('nav');menu.dataset.managementMenu='';menu.className='compact-work-menu';menu.setAttribute('aria-label','전문가 업무 메뉴');}
 renderExpertNavigation(menu,profession);
 const old=root.querySelector('[data-work-link]');if(old)old.hidden=true;
 if(!approved){menu.querySelector('a[href="/partner-work.html"]')?.remove();const summary=root.querySelector('[data-application-summary]');if(summary)root.prepend(summary);if(instant)root.append(instant);root.append(menu);return;}
 const main=document.createElement('section'),side=document.createElement('section');main.className='management-primary';side.className='management-secondary';main.setAttribute('aria-label','상담·지역·프로필 설정');side.setAttribute('aria-label','등록 정보와 업무 자료');
 const profile=root.querySelector('.optional-profile')?.closest('.card');
 const contact=root.querySelector('.public-contact-settings');
 const settings=[consult,area,contact,profile].filter((n,i,a)=>n&&a.indexOf(n)===i);
 for(const n of settings)main.append(n);
 const remainder=[...root.children].filter(n=>n!==instant&&n!==main&&n!==side&&n!==menu);
 side.append(menu);for(const n of remainder)side.append(n);
 const grid=document.createElement('div');grid.className='management-layout';grid.append(main,side);root.replaceChildren();if(instant)root.append(instant);root.append(grid);
}
