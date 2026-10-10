// Search existing directory information without inferring an institution's address.
export function normalizeResourceSearch(value){
 return String(value||'').normalize('NFKC').toLowerCase().replace(/대학교/g,'대').replace(/[^\p{L}\p{N}]/gu,'');
}
export function matchesResourceQuery(resource,query,typeNames={}){
 const fields=[resource.name,...resource.aliases||[],resource.region,resource.regionGroup,resource.summary,typeNames[resource.type],typeNames[resource.insuranceClass]];
 const text=normalizeResourceSearch(fields.join(' ')),whole=normalizeResourceSearch(query);
 if(!whole||text.includes(whole))return true;
 const tokens=String(query).trim().split(/[\s,·/]+/u).map(normalizeResourceSearch).filter(Boolean);
 // Place words may match an institution name; this does not assert its street address.
 return tokens.every(token=>text.includes(token)||(token.length>=3&&/[시군구]$/.test(token)&&text.includes(token.slice(0,-1))));
}
export function inResourceCategory(resource,category){
 if(category==='all')return true;
 if(category==='service')return ['service','inheritance','funeral'].includes(resource.type);
 if(category==='reference')return ['pension','other'].includes(resource.type);
 if(category==='insurer')return resource.type==='insurer'||resource.type==='pension';
 if(category==='life')return resource.insuranceClass==='life'||resource.type==='pension';
 if(category==='nonlife'||category==='post')return resource.insuranceClass===category;
 return resource.type===category;
}
