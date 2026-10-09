import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=await readFile('public/location.js','utf8');
function fixture(positions){const saved=new Map();let calls=0;const c={window:{isSecureContext:true},Date,setTimeout,clearTimeout,sessionStorage:{setItem:(k,v)=>saved.set(k,v),getItem:k=>saved.get(k),removeItem:k=>saved.delete(k)},navigator:{permissions:{query:async()=>({state:'granted'})},geolocation:{getCurrentPosition(ok,error,options){assert.equal(options.enableHighAccuracy,true);assert.equal(options.maximumAge,0);const p=positions[calls++];if(p.error)error(p);else ok({coords:{latitude:37.49,longitude:127.05,accuracy:p.accuracy}});}}}};vm.runInNewContext(source,c);return {w:c.window,calls:()=>calls};}
test('coarse first fix retries and retains the better measurement',async()=>{const f=fixture([{accuracy:4000},{accuracy:25}]);let result;f.w.findBohumsoLocation({progress(){},success:r=>result=r,error:assert.fail});assert.equal(result.coords.accuracy,25);assert.equal(f.calls(),2);});
test('retry failure retains device uncertainty instead of replacing with IP',async()=>{const f=fixture([{accuracy:4000},{error:true,code:3}]);let result;f.w.findBohumsoLocation({progress(){},success:r=>result=r,error:assert.fail});assert.equal(result.coords.accuracy,4000);});
test('saved network and inaccurate fixes refresh; manual selection remains',async()=>{for(const value of [{source:'NETWORK',accuracy:null},{source:'DEVICE',accuracy:4000},{source:'MANUAL',accuracy:null}]){const f=fixture([]);f.w.BohumsoLocationStore.set({...value,latitude:37,longitude:127});let requests=0;await f.w.startBohumsoLocation(()=>requests++,()=>{});assert.equal(requests,value.source==='MANUAL'?0:1);}});
