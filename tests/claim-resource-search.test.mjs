import test from 'node:test';
import assert from 'node:assert/strict';
import {resources,resourceTypes} from '../public/claim-resources-data.js';
import {matchesResourceQuery,inResourceCategory} from '../public/claim-resource-search.js';
const find=query=>resources.filter(r=>matchesResourceQuery(r,query,resourceTypes));
test('search accepts reordered words, school abbreviations, spaces and insurer aliases',()=>{
 for(const q of ['서울 삼성','삼성 서울','삼성서울'])assert.ok(find(q).some(r=>r.id==='smc'),q);
 assert.ok(find('분당 서울대').some(r=>r.id==='snubh'));
 assert.ok(find('서울대 분당').some(r=>r.id==='snubh'));
 assert.equal(find('부산 병원').length,5);
 assert.ok(find('강남구').some(r=>r.name==='강남세브란스병원'));
 assert.ok(find('캐롯').some(r=>r.name==='한화손해보험'));
 assert.ok(find('ｄｂ 손해').some(r=>r.id==='db'));
 assert.equal(find('없는기관123').length,0);assert.equal(find('   ').length,resources.length);
});
test('directory categories keep every existing entry and separate reference scope',()=>{
 assert.equal(resources.filter(r=>inResourceCategory(r,'all')).length,91);
 assert.equal(resources.filter(r=>inResourceCategory(r,'hospital')).length,47);
 assert.equal(resources.filter(r=>inResourceCategory(r,'insurer')).length,39);
 assert.equal(resources.filter(r=>inResourceCategory(r,'reference')).length,3);
 assert.equal(resources.filter(r=>inResourceCategory(r,'service')).length,3);
 assert.equal(resources.filter(r=>inResourceCategory(r,'life')).length,22);
 assert.equal(resources.filter(r=>inResourceCategory(r,'nonlife')).length,16);
 assert.equal(resources.filter(r=>inResourceCategory(r,'post')).length,1);
});
