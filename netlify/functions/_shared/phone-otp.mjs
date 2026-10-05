import {createHmac,randomInt,randomBytes} from 'node:crypto';
export function normalizePhone(value){const v=String(value||'').trim().replace(/[\s()-]/g,'');const phone=v.startsWith('+82')?v:v.startsWith('82')?'+'+v:'+82'+v.replace(/^0/,'');if(!/^\+8210\d{8}$/.test(phone))throw Error('invalid_phone');return phone;}
export const maskPhone=phone=>'010-'+phone.slice(5,7)+'**-'+phone.slice(-4);
export function otpHash(secret,user,phone,otp){return createHmac('sha256',secret).update('bohumso:otp:v1:'+user+':'+phone+':'+otp).digest('hex');}
export function phoneEnabled(env,deployContext=env('CONTEXT')){const preview=deployContext==='deploy-preview';return env('SMS_PROVIDER')==='solapi'&&(preview?env('PHONE_VERIFICATION_MODE')==='test':env('PHONE_VERIFICATION_ENABLED')==='true'&&env('PHONE_VERIFICATION_MODE')==='otp');}
export function allowlisted(env,phone){return (env('SMS_ALLOWLIST')||'').split(/[,;\s]+/).some(v=>{try{return normalizePhone(v)===phone;}catch{return false;}});}
export async function sendSolapi(env,phone,otp,fetcher=fetch){
 const date=new Date().toISOString(),salt=randomBytes(16).toString('hex');
 const signature=createHmac('sha256',env('SOLAPI_API_SECRET')).update(date+salt).digest('hex');
 const response=await fetcher('https://api.solapi.com/messages/v4/send-many/detail',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`HMAC-SHA256 apiKey=${env('SOLAPI_API_KEY')}, date=${date}, salt=${salt}, signature=${signature}`},body:JSON.stringify({messages:[{to:'0'+phone.slice(3),from:env('SOLAPI_SENDER_NUMBER').replace(/\D/g,''),type:'SMS',text:`[우리곁에 보험소] 인증번호는 ${otp}입니다. 3분 안에 입력해주세요.`}],allowDuplicates:false}),signal:AbortSignal.timeout(10000)});
 const result=await response.json();if(!response.ok||result.failedMessageList?.length||result.groupInfo?.count?.registeredSuccess!==1)throw Error('sms_unavailable');
}
export function createPhoneHandler({env,makeClient,fetcher=fetch,generate=()=>String(randomInt(0,1000000)).padStart(6,'0')}){
 const reply=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
 return async(request,context={})=>{
  if(request.method!=='POST')return reply({error:'method_not_allowed'},405);
  const deployContext=context.deploy?.context||env('CONTEXT');
  if(!phoneEnabled(env,deployContext))return reply({error:'phone_provider_disabled'},503);
  try{
   const expectedOrigin=deployContext==='deploy-preview'&&context.deploy?.id?'https://'+context.deploy.id+'--bohumso.netlify.app':env('APP_ORIGIN');
   if(request.headers.get('origin')!==new URL(expectedOrigin).origin)return reply({error:'origin_not_allowed'},403);
   if(!['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','SOLAPI_API_KEY','SOLAPI_API_SECRET','SOLAPI_SENDER_NUMBER','SMS_ALLOWLIST'].every(k=>env(k)))throw Error('sms_unavailable');
   const token=request.headers.get('authorization')?.replace(/^Bearer /,'');if(!token)return reply({error:'login_required'},401);
   const client=makeClient(env('SUPABASE_URL'),env('SUPABASE_SERVICE_ROLE_KEY'),{auth:{persistSession:false,autoRefreshToken:false}});
   const auth=await client.auth.getUser(token);if(auth.error||!auth.data.user)return reply({error:'login_required'},401);
   const subject=auth.data.user.id;
   if(deployContext!=='deploy-preview'){const release=await client.rpc('release_status');if(release.error||release.data?.phoneEnabled!==true)return reply({error:'phone_provider_disabled'},503);}
   // Read at most 2 KiB; never log request bodies or provider responses.
   const reader=request.body?.getReader();if(!reader)throw Error('invalid_phone');let raw='',size=0;const decoder=new TextDecoder();
   while(true){const r=await reader.read();if(r.done)break;size+=r.value.byteLength;if(size>2048){await reader.cancel();return reply({error:'request_too_large'},413);}raw+=decoder.decode(r.value,{stream:true});}raw+=decoder.decode();
   const body=JSON.parse(raw),action=new URL(request.url).pathname.split('/').pop();
   const rpc=async(operation,payload={})=>{const r=await client.rpc('phone_otp_service',{subject,operation,payload});if(r.error)throw Error('sms_unavailable');return r.data;};
   if(action==='status')return reply(await rpc('status'));
   const phone=normalizePhone(body.phone);if(!allowlisted(env,phone))return reply({error:'phone_not_available'},403);
   if(action==='verify-otp'){
    if(!/^\d{6}$/.test(String(body.otp||'')))return reply({error:'invalid_otp'},400);
    const result=await rpc('verify',{phone,hash:otpHash(env('SOLAPI_API_SECRET'),subject,phone,body.otp)});return reply(result,result.error?400:200);
   }
   if(!['send-otp','resend-otp'].includes(action))return reply({error:'invalid_operation'},400);
   if(!context.ip)throw Error('sms_unavailable');
   const ipHash=createHmac('sha256',env('SOLAPI_API_SECRET')).update('bohumso:ip:'+context.ip).digest('hex');
   let otp=generate();const reserved=await rpc('reserve',{phone,hash:otpHash(env('SOLAPI_API_SECRET'),subject,phone,otp),ip_hash:ipHash});
   if(reserved.error){otp='';return reply(reserved,429);}
   try{await sendSolapi(env,phone,otp,fetcher);}catch{await rpc('cancel',{id:reserved.id});throw Error('sms_unavailable');}finally{otp='';}
   const sent=await rpc('sent',{id:reserved.id});if(sent.error||!sent.saved)return reply({error:'sms_unavailable'},400);
   return reply({sent:true,maskedPhone:maskPhone(phone),expiresIn:180,retryAfter:30});
  }catch(error){const safe=['invalid_phone','sms_unavailable'];return reply({error:safe.includes(error?.message)?error.message:'sms_unavailable'},400);}
 };
}
