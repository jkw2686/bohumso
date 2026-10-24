import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {PGlite} from '@electric-sql/pglite';
const uid=n=>'10000000-0000-4000-8000-'+String(n).padStart(12,'0');
async function fixture(){const db=new PGlite();await db.exec(`
 create role anon;create role authenticated;create schema auth;create schema private;
 create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create function private.is_active_member() returns boolean language sql stable as $$select auth.uid() is not null and auth.uid()<>'${uid(99)}'::uuid$$;
 create function private.is_admin() returns boolean language sql stable as $$select auth.uid()='${uid(1)}'::uuid$$;
 create table private.account_lifecycle(user_id uuid primary key,status text);
 create table private.ad_subscriptions(planner_id uuid,state text,ends_at timestamptz);
 create table private.service_areas(id text primary key,name text,region text);
 create table private.expert_service_areas(user_id uuid primary key,primary_area text,secondary_areas text[]);
 create table private.expert_profiles(user_id uuid primary key,profession text,status text,registration_status text,organization_status text,specialties text[],map_visible boolean);
 insert into private.service_areas values('서울 마포','마포구','서울'),('경기 분당','분당구','경기 성남시'),('경기 판교','판교','경기');
 `);for(let i=1;i<=30;i++)await db.query('insert into auth.users values($1)',[uid(i)]);
 const sql=await readFile('supabase/076_promotion_invites.sql','utf8');await db.exec(sql);await db.exec(sql);
 const login=async(n,role='authenticated')=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[n?uid(n):'']);await db.exec('set role '+role);};
 const rpc=async(op,payload={})=>(await db.query('select public.promotion_command($1,$2) result',[op,payload])).rows[0].result;
 const preview=async(token)=>(await db.query('select public.promotion_preview($1) result',[token])).rows[0].result;
 const create=async(capacity=1,days=30)=>{await login(1);return rpc('create',{free_days:days,capacity,deadline:new Date(Date.now()+86400000).toISOString()});};
 return {db,login,rpc,preview,create};}
test('promotion capacity, idempotent redemption, failed/paid/existing benefit do not consume; RLS and admin guards',async()=>{const f=await fixture();try{
 const p=await f.create(1);await f.login(2);await assert.rejects(f.rpc('create',{free_days:30,capacity:1,deadline:new Date(Date.now()+86400000).toISOString()}),/admin_required/);
 await assert.rejects(f.db.query('select * from private.promotion_redemptions'),/permission denied/);
 await f.login(99);await assert.rejects(f.rpc('redeem',{token:p.token}),/membership_required/);await f.login(2);
 const first=await f.rpc('redeem',{token:p.token});assert.equal(first.applied,true);assert.equal(new Date(first.ends_at)-new Date(first.started_at),30*86400000);
 const duplicate=await f.rpc('redeem',{token:p.token});assert.equal(duplicate.already_applied,true);assert.equal(duplicate.ends_at,first.ends_at);
 await f.login(3);await assert.rejects(f.rpc('redeem',{token:p.token}),/promotion_full/);assert.equal((await f.preview(p.token)).used,1);
 const q=await f.create(null);await f.login(2);await assert.rejects(f.rpc('redeem',{token:q.token}),/existing_free_benefit/);assert.equal((await f.preview(q.token)).used,0);assert.equal((await f.rpc('benefit')).ends_at,first.ends_at);
 await f.db.exec('reset role');await f.db.query("insert into private.ad_subscriptions values($1,'active',now()+interval '5 days')",[uid(3)]);await f.login(3);await assert.rejects(f.rpc('redeem',{token:q.token}),/paid_subscription_preserved/);assert.equal((await f.preview(q.token)).used,0);
 await f.login(1);await f.rpc('stop',{id:p.id});await f.login(2);assert.equal((await f.rpc('redeem',{token:p.token})).ends_at,first.ends_at);
 await f.login(4);await assert.rejects(f.rpc('redeem',{token:p.token}),/promotion_stopped/);
 const expired=await f.create(2);await f.db.exec('reset role');await f.db.query("update private.promotion_invites set deadline=now()-interval '1 second' where id=$1",[expired.id]);await f.login(4);await assert.rejects(f.rpc('redeem',{token:expired.token}),/promotion_closed/);assert.equal((await f.preview(expired.token)).used,0);
 await f.login(null,'anon');assert.equal((await f.preview(q.token)).capacity,null);await assert.rejects(f.rpc('list'),/permission denied/);
 await f.login(1);assert.equal((await f.rpc('members',{id:p.id})).length,1);
 // Queued contenders exercise one remaining capacity through the same server transaction boundary.
 const last=await f.create(1);const outcomes=await Promise.allSettled([f.rpc('redeem',{token:last.token}),f.rpc('redeem',{token:last.token})]);assert.equal(outcomes.filter(x=>x.status==='fulfilled').length,2);assert.equal((await f.preview(last.token)).used,1);
 const race=await f.create(1);await f.db.exec('reset role');const contenders=await Promise.allSettled([5,6].map(n=>f.db.transaction(async tx=>{await tx.exec('reset role');await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[uid(n)]);await tx.exec('set local role authenticated');return (await tx.query("select public.promotion_command('redeem',$1) result",[{token:race.token}])).rows[0].result;})));assert.equal(contenders.filter(r=>r.status==='fulfilled').length,1);assert.match(contenders.find(r=>r.status==='rejected').reason.message,/promotion_full/);assert.equal((await f.preview(race.token)).used,1);
 }finally{await f.db.close();}});
