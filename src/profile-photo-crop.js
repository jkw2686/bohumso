import {prepareDocument} from './expert-shared.js';
import {el} from './consultation-ui.js';

async function bitmapFor(file){
 if(!['image/jpeg','image/png'].includes(file.type))throw Error('JPG 또는 PNG 사진을 선택해 주세요.');
 return createImageBitmap(await prepareDocument(file));
}
async function thumbnail(canvas){
 const small=document.createElement('canvas');small.width=small.height=192;
 small.getContext('2d').drawImage(canvas,0,0,192,192);
 const blob=await new Promise(resolve=>small.toBlob(resolve,'image/jpeg',.82));
 if(!blob||blob.size>131072)throw Error('사진을 줄이지 못했습니다. 다른 사진을 선택해 주세요.');
 return blob;
}
export async function prepareProfilePhoto(file){
 const bitmap=await bitmapFor(file);
 try{const c=document.createElement('canvas');c.width=c.height=192;const side=Math.min(bitmap.width,bitmap.height);c.getContext('2d').drawImage(bitmap,(bitmap.width-side)/2,(bitmap.height-side)/2,side,side,0,0,192,192);return await thumbnail(c);}finally{bitmap.close();}
}
export async function createPhotoCrop(file,parent,{apply,cancel}){
 const bitmap=await bitmapFor(file),root=el('section',undefined,parent);root.className='profile-photo-crop';
 root.setAttribute('aria-label','프로필 사진 위치·크기 조절');
 const title=el('h3','얼굴이 가운데 오도록 조절하세요',root);
 el('p','사진을 끌거나 아래 조절 막대를 사용하세요.',root);
 const canvas=el('canvas',undefined,root);canvas.width=canvas.height=384;canvas.setAttribute('aria-label','사진 자르기 미리보기');
 const controls=el('div',undefined,root),actions=el('div',undefined,root);actions.className='profile-editor-actions';
 let rotation=0,disposed=false,busy=false,drag=null;
 function slider(label,min,max,value){const wrap=el('label',label,controls),i=el('input',undefined,wrap);i.type='range';i.min=min;i.max=max;i.step='.01';i.value=value;i.oninput=draw;return i;}
 const zoom=slider('사진 확대',1,3,1),x=slider('사진 가로 위치',0,1,.5),y=slider('사진 세로 위치',0,1,.5);
 function dimensions(){return rotation%2?[bitmap.height,bitmap.width]:[bitmap.width,bitmap.height];}
 function geometry(){const [w,h]=dimensions(),scale=384/Math.min(w,h)*Number(zoom.value);return {w,h,scale,dx:(384-w*scale)*Number(x.value),dy:(384-h*scale)*Number(y.value)};}
 function draw(){if(disposed)return;const {w,h,scale,dx,dy}=geometry(),ctx=canvas.getContext('2d');ctx.clearRect(0,0,384,384);ctx.save();ctx.translate(dx+w*scale/2,dy+h*scale/2);ctx.scale(scale,scale);ctx.rotate(rotation*Math.PI/2);ctx.drawImage(bitmap,-bitmap.width/2,-bitmap.height/2);ctx.restore();}
 const rotate=el('button','90° 회전',actions);rotate.type='button';rotate.className='btn ghost';rotate.onclick=()=>{rotation=(rotation+1)%4;draw();};
 const back=el('button','사진 조절 취소',actions);back.type='button';back.className='btn ghost';back.onclick=cancel;
 const use=el('button','이 사진 사용',root);use.type='button';use.className='btn';
 use.onclick=async()=>{if(busy)return;busy=true;use.disabled=true;try{await apply(await thumbnail(canvas));}catch(e){title.textContent=e.message;}finally{busy=false;use.disabled=false;}};
 canvas.addEventListener('pointerdown',e=>{if(busy)return;drag={id:e.pointerId,x:e.clientX,y:e.clientY,px:Number(x.value),py:Number(y.value)};canvas.setPointerCapture(e.pointerId);});
 canvas.addEventListener('pointermove',e=>{if(!drag||drag.id!==e.pointerId)return;const g=geometry(),ratio=384/canvas.getBoundingClientRect().width;const clamp=v=>Math.max(0,Math.min(1,v));if(g.w*g.scale>384)x.value=clamp(drag.px-(e.clientX-drag.x)*ratio/(g.w*g.scale-384));if(g.h*g.scale>384)y.value=clamp(drag.py-(e.clientY-drag.y)*ratio/(g.h*g.scale-384));draw();});
 ['pointerup','pointercancel','lostpointercapture'].forEach(type=>canvas.addEventListener(type,()=>drag=null));
 draw();root.scrollIntoView({block:'nearest'});zoom.focus({preventScroll:true});
 return {dispose(){disposed=true;bitmap.close();root.remove();}};
}
