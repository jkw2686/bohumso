import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
export async function releaseSQL({includeFirstDraft=false}={}){
const names=['057_support_conversations.sql','060_support_chat.sql','061_expert_growth.sql'];
let sql="begin;\nselect pg_advisory_xact_lock(610063);\ndo $baseline$ begin\nif to_regclass('private.member_rights_requests') is null or to_regprocedure('private.is_owner()') is null or to_regclass('private.expert_profiles') is null then raise exception 'support_growth_baseline_required';end if;\nend $baseline$;\n";
for(const name of names){const raw=await readFile('supabase/'+name,'utf8');sql+='\n-- '+name+'\n'+raw.replace(/^begin;\s*/m,'').replace(/commit;\s*$/,'');}
if(includeFirstDraft){const first=JSON.parse(await readFile('data/growth-first-draft.json','utf8')),body=JSON.stringify(first.content);if(!/^[a-z0-9-]+$/.test(first.source_key)||body.includes('$first_draft$'))throw Error('unsafe_seed');sql+=`\ninsert into private.growth_contents(source_key,draft) values('${first.source_key}',$first_draft$${body}$first_draft$::jsonb) on conflict(source_key) do nothing;\n`;}
return sql+'\ncommit;\n';
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){await mkdir('artifacts',{recursive:true});await writeFile('artifacts/support-growth-release.sql',await releaseSQL({includeFirstDraft:process.argv.includes('--seed-review')}));
console.log('Prepared atomic release SQL. No database connection or deployment.');
}
