export const availabilityLabels={now:'🟢 지금 가능',today:'🟡 오늘 가능',scheduled:'⚪ 예약 가능',unavailable:'🔴 상담 불가'};
export function availabilityOf(p,now=Date.now()){
 if(!p.available)return 'unavailable';
 if(['now','today'].includes(p.availability_status)&&Date.parse(p.availability_until)>now)return p.availability_status;
 return 'scheduled';
}
export function prioritizeProfiles(profiles){const rank={now:0,today:1,scheduled:2,unavailable:3};return [...profiles].sort((a,b)=>rank[availabilityOf(a)]-rank[availabilityOf(b)]||(a.distance??Infinity)-(b.distance??Infinity)||a.name.localeCompare(b.name,'ko'));}
