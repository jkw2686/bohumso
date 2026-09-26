import {readFile,mkdir} from 'node:fs/promises';import {PGlite} from '@electric-sql/pglite';import {createClient} from '@supabase/supabase-js';
export const ACTORS={customer:'10000000-1111-4000-8000-000000000001',admin:'30000000-1111-4000-8000-000000000001',expert:'20000000-1111-4000-8000-000000000001'};
export async function openTestDatabase({memory=false,dataDir='artifacts/test-flow-db',env=process.env}={}){
 let backend,invoke,close;
 if(env.TEST_SUPABASE_URL||env.TEST_SUPABASE_SERVICE_ROLE_KEY){
  if(!env.TEST_SUPABASE_URL||!env.TEST_SUPABASE_SERVICE_ROLE_KEY||env.TEST_SUPABASE_ALLOW_REMOTE!=='true')throw Error('Test Supabase requires URL, server key and explicit TEST_SUPABASE_ALLOW_REMOTE=true.');
  const url=new URL(env.TEST_SUPABASE_URL),ref=url.hostname.split('.')[0];if(url.protocol!=='https:'||!url.hostname.endsWith('.supabase.co')||ref!==env.TEST_SUPABASE_PROJECT_REF||ref==='xyexphhspykwwlhfokfl')throw Error('A separate, explicitly selected test Supabase project is required. Existing production project is blocked.');
  const client=createClient(url.origin,env.TEST_SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});backend='supabase-test';invoke=async(actor,operation,payload)=>{const r=await client.rpc('bohumso_test_command',{actor,operation,payload});if(r.error)throw Error(r.error.message);return r.data;};close=async()=>{};
  await invoke(ACTORS.admin,'session',{});
 }else{
  if(!memory)await mkdir(dataDir,{recursive:true});const db=new PGlite(memory?undefined:dataDir);await db.exec(await readFile('supabase/012_private_test_flow.sql','utf8'));backend='local-postgresql';let queue=Promise.resolve();invoke=(actor,operation,payload)=>{const next=queue.then(async()=>{const r=await db.query('select public.bohumso_test_command($1,$2,$3) result',[actor,operation,payload]);return r.rows[0].result;});queue=next.catch(()=>{});return next;};close=async()=>{await queue;await db.close();};
 }
 return {backend,command:(actor,operation,payload={})=>invoke(actor,operation,payload),close};
}
