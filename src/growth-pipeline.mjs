// Dormant adapters. Source documents are data, never instructions; personal records are not inputs.
export const pipelineLimits=Object.freeze({monthlyCalls:8,maxRetries:2,maxFailures:3,maxSourceBytes:100000,maxOutputChars:12000});
export function contentJobKey(kind,period,sourceId){if(!['weekly','book','rest','tools'].includes(kind)||!/^\d{4}-\d{2}(-\d{2})?$/.test(period)||!sourceId)throw Error('invalid_job');return ['growth',kind,period,encodeURIComponent(sourceId)].join(':');}
export async function prepareContent({approved=false,kind,period,source,collector,generator,receipts}){
 if(!approved||!collector||!generator||!receipts)return {state:'disconnected',executed:false};
 const key=contentJobKey(kind,period,source.id);
 // Durable adapters must serialize this key and persist the provider idempotency token.
 return receipts.runOnce(key,async()=>{
  const data=await collector.readOfficial(source,{maxBytes:pipelineLimits.maxSourceBytes});
  const draft=await generator.createDraft({category:kind,source:{title:data.title,url:data.url,published_date:data.published_date||null,collected_at:data.collected_at},untrustedSourceText:data.text},{idempotencyKey:key,limits:pipelineLimits});
  return {state:'review',executed:true,source_key:key,draft};
 });
}
