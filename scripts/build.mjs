import {build} from 'esbuild';import {mkdir,readdir,readFile,writeFile} from 'node:fs/promises';
await mkdir('public/assets',{recursive:true});
await build({entryPoints:{account:'src/account.js',visit:'src/visit.js'},bundle:true,format:'esm',platform:'browser',target:['es2020'],outdir:'public/assets',minify:true});
await mkdir('artifacts/functions',{recursive:true});
const functions=(await readdir('netlify/functions')).filter(f=>/\.(mts|mjs)$/.test(f)).map(f=>'netlify/functions/'+f);
await build({entryPoints:functions,bundle:true,format:'esm',platform:'node',target:'node22',outdir:'artifacts/functions',packages:'external'});
const bundle=await readFile('public/assets/account.js','utf8');if(/(?:test_sk_|live_sk_)[A-Za-z0-9]{16,}|sb_secret_[A-Za-z0-9_-]{20,}/.test(bundle))throw Error('Server key pattern in browser bundle');
await writeFile('artifacts/build-report.json',JSON.stringify({builtAt:new Date().toISOString(),client:true,functions:functions.map(f=>f.split('/').pop()),deployed:false,livePayments:false},null,2));
console.log('Production client and server function builds passed. No deployment performed.');

