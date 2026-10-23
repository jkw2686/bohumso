import {adminPage, lockAdminPage, grantAdminPage, adminPageCurrent} from './admin-page-access.js';
import {mountExpertOverview} from './expert-overview.js';
import {arrangeExpertManagement} from './expert-management-layout.js';
import {signupNext} from './signup-next.js';
import {simplifyServiceChrome} from './service-clarity.js';
import {mountForegroundNotice} from './foreground-notice.js';
import {mountNotificationSettings,mountNotificationSummary} from './notification-settings.js';
import {maybePromptReservationPush} from './notification-prompt.js';
import {renderNotificationPage,focusBooking} from './booking-notifications.js';
import {mountGrowthAdmin} from './growth-admin.js';
import {mountInsurerAdmin} from './admin-insurers.js';
import {renderWaitlistCounts} from './region-waitlist.js';
import {renderCareAdmin,renderCareCases,careErrors} from './appointment-care.js';
import {renderEarlyExpertAdmin} from './early-expert-admin.js';
import {renderPublicSignup,finishPublicSignup,PRODUCTION_ORIGIN} from './public-signup.js';
import {betaCode,betaReturn,renderBetaSignup,renderBetaFinish,renderBetaAdmin,renderBetaExpert} from './beta.js';
import {bindPhoneAuth} from './phone-auth.js';
import {renderPhoneVerification} from './phone-verification-ui.js';
import {renderServiceArea,renderInstant,renderUrgentWorkspace} from './urgent.js';
import './member-entry.js';
import {renderExpertAdmin} from './expert-admin.js';
import {bindMembershipConsent} from "./membership-consent.js";
import {socialProviders,configureSocialAuth,authMethodsMarkup} from "./social-auth.js";
import {renderPartnerApplication} from "./partner-onboarding.js";
import {renderWorkflow as renderRequests,renderPaymentResult} from "./workflow.js";
import {renderDirectory} from "./directory.js";
import {renderProfileEditor} from "./profile-editor.js";
import {openMenuDestination} from './menu-destinations.js';
import {memberService,memberConfig,memberState,invalidateMemberState,MEMBER,pendingAction,rememberAction,clearAction,authURL,accountReturn} from "./member-access.js";
const $=id=>document.getElementById(id);const mode=document.body.dataset.accountPage;
let client,config,user,membership;
let justCompleted=false,adminReady=false;
const status={pending:"심사 대기",approved:"승인 완료",rejected:"반려",suspended:"활동 정지",withdrawn:"신청 철회"};
const jobs={planner:"보험설계사",adjuster:"손해사정사",lawyer:"변호사",corporate:"기업보험 컨설턴트",tax:"세무사",office:"거점 운영자"};
function message(text){$("accountMessage").textContent=text;}
let toastTimer;function toast(text){const t=$("toast");if(!t){message(text);return;}t.textContent=text;t.classList.add("show");clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove("show"),2800);}
function flagInvalid(field,msg){toast(msg);let hint=field.parentElement.querySelector(".field-error");if(!hint){hint=document.createElement("p");hint.className="field-error";hint.id="error-"+(field.name||field.id);hint.setAttribute("role","alert");field.after(hint);}hint.textContent=msg;field.setAttribute("aria-describedby",hint.id);field.addEventListener("change",()=>{hint.remove();field.removeAttribute("aria-invalid");},{once:true});field.setAttribute("aria-invalid","true");field.classList.add("invalid");field.scrollIntoView({block:"center",behavior:"smooth"});field.focus({preventScroll:true});field.addEventListener("input",()=>{field.removeAttribute("aria-invalid");field.classList.remove("invalid");},{once:true});return false;}
function safeError(error){
 if(error?.message!=='slot_unavailable'&&careErrors[error?.message])return careErrors[error.message];
 const scheduleErrors={reservation_slot_taken:'해당 시간에 다른 예약이 있습니다. 다른 시간을 선택해 주세요.',reservation_time_passed:'이미 지난 일정입니다. 새로운 시간을 상대방에게 제안해 주세요.',beta_scope_mismatch:'이 전문가에게 요청할 수 없는 계정 상태입니다. 다른 전문가를 확인해 주세요.',request_key_required:'요청 정보를 다시 확인해 주세요. 화면을 새로고침해도 선택한 내용은 유지됩니다.',office_not_active:'이 보험소는 현재 방문예약을 받지 않습니다. 다른 보험소를 선택해 주세요.',schedule_pending:'상대방의 일정 제안이 있습니다. 먼저 수락하거나 기존 일정을 유지해 주세요.',schedule_slot_unavailable:'제안한 시간에 다른 예약이 있습니다. 기존 일정은 유지됩니다. 다른 시간을 선택해 주세요.'};if(scheduleErrors[error?.message])return scheduleErrors[error.message];
if(error instanceof TypeError||error?.message?.includes("fetch"))return "네트워크 연결을 확인해 주세요.";if(error?.code==="23505")return "이미 처리되었거나 해당 시간이 예약되었습니다. 새로고침 후 다른 일정을 선택해 주세요.";const known={policies_not_approved:"현재 예약 접수를 준비하고 있습니다. 문의하기에서 이용 문의를 남겨 주세요.",beta_invitation_required:"초대된 베타 참여자만 요청할 수 있습니다.",phone_verification_required:"예약을 이어가려면 휴대전화 번호를 확인해 주세요.",stale_application:"다른 화면에서 신청 내용이 바뀌었습니다. 새로고침 후 확인해 주세요.",application_locked:"현재 상태에서는 신청을 수정할 수 없습니다.",invalid_application:"연락처·자격 정보·경력·상담 방식을 확인해 주세요.",verification_consent_required:"자격 확인에 필요한 개인정보 검토에 동의해 주세요.",plan_not_available:"구독 조건이 아직 확정되지 않았습니다.",slot_unavailable:"이용 중이거나 결제 확인 중인 광고 슬롯입니다. 기존 주문 상태를 확인해 주세요.",order_expired:"주문 시간이 만료됐습니다. 구독 화면에서 새로 선택해 주세요.",refund_not_eligible:"기간 종료와 약정 노출 미달 여부를 확인해 주세요.",refund_evidence_required:"관리자의 플랫폼 귀책 확인 근거가 필요합니다.",stale_request:"다른 화면에서 예약이 변경되었습니다. 새로고침 후 다시 확인해 주세요.",test_payment_not_configured:"테스트 결제 설정 전입니다. 실제 결제는 발생하지 않습니다.",price_changed:"구독 조건이 변경되었습니다. 새로고침하여 확인해 주세요.",payment_in_progress:"결제 상태를 확인 중입니다. 승인·환불 확인 후 다시 시도해 주세요.",automatic_not_allowed:"자동 배정은 지원하지 않습니다. 설계사를 직접 선택해 주세요.",select_planner:"목록에서 설계사를 직접 선택해 주세요.",invalid_slot:"예약 가능한 날짜의 09:00~17:00 정각을 선택해 주세요.",invalid_partner:"담당자의 직군·승인 상태가 맞지 않습니다. 다시 확인해 주세요.",request_limit:"진행 중인 요청은 최대 5건입니다.",request_forbidden:"이 요청을 처리할 권한이 없습니다.",address_required:"방문 장소의 정확한 주소를 입력해 주세요.",admin_required:"관리자 권한이 필요합니다.",self_review_forbidden:"본인 신청은 직접 심사할 수 없습니다.",invalid_transition:"신청 상태가 변경되었습니다. 새로고침해 주세요.",consent_required:"필수 동의를 확인해 주세요.",membership_required:"고객 가입을 먼저 완료해 주세요.",verified_account_required:"계정 인증 후 다시 로그인해 주세요."};return known[error?.message]||"처리하지 못했습니다. 입력 내용과 연결 상태를 확인한 뒤 다시 시도해 주세요.";}
async function action(form,fn){const buttons=[...form.querySelectorAll("button")];const disabled=buttons.map(b=>b.disabled);buttons.forEach(b=>b.disabled=true);message("");try{await fn()}catch(e){message(safeError(e))}finally{buttons.forEach((b,i)=>b.disabled=disabled[i])}}
function onForm(id,fn){$(id)?.addEventListener("submit",e=>{e.preventDefault();action(e.currentTarget,()=>fn(new FormData(e.currentTarget)));});}
function checked(data,name){return data.get(name)==="on";}
function fail(error){if(error)throw error;}
function line(parent,text,tag="p"){const el=document.createElement(tag);el.textContent=text;parent.append(el);return el;}
async function refreshMembership(){const {data,error}=await client.rpc("my_membership");fail(error);membership=data;}
async function renderAccount(){
 if(config.earlyAccess&&!membership.member&&await finishPublicSignup(client)){justCompleted=true;await refreshMembership();}
 if(config.closedBeta&&betaCode()&&!membership.beta){const done=await renderBetaFinish({client,root:$("accountContent"),onDone:async()=>{await refreshMembership();if(membership.beta_role==='EXPERT'){location.assign('/partner.html?next='+encodeURIComponent(pendingAction()));return;}await renderAccount();}});if(done){$("identity").textContent=user.email||user.phone||"내 계정";document.querySelector(".account-links").hidden=true;$("membershipForm").hidden=true;$("logout").onclick=async()=>{await client.auth.signOut();location.assign('/login.html');};return;}}
 const next=pendingAction();if(membership.member&&next!='/account.html'){clearAction();location.replace(next.startsWith('/partner.html?roleIntent=expert')&&membership.profession==='office'?'/partner.html?profession=office':next);return;}
 try{sessionStorage.removeItem("bohumso-signup-intent");}catch{}
 document.querySelector('h1').textContent=membership.state==='EXPERT_APPROVED'?'보험소 PRO':['EXPERT_PENDING','EXPERT_VERIFICATION_PENDING'].includes(membership.state)?'전문가 심사 중':membership.state==='EXPERT_DRAFT'?'보험소 PRO · 프로필':membership.member?'내 계정':'가입 마무리';
 document.querySelector('.account-links').hidden=!membership.member;
 if(membership.member){
  clearAction();
  const destination=signupNext(membership);let nextPanel=document.getElementById('accountNextAction');
  if(!nextPanel){nextPanel=document.createElement('section');nextPanel.id='accountNextAction';nextPanel.className='card';$('accountContent').prepend(nextPanel);}
  nextPanel.replaceChildren();
  line(nextPanel,justCompleted?'가입이 완료됐어요.':'다음 할 일','h2');
  if(destination.href.startsWith('/map'))line(nextPanel,'가까운 전문가를 찾아 필요한 도움을 받아보세요.');
  const primary=document.createElement('a');primary.href=destination.href;primary.className='btn';primary.textContent=destination.label;nextPanel.append(primary);
  const reservations=document.createElement('a');reservations.href='/requests.html';reservations.className='btn ghost';reservations.textContent='내 예약';nextPanel.append(reservations);
  const expertLink=document.querySelector('.account-links a[href="/partner.html"],.account-links a[href="/partner"]');if(expertLink&&!membership.partner_status){const label=expertLink.querySelector('span:last-child')||expertLink;label.textContent='전문가로 참여하기';expertLink.href='/partner.html?roleIntent=expert';}
 }
 if(membership.member&&!document.querySelector('[data-notification-entry]')){const a=document.createElement('a');a.href='/notifications.html';a.innerHTML=window.uiIcon?.('calendar')||'';a.append(document.createTextNode('예약 알림·설정'));a.dataset.notificationEntry='';document.querySelector('.account-links')?.append(a);}
 $("identity").textContent=user.email||user.phone||"내 계정";$("operator").textContent=config.operator;$("privacyContact").textContent=config.contact;
 $("membershipState").textContent=membership.member?(membership.beta?"베타 가입 완료 · "+(membership.phoneStatus==='UNVERIFIED'?'운영자 전화 확인 대기':'예약 이용 가능'):"회원 가입 완료"):"계정 인증 완료 · 가입 동의가 필요합니다.";
 $("membershipForm").hidden=membership.member||config.signupEnabled===false;if(!membership.member&&config.signupEnabled===false){$("membershipState").textContent="초대코드를 확인하면 베타 가입을 마칠 수 있어요.";if(!document.getElementById("accountInviteLink")){const a=document.createElement("a");a.id="accountInviteLink";a.className="btn";a.href="/signup.html?next="+encodeURIComponent(pendingAction());a.textContent="초대코드 입력";$("membershipState").after(a);}}$("adminLink").hidden=!membership.admin;
 bindMembershipConsent($("membershipForm"));$("membershipForm").noValidate=true;
 onForm("membershipForm",async d=>{for(const name of ['age','terms','privacy'])if(!checked(d,name))return flagInvalid($("membershipForm").elements[name],'필수약관에 동의해 주세요.');const {error}=await client.rpc("complete_membership",{terms_accepted:checked(d,"terms"),privacy_accepted:checked(d,"privacy"),age_accepted:checked(d,"age"),marketing_accepted:checked(d,"marketing")});fail(error);justCompleted=true;message("");await refreshMembership();await renderAccount();});
 $("logout").onclick=async()=>{const {error}=await client.auth.signOut();if(error){message("로그아웃하지 못했습니다. 다시 시도해 주세요.");return}location.replace("/login.html");};
}
async function renderPartner(){return renderPartnerApplication({client,user,membership,message,action,config});}
async function renderAdmin(){if(!membership.admin)throw {message:'admin_required'};await (config.earlyAccess?renderEarlyExpertAdmin:renderExpertAdmin)({client,host:$('applications'),message});await renderCareAdmin(client,$('accountContent'));document.getElementById('growthAdmin')?.remove();try{await mountGrowthAdmin({client,host:$('accountContent')});}catch(e){if(!['PGRST202','42883'].includes(e.code)){const p=document.createElement('p');p.textContent='성장·실천 자료 운영을 불러오지 못했습니다.';$('accountContent').append(p);}}
 // 보험사 연락처. 073 미적용 환경에서는 조용히 숨기고 다른 운영 화면을 막지 않는다.
 document.querySelector('[data-insurer-admin]')?.remove();try{await mountInsurerAdmin({client,host:$('accountContent')});}catch(e){if(!['PGRST202','42883'].includes(e.code)){const p=document.createElement('p');p.textContent='보험사 연락처 운영을 불러오지 못했습니다.';$('accountContent').append(p);}}}
