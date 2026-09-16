import {createClient} from '@supabase/supabase-js';
import {testPaymentConfig,createTossGateway,verifiedPayment,confirmAndReconcile} from './_shared/payments.mjs';
const env=(key:string)=>Netlify.env.get(key);
const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
export default async (request:Request)=>{
 if(request.method!=='POST')return reply({error:'method_not_allowed'},405);
 try{
  const settings=testPaymentConfig(env);
  if(request.headers.get('origin')!==settings.origin)return reply({error:'origin_not_allowed'},403);
  if(!request.headers.get('content-type')?.includes('application/json'))return reply({error:'json_required'},415);
  const text=await request.text();if(text.length>12000)return reply({error:'request_too_large'},413);
  const body=JSON.parse(text),token=request.headers.get('authorization')?.replace(/^Bearer /,'');if(!token)return reply({error:'login_required'},401);
  const url=env('SUPABASE_URL'),key=env('SUPABASE_PUBLISHABLE_KEY'),service=env('SUPABASE_SERVICE_ROLE_KEY');if(!url||!key||!service)throw Error('server_not_configured');
  const client=createClient(url,key,{global:{headers:{Authorization:'Bearer '+token}},auth:{persistSession:false,autoRefreshToken:false}});
  const auth=await client.auth.getUser(token);if(auth.error||!auth.data.user)return reply({error:'login_required'},401);
  const server=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
  async function rpc(c:any,name:string,args:any){const result=await c.rpc(name,args);if(result.error)throw Error(result.error.message);return result.data;}
  const gateway=createTossGateway(settings.secretKey);
  if(body.action==='checkout'){
   const order=await rpc(client,'connection_checkout',{booking_id:body.bookingId,requested_stage:body.stage});
   return reply({order,clientKey:settings.clientKey,successUrl:settings.origin+'/payment-result.html',failUrl:settings.origin+'/payment-result.html?failed=1',testOnly:true});
  }
  if(body.action==='confirm'){
   if(!Number.isSafeInteger(body.amount))return reply({error:'invalid_amount'},400);
   const order=await rpc(client,'connection_begin_confirm',{order_id:body.orderId,provided_key:body.paymentKey,provided_amount:body.amount});
   const result=await confirmAndReconcile(order,gateway,args=>rpc(server,'connection_reconcile',args));return reply(result);
  }
  if(body.action==='status'){
   const order=await rpc(client,'connection_user_order',{order_id:body.orderId});if(!order.payment_key)return reply({status:order.state});
   const payment=await gateway.lookup(order.id);await rpc(server,'connection_reconcile',verifiedPayment(payment,order));return reply({status:payment.status});
  }
  if(body.action==='refund'){
   const order=await rpc(client,'connection_refund_request',{order_id:body.orderId,reason:body.reason});if(order.already_refunded)return reply({status:'CANCELED'});
   try{
    let payment=await gateway.lookup(order.id);
    if(payment.status!=='CANCELED')payment=await gateway.cancel(order);
    await rpc(server,'connection_reconcile',verifiedPayment(payment,order));return reply({status:payment.status});
   }catch{
    // Mark for reconciliation. Retry uses the same refund idempotency key, never a new refund.
    await rpc(server,'connection_refund_failure',{order_id:order.id});return reply({error:'refund_needs_reconciliation'},503);
   }
  }
  return reply({error:'unknown_action'},400);
 }catch(error){const code=error instanceof Error?error.message:'unknown';const allowed=['test_payment_not_configured','live_payments_blocked','payment_status_pending','free_no_payment','dispute_on_hold','invalid_stage','payment_mismatch','payment_key_conflict','request_forbidden','server_not_configured'];return reply({error:allowed.includes(code)?code:'payment_unavailable'},503);}
};
export const config={path:'/api/payment'};
