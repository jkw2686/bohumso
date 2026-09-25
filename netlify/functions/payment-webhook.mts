import {createClient} from '@supabase/supabase-js';
import {testPaymentConfig,createTossGateway,verifiedPayment} from './_shared/payments.mjs';
export default async (request:Request)=>{
 if(request.method!=='POST')return new Response(null,{status:405});
 try{
  const env=(key:string)=>Netlify.env.get(key),settings=testPaymentConfig(env);
  const text=await request.text();if(text.length>32768)return new Response(null,{status:413});
  const body=JSON.parse(text),id=body.data?.orderId;
  if(typeof id!=='string'||!/^(ad_|testadmin_)[a-f0-9]{32}$/.test(id))return new Response(null,{status:200});
  const client=createClient(env('SUPABASE_URL')!,env('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:order,error}=await client.rpc(id.startsWith('testadmin_')?'admin_test_order_lookup':'ad_order_lookup',{order_id:id});if(error)throw Error('lookup');if(!order?.payment_key)return new Response(null,{status:200});
  // Treat the webhook as a hint only. Payload status, amounts, and receipt are never trusted.
  const payment=await createTossGateway(settings.secretKey).lookup(id);
  const result=await client.rpc(id.startsWith('testadmin_')?'admin_test_reconcile':'ad_reconcile',verifiedPayment(payment,order));if(result.error)throw Error('reconcile');
  return new Response(null,{status:200});
 }catch{return new Response(null,{status:503});}
};
export const config={path:'/api/payment-webhook'};
