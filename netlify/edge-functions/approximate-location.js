// Return only a coarse domestic region. No IP, address, cookies or persistent logs.
export default function (_request, context) {
  const geo=context.geo||{},latitude=Number(geo.latitude),longitude=Number(geo.longitude);
  const available=geo.country?.code==='KR'&&Number.isFinite(latitude)&&Number.isFinite(longitude)&&latitude>=33&&latitude<=39&&longitude>=124&&longitude<=132;
  return new Response(JSON.stringify(available?{available:true,source:'network',latitude:Math.round(latitude*100)/100,longitude:Math.round(longitude*100)/100}:{available:false}),{headers:{'Content-Type':'application/json','Cache-Control':'private, no-store','Netlify-CDN-Cache-Control':'no-store'}});
}
export const config={path:'/api/approximate-location',method:'GET'};