async function start(){
 const adminTicket=lockAdminPage();
 // 백엔드(Functions) 미배포·미설정 시 에러 대신 '준비 중'으로 degrade. 정적 공유 배포에서도 화면이 깨지지 않는다.
 config=await memberConfig();
 if(!config.enabled&&mode==="directory"){await renderDirectory(null);return;}
 if(!config.enabled){
 if(adminPage)lockAdminPage('접근 권한을 확인하지 못했습니다. 새로고침해 주세요.');
 const local=['127.0.0.1','localhost'].includes(location.hostname);
 $("accountNotice").textContent=local?'디자인 미리보기입니다. 실제 가입·로그인은 공개 사이트에서 진행해 주세요.':config.message||'회원 서비스 연결을 확인할 수 없습니다. 잠시 후 다시 시도해 주세요.';
 if(local&&['signup','login','account'].includes(mode)){const a=document.createElement('a');a.className='btn';a.href='https://bohumso.netlify.app/'+(mode==='signup'?'signup.html':'login.html');a.textContent=mode==='signup'?'실제 사이트에서 가입하기':'실제 사이트에서 로그인하기';$("accountNotice").append(a);}return;
}
 ({client,config}=await memberService());
 if(adminPage){
  const initialIdentity=(await client.auth.getSession()).data.session?.user?.id||null;
  let leaving=false;
  client.auth.onAuthStateChange((event,session)=>{
   if(event==='INITIAL_SESSION'||leaving)return;
   const sameIdentity=!!session?.user&&session.user.id===initialIdentity;
   // SDK recovery can emit SIGNED_IN during initialization. The pending server
   // membership lookup already covers that identity; do not start a reload loop.
   if(!adminReady&&(session?.user?.id||null)===initialIdentity)return;
   const ticket=lockAdminPage();
   invalidateMemberState(client);
   if(sameIdentity){
    setTimeout(async()=>{
     try{const current=await memberState(client);if(!adminPageCurrent(ticket))return;
      if(current.membership?.admin){grantAdminPage(ticket);return;}
     }catch{if(!adminPageCurrent(ticket))return;}
     $('accountContent').hidden=true;$('accountContent').replaceChildren();
     document.getElementById('legacyRequests')?.replaceChildren();
     lockAdminPage('접근 권한을 확인하지 못했습니다. 새로고침해 주세요.');
    },0);
    return;
   }
   leaving=true;
   $('accountContent').hidden=true;$('accountContent').replaceChildren();
   document.getElementById('legacyRequests')?.replaceChildren();clearAction();
   setTimeout(()=>location.replace(session?.user?'/account.html':'/login.html'),0);
  });
 }
 if(config.visitMetrics){try{const day=new Intl.DateTimeFormat("sv-SE",{timeZone:"Asia/Seoul"}).format(new Date());const key="bohumso-visit-"+day;let id=sessionStorage.getItem(key);if(!id){id=crypto.randomUUID();sessionStorage.setItem(key,id);}client.rpc("record_visit_session",{session_id:id}).catch(()=>{});}catch{}}
 $("accountNotice").textContent=[config.operator&&"운영: "+config.operator,config.contact&&"문의: "+config.contact].filter(Boolean).join(" · ");
 if(mode==="directory"){$("accountContent").hidden=false;await renderDirectory(client);return;}
 if(mode==="signup"||mode==="login"){
 if(config.closedBeta)betaCode();const next=pendingAction();if(mode==='login')document.querySelector('h1').textContent=next.startsWith('/partner.html')?'전문가 로그인':next.startsWith('/map.html')?'일반회원 로그인':'로그인';const state=await memberState(client);const showSignupOptions=mode==='signup'&&new URLSearchParams(location.search).get('view')==='options';if(state.state!==MEMBER.anonymous&&!showSignupOptions&&(mode==='login'||state.membership?.member||(config.closedBeta&&betaCode()))){location.replace(config.closedBeta&&betaCode()?betaReturn():accountReturn(next));return;}
 $("accountContent").hidden=false;document.querySelectorAll('a[href]').forEach(a=>{const path=new URL(a.href,location.href).pathname;if(/^\/(signup|login)(\.html)?$/.test(path))a.href=authURL(next,path.includes('login')?'login':'signup');});
 if(mode==="login"){document.getElementById("authMethods").innerHTML=authMethodsMarkup(mode);bindPhoneAuth({client,config,root:$("accountContent")});void configureSocialAuth(config,mode);}
 }
 if(mode==="signup"){if(config.earlyAccess)await renderPublicSignup({client,config,root:$("accountContent"),message});else await renderBetaSignup({client,root:$("accountContent"),message});if(new URLSearchParams(location.search).get('view')==='options'){const current=await memberState(client);if(current.state!==MEMBER.anonymous){$("accountNotice").textContent=current.membership?.member?'현재 로그인되어 있습니다. 기존 계정으로 계속 이용할 수 있어요.':'계정 인증이 완료됐습니다. 필수 동의로 가입을 마무리하세요.';const a=document.createElement('a');a.href=accountReturn();a.textContent=current.membership?.member?'내 정보로 돌아가기':'가입 마무리';$("accountNotice").append(' ',a);}}return;}
 if(mode==="login"){
 const oauth=provider=>action($("accountContent"),async()=>{if(location.origin!==PRODUCTION_ORIGIN){location.assign(PRODUCTION_ORIGIN+authURL(pendingAction(),"login"));return;}const {error}=await client.auth.signInWithOAuth({provider,options:{redirectTo:PRODUCTION_ORIGIN+accountReturn()}});fail(error);});
 for(const p of socialProviders)$(p.id+"Login")?.addEventListener("click",()=>oauth(p.provider));
 $("loginForm").noValidate=true;onForm("loginForm",async d=>{const email=$("loginForm").elements.email,pw=$("loginForm").elements.password;if(!email.value.trim()||!email.checkValidity())return flagInvalid(email,'이메일을 확인해 주세요.');if(!pw.value)return flagInvalid(pw,'비밀번호를 입력해 주세요.');const {error}=await client.auth.signInWithPassword({email:String(d.get("email")).trim(),password:String(d.get("password"))});if(error){message("이메일·비밀번호 또는 이메일 인증 상태를 확인해 주세요.");return}location.assign(accountReturn());});
 $("resendConfirmation")?.addEventListener("click",()=>action($("loginForm"),async()=>{const email=$("loginForm").elements.email;if(!email.reportValidity())return;const {error}=await client.auth.resend({type:"signup",email:email.value.trim(),options:{emailRedirectTo:PRODUCTION_ORIGIN+accountReturn()}});fail(error);message("인증 대기 중인 이메일이면 안내 메일이 발송됩니다.");}));
 $("resetPassword").onclick=()=>action($("loginForm"),async()=>{const email=$("loginForm").elements.email;if(!email.reportValidity())return;const {error}=await client.auth.resetPasswordForEmail(email.value,{redirectTo:PRODUCTION_ORIGIN+"/reset-password.html"});fail(error);message("등록된 이메일이면 비밀번호 재설정 안내가 발송됩니다.");});return;
 }
 const auth=await memberState(client);if(!adminPageCurrent(adminTicket))return;if(auth.state===MEMBER.anonymous){const next=rememberAction(location.pathname+location.search+location.hash);location.replace(authURL(next,'login'));return;}user=auth.user;membership=auth.membership;
 if(!adminPage)client.auth.onAuthStateChange((event,session)=>{if(event==='INITIAL_SESSION'||session?.user?.id===user.id)return;$("accountContent").hidden=true;$("accountContent").style.display="none";message('계정이 변경되어 회원 정보를 다시 확인합니다.');clearAction();setTimeout(()=>location.replace(session?.user?'/account.html':'/login.html'),0);});
 if(auth.state===MEMBER.incomplete&&!['account','reset'].includes(mode)){const next=rememberAction(location.pathname+location.search+location.hash);location.replace(accountReturn(next));return;}
 if((mode==='admin'||document.body.dataset.workspace==='admin')&&!membership.admin){message('관리자 권한이 필요합니다.');lockAdminPage('관리자 권한이 필요합니다.');return;}
 if(document.body.dataset.workspace==='partner'&&(membership.partner_status!=='approved'||membership.profession==='office')){message('승인된 전문가만 이용할 수 있습니다.');return;}
 if(mode==="reset"){$("accountContent").hidden=false;onForm("passwordForm",async d=>{const {error}=await client.auth.updateUser({password:String(d.get("password"))});fail(error);message("비밀번호를 변경했습니다. 내 계정에서 계속 이용할 수 있습니다.");});return;}
 if(['requests','account','notifications'].includes(mode)&&membership.member&&document.body.dataset.workspace!=='admin')void mountForegroundNotice({client,host:$('accountContent'),user});
 if(mode==='notifications'){
  // Resolve reservation links and show the inbox independently of device settings.
  if(!new URLSearchParams(location.search).has('reservation'))void mountNotificationSettings({client,host:$('accountContent'),user,compact:true});
  const page=renderNotificationPage({client,root:$('accountContent')});
  await page;
  simplifyServiceChrome();return;
 }
 if(mode==="requests"){await renderRequests({client,membership,workspace:document.body.dataset.workspace,message,action,config:{...config,viewerId:user.id}});$('accountContent').hidden=false;if($('requestList'))focusBooking($('requestList'));if(document.body.dataset.workspace==='partner'){
  // 업무와 설정의 DOM 순서도 모바일 읽는 순서와 같게 유지한다.
  // 자료실은 정적 카드라 await 전에 먼저 옮겨 두어야 늦게 올라오며 깜빡이지 않는다.
  const tools=document.createElement('div'),quick=document.createElement('div');
  const settings=$("accountContent").querySelector("[data-work-settings]")||$("accountContent");settings.append(tools);const quickDetails=document.createElement("details");const quickTitle=document.createElement("summary");quickTitle.textContent="방문 가능 설정";quickDetails.append(quickTitle,quick);settings.append(quickDetails);quick.className="work-availability";
  const resources=$("accountContent").querySelector('[data-expert-resources]');
  if(resources){const heading=settings.querySelector("h2");if(heading)heading.after(resources);else settings.prepend(resources);}
  await renderInstant(client,quick);
  await renderServiceArea(client,tools);await renderUrgentWorkspace(client,$("accountContent").querySelector("[data-work-primary]")||tools);}else if(document.body.dataset.workspace!=='admin'){await renderUrgentWorkspace(client,$("accountContent"));}}
 if(mode==='requests'&&document.body.dataset.workspace==='admin')await renderWaitlistCounts(client,document.getElementById('regionWaitlistHost'));
 if(mode==='requests'&&document.body.dataset.workspace!=='admin'){void mountNotificationSummary({client,host:$('accountContent'),user});}
 if(mode==='requests'&&document.body.dataset.workspace!=='admin')await renderCareCases(client,$('accountContent'),document.body.dataset.workspace);
 if(mode==="payment")await renderPaymentResult(client,message);
 if(mode==="phone")await renderPhoneVerification({client,config,root:$("accountContent")});
 if(mode==="account"){await renderAccount();$("accountContent").hidden=false;if(membership.member)await mountNotificationSettings({client,host:$("accountContent"),user});}
 if(mode==="partner"&&membership.beta_role==="EXPERT"){await renderBetaExpert(client,$("accountContent"));const quick=document.createElement('div');$("accountContent").prepend(quick);await renderInstant(client,quick);await mountExpertOverview({client,host:$("accountContent"),user,membership});$("accountContent").hidden=false;return;}
 if(mode==="partner"){const applicationStatus=await renderPartner();
  // ① 지금 방문 상담 카드를 신청 정보 카드보다 위에 둔다. partner-work 와 같은 renderInstant 를
  //    그대로 쓴다(새로 만들지 않는다). 승인 전에는 카드 대신 안내 한 줄만 보여준다.
  const top=document.createElement('div');top.dataset.managementPriority='';$("accountContent").prepend(top);
  if(applicationStatus==='approved')await renderInstant(client,top);
  else if(applicationStatus!=='office'){const note=document.createElement('p');note.className='card';note.textContent=membership.partner_status==='approved'?'방문 상담 상태를 확인하지 못했습니다. 새로고침해 주세요.':'승인 후 지금 방문 상담을 켤 수 있어요';top.append(note);}
  if(applicationStatus!=='office'&&membership.partner_status&&membership.profession!=='office')await renderServiceArea(client,$("accountContent"));
  if(["planner","tax"].includes(membership.profession)&&applicationStatus==="approved")await renderProfileEditor(client,$("accountContent"));

  const workLink=$("accountContent").querySelector('[data-work-link]');if(workLink){workLink.hidden=membership.profession==='office'||applicationStatus==='office';$("accountContent").append(workLink);}if(membership.profession!=='office'&&applicationStatus!=='office')arrangeExpertManagement($("accountContent"),{approved:applicationStatus==="approved"});}
 if(mode==="partner")await mountExpertOverview({client,host:$("accountContent"),user,membership});
 if(mode==="admin"){if(config.betaInvitesEnabled)await renderBetaAdmin(client,$("accountContent"));await renderAdmin();$("refreshAdmin").onclick=()=>action($("accountContent"),renderAdmin);}
 if((mode==='partner'||document.body.dataset.workspace==='partner')&&membership.profession!=='office'&&(membership.partner_status||membership.state?.startsWith('EXPERT'))){const entry=document.createElement('a');entry.href='/growth.html';entry.className='btn ghost';entry.textContent='성장·실천';entry.setAttribute('data-growth-entry','');const resources=$('accountContent').querySelector('[data-expert-resources]')||$('accountContent').querySelector('[data-management-menu]');if(resources)resources.append(entry);else {const menu=$('accountContent').querySelector('[data-management-menu]');if(menu)menu.append(entry);else $('accountContent').append(entry);}}
 if(!grantAdminPage(adminTicket))return;
 adminReady=adminPage;
 $("accountContent").hidden=false;
 if(mode==='requests'&&$('requestList'))focusBooking($('requestList'));
 simplifyServiceChrome();
 openMenuDestination();
}
// 로딩 그림 자리(3-6)는 내용이 떴거나 오류 안내가 나오면 감춘다. 안 붙어 있는 화면도 있어 없으면 넘어간다.
const loadingArt=document.querySelector('[data-art-slot="loading"]');
if(loadingArt){const content=$("accountContent");
 const settle=()=>{if(!content.hidden)loadingArt.hidden=true;};
 new MutationObserver(settle).observe(content,{attributes:true,attributeFilter:["hidden"]});settle();}
