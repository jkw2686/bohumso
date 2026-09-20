import type {Config} from '@netlify/functions';
// Normalizes NAVER's nested profile for Supabase custom OAuth. No user creation,
// email linking, cookies, secret keys or token persistence occurs here.
export default async function handler(request:Request){
 const headers={'Cache-Control':'no-store','Pragma':'no-cache'};
 if(Netlify.env.get('NAVER_LOGIN_ENABLED')!=='true')return Response.json({error:'not_enabled'},{status:503,headers});
 if(request.method!=='GET')return Response.json({error:'method_not_allowed'},{status:405,headers:{...headers,Allow:'GET'}});
 const authorization=request.headers.get('authorization')||'';
 if(!/^Bearer [A-Za-z0-9._~+\/-]+=*$/.test(authorization)||authorization.length>4096)return Response.json({error:'unauthorized'},{status:401,headers});
 try{
  const r=await fetch('https://openapi.naver.com/v1/nid/me',{headers:{Authorization:authorization},redirect:'error',signal:AbortSignal.timeout(8000)});
  if(!r.ok)return Response.json({error:'provider_rejected'},{status:r.status===401||r.status===403?401:502,headers});
  const data=await r.json(),profile=data.response;
  if(data.resultcode!=='00'||typeof profile?.id!=='string'||!profile.id||profile.id.length>255||typeof profile.email!=='string'||!/^\S+@\S+\.\S+$/.test(profile.email)||profile.email.length>254)return Response.json({error:'profile_unavailable'},{status:422,headers});
  // NAVER's profile does not assert email verification. Never invent that claim
  // or automatically attach an existing account merely by matching email.
  return Response.json({sub:profile.id,email:profile.email,email_verified:false},{headers});
 }catch{return Response.json({error:'provider_unavailable'},{status:502,headers});}
}
export const config:Config={path:'/api/auth/naver/userinfo'};
