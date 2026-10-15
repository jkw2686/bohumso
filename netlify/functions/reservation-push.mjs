import {createClient} from '@supabase/supabase-js';
import {validSubscription,hash,isUuid,pushConfiguration} from './_shared/reservation-push.mjs';
const reply=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
export function createPushHandler({env,makeClient=createClient}){return async request=>{
 const cfg=pushConfiguration(env);if(request.method==='GET')return reply({enabled:cfg.enabled,publicKey:cfg.enabled?cfg.publicKey:null});
 if(request.method!=='POST')return reply({error:'method_not_allowed'},405);
 if(request.headers.get('origin')!==(env('APP_ORIGIN')||'https://bohumso.netlify.app'))return reply({error:'origin_forbidden'},403);
 if(!cfg.enabled)return reply({error:'push_not_configured'},503);
 try{const text=await request.text();if(text.length>8192)return reply({error:'invalid_request'},400);const body=JSON.parse(text);
  if(!['status','register','unregister','test'].includes(body.operation)||!isUuid(body.device_id)||!/^[a-f0-9]{64}$/.test(body.device_secret||''))return reply({error:'invalid_device'},400);
  const token=request.headers.get('authorization')?.match(/^Bearer (\S+)$/)?.[1];if(!token)return reply({error:'login_required'},401);
  const client=makeClient(env('SUPABASE_URL'),env('SUPABASE_SERVICE_ROLE_KEY'),{auth:{persistSession:false,autoRefreshToken:false}}),auth=await client.auth.getUser(token);if(auth.error||!auth.data?.user)return reply({error:'login_required'},401);
  if(body.operation==='register'&&(!isUuid(body.binding)||!validSubscription(body.subscription)))return reply({error:'invalid_subscription'},400);
  if(body.operation==='test'&&!isUuid(body.request_key))return reply({error:'invalid_request'},400);
  const payload={...(body.operation==='test'?{request_key:body.request_key}:{}),device_id:body.device_id,device_hash:hash(body.device_secret),...(body.operation==='register'?{binding:body.binding,subscription:body.subscription}:{})};
  const r=await client.rpc('reservation_web_push_service',{subject:auth.data.user.id,operation:body.operation,payload});if(r.error)return reply({error:['device_conflict','notifications_disabled','membership_required','test_rate_limit','device_not_ready'].includes(r.error.message)?r.error.message:'push_save_failed'},r.error.message==='membership_required'?403:503);
  return reply(r.data);
 }catch{return reply({error:'push_save_failed'},400);}
};}
export default request=>createPushHandler({env:k=>Netlify.env.get(k)})(request);
export const config={path:'/api/reservation-push'};
