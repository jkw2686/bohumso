import {el,link} from './consultation-ui.js';
let cleanup=()=>{},generation=0;
export async function renderSponsored(parent,area){
 const current=++generation;cleanup();parent.replaceChildren();parent.hidden=true;
 try{
  const response=await fetch('/api/ads?area='+encodeURIComponent(area),{cache:'no-store'});
  if(!response.ok)return;const data=await response.json();if(current!==generation||!data.enabled||!data.ads?.length)return;
  parent.hidden=false;el('h2','광고 · 지역 전문가',parent);el('p','유료 노출 영역입니다. 아래 일반 목록에서도 직접 비교하고 선택할 수 있습니다.',parent);
  const timers=new Map(),proofs=new Map(),sent=new Set();
  const observer=new IntersectionObserver(entries=>{for(const entry of entries){
   clearTimeout(timers.get(entry.target));
   if(entry.isIntersecting&&entry.intersectionRatio>=0.5&&!document.hidden&&!sent.has(entry.target)){
    timers.set(entry.target,setTimeout(()=>{if(document.hidden)return;sent.add(entry.target);observer.unobserve(entry.target);fetch('/api/ads',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:proofs.get(entry.target)})}).catch(()=>{});},1000));
   }
  }},{threshold:[0,0.5]});
  const visibility=()=>{if(document.hidden){for(const t of timers.values())clearTimeout(t);}else for(const node of proofs.keys())if(!sent.has(node)){observer.unobserve(node);observer.observe(node);}};
  document.addEventListener('visibilitychange',visibility);
  for(const ad of data.ads){
   const card=el('article',undefined,parent);card.className='card';el('span','광고',card).className='sample-tag';
   el('h3',ad.name,card);el('p',ad.region+' · '+ad.plan_name,card);
   link(card,'프로필 직접 확인','/find.html?profile='+encodeURIComponent(ad.planner_id)+'#profile-'+encodeURIComponent(ad.planner_id));
   proofs.set(card,ad.token);observer.observe(card);
  }
  cleanup=()=>{observer.disconnect();for(const timer of timers.values())clearTimeout(timer);document.removeEventListener('visibilitychange',visibility);};
 }catch{parent.hidden=true;}
}
