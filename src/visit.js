import {createClient} from '@supabase/supabase-js';
(async()=>{try{
 const response=await fetch('/api/config',{cache:'no-store'});if(!response.ok)return;const config=await response.json();if(!config.enabled||!config.visitMetrics)return;
 const day=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(new Date()),key='bohumso-visit-'+day;
 let id=sessionStorage.getItem(key);if(!id){id=crypto.randomUUID();sessionStorage.setItem(key,id);}
 const client=createClient(config.url,config.key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
 await client.rpc('record_visit_session',{session_id:id});
}catch{/* Optional aggregate metrics must never interrupt the page. */}})();
