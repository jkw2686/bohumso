import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {setupUrgent} from './urgent-fixture.mjs';
import {earlyMigrationSQL} from '../scripts/early-sql.mjs';
async function baseline(){const f=await setupUrgent(false);await f.db.exec('reset role');for(const name of ['026_release_controls.sql','027_private_rls.sql'])await f.db.exec(await readFile('supabase/'+name,'utf8'));await f.db.exec("create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid default gen_random_uuid(),bucket_id text);alter table storage.objects enable row level security;grant usage on schema storage to anon,authenticated;grant all on storage.objects to anon,authenticated;create policy legacy_broad on storage.objects for all to anon,authenticated using(true) with check(true);");return f;}
test('exact operational migration is atomic, rerunnable, and blocks direct private storage even under broad policies',async()=>{const f=await baseline();try{
 const sql=await earlyMigrationSQL();await f.db.exec(sql);await f.db.exec(sql);
 assert.equal((await f.db.query('select count(*)::int n from private.schema_migrations')).rows[0].n,8);
 assert.equal((await f.db.query("select public from storage.buckets where id='expert-documents'")).rows[0].public,false);
 await f.db.exec("insert into storage.objects(bucket_id) values('expert-documents'),('other')");
 for(const role of ['anon','authenticated']){await f.login(null,role);assert.deepEqual((await f.db.query('select bucket_id from storage.objects')).rows.map(x=>x.bucket_id),['other']);await assert.rejects(f.db.exec("insert into storage.objects(bucket_id) values('expert-documents')"),/row-level security/);}
 }finally{await f.db.close();}});
test('failure before commit rolls back all seven migrations and ledger entries',async()=>{const f=await baseline();try{
 const sql=(await earlyMigrationSQL()).replace(/commit;\s*$/, "select 1/0;commit;");await assert.rejects(f.db.exec(sql),/division by zero/);await f.db.exec('rollback');
 assert.equal((await f.db.query("select to_regclass('private.service_features') t")).rows[0].t,null);
 assert.equal((await f.db.query("select to_regclass('private.schema_migrations') t")).rows[0].t,null);
 assert.equal((await f.db.query("select count(*)::int n from storage.buckets")).rows[0].n,0);
 }finally{await f.db.close();}});
