import {createClient} from '@supabase/supabase-js';
import {documentType,safeFilename,DOCUMENT_LIMIT} from './_shared/expert-documents.mjs';
const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
export default async(request:Request)=>{
 if(request.method!=='POST')return reply({error:'method_not_allowed'},405);
 const env=(key:string)=>Netlify.env.get(key);
 if(env('EXPERT_DOCUMENTS_ENABLED')!=='true')return reply({error:'documents_not_configured'},503);
 try{
  if(request.headers.get('origin')!==new URL(env('APP_ORIGIN')!).origin)return reply({error:'origin_not_allowed'},403);
  const token=request.headers.get('authorization')?.replace(/^Bearer /,'');if(!token)return reply({error:'login_required'},401);
  const server=createClient(env('SUPABASE_URL')!,env('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data,error}=await server.auth.getUser(token);if(error||!data.user)return reply({error:'login_required'},401);
  const subject=data.user.id,store=server.storage.from('expert-documents');
  const rpc=async(operation:string,payload:any)=>{const r=await server.rpc('expert_document_service',{subject,operation,payload});if(r.error)throw Error(r.error.message);return r.data;};
  const contentType=request.headers.get('content-type')||'';
  if(contentType.includes('multipart/form-data')){
   // Account for multipart overhead; stream-limit before parsing.
   const reader=request.body?.getReader();if(!reader)throw Error('invalid_document');let length=0;const chunks:Uint8Array[]=[];
   while(true){const r=await reader.read();if(r.done)break;length+=r.value.byteLength;if(length>DOCUMENT_LIMIT+65536){await reader.cancel();return reply({error:'file_too_large'},413);}chunks.push(r.value);}
   const form=await new Response(new Blob(chunks),{headers:{'Content-Type':contentType}}).formData();
   const file=form.get('file'),kind=String(form.get('kind')),profession=String(form.get('profession'));if(!(file instanceof File)||!['identity','qualification'].includes(kind)||!['planner','adjuster','lawyer'].includes(profession)||form.get('consent')!=='true'||form.get('redacted')!=='true')throw Error('invalid_document');
   const bytes=new Uint8Array(await file.arrayBuffer()),mime=documentType(bytes);if(file.type!==mime)throw Error('invalid_document');
   const objectPath=subject+'/'+crypto.randomUUID()+({ 'image/jpeg':'.jpg','image/png':'.png','application/pdf':'.pdf'}[mime]);
   const upload=await store.upload(objectPath,bytes,{contentType:mime,upsert:false});if(upload.error)throw Error('storage_unavailable');
   try{const saved=await rpc('save',{kind,profession,path:objectPath,filename:safeFilename(file.name),mime,bytes:bytes.length});if(saved.previous_path){const removed=await store.remove([saved.previous_path]);if(removed.error)throw Error('old_document_cleanup_required');}return reply(saved.document);}
   catch(error){if(error instanceof Error&&error.message!=='old_document_cleanup_required')await store.remove([objectPath]);throw error;}
  }
  if(!contentType.includes('application/json'))return reply({error:'json_required'},415);
  const raw=await request.text();if(raw.length>2048)return reply({error:'request_too_large'},413);const body=JSON.parse(raw);
  if(!['read','delete'].includes(body.action))throw Error('invalid_operation');
  const doc=await rpc(body.action,{id:body.id});
  if(body.action==='delete'){const result=await store.remove([doc.object_path]);if(result.error)throw Error('storage_unavailable');await rpc('confirm_delete',{id:body.id,path:doc.object_path});return reply({deleted:true});}
  const result=await store.download(doc.object_path);if(result.error)throw Error('storage_unavailable');
  // Authorized streaming avoids permanent public URLs and stale signed URL access.
  return new Response(result.data,{headers:{'Content-Type':doc.mime,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Disposition':'attachment; filename="document"','Content-Security-Policy':"sandbox; default-src 'none'"}});
 }catch(error){const code=error instanceof Error?error.message:'';const safe=['request_forbidden','membership_required','application_locked','invalid_document','storage_unavailable','old_document_cleanup_required'];return reply({error:safe.includes(code)?code:'document_unavailable'},400);}
};
export const config={path:'/api/expert-documents'};
