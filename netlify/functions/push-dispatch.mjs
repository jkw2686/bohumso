import {createClient} from '@supabase/supabase-js';
import {fcmSender,deliverPush} from './_shared/fcm.mjs';
export default async function(){const env=k=>process.env[k]||'';if(env('PUSH_NOTIFICATIONS_ENABLED')!=='true')return new Response('disabled');try{const send=await fcmSender(env);const client=createClient(env('SUPABASE_URL'),env('SUPABASE_SERVICE_ROLE_KEY'),{auth:{persistSession:false,autoRefreshToken:false}});return Response.json(await deliverPush(client,send));}catch{return Response.json({error:'push_delivery_unavailable'},{status:503});}}
export const config={schedule:'* * * * *'};
