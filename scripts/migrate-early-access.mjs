import pg from 'pg';import {earlyMigrationSQL} from './early-sql.mjs';
if(!process.env.DATABASE_URL){console.error('DATABASE_URL is not configured. No migration executed.');process.exit(1);}
const client=new pg.Client({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:true},connectionTimeoutMillis:15000});
try{await client.connect();await client.query(await earlyMigrationSQL());console.log('Early-access migration transaction committed; previously applied migrations skipped.');}
catch(e){await client.query('rollback').catch(()=>{});console.error('Migration rolled back:',e.code||e.name);process.exitCode=1;}finally{await client.end().catch(()=>{});}
