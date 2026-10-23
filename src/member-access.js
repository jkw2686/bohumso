import {installPushIdentityGuard} from './reservation-push.js';
import {createClient} from '@supabase/supabase-js';
import {requestParams} from './request-intent.js';
export const MEMBER={anonymous:'ANONYMOUS',incomplete:'AUTHENTICATED_INCOMPLETE',active:'ACTIVE_MEMBER',beta:'BETA_MEMBER',expertPending:'EXPERT_PENDING',expertApproved:'EXPERT_APPROVED',admin:'ADMIN'};
const pendingKey='bohumso-pending-action';
const returnPages=new Set('/ /index.html /map.html /requests.html /account.html /partner.html /partner-work.html /admin-requests.html /admin.html /phone-verification.html /notifications.html /urgent.html /find.html /consult.html /analysis.html /diagnosis.html /dashboard.html /support.html /growth.html /payment-result.html /my-reservations /reserve /consultation/new /pro /terms.html /privacy.html'.split(' '));
returnPages.add('/menu.html');
for(const page of [...returnPages])if(page.endsWith('.html'))returnPages.add(page.slice(0,-5));
export function safeNext(value,fallback='/account.html'){
 if(typeof value!=='string'||!value.startsWith('/')||value.startsWith('//')||/[\\\u0000-\u0020]/.test(value))return fallback;
 try{const decoded=decodeURIComponent(value);if(decoded.startsWith('//')||/[\\\u0000-\u001f]/.test(decoded))return fallback;const u=new URL(value,'https://internal.invalid');if(!returnPages.has(u.pathname))return fallback;if(u.origin!=='https://internal.invalid'||u.pathname.startsWith('//')||/^\/(login|signup|auth|reset-password)(\.html)?\/?$/i.test(u.pathname))return fallback;for(const key of ['code','access_token','refresh_token','token','token_hash','next','returnTo','redirect','redirect_to','redirectTo'])if(u.searchParams.has(key))u.searchParams.delete(key);if(/(?:access_token|refresh_token|token_hash)=/.test(u.hash))u.hash='';return u.pathname+u.search+u.hash;}catch{return fallback;}
}
export function rememberAction(next){let path=safeNext(next);const url=new URL(path,'https://internal.invalid');if(/^\/(requests|urgent)(\.html)?$/.test(url.pathname)){url.search=requestParams(url.search).toString();path=url.pathname+url.search+url.hash;}try{sessionStorage.setItem(pendingKey,JSON.stringify({next:path,at:Date.now()}));}catch{}return path;}
export function pendingAction(){const query=new URLSearchParams(location.search).get('next')||new URLSearchParams(location.search).get('returnTo');if(query)return rememberAction(query);try{const value=JSON.parse(sessionStorage.getItem(pendingKey)||'null');if(value&&Number.isFinite(value.at)&&Date.now()>=value.at&&Date.now()-value.at<2*60*60*1000)return safeNext(value.next);clearAction();}catch{}return '/account.html';}
export function clearAction(){try{sessionStorage.removeItem(pendingKey);sessionStorage.removeItem('bohumso-booking-return');sessionStorage.removeItem('bohumso-signup-choice');sessionStorage.removeItem('bohumso-signup-intent');}catch{}}
export function authURL(next,mode='signup'){return '/'+(mode==='login'?'login':'signup')+'.html?next='+encodeURIComponent(safeNext(next));}
export function loginCallback(origin=location.origin,next=pendingAction()){return new URL('/account.html?next='+encodeURIComponent(safeNext(next)),origin).href;}
export function accountReturn(next=pendingAction()){return '/account.html'+(next==='/account.html'?'':'?next='+encodeURIComponent(safeNext(next)));}
let service;
// Only public configuration is shared across entry bundles; never identity or permissions.
const configuration=Symbol.for('bohumso.public-config.request');
export function memberConfig(){return globalThis[configuration]||(globalThis[configuration]=fetch('/api/config',{cache:'no-store',signal:AbortSignal.timeout(12000)}).then(async response=>{if(!response.ok)throw Error('network_unavailable');return response.json();}).catch(error=>{delete globalThis[configuration];throw error;}));}
const stateRequests=new WeakMap(),stateEpochs=new WeakMap();
export function memberService(){return service||(service=(async()=>{const config=await memberConfig();if(!config.enabled)throw Error('service_unavailable');const client=createClient(config.url,config.key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,flowType:'pkce',storageKey:'woori-account'}});installPushIdentityGuard(client);let identity;client.auth.onAuthStateChange((event,session)=>{const nextIdentity=session?.user?.id||null;if(identity!==undefined&&identity!==nextIdentity){stateEpochs.set(client,(stateEpochs.get(client)||0)+1);stateRequests.delete(client);}identity=nextIdentity;if(event==='SIGNED_OUT'){clearAction();try{sessionStorage.removeItem('bohumso-action-owner');sessionStorage.removeItem('bohumso-signup-intent');sessionStorage.removeItem('bohumso-signup-choice');localStorage.removeItem('bohumso-public-consent-intent');}catch{}}});return {client,config};})().catch(error=>{service=null;throw error;}));}
export function invalidateMemberState(client){stateEpochs.set(client,(stateEpochs.get(client)||0)+1);stateRequests.delete(client);}
// Share concurrent checks only. Never persist or reuse a completed authorization result.
export function memberState(client){
 if(stateRequests.has(client))return stateRequests.get(client);
 const request=readMemberState(client).finally(()=>{if(stateRequests.get(client)===request)stateRequests.delete(client);});stateRequests.set(client,request);return request;
}
async function readMemberState(client){
 const epoch=stateEpochs.get(client)||0;
 const {data,error}=await client.auth.getUser();if(error||!data.user){if(error&&error.name!=='AuthSessionMissingError'&&error.status!==400&&error.status!==401)throw error;return {state:MEMBER.anonymous,user:null,membership:null};}
 try{const previous=sessionStorage.getItem('bohumso-action-owner');if(previous&&previous!==data.user.id){clearAction();sessionStorage.removeItem('bohumso-signup-intent');sessionStorage.removeItem('bohumso-signup-choice');localStorage.removeItem('bohumso-public-consent-intent');const url=new URL(location.href);url.searchParams.delete('next');url.searchParams.delete('returnTo');url.searchParams.delete('roleIntent');history.replaceState(null,'',url);}sessionStorage.setItem('bohumso-action-owner',data.user.id);}catch{}
 const result=await client.rpc('my_membership');if(epoch!==(stateEpochs.get(client)||0))throw Error('account_changed');if(result.error)throw result.error;return {accountState:result.data?.state,state:result.data?.member?MEMBER.active:MEMBER.incomplete,user:data.user,membership:result.data};
}
export async function requireActiveMember({next=location.pathname+location.search+location.hash,client,mode='signup'}={}){
 const result=await memberState(client||(await memberService()).client);if(result.state===MEMBER.active)return result;
 const path=rememberAction(next);location.assign(result.state===MEMBER.anonymous?authURL(path,mode):accountReturn(path));return null;
}

const funnelEvents=new Set('home_view signup_started signup_completed location_success location_denied expert_viewed reservation_started reservation_created reservation_confirmed consultation_completed google_auth_failed email_auth_failed location_failed reservation_failed duplicate_reservation rls_denied function_error payment_test_error'.split(' '));
export function trackEvent(name){if(!funnelEvents.has(name))return;void memberService().then(({client,config})=>{if(config.operationalMetrics)return client.rpc('record_operational_event',{event_name:name});}).catch(()=>{});}
