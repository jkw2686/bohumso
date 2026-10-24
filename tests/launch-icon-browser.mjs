import {chromium,expect} from '@playwright/test';
import {readFile,writeFile} from 'node:fs/promises';
import launch from './playwright-launch.cjs';
const browser=await chromium.launch(launch),page=await browser.newPage(),report=[];
try{
for(const file of ['app-icon-1024.png','app-icon-maskable-512.png']){
 const data=(await readFile('public/brand/'+file)).toString('base64');
 const result=await page.evaluate(async data=>{
  const im=new Image();im.src='data:image/png;base64,'+data;await im.decode();const c=document.createElement('canvas');c.width=im.width;c.height=im.height;const ctx=c.getContext('2d');ctx.drawImage(im,0,0);const p=ctx.getImageData(0,0,c.width,c.height).data;let minX=c.width,maxX=0,minY=c.height,maxY=0,radius=0;
  for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++){const i=(y*c.width+x)*4;if(p[i+3]>128&&Math.min(p[i],p[i+1],p[i+2])<220){minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);radius=Math.max(radius,Math.hypot(x-c.width/2,y-c.height/2));}}
  return {size:c.width,visibleRatio:(maxX-minX+1)/c.width,minX,minY,maxX,maxY,radiusRatio:radius/c.width};
 },data);
 expect(result.minX).toBeGreaterThan(0);expect(result.minY).toBeGreaterThan(0);
 if(file.includes('maskable')){expect(result.visibleRatio).toBeGreaterThan(.74);expect(result.radiusRatio).toBeLessThanOrEqual(.4);}else expect(result.visibleRatio).toBeGreaterThan(.88);
 report.push({file,...result});
}
await writeFile('artifacts/launch-icon-report.json',JSON.stringify({report,physicalPhoneVerified:false,osSpacingControlled:false},null,2));
console.log('PASS high-resolution icon bounds, enlarged visible symbol, maskable circular safe zone');
}finally{await browser.close();}
