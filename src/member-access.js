import {createClient} from '@supabase/supabase-js';
export const MEMBER={anonymous:'ANONYMOUS',incomplete:'AUTHENTICATED_INCOMPLETE',active:'ACTIVE_MEMBER',beta:'BETA_MEMBER',expertPending:'EXPERT_PENDING',expertApproved:'EXPERT_APPROVED',admin:'ADMIN'};
const pendingKey='bohumso-pending-action';
export function safeNext(value,fallback='/account.html'){
 if(typeof value!=='string'||!value.startsWith('/')||value.startsWith('//')||/[\\\u0000-\u0020]/.test(value))return fallback;
 try{const decoded=decodeURIComponent(value);if(decoded.startsWith('//')||/[\\\u0000-\u001f]/.test(decoded))return fallback;const u=new URL(value,'https://internal.invalid');if(u.origin!=='https://internal.invalid'||u.pathname.startsWith('//')||/^\/(login|signup|auth|reset-password)(\.html)?\/?$/i.test(u.pathname))return fallback;return u.pathname+u.search+u.hash;}catch{return fallback;}
}
export function rememberAction(next){const path=safeNext(next);try{sessionStorage.setItem(pendingKey,JSON.stringify({next:path,at:Date.now()}));}catch{}return path;}
export function pendingAction(){const query=new URLSearchParams(location.search).get('next')||new URLSearchParams(location.search).get('returnTo');if(query)return rememberAction(query);try{const value=JSON.parse(sessionStorage.getItem(pendingKey)||'null');if(value&&Date.now()-value.at<2*60*60*1000)return safeNext(value.next);const legacy=sessionStorage.getItem('bohumso-booking-return');if(legacy)return rememberAction(legacy);}catch{}return '/account.html';}
export function clearAction(){try{sessionStorage.removeItem(pendingKey);sessionStorage.removeItem('bohumso-booking-return');}catch{}}
export function authURL(next,mode='signup'){return '/'+(mode==='login'?'login':'signup')+'.html?next='+encodeURIComponent(safeNext(next));}
export function accountReturn(next=pendingAction()){return '/account.html'+(next==='/account.html'?'':'?next='+encodeURIComponent(safeNext(next)));}
let service;
export function memberService(){return service||(service=(async()=>{const response=await fetch('/api/config',{cache:'no-store'});if(!response.ok)throw Error('network_unavailable');const config=await response.json();if(!config.enabled)throw Error('service_unavailable');const client=createClient(config.url,config.key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,flowType:'pkce',storageKey:'woori-account'}});return {client,config};})().catch(error=>{service=null;throw error;}));}
export async function memberState(client){
 const {data,error}=await client.auth.getUser();if(error||!data.user){if(error&&error.name!=='AuthSessionMissingError'&&error.status!==400&&error.status!==401)throw error;return {state:MEMBER.anonymous,user:null,membership:null};}
 const result=await client.rpc('my_membership');if(result.error)throw result.error;return {accountState:result.data?.state,state:result.data?.member?MEMBER.active:MEMBER.incomplete,user:data.user,membership:result.data};
}
export async function requireActiveMember({next=location.pathname+location.search+location.hash,client,mode='signup'}={}){
 const result=await memberState(client||(await memberService()).client);if(result.state===MEMBER.active)return result;
 const path=rememberAction(next);location.assign(result.state===MEMBER.anonymous?authURL(path,mode):accountReturn(path));return null;
}
