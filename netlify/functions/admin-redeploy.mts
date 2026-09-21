import {createClient} from '@supabase/supabase-js';
import type {Config} from '@netlify/functions';
const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const validHook=(value:string)=>/^https:\/\/api\.netlify\.com\/build_hooks\/[a-zA-Z0-9_-]{10,100}$/.test(value);
export default async function handler(request:Request){
 const env=(name:string)=>Netlify.env.get(name)||'';
 if(!['GET','POST'].includes(request.method))return reply({error:'method_not_allowed'},405);
 if(request.method==='POST'&&(!env('APP_ORIGIN')||request.headers.get('origin')!==env('APP_ORIGIN')))return reply({error:'origin_not_allowed'},403);
 const authorization=request.headers.get('authorization')||'';
 if(!/^Bearer \S+$/.test(authorization)||authorization.length>8192)return reply({error:'login_required'},401);
 if(!env('SUPABASE_URL')||!env('SUPABASE_PUBLISHABLE_KEY'))return reply({error:'not_configured'},503);
 try{
  const options={auth:{persistSession:false,autoRefreshToken:false},global:{headers:{Authorization:authorization}}};
  const client=createClient(env('SUPABASE_URL'),env('SUPABASE_PUBLISHABLE_KEY'),options);
  const auth=await client.auth.getUser(authorization.slice(7));if(auth.error||!auth.data.user)return reply({error:'login_required'},401);
  const membership=await client.rpc('my_membership');if(membership.error||membership.data?.admin!==true)return reply({error:'admin_required'},403);
  const hook=env('NETLIFY_ADMIN_BUILD_HOOK');const enabled=env('ADMIN_REDEPLOY_ENABLED')==='true'&&validHook(hook)&&!!env('SUPABASE_SERVICE_ROLE_KEY');
  const state=await client.rpc('admin_deploy_status');if(state.error)return reply({error:'deploy_database_not_ready'},503);
  const site=env('SITE_NAME');const dashboard=/^[a-z0-9-]+$/.test(site)?'https://app.netlify.com/projects/'+site+'/deploys':null;
  if(request.method==='GET')return reply({enabled,...state.data,dashboard});
  if(!enabled)return reply({error:'deploy_not_configured'},503);
  if(!request.headers.get('content-type')?.startsWith('application/json'))return reply({error:'json_required'},415);
  const text=await request.text();if(text.length>1024)return reply({error:'request_too_large'},413);
  let body;try{body=JSON.parse(text);}catch{return reply({error:'invalid_request'},400);}
  if(body.confirmation!=='DEPLOY'||!/^([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i.test(body.requestId||''))return reply({error:'confirmation_required'},400);
  const server=createClient(env('SUPABASE_URL'),env('SUPABASE_SERVICE_ROLE_KEY'),{auth:{persistSession:false,autoRefreshToken:false}});
  const claim=await server.rpc('admin_deploy_claim',{request_id:body.requestId,actor_id:auth.data.user.id});if(claim.error)return reply({error:'deploy_request_unavailable'},503);
  if(!claim.data?.send)return reply({state:claim.data?.state||'cooldown',replay:claim.data?.replay===true,next_allowed_at:claim.data?.next_allowed_at},claim.data?.replay?200:429);
  let result='unknown';
  try{const r=await fetch(hook,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}',redirect:'error',signal:AbortSignal.timeout(10000)});result=r.ok?'accepted':(r.status>=400&&r.status<500?'rejected':'unknown');await r.body?.cancel();}catch{}
  // A timeout may mean the build started. Record uncertainty, never resend automatically.
  const saved=await server.rpc('admin_deploy_finish',{request_id:body.requestId,result_state:result});
  return reply({state:result,recorded:!saved.error,dashboard},result==='rejected'?502:202);
 }catch{return reply({error:'deploy_service_unavailable'},503);}
}
export const config:Config={path:'/api/admin/redeploy'};
