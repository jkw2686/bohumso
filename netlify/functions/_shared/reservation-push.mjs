import {createHash} from 'node:crypto';
export function validSubscription(s){
 try{const u=new URL(s?.endpoint);if(u.protocol!=='https:'||u.username||u.password||u.port&&u.port!=='443'||s.endpoint.length>4096)return false;
 const h=u.hostname;if(!['fcm.googleapis.com','web.push.apple.com','updates.push.services.mozilla.com'].includes(h)&&!h.endsWith('.notify.windows.com')&&!h.endsWith('.push.services.mozilla.com'))return false;
 const a=s.keys?.auth,p=s.keys?.p256dh;if(!/^[A-Za-z0-9_-]+={0,2}$/.test(a||'')||!/^[A-Za-z0-9_-]+={0,2}$/.test(p||''))return false;
 return Buffer.from(a,'base64url').length===16&&Buffer.from(p,'base64url').length===65&&Buffer.from(p,'base64url')[0]===4;
 }catch{return false;}
}
export const hash=value=>createHash('sha256').update(value).digest('hex');
export const isUuid=value=>/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value||'');
export function pushConfiguration(env){const names=['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','WEB_PUSH_VAPID_PUBLIC_KEY','WEB_PUSH_VAPID_PRIVATE_KEY','WEB_PUSH_SUBJECT'];return {enabled:env('RESERVATION_PUSH_ENABLED')==='true'&&names.every(k=>!!env(k)),publicKey:env('WEB_PUSH_VAPID_PUBLIC_KEY')};}
const bookingMessages={REQUESTED:['예약 요청 안내','예약 요청이 접수됐습니다. 아직 확정 전입니다.'],ACCEPTED:['전문가 요청 확인','요청 확인이 반영됐습니다. 남은 확정 절차를 확인해 주세요.'],PROPOSED:['예약시간 변경 제안','변경 제안과 다음 행동을 내 예약에서 확인해 주세요.'],CHANGED:['예약시간 변경','변경된 일정과 확정 여부를 내 예약에서 확인해 주세요.'],CHANGE_DECLINED:['일정 변경 제안 종료','기존 예약 일정을 확인해 주세요.'],CONFIRMED:['예약 확정','예약이 확정됐습니다. 일시와 장소를 확인해 주세요.'],REJECTED:['예약 요청 종료','해당 요청이 종료됐습니다. 내 예약을 확인해 주세요.'],CANCELLED:['예약 취소','예약 취소 결과를 확인해 주세요.'],COMPLETION_REQUESTED:['상담 완료 확인 요청','상담 완료 확인 절차를 내 예약에서 확인해 주세요.'],COMPLETED:['상담 완료','상담 완료가 반영됐습니다.'],DEPARTED:['전문가 출발','전문가가 출발했습니다.'],ARRIVED:['전문가 도착','전문가가 도착했습니다.'],REMINDER:['예약시간 안내','곧 예약 시간입니다. 내 예약을 확인해 주세요.'],LATE:['상담 지각 안내','상담 지각 안내를 확인해 주세요.'],ASSIGNED:['예약 담당 확인','담당 예약과 다음 절차를 확인해 주세요.']};
export const genericTitle=type=>bookingMessages[type?.replace(/^BOOKING_/,'')]?.[0]||'보험소 예약 알림';
export const genericBody=type=>bookingMessages[type?.replace(/^BOOKING_/,'')]?.[1]||(type==='RESERVATION_PUSH_TEST'?'이 기기의 예약 알림 수신 테스트입니다.':type.includes('CANCELLED')?'예약 취소 안내가 있어요.':type.includes('REQUESTED')?'새 상담·방문 요청이 있어요.':type.includes('CONFIRMED')||type==='RESERVATION_ACCEPTED'?'예약 확정·확인 안내가 있어요.':'예약 변경 안내가 있어요.');
