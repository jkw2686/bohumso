import {createClient} from '@supabase/supabase-js';
export default async ()=>{
 if(Netlify.env.get('MATCHING_WORKER_ENABLED')!=='true')return;
 const url=Netlify.env.get('SUPABASE_URL'),key=Netlify.env.get('SUPABASE_SERVICE_ROLE_KEY');if(!url||!key)throw Error('matching_not_configured');
 const client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});const {error}=await client.rpc('expire_consultation_offers');if(error)throw Error('matching_retry_required');
};
export const config={schedule:'*/15 * * * *'};