// A slow auth/member lookup must not leave a hidden workspace without recovery.
let startupFailed=false;
function offerStartupRetry(){if(document.getElementById('memberStartupRetry'))return;const retry=document.createElement('button');retry.type='button';retry.className='btn ghost';retry.id='memberStartupRetry';retry.textContent='연결 다시 확인';retry.onclick=()=>location.reload();$("accountNotice").append(' ',retry);}
const startupTimer=setTimeout(()=>{
 if(!$("accountContent")?.hidden)return;
 if(adminPage)document.getElementById('adminAccessNotice').textContent='접근 권한 확인이 지연되고 있습니다. 새로고침해 주세요.';
 $("accountNotice").textContent='로그인·회원 정보 확인이 지연되고 있습니다. 연결을 다시 확인해 주세요. 예약은 새로 생성되지 않습니다.';
 offerStartupRetry();if(loadingArt)loadingArt.hidden=true;
},15000);
start().catch(e=>{if(adminPage)lockAdminPage('접근 권한을 확인하지 못했습니다. 새로고침해 주세요.');startupFailed=true;message(safeError(e));$("accountContent").hidden=true;$("accountNotice").textContent="회원 서비스 연결 상태를 확인할 수 없습니다.";offerStartupRetry();if(loadingArt)loadingArt.hidden=true;}).finally(()=>{clearTimeout(startupTimer);const retry=document.getElementById('memberStartupRetry');if(!startupFailed&&retry){retry.remove();if(!$("accountContent").hidden)$("accountNotice").textContent=[config?.operator&&'운영: '+config.operator,config?.contact&&'문의: '+config.contact].filter(Boolean).join(' · ');}});
