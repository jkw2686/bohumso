import {isIP} from 'node:net';
import type {Config,Context} from '@netlify/functions';
export default async function handler(request:Request,context:Context){
 const env=(key:string)=>Netlify.env.get(key)||'';
 const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
 if(request.method!=='POST')return reply({error:'method_not_allowed'},405);
 const origin=request.headers.get('origin');
 if(!origin||origin!==new URL(request.url).origin)return reply({error:'origin_not_allowed'},403);
 if(env('CLOSED_BETA')==='false'||!env('BETA_GATEWAY_SECRET'))return reply({error:'beta_unavailable'},503);
 const authorization=request.headers.get('authorization')||'';
 if(!/^Bearer \S+$/.test(authorization)||authorization.length>8192)return reply({error:'login_required'},401);
 if(!request.headers.get('content-type')?.startsWith('application/json'))return reply({error:'json_required'},415);
 try{
  const text=await request.text();if(text.length>2048)return reply({error:'request_too_large'},413);
  const body=JSON.parse(text);
  if(!/^[a-f0-9]{64}$/.test(body.code||'')||body.ageAccepted!==true||body.termsVersion!=='2026-10-05-beta-v1'||body.privacyVersion!=='2026-10-05-beta-v1')return reply({error:'consent_required'},400);
  const base=env('SUPABASE_URL').replace(/\/$/,'');
  const authHeaders={Authorization:authorization,apikey:env('SUPABASE_PUBLISHABLE_KEY')};
  const auth=await fetch(base+'/auth/v1/user',{headers:authHeaders,signal:AbortSignal.timeout(8000)});
  if(!auth.ok||!(await auth.json()).id)return reply({error:'login_required'},401);
  const headers={...authHeaders,'Content-Type':'application/json','x-beta-gateway':env('BETA_GATEWAY_SECRET'),'x-beta-ip':isIP(context.ip||'')?context.ip:'','x-beta-user-agent':encodeURIComponent((request.headers.get('user-agent')||'').slice(0,512))};
  const rpc=(name:string,payload:unknown)=>fetch(base+'/rest/v1/rpc/'+name,{method:'POST',headers,body:JSON.stringify(payload),signal:AbortSignal.timeout(8000)});
  const result=await rpc('beta_join',{code:body.code,terms_version:body.termsVersion,privacy_version:body.privacyVersion,age_accepted:true});const data=await result.json();
  if(!result.ok){await rpc('beta_report_error',{}).catch(()=>{});return reply({error:['invalid_invite','consent_required','beta_membership_inactive'].includes(data.message)?data.message:'beta_join_unavailable'},400);}
  return reply(data);
 }catch{return reply({error:'beta_join_unavailable'},503);}
}
export const config:Config={path:'/api/beta/join'};
