import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFile} from 'node:fs/promises';
test('tab location retains provenance, expires, rejects corrupt coordinates, and restores without requesting GPS',async()=>{
 const data=new Map(),sessionStorage={setItem:(k,v)=>data.set(k,v),getItem:k=>data.get(k)||null,removeItem:k=>data.delete(k)};
 let now=100000;const context={window:{},sessionStorage,Date:{now:()=>now},navigator:{permissions:{query:async()=>({state:'prompt'})}}};vm.runInNewContext(await readFile('public/location.js','utf8'),context);
 const store=context.window.BohumsoLocationStore;store.set({source:'DEVICE',latitude:37.8,longitude:127.5,accuracy:20});let restored;await context.window.startBohumsoLocation(()=>assert.fail('unexpected GPS prompt'),x=>restored=x);assert.equal(restored.source,'DEVICE');assert.equal(restored.state,'SAVED');
 store.set({source:'MANUAL',latitude:37,longitude:127,label:'직접 선택'});assert.equal(store.get().source,'MANUAL');store.set({source:'DEVICE',latitude:999,longitude:127});assert.equal(store.get().source,'MANUAL');
 now+=900001;assert.equal(store.get(),null);data.set('bohumso-location-v1','bad json');assert.equal(store.get(),null);
});
