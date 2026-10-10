import {chromium,expect} from '@playwright/test';import {readFile} from 'node:fs/promises';import path from 'node:path';
const browser=await chromium.launch({channel:'msedge',headless:true});try{
 const page=await browser.newPage();page.setDefaultTimeout(10000);await page.route('**/*',async route=>{const u=new URL(route.request().url());if(u.origin!=='https://fixture.test')return route.abort();if(u.pathname==='/crop')return route.fulfill({contentType:'text/html',body:'<!doctype html><meta charset="utf-8"><div id="host"></div>'});try{return route.fulfill({body:await readFile(path.resolve('.'+u.pathname)),contentType:'text/javascript'});}catch{return route.fulfill({status:404,body:''});}});await page.goto('https://fixture.test/crop');
 const results=await page.evaluate(async()=>{
  const {prepareDocument}=await import('/src/expert-shared.js'),{createPhotoCrop,prepareProfilePhoto}=await import('/src/profile-photo-crop.js');
  const c=document.createElement('canvas');c.width=600;c.height=300;const ctx=c.getContext('2d');ctx.fillStyle='red';ctx.fillRect(0,0,300,300);ctx.fillStyle='blue';ctx.fillRect(300,0,300,300);
  const jpeg=new Uint8Array(await (await new Promise(r=>c.toBlob(r,'image/jpeg',.9))).arrayBuffer());
  const segment=new Uint8Array([255,225,0,34,69,120,105,102,0,0,73,73,42,0,8,0,0,0,1,0,18,1,3,0,1,0,0,0,6,0,0,0,0,0,0,0]);
  const rotated=new File([jpeg.slice(0,2),segment,jpeg.slice(2)],'camera.jpg',{type:'image/jpeg'}),ready=await prepareDocument(rotated),bitmap=await createImageBitmap(ready),dimensions=[bitmap.width,bitmap.height];bitmap.close();
  const control=await createPhotoCrop(rotated,document.getElementById('host'),{apply:()=>{},cancel:()=>{}}),canvas=document.querySelector('#host canvas'),pixel=(x,y)=>Array.from(canvas.getContext('2d').getImageData(x,y,1,1).data),top=pixel(192,30),bottom=pixel(192,350);control.dispose();
  const png=await new Promise(r=>c.toBlob(r,'image/png')),portrait=document.createElement('canvas');portrait.width=300;portrait.height=600;portrait.getContext('2d').drawImage(c,0,0,300,600);const pngTall=await new Promise(r=>portrait.toBlob(r,'image/png'));
  const sizes=[];for(const [name,blob]of [['wide.png',png],['tall.png',pngTall],['camera.jpg',rotated]]){const out=await prepareProfilePhoto(new File([blob],name,{type:blob.type})),b=await createImageBitmap(out);sizes.push([b.width,b.height,out.size]);b.close();}
  let invalid=false;try{await prepareProfilePhoto(new File(['bad'],'x.txt',{type:'text/plain'}));}catch{invalid=true;}
  return {dimensions,top,bottom,sizes,invalid};
 });
 expect(results.dimensions).toEqual([300,600]);expect(results.top[0]).toBeGreaterThan(200);expect(results.top[2]).toBeLessThan(40);expect(results.bottom[2]).toBeGreaterThan(200);expect(results.bottom[0]).toBeLessThan(40);for(const [w,h,size]of results.sizes){expect([w,h]).toEqual([192,192]);expect(size).toBeLessThanOrEqual(131072);}expect(results.invalid).toBe(true);console.log('PASS camera EXIF orientation, portrait/landscape square output, 192px/128KB, unsupported type validation. No network calls.');
}finally{await browser.close();}
