import {createClient} from '@supabase/supabase-js';
import {fcmSender,deliverPush} from './_shared/fcm.mjs';
export default async function(request,context={}){
 const env=k=>process.env[k]||'';
 const reply=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
 if(request.method!=='POST')return reply({error:'method_not_allowed'},405);
 const origin=context.deploy?.context==='deploy-preview'?'https://'+context.deploy.id+'--bohumso.netlify.app':env('APP_ORIGIN');
 if(request.headers.get('origin')!==origin)return reply({error:'origin_not_allowed'},403);
 const authorization=request.headers.get('authorization')||'';
 if(!/^Bearer \S{1,8192}$/.test(authorization))return reply({error:'login_required'},401);
 try{
  const server=createClient(env('SUPABASE_URL'),env('SUPABASE_SERVICE_ROLE_KEY'),{auth:{persistSession:false,autoRefreshToken:false}});
  const user=await server.auth.getUser(authorization.slice(7));
  if(user.error||!user.data.user)return reply({error:'login_required'},401);
  const actor=createClient(env('SUPABASE_URL'),env('SUPABASE_PUBLISHABLE_KEY'),{global:{headers:{Authorization:authorization}},auth:{persistSession:false,autoRefreshToken:false}});
  const membership=await actor.rpc('my_membership');
  if(membership.error||!membership.data?.admin)return reply({error:'admin_required'},403);
  if(env('PUSH_NOTIFICATIONS_ENABLED')!=='true')return reply({error:'push_disabled'},503);
  // Dispatch only server-created pending reservation events; no recipient or text accepted from the caller.
  const send=await fcmSender(env);return reply(await deliverPush(server,send));
 }catch{return reply({error:'push_delivery_unavailable'},503);}
}
export const config={path:'/api/push/dispatch'};
