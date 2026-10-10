// Keep only the selection needed to resume a request; never persist contact details.
const fields=['planner','office','region','purpose','method','date','time','situation'];
export function requestParams(search){const source=new URLSearchParams(search),result=new URLSearchParams();for(const key of fields)if(source.has(key))result.set(key,source.get(key));if(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(source.get('request')||''))result.set('request',source.get('request'));return result;}
export function requestIdentity(payload){return JSON.stringify([payload.planner_id||'',payload.office_id||'',payload.region||payload.area||'',payload.purpose||'',payload.method||'visit',payload.preferred_at||'']);}
export function stableRequestKey(payload,namespace='consultation'){
 const key='bohumso-request-'+namespace,identity=requestIdentity(payload);
 try{const saved=JSON.parse(sessionStorage.getItem(key)||'null');if(saved?.identity===identity&&Date.now()-saved.at<24*60*60*1000)return saved.key;const value={identity,key:crypto.randomUUID(),at:Date.now()};sessionStorage.setItem(key,JSON.stringify(value));return value.key;}catch{return crypto.randomUUID();}
}
