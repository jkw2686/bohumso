import {createClient} from '@supabase/supabase-js';import webpush from 'web-push';
import {pushConfiguration,validSubscription,isUuid,genericBody} from './_shared/reservation-push.mjs';
export async function dispatchReservationPush({env,makeClient=createClient,send=webpush.sendNotification.bind(webpush)}){
 if(!pushConfiguration(env).enabled)return {enabled:false,sent:0};
 const client=makeClient(env('SUPABASE_URL'),env('SUPABASE_SERVICE_ROLE_KEY'),{auth:{persistSession:false,autoRefreshToken:false}});
 const rpc=async(operation,payload={})=>{const r=await client.rpc('reservation_web_push_service',{subject:null,operation,payload});if(r.error)throw Error('push_queue_unavailable');return r.data;};
 const jobs=await rpc('claim');let sent=0;
 await Promise.all(jobs.map(async job=>{let state='CANCELLED',errorCode=null;const args={id:job.id,lease:job.lease};
  try{const item=await rpc('authorize',args);if(item&&validSubscription(item.subscription)&&(isUuid(item.reservationId)||item.type==='RESERVATION_PUSH_TEST')){
   const payload={binding:item.binding,id:item.notificationId,title:'보험소 예약 알림',body:genericBody(item.type),url:item.type==='RESERVATION_PUSH_TEST'?'/notifications.html':'/notifications.html?reservation='+item.reservationId};
   try{await send(item.subscription,JSON.stringify(payload),{TTL:3600,urgency:'normal',topic:item.notificationId.replace(/-/g,'').slice(0,32),timeout:5000,vapidDetails:{subject:env('WEB_PUSH_SUBJECT'),publicKey:env('WEB_PUSH_VAPID_PUBLIC_KEY'),privateKey:env('WEB_PUSH_VAPID_PRIVATE_KEY')}});state='SENT';sent++;}
   catch(e){const status=Number(e.statusCode);if(status===404||status===410){state='FAILED';errorCode='UNREGISTERED';}else if(status===429||status>=500){state='RETRY';errorCode='PROVIDER_REJECTED';}else if(status>=400){state='FAILED';errorCode='PROVIDER_REJECTED';}else{state='UNKNOWN';errorCode='TRANSPORT_UNKNOWN';}}
  }}catch{state='UNKNOWN';errorCode='AUTHORIZATION_UNKNOWN';}
  await rpc('finish',{...args,state,errorCode});
 }));
 return {enabled:true,sent};
}
export default async()=>{try{const data=await dispatchReservationPush({env:k=>Netlify.env.get(k)});return Response.json(data);}catch{return Response.json({error:'push_worker_failed'},{status:503});}};
export const config={schedule:'* * * * *'};
