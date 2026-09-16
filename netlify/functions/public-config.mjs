export default async function handler() {
 const url=process.env.SUPABASE_URL, key=process.env.SUPABASE_PUBLISHABLE_KEY;
 const ready=process.env.ACCOUNTS_ENABLED==="true" && process.env.POLICIES_APPROVED==="true" && Boolean(process.env.OPERATOR_NAME?.trim() && process.env.PRIVACY_CONTACT?.trim() && url && key);
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
 return Response.json({enabled:true,url,key,visitMetrics:process.env.VISIT_METRICS_ENABLED==="true",operator:process.env.OPERATOR_NAME,contact:process.env.PRIVACY_CONTACT},{headers});
}
