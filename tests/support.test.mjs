import assert from 'node:assert/strict';
import {openTestDatabase,ACTORS as A} from '../src/test-flow/database.mjs';
import {matchFAQ,classifySituation} from '../src/test-flow/support-rules.mjs';
const db=await openTestDatabase({memory:true,env:{}});try{
const c=(op,p)=>db.command(A.customer,op,p),a=(op,p)=>db.command(A.admin,op,p);
const faq=await c('support_faq');assert.equal(faq.length,6);assert.equal(matchFAQ('비용 얼마인가요',faq).action,'none');assert.equal(classifySituation('청구 거절'),'denial');assert.equal(classifySituation('암호'),null);
await assert.rejects(c('support_admin'),/admin_required/);await assert.rejects(c('support_faq_save',{}),/admin_required/);
const payload={question:'가상 예약 문의입니다',consent:true,request_key:crypto.randomUUID()};const q=await c('support_submit',payload);assert.equal((await c('support_submit',payload)).id,q.id);assert.equal((await db.command(A.expert,'support_mine')).length,0);
await assert.rejects(c('support_reply',{id:q.id,revision:1,answer:'불가'}),/admin_required/);
await a('support_reply',{id:q.id,revision:1,answer:'가상 답변입니다'});assert.equal((await c('support_mine'))[0].answer,'가상 답변입니다');await assert.rejects(a('support_reply',{id:q.id,revision:1,answer:'중복'}),/stale_revision/);
let f=await a('support_faq_save',{question:'테스트 질문',answer:'테스트 안내',keywords:['테스트'],action:'map'});f=await a('support_faq_save',{...f,answer:'수정 안내'});assert.equal(f.revision,2);await a('support_faq_delete',{id:f.id,revision:2});assert.equal((await c('support_faq')).length,6);console.log('PASS: rules, privacy, admin authorization, idempotency, replies, stale revision, FAQ CRUD');
}finally{await db.close();}
