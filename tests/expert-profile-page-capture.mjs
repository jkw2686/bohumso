import PW_LAUNCH from './playwright-launch.cjs';
// A-5 전/후 캡처 전용. 검사는 하지 않고 partner.html 을 390x844 로 찍는다.
// 같은 스크립트를 origin/main 워크트리에서 돌려 '전', 작업 트리에서 돌려 '후' 를 만든다.
import {chromium} from '@playwright/test';
import {readFile, mkdir} from 'node:fs/promises';
import path from 'node:path';
import {setupCare, ids} from './appointment-care-fixture.mjs';

const label = process.argv[2] || 'after';
const f = await setupCare(), browser = await chromium.launch(PW_LAUNCH);
await mkdir('artifacts', {recursive: true});
const origin = 'https://profile.fixture.test', auth = 'https://auth.fixture.test';

async function open(actor) {
  const user = {id: actor, email: 'profile@example.test', aud: 'authenticated'};
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const session = {user, access_token: Buffer.from('{"alg":"HS256"}').toString('base64url') + '.' +
    Buffer.from(JSON.stringify({sub: actor, exp})).toString('base64url') + '.fixture',
    refresh_token: 'fixture', expires_at: exp, expires_in: 3600, token_type: 'bearer'};
  const context = await browser.newContext({viewport: {width: 390, height: 844}});
  context.setDefaultTimeout(10000);
  await context.addInitScript(s => localStorage.setItem('woori-account', JSON.stringify(s)), session);
  await context.route('**/*', async r => {
    const u = new URL(r.request().url());
    if (u.origin === origin) {
      if (u.pathname === '/api/config') return r.fulfill({json: {enabled: true, earlyAccess: true, expertApplicationsEnabled: true, signupEnabled: true, paymentsEnabled: false, url: auth, key: 'fixture'}});
      try {
        const file = path.resolve('public', '.' + u.pathname);
        return r.fulfill({body: await readFile(file), contentType: file.endsWith('.js') ? 'text/javascript'
          : file.endsWith('.css') ? 'text/css' : file.endsWith('.svg') ? 'image/svg+xml'
          : file.endsWith('.png') ? 'image/png' : file.endsWith('.woff2') ? 'font/woff2' : 'text/html; charset=utf-8'});
      } catch { return r.fulfill({status: 404, body: ''}); }
    }
    if (u.origin !== auth) return r.abort();
    if (u.pathname.endsWith('/user')) return r.fulfill({json: user});
    if (u.pathname.endsWith('/token')) return r.fulfill({json: {...session, user}});
    const name = u.pathname.split('/').pop(), args = r.request().postDataJSON() || {};
    try { await f.login(actor); return r.fulfill({json: await f.rpc(name, Object.values(args))}); }
    catch (e) { return r.fulfill({status: 400, json: {message: e.message, code: e.code}}); }
  });
  const page = await context.newPage();
  return {context, page};
}

try {
  const {context, page} = await open(ids.planner);
  await page.goto(origin + '/partner.html');
  await page.waitForTimeout(2500);
  await page.screenshot({path: `artifacts/expert-profile-${label}-390-top.png`});
  await page.screenshot({path: `artifacts/expert-profile-${label}-390-full.png`, fullPage: true});
  const headings = await page.$$eval('#accountContent h2, #accountContent summary', n => n.map(x => (x.tagName === 'SUMMARY' ? '▶ ' : '') + x.textContent.trim()));
  console.log(label.toUpperCase() + ' 카드 순서: ' + (headings.join(' / ') || '(없음)'));
  await context.close();
} finally { await browser.close(); await f.db.close(); }