test('verified claim-help distinct planners, district memberships, toggle independence, one milestone only',async()=>{const f=await fixture();try{
 await f.db.exec('reset role');for(let i=2;i<=12;i++){
 await f.db.query("insert into private.expert_service_areas values($1,'서울 마포',array['서울 마포','경기 분당','경기 판교'])",[uid(i)]);
 await f.db.query("insert into private.expert_profiles values($1,'planner','APPROVED','VERIFIED','NOT_SUBMITTED',array['claim'],false)",[uid(i)]);}
 assert.equal((await f.db.query("select count(*) n from private.recruitment_milestones")).rows[0].n,2);
 const before=(await f.db.query('select * from private.recruitment_milestones order by area_id')).rows;
 await f.db.exec("update private.expert_profiles set map_visible=true;update private.expert_profiles set map_visible=false");
 assert.deepEqual((await f.db.query('select * from private.recruitment_milestones order by area_id')).rows,before);
 await f.db.query("update private.expert_profiles set profession='tax' where user_id=$1",[uid(12)]);await f.login(1);
 let result=(await f.db.query('select public.recruitment_regions() result')).rows[0].result;assert.ok(result.every(x=>x.participants===10&&x.reached_at));
 await f.db.exec('reset role');await f.db.query("update private.expert_profiles set registration_status='PENDING',status='VERIFICATION_PENDING' where user_id=$1",[uid(11)]);await f.login(1);
 result=(await f.db.query('select public.recruitment_regions() result')).rows[0].result;assert.ok(result.every(x=>x.participants===9));
 await f.rpc('regions_seen',{areas:['서울 마포','경기 분당']});result=(await f.db.query('select public.recruitment_regions() result')).rows[0].result;assert.ok(result.every(x=>x.seen_at));
 await f.db.exec('reset role');await f.db.query("insert into private.account_lifecycle values($1,'WITHDRAWN')",[uid(10)]);await f.login(1);result=(await f.db.query('select public.recruitment_regions() result')).rows[0].result;assert.ok(result.every(x=>x.participants===8));
 assert.equal((await f.rpc('list')).length,0);await f.login(2);await assert.rejects(f.db.query('select public.recruitment_regions()'),/admin_required/);
 }finally{await f.db.close();}});
