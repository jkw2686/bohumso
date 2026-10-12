import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const files=['062_expert_types_policy.sql','063_unified_expert_booking.sql','064_growth_summary.sql'];
let body='-- Development review only. No operational execution or feature activation.\nbegin;\n';
for(const name of files){let sql=await readFile('supabase/'+name,'utf8');sql=sql.replace(/^begin;\s*$/mi,'').replace(/^commit;\s*$/mi,'');body+='\n-- '+name+'\n'+sql;}
body+='\ncommit;\n';await mkdir('artifacts',{recursive:true});await writeFile('artifacts/expert-integration-candidate.sql',body);
console.log('Review SQL prepared in one transaction; tax and unified booking default OFF. SHA256 '+createHash('sha256').update(body).digest('hex'));
