import {readFile} from 'node:fs/promises';
import {setupVisits} from './expert-visits-fixture.mjs';
export async function setupContact(){const f=await setupVisits();await f.db.exec('reset role');for(const name of ['049_contact_first.sql','050_consultation_notifications.sql']){const sql=await readFile('supabase/'+name,'utf8');await f.db.exec(sql);await f.db.exec(sql);}return f;}
