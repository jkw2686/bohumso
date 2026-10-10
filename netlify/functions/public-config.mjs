export default async function handler() {
 const url=process.env.SUPABASE_URL, key=process.env.SUPABASE_PUBLISHABLE_KEY;
 const ready=process.env.ACCOUNTS_ENABLED==="true" && Boolean(process.env.OPERATOR_NAME?.trim() && process.env.PRIVACY_CONTACT?.trim() && url && key);
 const headers={"Cache-Control":"no-store","Content-Type":"application/json"};
 let valid=false;
 try {
  valid=new URL(url).protocol==="https:" && key.startsWith("sb_publishable_");
  if(!valid && new URL(url).protocol==="https:" && key.split(".").length===3){
   const claims=JSON.parse(Buffer.from(key.split(".")[1],"base64url").toString());
   valid=claims.role==="anon";
  }
 }catch{}
 if(!ready||!valid)return Response.json({enabled:false,message:"회원 서비스를 준비 중입니다. 현재 가입과 개인정보 입력은 받지 않습니다."},{headers});
 // Database is the source of truth for business eligibility. Environment flags only
 // control infrastructure/provider availability and can never grant DB permissions.
 let release;try{const r=await fetch(url.replace(/\/$/,'')+'/rest/v1/rpc/release_status',{method:'POST',headers:{apikey:key,'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(8000)});if(!r.ok)throw Error();release=await r.json();}catch{return Response.json({enabled:false,message:'회원 서비스 연결을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.'},{headers});}
 // Legacy property name identifies the current public membership implementation,
 // not the site's publication status. Keep it true for PRODUCTION consumers.
 const earlyAccess=['EARLY_ACCESS','PRODUCTION'].includes(release.serviceStage);
 return Response.json({enabled:true,url,key,earlyAccess,serviceStage:release.serviceStage||"CLOSED_BETA",policyVersion:release.policyVersion||(release.serviceStage==="PRODUCTION"?"2026-10-09-v1":null),bookingEnabled:release.policiesApproved===true,featureSource:"database",expertApplicationsEnabled:release.expertApplicationsEnabled===true,phoneDurationMinutes:release.phoneDurationMinutes||30,expertAutoPublish:false,operationalMetrics:process.env.OPERATIONAL_METRICS_ENABLED==="true",liveLocationEnabled:false,backgroundLocationEnabled:false,documentBasedRadiusEnabled:false,paidRadiusBoostEnabled:false,inviteRadiusBoostEnabled:false,performanceRadiusBoostEnabled:false,productToExpertMatchingEnabled:false,documentsEnabled:process.env.EXPERT_DOCUMENTS_ENABLED==="true",betaInvitesEnabled:!earlyAccess&&process.env.CLOSED_BETA!=="false"&&Boolean(process.env.BETA_GATEWAY_SECRET),signupEnabled:earlyAccess?release.signupEnabled===true:release.policiesApproved===true,closedBeta:release.closedBeta!==false,phoneSignupEnabled:release.phoneSignupEnabled===true,phoneVerificationEnabled:release.phoneEnabled===true&&process.env.PHONE_VERIFICATION_ENABLED==="true",paymentsEnabled:false,naverLogin:process.env.NAVER_LOGIN_ENABLED==="true",visitMetrics:process.env.VISIT_METRICS_ENABLED==="true",operator:process.env.OPERATOR_NAME,contact:process.env.PRIVACY_CONTACT},{headers});
}
