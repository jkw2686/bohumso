import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import handler from '../netlify/functions/expert-photo.mjs';import {validateThumbnail,storedPhotoPath} from '../netlify/functions/_shared/profile-photo.mjs';
test('profile photograph authenticates writes, checks public visibility and restricts image sizes',async()=>{
 const subject='40000000-0000-4000-8000-000000000052',version='00000000-0000-4000-8000-000000000052',url='https://bohumso.netlify.app/api/expert-photo?id='+subject+'&v='+version;
 const env={APP_ORIGIN:'https://bohumso.netlify.app',SUPABASE_URL:'https://fixture.test',SUPABASE_SERVICE_ROLE_KEY:'fixture-only'};globalThis.Netlify={env:{get:k=>env[k]}};
 const original=globalThis.fetch;let photoURL=url,visible=true,writes=0,gets=0,cleans=0;
 globalThis.fetch=async(input,init={})=>{const u=String(input);if(u.includes('/auth/v1/user'))return Response.json({id:subject});if(u.includes('/rpc/planner_catalog'))return Response.json({planners:visible?[{id:subject,photo_url:photoURL}]:[]});if(u.includes('/rpc/expert_photo_service')){const body=JSON.parse(init.body);assert.equal(body.subject,subject);const previous_url=photoURL;if(body.operation==='save')photoURL='https://bohumso.netlify.app/api/expert-photo?id='+subject+'&v='+body.payload.version;if(body.operation==='clear')photoURL='';return Response.json({photo_url:photoURL,previous_url});}if(u.includes('/storage/v1/object/')){if(init.method==='POST'){writes++;return Response.json({Key:'stored'});}if(init.method==='DELETE'){cleans++;return Response.json([]);}gets++;return new Response('photo',{headers:{'Content-Type':'image/jpeg'}});}throw Error('Unexpected fixture request');};
 const req=(method,body,auth=true,origin=env.APP_ORIGIN)=>new Request(url,{method,headers:{Origin:origin,...auth?{Authorization:'Bearer fixture'}:{},...body?{'Content-Type':'image/jpeg'}:{}},body});
 try{
  assert.equal((await handler(req('POST',new Uint8Array(2),false))).status,401);assert.equal((await handler(req('POST',new Uint8Array(2),true,'https://other.test'))).status,403);assert.equal((await handler(req('POST',new Uint8Array(2)))).status,400);assert.equal(writes,0);
  const bytes=await readFile('tests/fixtures/profile-thumbnail.jpg');assert.doesNotThrow(()=>validateThumbnail(bytes));assert.equal((await handler(req('POST',bytes))).status,200);assert.equal(writes,1);assert.equal(cleans,1);
  const r=await handler(new Request(photoURL));assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'no-store');assert.equal(r.headers.get('content-type'),'image/jpeg');visible=false;const before=gets;assert.equal((await handler(new Request(photoURL))).status,404);assert.equal(gets,before);
  assert.equal((await handler(new Request(photoURL,{headers:{Authorization:'Bearer fixture'}}))).status,200);
  assert.equal((await handler(req('DELETE'))).status,200);assert.equal((await handler(new Request(url))).status,404);
  assert.equal(storedPhotoPath('https://other.test/file',subject),null);assert.throws(()=>validateThumbnail(new Uint8Array(131073)),/invalid_photo/);const exif=Buffer.from(bytes);exif[3]=225;assert.throws(()=>validateThumbnail(exif),/invalid_photo/);
 }finally{globalThis.fetch=original;delete globalThis.Netlify;}
});
