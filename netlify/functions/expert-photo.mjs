import {createClient} from '@supabase/supabase-js';
import {PHOTO_LIMIT,validateThumbnail,storedPhotoPath} from './_shared/profile-photo.mjs';
const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'},reply=(data,status=200)=>Response.json(data,{status,headers});
export default async request=>{
 if(!['GET','POST','DELETE'].includes(request.method))return reply({error:'method_not_allowed'},405);
 const env=k=>Netlify.env.get(k);if(!env('SUPABASE_SERVICE_ROLE_KEY'))return reply({error:'photo_unavailable'},503);
 try{
  const server=createClient(env('SUPABASE_URL'),env('SUPABASE_SERVICE_ROLE_KEY'),{auth:{persistSession:false,autoRefreshToken:false}}),store=server.storage.from('expert-profile-photos');
  const token=request.headers.get('authorization')?.replace(/^Bearer /,'');let actor=null;
  if(token){const r=await server.auth.getUser(token);if(r.error||!r.data.user)return reply({error:'login_required'},401);actor=r.data.user.id;}
  const command=async(subject,operation,payload={})=>{const r=await server.rpc('expert_photo_service',{subject,operation,payload});if(r.error)throw Error(r.error.message);return r.data;};
  if(request.method==='GET'){
   const query=new URL(request.url).searchParams,id=query.get('id');if(!/^[a-f0-9-]{36}$/.test(id||''))return reply({error:'not_found'},404);
   let photo;if(actor===id)photo=(await command(id,'get')).photo_url;else{const catalog=await server.rpc('planner_catalog',{area:'',wanted:''});if(catalog.error)throw Error('photo_unavailable');photo=catalog.data?.planners?.find(p=>p.id===id&&!p.is_sample)?.photo_url;}
   const path=storedPhotoPath(photo,id);if(!path||query.get('v')!==new URL(photo).searchParams.get('v'))return reply({error:'not_found'},404);
   const result=await store.download(path);if(result.error)throw Error('photo_unavailable');return new Response(result.data,{headers:{...headers,'Content-Type':'image/jpeg','Content-Security-Policy':"default-src 'none'; sandbox"}});
  }
  if(!actor)return reply({error:'login_required'},401);
  if(request.headers.get('origin')!==new URL(env('APP_ORIGIN')).origin)return reply({error:'origin_not_allowed'},403);
  await command(actor,'get');
  if(request.method==='DELETE'){const result=await command(actor,'clear'),previous=storedPhotoPath(result.previous_url,actor);if(previous){const removed=await store.remove([previous]);if(removed.error)return reply({saved:true,photo_url:'',cleanupPending:true});}return reply({saved:true,photo_url:''});}
  if(request.headers.get('content-type')!=='image/jpeg')return reply({error:'invalid_photo'},415);
  const reader=request.body?.getReader();if(!reader)return reply({error:'invalid_photo'},400);let size=0;const chunks=[];
  while(true){const r=await reader.read();if(r.done)break;size+=r.value.length;if(size>PHOTO_LIMIT){await reader.cancel();return reply({error:'file_too_large'},413);}chunks.push(r.value);}
  const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}validateThumbnail(bytes);
  const version=crypto.randomUUID(),path=actor+'/'+version+'.jpg',upload=await store.upload(path,bytes,{contentType:'image/jpeg',upsert:false});if(upload.error)throw Error('photo_unavailable');
  let result;try{result=await command(actor,'save',{version});}catch(e){await store.remove([path]);throw e;}
  const previous=storedPhotoPath(result.previous_url,actor);let cleanupPending=false;if(previous){const removed=await store.remove([previous]);cleanupPending=!!removed.error;}
  return reply({saved:true,photo_url:result.photo_url,...cleanupPending?{cleanupPending:true}:{}});
 }catch(e){return reply({error:['invalid_photo','request_forbidden','membership_required'].includes(e.message)?e.message:'photo_unavailable'},400);}
};
export const config={path:'/api/expert-photo'};
