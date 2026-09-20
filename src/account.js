import {socialProviders,configureSocialAuth} from "./social-auth.js";
import {renderPartnerApplication} from "./partner-onboarding.js";
import {renderWorkflow as renderRequests,renderPaymentResult} from "./workflow.js";
import {renderDirectory} from "./directory.js";
import {renderProfileEditor} from "./profile-editor.js";
import {createClient} from "@supabase/supabase-js";
const $=id=>document.getElementById(id);const mode=document.body.dataset.accountPage;
let client,config,user,membership;
const status={pending:"심사 대기",approved:"승인 완료",rejected:"반려",suspended:"활동 정지",withdrawn:"신청 철회"};
const jobs={planner:"보험설계사",adjuster:"손해사정사",lawyer:"변호사",corporate:"기업보험 컨설턴트",tax:"세무사",office:"거점 운영자"};
function message(text){$("accountMessage").textContent=text;}
function safeError(error){if(error?.code==="23505")return "이미 처리되었거나 해당 시간이 예약되었습니다. 새로고침 후 다른 일정을 선택해 주세요.";const known={stale_application:"다른 화면에서 신청 내용이 바뀌었습니다. 새로고침 후 확인해 주세요.",application_locked:"현재 상태에서는 신청을 수정할 수 없습니다.",invalid_application:"연락처·자격 정보·경력·상담 방식을 확인해 주세요.",verification_consent_required:"자격 확인에 필요한 개인정보 검토에 동의해 주세요.",plan_not_available:"구독 조건이 아직 확정되지 않았습니다.",slot_unavailable:"이용 중이거나 결제 확인 중인 광고 슬롯입니다. 기존 주문 상태를 확인해 주세요.",order_expired:"주문 시간이 만료됐습니다. 구독 화면에서 새로 선택해 주세요.",refund_not_eligible:"기간 종료와 약정 노출 미달 여부를 확인해 주세요.",refund_evidence_required:"관리자의 플랫폼 귀책 확인 근거가 필요합니다.",stale_request:"다른 화면에서 예약이 변경되었습니다. 새로고침 후 다시 확인해 주세요.",test_payment_not_configured:"테스트 결제 설정 전입니다. 실제 결제는 발생하지 않습니다.",price_changed:"구독 조건이 변경되었습니다. 새로고침하여 확인해 주세요.",payment_in_progress:"결제 상태를 확인 중입니다. 승인·환불 확인 후 다시 시도해 주세요.",automatic_not_allowed:"자동 배정은 지원하지 않습니다. 설계사를 직접 선택해 주세요.",select_planner:"목록에서 설계사를 직접 선택해 주세요.",invalid_slot:"희망 일정은 30분 이후부터 90일 이내의 정각 또는 30분으로 선택해 주세요.",invalid_partner:"담당자의 직군·승인 상태가 맞지 않습니다. 다시 확인해 주세요.",request_limit:"진행 중인 요청은 최대 5건입니다.",request_forbidden:"이 요청을 처리할 권한이 없습니다.",address_required:"방문 장소의 정확한 주소를 입력해 주세요.",admin_required:"관리자 권한이 필요합니다.",self_review_forbidden:"본인 신청은 직접 심사할 수 없습니다.",invalid_transition:"신청 상태가 변경되었습니다. 새로고침해 주세요.",consent_required:"필수 동의를 확인해 주세요.",membership_required:"고객 가입을 먼저 완료해 주세요.",verified_account_required:"이메일 인증 후 다시 로그인해 주세요."};return known[error?.message]||"처리하지 못했습니다. 입력 내용과 연결 상태를 확인한 뒤 다시 시도해 주세요.";}
async function action(form,fn){const buttons=[...form.querySelectorAll("button")];const disabled=buttons.map(b=>b.disabled);buttons.forEach(b=>b.disabled=true);message("");try{await fn()}catch(e){message(safeError(e))}finally{buttons.forEach((b,i)=>b.disabled=disabled[i])}}
function onForm(id,fn){$(id)?.addEventListener("submit",e=>{e.preventDefault();action(e.currentTarget,()=>fn(new FormData(e.currentTarget)));});}
function checked(data,name){return data.get(name)==="on";}
function fail(error){if(error)throw error;}
function line(parent,text,tag="p"){const el=document.createElement(tag);el.textContent=text;parent.append(el);return el;}
async function refreshMembership(){const {data,error}=await client.rpc("my_membership");fail(error);membership=data;}
async function renderAccount(){
 try{if(membership.member&&sessionStorage.getItem("bohumso-signup-intent")==="expert"){sessionStorage.removeItem("bohumso-signup-intent");location.replace("/partner.html");return;}}catch{}
 $("identity").textContent=user.email;$("operator").textContent=config.operator;$("privacyContact").textContent=config.contact;
 $("membershipState").textContent=membership.member?"회원 가입 완료":"이메일 확인 완료 · 가입 동의가 필요합니다.";
 $("membershipForm").hidden=membership.member;$("adminLink").hidden=!membership.admin;
 onForm("membershipForm",async d=>{const {error}=await client.rpc("complete_membership",{terms_accepted:checked(d,"terms"),privacy_accepted:checked(d,"privacy"),age_accepted:checked(d,"age"),marketing_accepted:checked(d,"marketing")});fail(error);location.reload();});
 $("logout").onclick=async()=>{const {error}=await client.auth.signOut();if(error){message("로그아웃하지 못했습니다. 다시 시도해 주세요.");return}location.replace("/login.html");};
}
async function renderPartner(){await renderPartnerApplication({client,user,membership,message,action});}
async function renderAdmin(){
 const host=$("applications");host.replaceChildren();
 if(!membership.admin){$("accountContent").hidden=true;throw {message:"admin_required"};}
 const {data,error}=await client.from("partner_applications").select("*").order("created_at",{ascending:false}).limit(100);fail(error);
 if(!data.length)line(host,"심사 신청이 없습니다.");
 for(const row of data){const card=document.createElement("section");card.className="card";host.append(card);
 line(card,row.full_name+" · "+jobs[row.profession],"h2");line(card,row.organization+" / "+row.region);line(card,"확인 정보: "+row.credential_reference);line(card,"발급·확인 기관: "+(row.credential_issuer||"미입력"));line(card,"심사 연락처: "+(row.business_contact||"미입력"));line(card,"경력: "+(row.career_years||0)+"년");line(card,"상태: "+status[row.status]);if(row.review_note)line(card,row.review_note);
 const options=row.status==="pending"?[["approved","승인"],["rejected","반려"]]:row.status==="approved"?[["suspended","활동 정지"]]:row.status==="suspended"?[["approved","승인 복구"]]:[];
 if(!options.length)continue;
 const label=line(card,"검토 근거·안내 사유 (3자 이상)","label");const reason=document.createElement("textarea");reason.minLength=3;reason.maxLength=1000;reason.setAttribute("aria-label",row.full_name+" 검토 사유");label.append(reason);
 const actions=document.createElement("div");actions.className="review-actions";card.append(actions);
 for(const [decision,title]of options){const btn=document.createElement("button");btn.type="button";btn.textContent=title;actions.append(btn);btn.onclick=()=>action(card,async()=>{if(reason.value.trim().length<3){message("검토 사유를 3자 이상 입력해 주세요.");return}const {error}=await client.rpc("review_partner_application",{target_user:row.user_id,decision,reason:reason.value.trim(),expected_revision:row.revision});fail(error);await renderAdmin();message("심사 결과를 저장했습니다.");});}
 }
}
async function start(){
 // 백엔드(Functions) 미배포·미설정 시 에러 대신 '준비 중'으로 degrade. 정적 공유 배포에서도 화면이 깨지지 않는다.
 const response=await fetch("/api/config",{cache:"no-store"}).catch(()=>null);config=response&&response.ok?await response.json():{enabled:false};
 if(!config.enabled&&mode==="directory"){await renderDirectory(null);return;}
 if(!config.enabled){$("accountNotice").textContent=config.message||"회원 서비스를 준비 중입니다.";return;}
 client=createClient(config.url,config.key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,flowType:"pkce",storageKey:"woori-account"}});
 if(config.visitMetrics){try{const day=new Intl.DateTimeFormat("sv-SE",{timeZone:"Asia/Seoul"}).format(new Date());const key="bohumso-visit-"+day;let id=sessionStorage.getItem(key);if(!id){id=crypto.randomUUID();sessionStorage.setItem(key,id);}client.rpc("record_visit_session",{session_id:id}).catch(()=>{});}catch{}}
 $("accountNotice").textContent="운영: "+config.operator+" · 문의: "+config.contact;$("accountContent").hidden=false;
 if(mode==="directory"){await renderDirectory(client);return;}
 if(mode==="signup"||mode==="login")void configureSocialAuth(config,mode);
 if(mode==="signup"){
  const consent=()=>{if(!$("signupPrivacy").checked){message("개인정보 안내에 동의해 주세요.");return false;}try{sessionStorage.setItem("bohumso-signup-intent",document.querySelector("[name=signup_role]:checked")?.value||"customer");}catch{}return true;};
  const oauth=provider=>action($("accountContent"),async()=>{if(!consent())return;const {error}=await client.auth.signInWithOAuth({provider,options:{redirectTo:location.origin+"/account.html"}});fail(error);});
  for(const p of socialProviders)$(p.id+"Signup")?.addEventListener("click",()=>oauth(p.provider));
  onForm("signupForm",async d=>{if(!consent())return;const {error}=await client.auth.signUp({email:String(d.get("email")).trim(),password:String(d.get("password")),options:{emailRedirectTo:location.origin+"/account.html",data:{signup_notice_version:"2026-09-14-v1"}}});fail(error);message("등록 가능한 이메일이면 인증 메일이 전송됩니다. 메일 확인 후 로그인하여 가입을 마무리해 주세요.");});return;}
 if(mode==="login"){
 const oauth=provider=>action($("accountContent"),async()=>{const {error}=await client.auth.signInWithOAuth({provider,options:{redirectTo:location.origin+"/account.html"}});fail(error);});
 for(const p of socialProviders)$(p.id+"Login")?.addEventListener("click",()=>oauth(p.provider));
 onForm("loginForm",async d=>{const {error}=await client.auth.signInWithPassword({email:String(d.get("email")).trim(),password:String(d.get("password"))});if(error){message("이메일·비밀번호 또는 이메일 인증 상태를 확인해 주세요.");return}location.assign("/account.html");});
 $("resetPassword").onclick=()=>action($("loginForm"),async()=>{const email=$("loginForm").elements.email;if(!email.reportValidity())return;const {error}=await client.auth.resetPasswordForEmail(email.value,{redirectTo:location.origin+"/reset-password.html"});fail(error);message("등록된 이메일이면 비밀번호 재설정 안내가 발송됩니다.");});return;
 }
 const result=await client.auth.getUser();if(result.error||!result.data.user){$("accountContent").hidden=true;$("accountNotice").textContent="로그인이 필요합니다.";const a=document.createElement("a");a.href="/login.html";a.textContent="로그인하기";$("accountNotice").append(a);return;}user=result.data.user;
 if(mode==="reset"){onForm("passwordForm",async d=>{const {error}=await client.auth.updateUser({password:String(d.get("password"))});fail(error);message("비밀번호를 변경했습니다. 내 계정에서 계속 이용할 수 있습니다.");});return;}
 await refreshMembership();
 if(mode==="requests")await renderRequests({client,membership,workspace:document.body.dataset.workspace,message,action});
 if(mode==="payment")await renderPaymentResult(client,message);
 if(mode==="account")await renderAccount();
 if(mode==="partner"){await renderPartner();if(membership.profession==="planner")await renderProfileEditor(client,$("accountContent"));}
 if(mode==="admin"){await renderAdmin();$("refreshAdmin").onclick=()=>action($("accountContent"),renderAdmin);}
}
start().catch(e=>{message(safeError(e));$("accountContent").hidden=true;$("accountNotice").textContent="회원 서비스 연결 상태를 확인할 수 없습니다.";});

