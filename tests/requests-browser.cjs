const {chromium,expect}=require(process.argv[2]||'@playwright/test');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
(async()=>{const root=path.resolve('public');const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!file.startsWith(root+path.sep)){res.writeHead(404).end();return;}try{res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(file));}catch{res.writeHead(404).end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try{
 browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage({viewport:{width:390,height:844}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const base='http://127.0.0.1:'+server.address().port,uid='11111111-1111-4111-8111-111111111111',partner='22222222-2222-4222-8222-222222222222';let role='customer',rows=[],calls=[];
 const exp=Math.floor(Date.now()/1000)+3600;const jwt=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url')+'.'+Buffer.from(JSON.stringify({sub:uid,exp,role:'authenticated'})).toString('base64url')+'.test';
 await page.addInitScript(({uid,exp,jwt})=>localStorage.setItem('woori-account',JSON.stringify({access_token:jwt,refresh_token:'mock',expires_at:exp,expires_in:3600,token_type:'bearer',user:{id:uid,email:'test@example.com'}})),{uid,exp,jwt});
 await page.route('**/api/config',r=>r.fulfill({json:{enabled:true,url:'https://test.supabase.co',key:'sb_publishable_test',operator:'테스트 운영자',contact:'test@example.com'}}));
 await page.route('https://test.supabase.co/**',async route=>{
  const name=new URL(route.request().url()).pathname.split('/').pop(),body=route.request().postDataJSON();let data;
  if(name==='user')data={id:uid,email:'test@example.com',aud:'authenticated'};
  else if(name==='my_membership')data={member:true,admin:role==='admin',partner_status:role==='partner'?'approved':null};
  else if(name==='list_service_requests')data=rows;
  else if(name==='list_assignable_partners')data=[{user_id:partner,full_name:'테스트 설계사',profession:'planner',organization:'테스트 회사',region:'서울'}];
  else if(name==='create_service_request'){calls.push({name,body});rows=[{id:'request-one',kind:body.request_kind,profession:body.requested_profession,region:body.request_region,requested_at:body.preferred_at,status:'pending'}];data='request-one';}
  else if(name==='assign_service_request'){calls.push({name,body});Object.assign(rows[0],{status:'assigned',partner_id:partner,partner_name:'테스트 설계사',organization:'테스트 회사',partner_status:'approved'});data=null;}
  else if(name==='confirm_service_request'){calls.push({name,body});Object.assign(rows[0],{status:'confirmed',contact_name:body.contact_name,contact_phone:body.contact_phone});data=null;}
  else if(name==='change_service_request'){calls.push({name,body});rows[0].status=body.decision;data=null;}
  else throw Error('Unexpected request '+name);
  await route.fulfill({json:data});
 });
 await page.goto(base+'/requests.html');await expect(page.locator('#requestForm')).toBeVisible();
 await page.locator('[name=region]').fill('서울 마포구');const tomorrow=new Date(Date.now()+86400000).toISOString().slice(0,10);await page.locator('[name=date]').fill(tomorrow);await page.locator('[name=time]').selectOption('14:30');await page.getByRole('button',{name:'희망 일정 신청'}).click();await expect(page.locator('#requestList')).toContainText('접수 완료');
 if(calls[0].body.preferred_at!==tomorrow+'T05:30:00.000Z')throw Error('Korea timezone conversion failed');
 role='admin';await page.goto(base+'/admin-requests.html');await page.locator('#requestList select').selectOption(partner);await page.getByRole('button',{name:'담당자 배정',exact:true}).click();await expect(page.locator('#requestList')).toContainText('고객 확정 대기');
 role='customer';await page.goto(base+'/requests.html');await page.locator('[name=full_name]').fill('테스트 고객');await page.locator('[name=phone]').fill('01012345678');await page.locator('#requestList input[type=checkbox]').check();await page.getByRole('button',{name:'동의하고 예약 확정'}).click();await expect(page.locator('#requestList')).toContainText('예약 확정');
 if(!calls.find(c=>c.name==='confirm_service_request'&&c.body.expected_partner===partner&&c.body.share_consent===true))throw Error('Consent recipient missing');
 role='partner';await page.goto(base+'/partner-work.html');await expect(page.locator('#requestList')).toContainText('01012345678');await expect(page.getByRole('button',{name:'상담 완료 처리'})).toHaveCount(0);
 if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1))throw Error('Mobile horizontal overflow');
 role='customer';await page.goto(base+'/admin-requests.html');await expect(page.locator('#accountContent')).toBeHidden();
 await page.goto(base+'/requests.html');page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'요청 취소',exact:true}).click();await expect(page.locator('#requestList .request-status')).toHaveText('취소');
 if(errors.length)throw Error(errors.join('\n'));
 console.log('PASS: mobile request -> admin assignment -> customer consent -> partner view -> cancellation; unauthorized admin blocked. Mock backend only.');
}finally{if(browser)await browser.close();server.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
