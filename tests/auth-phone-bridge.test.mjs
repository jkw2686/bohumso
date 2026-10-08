import test from 'node:test';import assert from 'node:assert/strict';import {PGlite} from '@electric-sql/pglite';import {readFile} from 'node:fs/promises';
test('Auth OTP bridge requires confirmed phone; preserves reverify and account blocks; rollback',async()=>{
 const db=new PGlite();try{
 await db.exec(`create schema private;create schema auth;create role anon;create role authenticated;create table auth.users(id uuid primary key,phone text,phone_confirmed_at timestamptz);create table private.phone_contacts(user_id uuid primary key,phone_e164 text,phone_verification_status text,phone_verified_at timestamptz);create table private.account_lifecycle(user_id uuid,status text);insert into auth.users values('00000000-0000-4000-8000-000000000001','821000000000',null);`);
 const sql=await readFile('supabase/043_auth_phone_status_bridge.sql','utf8');await db.exec(sql);await db.exec(sql);
 const value=async()=>(await db.query("select private.verified_contact('00000000-0000-4000-8000-000000000001') as phone")).rows[0].phone;
 assert.equal(await value(),null);await db.exec('update auth.users set phone_confirmed_at=now()');assert.equal(await value(),'+821000000000');
 await db.exec("insert into private.phone_contacts select id,'+821000000001','REVERIFY_REQUIRED',now() from auth.users");assert.equal(await value(),null);
 await db.exec("update private.phone_contacts set phone_verification_status='OTP_VERIFIED'");assert.equal(await value(),'+821000000001');
 await db.exec("insert into private.account_lifecycle select id,'DELETED' from auth.users");assert.equal(await value(),null);
 assert.equal((await db.query("select has_function_privilege('authenticated','private.verified_contact(uuid)','execute') as allowed")).rows[0].allowed,false);
 await db.exec('delete from private.account_lifecycle;delete from private.phone_contacts;');await db.exec(await readFile('supabase/rollback_auth_phone_status_bridge.sql','utf8'));assert.equal(await value(),null);
 }finally{await db.close();}
});
