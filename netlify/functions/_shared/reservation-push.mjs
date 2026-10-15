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
export const genericBody=type=>type==='RESERVATION_PUSH_TEST'?'이 기기의 예약 알림 수신 테스트입니다.':type.includes('CANCELLED')?'예약 취소 안내가 있어요.':type.includes('REQUESTED')?'새 상담·방문 요청이 있어요.':type.includes('CONFIRMED')||type==='RESERVATION_ACCEPTED'?'예약 확정·확인 안내가 있어요.':'예약 변경 안내가 있어요.';
