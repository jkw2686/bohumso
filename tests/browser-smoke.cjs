const {chromium,expect}=require(process.argv[2]||'@playwright/test');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 const root=path.resolve('public');
 const server=http.createServer((req,res)=>{
  const p=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);
  if(!p.startsWith(root+path.sep)){res.writeHead(404).end();return}
  try{const data=fs.readFileSync(p);res.setHeader('Content-Type',p.endsWith('.js')?'text/javascript':p.endsWith('.css')?'text/css':'text/html');res.end(data)}catch{res.writeHead(404).end()}
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try{
  const base='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({channel:'msedge',headless:true});
  const page=await browser.newPage({viewport:{width:360,height:800}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  let enabled=false,providers=false,settingsFailure=false;const requests=[];
  await page.route('**/api/config',r=>r.fulfill({json:enabled?{enabled:true,naverLogin:providers,url:'https://test.supabase.co',key:'sb_publishable_test',operator:'Test',contact:'test@example.com'}:{enabled:false,message:'회원 서비스를 준비 중입니다.'}}));
  await page.route('https://test.supabase.co/**',async route=>{
   const req=route.request(),url=new URL(req.url());
   if(url.pathname.endsWith('/settings')){await route.fulfill({status:settingsFailure?503:200,json:{external:{kakao:providers,google:providers,apple:providers,facebook:providers}}});return}
   requests.push({url,body:req.postData()?req.postDataJSON():null});
   if(url.pathname.endsWith('/signup'))await route.fulfill({json:{user:{id:'11111111-1111-4111-8111-111111111111',email:'test@example.com'},session:null}});
   else if(url.pathname.endsWith('/recover'))await route.fulfill({json:{}});
   else if(url.pathname.endsWith('/authorize'))await route.fulfill({contentType:'text/html',body:'<p>Mock OAuth provider</p>'});
   else await route.fulfill({status:401,json:{message:'not logged in'}});
  });
  await page.goto(base+'/signup.html');
  await expect(page.locator('#signupForm')).toBeHidden();
  enabled=true;await page.goto(base+'/signup.html');
  await expect(page.locator('#signupForm')).toBeVisible();
  await expect(page.locator('#kakaoSignup')).toHaveText('카카오 로그인 준비 중');
  await expect(page.locator('#kakaoSignup')).toBeDisabled();
  await expect(page.locator('#googleSignup')).toBeDisabled();
  for(const id of ['naver','apple','facebook'])await expect(page.locator('#'+id+'Signup')).toHaveCount(0);
  await page.locator('[name=email]').fill('test@example.com');
  await page.locator('[name=password]').fill('test-password-1234');
  await page.getByRole('button',{name:'인증 메일 받고 가입 시작'}).click();
  await expect(page.locator('#accountMessage')).toContainText('동의');
  await expect(page.locator('#signupPrivacy')).toBeFocused();
  await expect(page.locator('#signupConsentHint')).toBeVisible();
  expect(requests.filter(r=>r.url.pathname.endsWith('/signup'))).toHaveLength(0);
  await page.locator('#signupPrivacy').check();
  await page.getByRole('button',{name:'인증 메일 받고 가입 시작'}).click();
  await expect(page.locator('#accountMessage')).toContainText('등록 가능한 이메일');
  const signup=requests.find(r=>r.url.pathname.endsWith('/signup'));
  expect(signup.body.email).toBe('test@example.com');
  expect(signup.url.searchParams.get('redirect_to')).toBe(base+'/account.html');
  await expect(page.locator('#kakaoSignup')).toBeDisabled();
  await page.goto(base+'/login.html');
  await expect(page.locator('#kakaoLogin')).toHaveText('카카오 로그인 준비 중');
  await page.locator('[name=email]').fill('test@example.com');
  await page.locator('#resetPassword').click();
  await expect(page.locator('#accountMessage')).toContainText('재설정 안내');
  const recovery=requests.find(r=>r.url.pathname.endsWith('/recover'));
  expect(recovery.url.searchParams.get('redirect_to')).toBe(base+'/reset-password.html');
  await expect(page.locator('#kakaoLogin')).toBeDisabled();
  settingsFailure=true;await page.goto(base+'/login.html');
  await expect(page.locator('#googleLogin')).toHaveText('Google 연결 확인 실패');
  await expect(page.locator('#retrySocialAuth')).toBeVisible();
  await expect(page.locator('#googleLogin')).toBeDisabled();
  await expect(page.locator('#loginForm')).toBeVisible();
  settingsFailure=false;providers=true;
  for(const mode of ['signup','login'])for(const provider of ['kakao','google']){
   await page.goto(base+'/'+mode+'.html');
   const button=page.locator('#'+provider+(mode==='signup'?'Signup':'Login'));
   if(mode==='login'){for(const id of ['naver','apple','facebook'])await expect(page.locator('#'+id+'Login')).toHaveCount(0);await expect(page.locator('.social-auth button').first()).toHaveAttribute('id','googleLogin');}
   if(mode==='login'&&provider==='kakao'){await expect(button).toBeDisabled();await expect(button).toHaveText('카카오 로그인 준비 중');continue;}
   await expect(button).toBeEnabled();
   if(mode==='signup'){
    const before=requests.length;await button.click();
    await expect(page.locator('#accountMessage')).toContainText('동의');
    expect(requests.length).toBe(before);await page.locator('#signupPrivacy').check();
   }
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
   await button.click();await page.waitForURL('https://test.supabase.co/auth/v1/authorize**');
   const auth=new URL(page.url());expect(auth.searchParams.get('provider')).toBe(provider==='naver'?'custom:naver':provider);
   expect(auth.searchParams.get('redirect_to')).toBe(base+'/account.html');
   expect(auth.searchParams.get('code_challenge')).toBeTruthy();
  }
  await page.goto(base+'/admin.html');await expect(page.locator('#accountContent')).toBeHidden();
  await expect(page.locator('#accountNotice')).toContainText('로그인이 필요');
  expect(errors).toEqual([]);
  console.log('PASS: signup consent, email/recovery redirects, disabled/unavailable providers, Kakao/Google PKCE redirects, 360px layout, anonymous admin blocked. Auth mocked; no email or external login.');
 }finally{if(browser)await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
