import {test} from "node:test";import assert from "node:assert/strict";import handler from "../netlify/functions/public-config.mjs";
test("Missing setup and private keys never enable signup",async()=>{
 const names=["SUPABASE_URL","SUPABASE_PUBLISHABLE_KEY","ACCOUNTS_ENABLED","POLICIES_APPROVED","OPERATOR_NAME","PRIVACY_CONTACT"];const before=Object.fromEntries(names.map(k=>[k,process.env[k]]));
 try{names.forEach(k=>delete process.env[k]);assert.equal((await(await handler()).json()).enabled,false);
 Object.assign(process.env,{SUPABASE_URL:"https://example.supabase.co",SUPABASE_PUBLISHABLE_KEY:"sb_secret_test",ACCOUNTS_ENABLED:"true",POLICIES_APPROVED:"true",OPERATOR_NAME:"테스트",PRIVACY_CONTACT:"test@example.com"});
 assert.equal((await(await handler()).json()).enabled,false);
 process.env.SUPABASE_PUBLISHABLE_KEY="sb_publishable_test";assert.equal((await(await handler()).json()).enabled,true);
 process.env.POLICIES_APPROVED="false";assert.equal((await(await handler()).json()).enabled,false);
 }finally{names.forEach(k=>before[k]===undefined?delete process.env[k]:process.env[k]=before[k]);}
});