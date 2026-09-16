import {PGlite} from '@electric-sql/pglite';import {readFile} from 'node:fs/promises';
export const ids={customer:'10000000-0000-4000-8000-000000000001',other:'10000000-0000-4000-8000-000000000002',planner:'20000000-0000-4000-8000-000000000001',next:'20000000-0000-4000-8000-000000000002',admin:'30000000-0000-4000-8000-000000000001'};
export async function fixture(){
 const db=new PGlite();await db.exec("create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key,email_confirmed_at timestamptz);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;");
 for(const file of ['001_accounts.sql','002_requests.sql','003_consultations.sql','004_payment_ledger.sql','005_matching_worker.sql','006_metrics.sql']){try{await db.exec(await readFile('supabase/'+file,'utf8'));}catch(error){await db.close();throw Error(file+': '+error.message+' at '+error.position);}}
 const rpc=async(name,args=[])=>{const rows=(await db.query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) result`,args)).rows;return rows[0].result;};
 const login=async(id,role='authenticated')=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id||'']);await db.exec('set role '+role);};
 for(const id of Object.values(ids))await db.query('insert into auth.users values($1,now())',[id]);await db.query('insert into private.admin_memberships values($1)',[ids.admin]);
 for(const id of Object.values(ids)){await login(id);await rpc('complete_membership',[true,true,true,false]);}
 const cmd=(operation,payload={})=>rpc('consultation_command',[operation,payload]);
 for(const key of ['planner','next']){await login(ids[key]);await rpc('apply_partner',[key==='planner'?'가상 설계사 A':'가상 설계사 B','planner','테스트 소속','서울 마포구','TEST-'+key,true]);await cmd('profile',{specialties:['claim','coverage'],biography:'테스트 계정',experience:0,hours:'테스트 시간',available:true,phone:'01000000000',latitude:key==='planner'?37.566:37.56,longitude:key==='planner'?126.902:126.91});await login(ids.admin);await rpc('review_partner',[ids[key],'approved','테스트 fixture 전용']);await cmd('verify_planner',{planner_id:ids[key],identity_key:'TEST-REGISTRY-'+key,evidence:'가상 테스트 데이터 확인',checked:true,is_sample:true});}
 const workspace=()=>rpc('consultation_workspace',['customer']);
 const row=async(id,view='customer')=>(await rpc('consultation_workspace',[view])).bookings.find(b=>b.id===id);
 const slot=(n=0)=>new Date(Math.ceil((Date.now()+86400000)/1800000)*1800000+n*1800000).toISOString();
 return {db,rpc,login,cmd,row,slot};
}
