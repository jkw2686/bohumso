import pg from 'pg';import {readFile} from 'node:fs/promises';
const names=['030_public_early_access.sql','031_expert_early_access.sql','032_expert_verification.sql','033_reservation_integrity.sql','034_organization_roster.sql','035_operational_metrics.sql','036_member_rights_admin.sql'];
if(!process.env.DATABASE_URL){console.error('DATABASE_URL is not configured. No migration executed.');process.exit(1);}
const client=new pg.Client({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:true},connectionTimeoutMillis:15000});
try{await client.connect();await client.query('begin');await client.query("select pg_advisory_xact_lock(hashtextextended('bohumso-early-migration',1))");
 const baseline=await client.query("select to_regclass('private.release_controls') is not null and to_regclass('private.service_areas') is not null and to_regclass('private.office_locations') is not null ok");if(!baseline.rows[0].ok)throw Error('production_027_baseline_required');
 await client.query('create table if not exists private.schema_migrations(name text primary key,applied_at timestamptz not null default now());alter table private.schema_migrations enable row level security;revoke all on private.schema_migrations from public,anon,authenticated;');
 const applied=new Set((await client.query('select name from private.schema_migrations')).rows.map(r=>r.name));
 for(const name of names){if(applied.has(name))continue;const sql=(await readFile('supabase/'+name,'utf8')).replace(/^begin;\s*/m,'').replace(/commit;\s*$/,'');await client.query(sql);await client.query('insert into private.schema_migrations(name) values($1)',[name]);console.log('Applied',name);}
 await client.query((await readFile('supabase/expert_storage_setup.sql','utf8')).replace(/^begin;\s*/m,'').replace(/commit;\s*$/,''));await client.query('commit');console.log('Early-access migrations committed. Policy, SMS, payment and document flags were not enabled.');
}catch(e){await client.query('rollback').catch(()=>{});console.error('Migration rolled back:',e.code||e.name);process.exitCode=1;}finally{await client.end().catch(()=>{});}
