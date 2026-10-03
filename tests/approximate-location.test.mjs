import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../netlify/edge-functions/approximate-location.js';
test('coarse location omits IP/address and cannot be cached across visitors',async()=>{
 const res=handler(new Request('https://test/api/approximate-location'),{ip:'sensitive',geo:{latitude:37.51342,longitude:127.08431,country:{code:'KR'},postalCode:'12345'}});
 assert.deepEqual(await res.json(),{available:true,source:'network',latitude:37.51,longitude:127.08});
 assert.match(res.headers.get('cache-control'),/no-store/);
});
test('missing, foreign and invalid location never invent a domestic point',async()=>{
 for(const geo of [{},{country:{code:'US'},latitude:37,longitude:-122},{country:{code:'KR'},latitude:null,longitude:null}])assert.deepEqual(await handler(new Request('https://test/api/approximate-location'),{geo}).json(),{available:false});
});
