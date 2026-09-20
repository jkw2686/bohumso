import pg from 'pg';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {randomUUID} from 'node:crypto';
const connection=process.env.DATABASE_URL;
if(!connection){console.error('DATABASE_URL에 일회용 로컬 PostgreSQL 연결을 설정하세요. 실행하지 않았습니다.');process.exit(1);}
let url;try{url=new URL(connection);}catch{console.error('연결 형식을 확인하세요.');process.exit(1);}
if(!['localhost','127.0.0.1','[::1]'].includes(url.hostname)){console.error('로컬 일회용 PostgreSQL만 허용합니다.');process.exit(1);}
const database='bohumso_test_'+randomUUID().replaceAll('-',''),control=new pg.Client({connectionString:connection});
let created=false,admin,workers=[];
const ids={customer:'10000000-0000-4000-8000-000000000001',other:'10000000-0000-4000-8000-000000000002',planner:'20000000-0000-4000-8000-000000000001',next:'20000000-0000-4000-8000-000000000002',admin:'30000000-0000-4000-8000-000000000001'};
async function rpc(c,name,args=[]){return (await c.query('select public.'+name+'('+args.map((_,i)=>'$'+(i+1)).join(',')+') result',args)).rows[0].result;}
async function login(c,id){await c.query('reset role');await c.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await c.query('set role authenticated');}
try{
 await control.connect();
 await control.query('CREATE DATABASE "'+database+'"');created=true;url.pathname='/'+database;
 admin=new pg.Client({connectionString:url.toString()});await admin.connect();
 // Roles are cluster-wide. Reuse standard roles without modifying privileges.
 for(const name of ['anon','authenticated','service_role']){if(!(await control.query('select 1 from pg_roles where rolname=$1',[name])).rowCount)await control.query('CREATE ROLE '+name+' NOLOGIN');}
 await admin.query("create schema auth;create table auth.users(id uuid primary key,email_confirmed_at timestamptz);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;");
 for(const name of ['001_accounts.sql','002_requests.sql','003_consultations.sql','004_payment_ledger.sql','005_matching_worker.sql','006_metrics.sql'])await admin.query(await readFile('supabase/'+name,'utf8'));
 for(const id of Object.values(ids))await admin.query('insert into auth.users values($1,now())',[id]);
 await admin.query('insert into private.admin_memberships values($1)',[ids.admin]);
 for(const id of Object.values(ids)){await login(admin,id);await rpc(admin,'complete_membership',[true,true,true,false]);}
 for(const k of ['planner','next']){
 await login(admin,ids[k]);await rpc(admin,'apply_partner',['가상 '+k,'planner','테스트','서울','TEST-'+k,true]);
 await rpc(admin,'consultation_command',['profile',{specialties:['claim'],available:true}]);
 await login(admin,ids.admin);await rpc(admin,'review_partner',[ids[k],'approved','TEST ONLY fixture approval']);
 await rpc(admin,'consultation_command',['verify_planner',{planner_id:ids[k],identity_key:'TEST-'+k,evidence:'TEST ONLY fixture identity',checked:true,is_sample:true}]);
 }
 const p=(await rpc(admin,'ad_admin_command',['plan',{code:'regional_exclusive',amount:12000,period_days:30,guaranteed_impressions:100,enabled:true,reason:'TEST ONLY race plan'}])).id;
 const sl=(await rpc(admin,'ad_admin_command',['slot',{code:'regional_exclusive',region:'서울',enabled:true,reason:'TEST ONLY race slot'}])).id;
 workers=await Promise.all([1,2].map(async()=>{const c=new pg.Client({connectionString:url.toString()});await c.connect();await c.query("set statement_timeout='15s'");return c;}));
 const checkout=await Promise.allSettled(workers.map(async(c,i)=>{await login(c,i?ids.next:ids.planner);return rpc(c,'ad_checkout',[p,sl,randomUUID(),true]);}));
 assert.equal(checkout.filter(r=>r.status==='fulfilled').length,1);
 assert.match(checkout.find(r=>r.status==='rejected').reason.message,/slot_unavailable/);
 console.log('PASS: concurrent exclusive advertising checkout allows exactly one owner');
 const slot=new Date(Math.ceil((Date.now()+86400000)/1800000)*1800000).toISOString(),bookings=[];
 for(const customer of [ids.customer,ids.other]){
 await login(admin,customer);const b=await rpc(admin,'consultation_command',['request',{planner_id:ids.planner,purpose:'claim',region:'서울',method:'scheduled',preferred_at:slot}]);bookings.push(b.id);
 await login(admin,ids.planner);await rpc(admin,'consultation_command',['accept',{id:b.id,revision:1}]);
 }
 const confirms=await Promise.allSettled(workers.map(async(c,i)=>{await login(c,i?ids.other:ids.customer);return rpc(c,'consultation_command',['confirm',{id:bookings[i],revision:2,name:'가상 고객',phone:'01011112222',share_consent:true}]);}));
 assert.equal(confirms.filter(r=>r.status==='fulfilled').length,1);assert.match(confirms.find(r=>r.status==='rejected').reason.message,/consultation_slot/);
 console.log('PASS: concurrent same-time consultations allow exactly one appointment');
}catch(e){console.error('검증 실패:',e.code||'test_failed');process.exitCode=1;}
finally{
 await Promise.allSettled(workers.map(c=>c.end()));await admin?.end().catch(()=>{});
 if(created){try{await control.query('DROP DATABASE "'+database+'"');}catch{console.error('생성한 테스트 DB 정리가 필요합니다: '+database);process.exitCode=1;}}
 await control.end().catch(()=>{});
}
