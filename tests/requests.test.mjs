import {test} from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {PGlite} from '@electric-sql/pglite';
test('Requests isolate roles, require consent, protect contact and prevent duplicate bookings',async()=>{
 const db=new PGlite();try{
 const [A,B,P,Q,ADMIN]=[1,2,3,4,5].map(n=>`${n}${String(n).repeat(7)}-${String(n).repeat(4)}-4${String(n).repeat(3)}-8${String(n).repeat(3)}-${String(n).repeat(12)}`);
 await db.exec("create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key,email_confirmed_at timestamptz);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;");
 for(const file of ['001_accounts.sql','002_requests.sql'])await db.exec(await readFile('supabase/'+file,'utf8'));
 for(const id of [A,B,P,Q,ADMIN])await db.query('insert into auth.users values($1,now())',[id]);
 await db.query('insert into private.admin_memberships values($1)',[ADMIN]);
 async function login(id){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated');}
 async function rpc(fn,args=[]){return (await db.query(`select * from public.${fn}(${args.map((_,i)=>'$'+(i+1)).join(',')})`,args)).rows;}
 const list=workspace=>rpc('list_service_requests',[workspace]);
 for(const id of [A,B,P,Q,ADMIN]){await login(id);await rpc('complete_membership',[true,true,true,false]);}
 for(const id of [P,Q]){await login(id);await rpc('apply_partner',['테스트 전문가','planner','테스트 회사','서울','TEST-123',true]);}
 await login(ADMIN);await rpc('review_partner',[P,'approved','확인 완료']);
 const slot=new Date(Math.ceil((Date.now()+86400000)/1800000)*1800000).toISOString();
 await login(A);const id=(await rpc('create_service_request',['consult','planner','서울',slot]))[0].create_service_request;
 await assert.rejects(()=>rpc('create_service_request',['visit','planner','서울',slot]));
 await assert.rejects(()=>rpc('create_service_request',['consult','planner','서울','2020-01-01T09:00:00Z']));
 await login(B);assert.equal((await list('customer')).length,0);
 await assert.rejects(()=>rpc('confirm_service_request',[id,P,'고객 이름','01012345678',true]));
 await assert.rejects(()=>list('admin'));await assert.rejects(()=>db.query('select * from private.request_contacts'));
 await login(P);assert.equal((await list('partner')).length,0);await assert.rejects(()=>rpc('assign_service_request',[id,P,'']));
 await login(ADMIN);await assert.rejects(()=>rpc('assign_service_request',[id,Q,'']));await rpc('assign_service_request',[id,P,'']);
 await login(P);assert.equal((await list('partner'))[0].contact_phone,null);
 await login(A);await assert.rejects(()=>rpc('confirm_service_request',[id,P,'고객 이름','01012345678',false]));
 await assert.rejects(()=>rpc('confirm_service_request',[id,Q,'고객 이름','01012345678',true]));
 await rpc('confirm_service_request',[id,P,'고객 이름','010-1234-5678',true]);
 await login(P);assert.equal((await list('partner'))[0].contact_phone,'01012345678');
 await assert.rejects(()=>rpc('change_service_request',[id,'completed']));
 await login(B);const second=(await rpc('create_service_request',['consult','planner','서울',slot]))[0].create_service_request;
 await login(ADMIN);await rpc('review_partner',[Q,'approved','확인 완료']);await rpc('assign_service_request',[second,Q,'']);await rpc('assign_service_request',[second,P,'']);
 await login(Q);assert.equal((await list('partner')).length,0);
 await login(B);await assert.rejects(()=>rpc('confirm_service_request',[second,P,'다른 고객','01099998888',true]),/one_partner_slot/);
 assert.equal((await list('customer'))[0].contact_phone,null);
 await login(ADMIN);await rpc('review_partner',[P,'suspended','활동 재검토']);
 await login(P);await assert.rejects(()=>list('partner'));await assert.rejects(()=>rpc('change_service_request',[id,'completed']));
 await login(A);await rpc('change_service_request',[id,'cancelled']);
 await login(ADMIN);await rpc('review_partner',[P,'approved','재검토 완료']);
 await login(P);assert.equal((await list('partner')).find(r=>r.id===id).contact_phone,null);
 await login(B);await rpc('confirm_service_request',[second,P,'다른 고객','01099998888',true]);
 await db.exec('reset role');await db.query("update private.service_requests set requested_at=now()-interval '1 hour' where id=$1",[second]);
 await login(P);await rpc('change_service_request',[second,'completed']);assert.equal((await list('partner')).find(r=>r.id===second).contact_phone,null);
 await login(B);assert.equal((await list('customer'))[0].status,'completed');
 await db.exec('reset role');await db.query("update public.partner_applications set profession='office' where user_id=$1",[Q]);
 await login(A);const visit=(await rpc('create_service_request',['visit','office','서울',slot]))[0].create_service_request;
 await login(ADMIN);await assert.rejects(()=>rpc('assign_service_request',[visit,Q,'']));await rpc('assign_service_request',[visit,Q,'서울 마포구 테스트로 10']);
 await login(A);assert.equal((await list('customer')).find(r=>r.id===visit).meeting_address,'서울 마포구 테스트로 10');await rpc('confirm_service_request',[visit,Q,'방문 고객','01012345678',true]);
 await login(Q);assert.equal((await list('partner')).find(r=>r.id===visit).status,'confirmed');
 await db.exec('reset role');assert.ok((await db.query('select * from private.request_audit')).rows.length>=8);
 await db.exec('set role anon');await assert.rejects(()=>list('customer'));await assert.rejects(()=>rpc('create_service_request',['consult','planner','서울',slot]));
 }finally{await db.close();}
});
