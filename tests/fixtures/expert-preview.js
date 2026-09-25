import {renderPartnerApplication} from '../../src/partner-onboarding.js';
import {renderExpertAdmin} from '../../src/expert-admin.js';
import {pledgeDialog,AGREEMENT_VERSION} from '../../src/expert-shared.js';
const id='10000000-0000-4000-8000-000000000001';
let docs=[],application=null;let phoneConfirmed=false;let mobile='';let serial=0;
const adminRow={user_id:id,profession:'planner',full_name:'가상 신청자',phone:'+821000000000',region:'서울 마포구',organization:'테스트 소속',registration_number:'TEST-123',status:'pending',revision:1,submitted_at:new Date().toISOString(),phone_verified_at:new Date().toISOString(),agreement_version:AGREEMENT_VERSION,agreed_at:new Date().toISOString(),documents:[],events:[],reports:[{id:'test-report',category:'other',reason:'가상 신고: 상담 안내를 확인해 주세요.',created_at:new Date().toISOString(),resolved:false}]};
window.expertDemo={submissions:[],reviews:[],smsFailure:false};
const client={auth:{getUser:async()=>({data:{user:{id,phone:mobile,phone_confirmed_at:phoneConfirmed?new Date().toISOString():null}}}),getSession:async()=>({data:{session:{access_token:'local-fake-not-a-real-token'}}}),updateUser:async({phone})=>{if(window.expertDemo.smsFailure)return {error:{message:'not configured'}};mobile=phone;return {data:{}};},verifyOtp:async({token})=>{if(token!=='123456')return {error:{message:'invalid'}};phoneConfirmed=true;return {data:{}};}},rpc:async(name,args)=>{
 if(name==='expert_workspace')return {data:{application,documents:docs,events:[]}};
 if(name==='expert_submit'){window.expertDemo.submissions.push(args);application={...args.payload,status:'pending',revision:1};return {data:null};}
 if(name==='expert_admin_list')return {data:[adminRow]};
 if(name==='expert_review'){window.expertDemo.reviews.push(args);adminRow.status=['approved','needs_changes','rejected'].includes(args.decision)?args.decision:adminRow.status;adminRow.sanction=['warning','suspended','banned'].includes(args.decision)?args.decision:null;adminRow.revision++;return {data:null};}
 return {error:{message:'Unsupported local mock'}};
}};
const nativeFetch=window.fetch.bind(window);window.fetch=async(url,options)=>{
 if(url!=='/api/expert-documents')return nativeFetch(url,options);
 if(options.body instanceof FormData){const file=options.body.get('file'),kind=options.body.get('kind');const doc={id:'fake-'+(++serial),kind,profession:options.body.get('profession'),filename:file.name,mime:file.type,bytes:file.size,file};docs=docs.filter(d=>d.kind!==kind).concat(doc);return Response.json(doc);}
 const payload=JSON.parse(options.body);const doc=docs.find(d=>d.id===payload.id);if(payload.action==='read')return new Response(doc?.file||new Blob(['%PDF-1.7 demo'],{type:'application/pdf'}));docs=docs.filter(d=>d.id!==payload.id);return Response.json({deleted:true});
};
const message=text=>document.getElementById('accountMessage').textContent=text;
if(new URLSearchParams(location.search).get('view')==='admin')await renderExpertAdmin({client,host:document.getElementById('demoHost'),message});
else if(new URLSearchParams(location.search).get('view')==='badge'){const b=document.createElement('button');b.className='pledge-badge';b.textContent='소비자보호 서약';b.onclick=pledgeDialog;document.getElementById('demoHost').append(b);}
else await renderPartnerApplication({client,user:{id},membership:{member:true},message});
