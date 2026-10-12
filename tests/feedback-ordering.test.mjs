import test from 'node:test';
import assert from 'node:assert/strict';
import {sortedProfiles} from '../src/consultation-ui.js';
test('new profile feedback never affects previous directory ordering or equal-score specialty ties',()=>{
 const old=[{id:'a',name:'A',rating:3,specialties:['claim']},{id:'b',name:'B',rating:5,specialties:['other']},{id:'c',name:'C',rating:5,specialties:['claim']}];
 const updated=old.map(p=>({...p,rating:null,legacy_rating_order:p.rating===5?1:2,feedback_summary:{average:p.id==='a'?5:1,count:20}}));
 assert.deepEqual(sortedProfiles(updated,null,'claim').map(p=>p.id),sortedProfiles(old,null,'claim').map(p=>p.id));
 assert.deepEqual(sortedProfiles(updated,null,'claim').map(p=>p.id),['c','b','a']);
});
