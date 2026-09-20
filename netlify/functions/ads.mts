import {createClient} from '@supabase/supabase-js';
import {impressionToken,verifyImpressionToken} from './_shared/impressions.mjs';
const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
export default async(request:Request)=>{
 if(!['GET','POST'].includes(request.method))return reply({error:'method_not_allowed'},405);
 const env=(key:string)=>Netlify.env.get(key);
 if(env('AD_EXPOSURE_ENABLED')!=='true')return reply({enabled:false,ads:[]});
 try{
  const secret=env('AD_IMPRESSION_SECRET'),url=env('SUPABASE_URL'),key=env('SUPABASE_SERVICE_ROLE_KEY');
  if(!secret||secret.length<32||!url||!key)return reply({error:'not_configured'},503);
  if(request.method==='POST'&&request.headers.get('origin')!==new URL(env('APP_ORIGIN')!).origin)return reply({error:'origin_not_allowed'},403);
  const client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  if(request.method==='GET'){
   const area=new URL(request.url).searchParams.get('area')||'';
   if(area.length>120)return reply({error:'invalid_area'},400);
   const {data,error}=await client.rpc('ad_public_slots',{area});if(error)throw Error('lookup');
   return reply({enabled:true,ads:data.map((ad:any)=>({...ad,token:impressionToken(secret,ad.subscription_id)}))});
  }
  const text=await request.text();if(text.length>2000)return reply({error:'request_too_large'},413);
  let proof;try{proof=verifyImpressionToken(secret,JSON.parse(text).token);}catch{return reply({error:'invalid_token'},400);}
  const {error}=await client.rpc('ad_record_impression',{subscription_id:proof.subscriptionId,event_id:proof.eventId});if(error)throw Error('record');
  return reply({saved:true});
 }catch{return reply({error:'advertising_unavailable'},503);}
};
export const config={path:'/api/ads'};
