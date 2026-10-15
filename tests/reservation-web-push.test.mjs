import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {setupCare,ids} from './appointment-care-fixture.mjs';
test('web push defaults, explicit OFF, role isolation, device rebind, queue dedupe and no old replay',async()=>{const f=await setupCare();try{
 const sql=await readFile('supabase/067_reservation_web_push.sql','utf8');await f.db.exec(sql);await f.db.exec(sql);
 const prefs=(op='get',payload={})=>f.rpc('reservation_notification_settings',[op,payload]);
 await f.login(ids.customer);assert.equal((await prefs()).enabled,true);await prefs('set',{enabled:false});
 await f.db.exec('reset role');await f.db.exec(sql);await f.login(ids.customer);assert.equal((await prefs()).enabled,false);await prefs('set',{enabled:true});
 await assert.rejects(f.rpc('reservation_web_push_service',[ids.customer,'claim',{}]),/permission denied/);
 const device=crypto.randomUUID(),cap='a'.repeat(64),binding=crypto.randomUUID();const payload={device_id:device,device_hash:cap,binding,subscription:{endpoint:'https://fcm.googleapis.com/fcm/send/fixture',keys:{auth:'A'.repeat(22),p256dh:'B'.repeat(87)}}};
 const svc=async(subject,op,p={})=>{await f.login(null,'service_role');return f.rpc('reservation_web_push_service',[subject,op,p]);};
 const insert=async(id,recipient,old=false)=>{await f.db.exec('reset role');await f.db.query("insert into private.notifications(id,recipient_user_id,notification_type,title,body,consultation_id,deep_link,dedupe_key,created_at) values($1::uuid,$2::uuid,'RESERVATION_REQUESTED','예약 알림','확인',null,'/notifications.html',($1::uuid)::text,now()-case when $3 then interval '1 day' else interval '0' end)",[id,recipient,old]);};
 await insert(crypto.randomUUID(),ids.customer,true);await svc(ids.customer,'register',payload);assert.equal((await svc(null,'claim')).length,0);
 const n1=crypto.randomUUID();await insert(n1,ids.customer);const jobs=await svc(null,'claim');assert.equal(jobs.length,1);assert.equal((await svc(null,'claim')).length,0);
 const args=jobs[0];assert.equal((await svc(null,'authorize',args)).binding,binding);await svc(null,'finish',{...args,state:'SENT'});assert.equal((await svc(null,'claim')).length,0);
 const n2=crypto.randomUUID();await insert(n2,ids.customer);const [pending]=await svc(null,'claim');
 await f.login(ids.customer);await prefs('set',{enabled:false});assert.equal(await svc(null,'authorize',pending),null);
 await f.db.exec('reset role');assert.equal((await f.db.query('select count(*)::int n from private.notifications where id=$1',[n2])).rows[0].n,1);
 await f.login(ids.customer);await prefs('set',{enabled:true});await svc(ids.customer,'register',{...payload,binding:crypto.randomUUID()});
 const binding2=crypto.randomUUID();await svc(ids.other,'register',{...payload,binding:binding2});assert.equal((await svc(ids.customer,'status',payload)).active,false);assert.equal((await svc(ids.other,'status',payload)).binding,binding2);
 await assert.rejects(svc(ids.customer,'register',{...payload,device_hash:'b'.repeat(64)}),/device_conflict/);
 const key=crypto.randomUUID(),first=await svc(ids.other,'test',{...payload,request_key:key}),again=await svc(ids.other,'test',{...payload,request_key:key});assert.equal(first.notificationId,again.notificationId);
 await assert.rejects(svc(ids.other,'test',{...payload,request_key:crypto.randomUUID()}),/test_rate_limit/);
 const testJobs=await svc(null,'claim');assert.equal(testJobs.length,1);const testData=await svc(null,'authorize',testJobs[0]);assert.equal(testData.type,'RESERVATION_PUSH_TEST');
 await f.db.exec('reset role');assert.equal((await f.db.query('select count(*)::int n from private.web_push_deliveries where notification_id=$1',[first.notificationId])).rows[0].n,1);

 await f.login(ids.other);assert.equal((await prefs()).enabled,true);await assert.rejects(f.db.query('select * from private.web_push_subscriptions'),/permission denied/);await f.login(null,'anon');await assert.rejects(prefs(),/permission denied/);
 console.log('PASS SQL is additive and repeatable, no default subscriptions or historical replay; explicit OFF and recipient/device isolation preserved');
}finally{await f.db.close();}});
