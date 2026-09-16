import {spawnSync} from 'node:child_process';import {readdir,mkdir,writeFile} from 'node:fs/promises';
const started=new Date().toISOString(),checks=[];
const suites=(await readdir('tests')).filter(f=>f.endsWith('.test.mjs')).sort().map(f=>'tests/'+f);
const commands=[['Production build',['scripts/build.mjs']],['Database and gateway tests',['--test','--test-concurrency=1',...suites]],['Signup regression',['tests/browser-smoke.cjs']],['Mobile/desktop end-to-end',['tests/commerce-browser.cjs']]];
for(const [name,args]of commands){const result=spawnSync(process.execPath,args,{stdio:'inherit',shell:false});checks.push({name,exitCode:result.status});if(result.status!==0){await mkdir('artifacts',{recursive:true});await writeFile('artifacts/verification-report.json',JSON.stringify({started,finished:new Date().toISOString(),passed:false,checks,deployed:false,realPayment:false},null,2));process.exit(result.status||1);}}
await writeFile('artifacts/verification-report.json',JSON.stringify({started,finished:new Date().toISOString(),passed:true,checks,database:'PGlite PostgreSQL-compatible',authentication:'simulated',paymentGateway:'simulated',deployed:false,realPayment:false,externalTestMerchantVerified:false},null,2));
console.log('All local verification passed. External test merchant and live Supabase remain unverified.');
