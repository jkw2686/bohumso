import {readFile,writeFile} from 'node:fs/promises';
const data=JSON.parse(await readFile('shared/professions.json','utf8'));
const quote=s=>"'"+s.replaceAll("'","''")+"'";
const sql='-- PROFESSION_CATALOG_START\ninsert into private.profession_definitions(id,definition,version) values\n'+Object.entries(data.professions).map(([id,d])=>' ('+[quote(id),quote(JSON.stringify(d))+'::jsonb',quote(data.version)].join(',')+')').join(',\n')+'\non conflict(id) do update set definition=excluded.definition,version=excluded.version;\n-- PROFESSION_CATALOG_END';
const path='supabase/066_profession_registration.sql',source=await readFile(path,'utf8');
const target=source.replace(/-- PROFESSION_CATALOG_START[\s\S]*?-- PROFESSION_CATALOG_END|-- PROFESSION_CATALOG\b/,sql);
if(process.argv.includes('--check')){if(source!==target)throw Error('Profession catalog is out of date. Run node scripts/profession-catalog.mjs');}
else await writeFile(path,target);
