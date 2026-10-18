import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {setupProfessions,ids} from './profession-fixture.mjs';
import {requestParams,requestIdentity} from '../src/request-intent.js';
test('booking return preserves help, profession, expert and time without contact data',()=>{
 for(const help of ['claim','tax']){const p=requestParams(`help=${help}&profession=${help==='tax'?'tax':'planner'}&planner=fixture&date=2030-01-15&time=14:00&phone=private`);assert.equal(p.get('help'),help);assert.equal(p.get('planner'),'fixture');assert.equal(p.get('time'),'14:00');assert.equal(p.has('phone'),false);}
 assert.notEqual(requestIdentity({help_intent:'tax'}),requestIdentity({help_intent:'claim'}));
});
test('help guard rejects cross-profession and office tax requests, preserving legacy contract',async()=>{
 const f=await setupProfessions();try{
 await f.db.exec('reset role');const sql=await readFile('supabase/071_help_intent.sql','utf8');await f.db.exec(sql);await f.db.exec(sql);
 await f.db.query("update private.expert_profiles set profession='planner' where user_id=$1",[ids.planner]);
 await f.db.query("update public.partner_applications set profession='planner' where user_id=$1",[ids.planner]);
 const check=payload=>f.db.query('select private.check_help_intent($1::jsonb)',[JSON.stringify(payload)]);
 await check({});await check({help_intent:'claim',planner_id:ids.planner,purpose:'claim'});
 await assert.rejects(check({help_intent:'tax',planner_id:ids.planner,purpose:'other'}),/help_profession_mismatch/);
 await assert.rejects(check({help_intent:'tax',office_id:ids.planner,purpose:'other'}),/help_profession_mismatch/);
 await assert.rejects(check({help_intent:'tax',office_assignment:true,purpose:'other'}),/help_profession_mismatch/);
 await assert.rejects(check({help_intent:'claim',planner_id:ids.planner,purpose:'other'}),/help_purpose_mismatch/);
 await f.db.query("update private.expert_profiles set profession='tax' where user_id=$1",[ids.planner]);await f.db.query("update public.partner_applications set profession='tax' where user_id=$1",[ids.planner]);
 await check({help_intent:'tax',planner_id:ids.planner,purpose:'other'});
 const before=(await f.db.query('select count(*) n from private.consultations')).rows[0].n;
 await f.login(ids.customer);await assert.rejects(f.cmd('request',{help_intent:'claim',planner_id:ids.planner,purpose:'claim'}),/help_profession_mismatch/);
 await f.db.exec('reset role');assert.equal((await f.db.query('select count(*) n from private.consultations')).rows[0].n,before);
 }finally{await f.db.close();}
});
