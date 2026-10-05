import {build} from 'esbuild';import {mkdir,readdir,readFile,writeFile} from 'node:fs/promises';
await mkdir('public/assets',{recursive:true});
await build({entryPoints:{rights:'src/member-rights.js',account:'src/account.js',visit:'src/visit.js',member:'src/member-entry.js',urgent:'src/urgent.js'},bundle:true,format:'esm',platform:'browser',target:['es2020'],outdir:'public/assets',minify:true});
await build({entryPoints:['src/test-flow/ui.js'],bundle:true,format:'esm',platform:'browser',target:['es2022'],outfile:'artifacts/test-flow.js',minify:true});
await mkdir('artifacts/deploy-functions',{recursive:true});
const functions=(await readdir('netlify/functions')).filter(f=>/\.(mts|mjs)$/.test(f)).map(f=>'netlify/functions/'+f);
// Prebundle third-party code so deployment never packages the developer's node_modules junction.
await build({entryPoints:functions,bundle:true,format:'esm',platform:'node',target:'node22',outdir:'artifacts/deploy-functions',outExtension:{'.js':'.mjs'}});
for(const source of functions){const name=source.split('/').pop().replace(/\.(mts|mjs)$/,'.mjs');const module=await import(new URL('../artifacts/deploy-functions/'+name,import.meta.url));if(typeof module.default!=='function')throw Error('Missing function handler: '+name);}
const bundle=await readFile('public/assets/account.js','utf8');if(/(?:test_g?sk_|live_g?sk_)[A-Za-z0-9]{16,}|sb_secret_[A-Za-z0-9_-]{20,}/.test(bundle))throw Error('Server key pattern in browser bundle');
await writeFile('artifacts/build-report.json',JSON.stringify({builtAt:new Date().toISOString(),client:true,functions:functions.map(f=>f.split('/').pop()),deployed:false,livePayments:false},null,2));
console.log('Production client and server function builds passed. No deployment performed.');

