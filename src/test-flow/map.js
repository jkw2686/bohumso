// Reuse the existing map.html Leaflet 1.9.4 / OpenStreetMap renderer.
// Experts always come from the current directory API, never the illustration.
let library;
function loadLeaflet(){
 if(window.L)return Promise.resolve(window.L);
 if(library)return library;
 library=new Promise((resolve,reject)=>{
  const css=document.createElement('link');css.rel='stylesheet';css.href='/vendor/leaflet.css';document.head.append(css);
  const script=document.createElement('script');script.src='/vendor/leaflet.js';script.async=true;
  const timer=setTimeout(()=>reject(Error('map_timeout')),8000);
  script.onload=()=>{clearTimeout(timer);window.L?resolve(window.L):reject(Error('map_unavailable'));};script.onerror=()=>{clearTimeout(timer);reject(Error('map_unavailable'));};document.head.append(script);
 }).catch(e=>{library=null;throw e;});return library;
}
export function mountDirectoryMap(parent,profiles,center,handlers){
 let disposed=false,map,observer;const canvas=document.createElement('div');canvas.className='geographic-map';parent.prepend(canvas);
 loadLeaflet().then(L=>{
  if(disposed||!parent.isConnected)return;
  map=L.map(canvas,{zoomControl:false,attributionControl:true,scrollWheelZoom:false,zoomAnimation:false,fadeAnimation:false,markerZoomAnimation:false}).setView([center.lat,center.lng],14);
  const tiles=L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>'}).addTo(map);
  let loaded=false;tiles.on('tileload',()=>{loaded=true;parent.dataset.tiles='loaded';});tiles.on('tileerror',()=>{if(!loaded)handlers.failed();});
  profiles.forEach(p=>{const isBranch=p.kind==='branch';const button=document.createElement('button');button.type='button';button.className='map-marker'+(isBranch?' branch-marker':'')+(p.planned?' planned-marker':'');if(isBranch)button.dataset.branchId=p.id;else button.dataset.expertId=p.id;button.textContent=isBranch?'🏠 '+p.name:(p.profession==='adjuster'?'손해':'설계')+' · '+p.name;if(p.planned)button.textContent+=' · 예정';button.onclick=e=>{e.stopPropagation();handlers.select(p);};const marker=L.marker([p.latitude,p.longitude],{icon:L.divIcon({html:button,className:'live-marker'+(isBranch?' live-branch':''),iconSize:[160,44],iconAnchor:[80,44]}),keyboard:false,zIndexOffset:isBranch?1000:0}).addTo(map);marker.on('click',()=>handlers.select(p));});
  const brand=getComputedStyle(parent).getPropertyValue('--brand').trim();if(handlers.showLocation)L.circleMarker([center.lat,center.lng],{radius:8,color:brand,fillColor:brand,fillOpacity:1}).addTo(map).bindTooltip('내 위치');const fit=()=>{if(handlers.keepCenter){map.setView([center.lat,center.lng],13);return;}if(profiles.length>1)map.fitBounds(profiles.map(p=>[p.latitude,p.longitude]),{padding:[85,85],maxZoom:14});else if(profiles.length===1)map.setView([profiles[0].latitude,profiles[0].longitude],14);};fit();observer=new ResizeObserver(()=>{if(!disposed){map.invalidateSize({pan:false});fit();}});observer.observe(canvas);handlers.ready(map);requestAnimationFrame(()=>{if(!disposed)map.invalidateSize();});
 }).catch(()=>{if(!disposed)handlers.failed();});
 return()=>{disposed=true;observer?.disconnect();map?.stop();map?.remove();canvas.remove();};
}
