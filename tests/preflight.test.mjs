import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
const base={...process.env,SUPABASE_URL:'https://example.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fixture',SUPABASE_SERVICE_ROLE_KEY:'',OPERATOR_NAME:'fixture',PRIVACY_CONTACT:'test@example.test',APP_ORIGIN:'https://example.test',PAYMENTS_ENABLED:'false',EXPERT_DOCUMENTS_ENABLED:'false',AD_EXPOSURE_ENABLED:'false',ACCOUNTS_ENABLED:'true',POLICIES_APPROVED:'false',TOSS_MODE:'',TOSS_CLIENT_KEY:'',TOSS_SECRET_KEY:''};
const run=extra=>spawnSync(process.execPath,['scripts/preflight.mjs'],{env:{...base,...extra},encoding:'utf8'});
test('closed beta does not require disabled payment secrets; enabled functions and wrong-role keys fail closed',()=>{
 assert.equal(run({}).status,0);
 assert.equal(run({PAYMENTS_ENABLED:'true'}).status,1);
 assert.equal(run({EXPERT_DOCUMENTS_ENABLED:'true'}).status,1);
 const marker='sb_publishable_DO_NOT_LOG';const result=run({SUPABASE_SERVICE_ROLE_KEY:marker});assert.equal(result.status,1);assert.ok(!result.stdout.includes(marker));
});
