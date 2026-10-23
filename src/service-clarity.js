export function simplifyServiceChrome(){
 if(document.body.classList.contains('map-page'))return;
 const footer=document.querySelector('.policy-footer');
 if(footer&&!footer.querySelector('[data-compact-footer]')){const d=document.createElement('details');d.dataset.compactFooter='';const s=document.createElement('summary');s.textContent='약관·개인정보·운영정보';d.append(s);while(footer.firstChild)d.append(footer.firstChild);footer.append(d);}
 const notice=document.getElementById('accountNotice');
 if(notice?.textContent.startsWith('운영:')&&footer){notice.textContent='';}
 const legacy=document.getElementById('legacyRequests')?.closest('details');if(legacy){legacy.querySelector('summary').textContent='이전 예약 보기';legacy.hidden=document.querySelector('[data-booking-view]')?.dataset.bookingView!=='past';}
}
