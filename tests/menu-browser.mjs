import {chromium, expect} from '@playwright/test';
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {setupCare, ids} from './appointment-care-fixture.mjs';
import PW_LAUNCH from './playwright-launch.cjs';

const f = await setupCare();
await f.db.exec('reset role');
// Isolated owner identity, same predicate contract as the growth fixture.
await f.db.exec(`create or replace function private.is_owner() returns boolean language sql stable security definer set search_path='' as $$select private.is_admin() and auth.uid()='${ids.admin}'::uuid$$;revoke all on function private.is_owner() from public,anon,authenticated;`);
for (const name of ['057_support_conversations.sql', '060_support_chat.sql', '061_expert_growth.sql']) await f.db.exec(await readFile('supabase/' + name, 'utf8'));
// Current registration UI uses SQL 066; the old fixture stopped at SQL 061.
await f.db.exec('create table private.phone_contacts(user_id uuid primary key,phone_e164 text,phone_verification_status text,phone_verified_at timestamptz)');
for (const name of ['043_auth_phone_status_bridge.sql','051_phone_signup.sql','056_booking_hardening.sql','066_profession_registration.sql']) await f.db.exec(await readFile('supabase/' + name,'utf8'));
await f.db.exec("update private.planner_directory set is_sample=false");
const browser = await chromium.launch(PW_LAUNCH);
const flowsOnly = process.argv.includes('--flows-only');
const origin = 'https://menu.fixture.test', auth = 'https://auth.fixture.test';
const checks = [], errors = [], failedRPC = new Set();
let queue = Promise.resolve();
const serial = fn => { const result = queue.then(fn); queue = result.catch(() => {}); return result; };
const check = (ok, label) => { if (!ok) throw Error(label); checks.push(label); console.log('PASS ' + label); };
await mkdir('artifacts/menu-screens', {recursive: true});

async function open(actor) {
  const context = await browser.newContext({viewport: {width: 390, height: 844}});
  const user = {id: actor, email: 'menu@example.test', aud: 'authenticated', user_metadata: {full_name: '메뉴 확인 회원'}};
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const session = {user, access_token: Buffer.from('{"alg":"HS256"}').toString('base64url') + '.' + Buffer.from(JSON.stringify({sub: actor, exp})).toString('base64url') + '.fixture', refresh_token: 'fixture', expires_at: exp, expires_in: 3600};
  if (actor) await context.addInitScript(s => localStorage.setItem('woori-account', JSON.stringify(s)), session);
  await context.route('**/*', async route => {
    const u = new URL(route.request().url());
    if (u.origin === origin) {
      if (u.pathname === '/api/config') return route.fulfill({json: {enabled: true, earlyAccess: true, expertApplicationsEnabled: true, signupEnabled: true, paymentsEnabled: false, url: auth, key: 'fixture'}});
      let pathname = u.pathname === '/' ? '/index.html' : u.pathname;
      if (!path.extname(pathname)) pathname += '.html';
      try {
        const file = path.resolve('public', '.' + pathname);
        return route.fulfill({body: await readFile(file), contentType: file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.svg') ? 'image/svg+xml' : file.endsWith('.woff2') ? 'font/woff2' : file.endsWith('.png') ? 'image/png' : 'text/html; charset=utf-8'});
      } catch { return route.fulfill({status: 404, body: ''}); }
    }
    if (u.origin !== auth) return route.abort();
    if (u.pathname.endsWith('/user')) return route.fulfill({json: user});
    if (u.pathname.endsWith('/token')) return route.fulfill({json: session});
    const name = u.pathname.split('/').pop(), args = route.request().postDataJSON() || {};
    if (failedRPC.has(name)) return route.fulfill({status: 503, json: {message: 'Connection interrupted'}});
    try {
      const data = await serial(async () => { await f.login(actor, actor ? 'authenticated' : 'anon'); return f.rpc(name, Object.values(args)); });
      return route.fulfill({json: data});
    } catch (e) { console.log('RPC', name, args.operation || '', e.message); return route.fulfill({status: 400, json: {message: e.message, code: e.code}}); }
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  return {page, context};
}
async function menu(page) {
  await page.goto(origin + '/menu.html', {waitUntil: 'domcontentloaded', timeout: 60000});
  await expect(page.locator('#menuContent')).toHaveAttribute('aria-busy', 'false');
}
async function sizing(page, width, zoom = false) {
  await page.setViewportSize({width, height: width === 1440 ? 1000 : 844});
  await page.evaluate(enlarged => { document.documentElement.style.fontSize = enlarged ? '200%' : ''; }, zoom);
  await page.evaluate(() => document.fonts.ready);
  check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}px ${zoom ? '200% text' : ''} no horizontal overflow`);
  check(await page.locator('.menu-row,.menu-settings').evaluateAll(els => els.every(e => e.getBoundingClientRect().height >= 48)), `${width}px menu touch targets >= 48px`);
  await page.evaluate(() => scrollTo(0, document.body.scrollHeight));
  await expect.poll(() => page.evaluate(() => {
    const rows = [...document.querySelectorAll('.menu-group .menu-row')];
    return rows.at(-1).getBoundingClientRect().bottom <= document.querySelector('.customer-nav').getBoundingClientRect().top;
  })).toBe(true);
  check(true, `${width}px last row clears bottom navigation`);
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({path: `artifacts/menu-screens/menu-${width}${zoom ? '-200' : ''}.png`, fullPage: true});
}

try {
  const expert = await open(ids.planner), p = expert.page;
  await p.goto(origin + '/account.html', {waitUntil: 'domcontentloaded'});
  await expect(p.locator('#accountContent')).toBeVisible();
  if (!flowsOnly) await p.screenshot({path: 'artifacts/menu-screens/account-before-390.png', fullPage: true});
  await menu(p);
  await expect(p.getByRole('link', {name: '프로필 수정', exact: true})).toBeVisible();
  await expect(p.getByRole('link', {name: '내 프로필 보기', exact: true})).toBeVisible();
  await expect(p.getByRole('link', {name: '상담 자료', exact: true})).toBeVisible();
  await expect(p.getByRole('link', {name: '관리자 화면', exact: true})).toHaveCount(0);
  await expect(p.locator('#menuRetry')).toBeHidden();
  check((await p.locator('.customer-nav a').allTextContents()).join('/') === '홈/지도/예약/고객센터/메뉴', 'five existing positions; last tab opens separate menu');
  const links = await p.locator('main a').evaluateAll(els => els.map(el => el.pathname));
  for (const link of links) await readFile(path.resolve('public', '.' + link));
  check(true, 'all expert menu destinations exist');
  if (!flowsOnly) {
    for (const width of [360, 390, 430, 1440]) await sizing(p, width);
    await p.locator('.menu-name').evaluate(el => el.textContent = '긴이름과공백없는이름확인🙂'.repeat(6));
    await sizing(p, 360, true);
  }
  await p.evaluate(() => { document.documentElement.style.fontSize = ''; });
  check(await p.evaluate(() => getComputedStyle(document.body).backgroundColor === 'rgb(246, 247, 249)'), 'requested scoped background applied');
  const colors = [['#17212F', '#FFFFFF'], ['#596579', '#FFFFFF'], ['#3157C8', '#EEF2FA'], ['#526176', '#EEF2FA']];
  const luminance = color => color.slice(1).match(/../g).map(v => parseInt(v, 16) / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((n, v, i) => n + v * [.2126, .7152, .0722][i], 0);
  for (const [front, back] of colors) check((luminance(back) + .05) / (luminance(front) + .05) >= 4.5, `${front} on ${back} contrast >= 4.5:1`);
  await menu(p);
  await p.getByRole('link', {name: '프로필 수정', exact: true}).click();
  await expect(p.locator('#optionalProfileBody')).toBeVisible();
  await expect(p.locator('.optional-profile h2').first()).toBeFocused();
  if (!flowsOnly) await p.screenshot({path: 'artifacts/menu-screens/profile-destination-390.png'});
  await p.goBack();
  await expect(p.locator('#menuContent')).toHaveAttribute('aria-busy', 'false');
  await p.getByRole('link', {name: '상담 가능 설정', exact: true}).click();
  await expect(p.locator('#consultSettingsBody')).toBeVisible();
  await expect(p.locator('.consult-settings h2')).toBeFocused();
  check(true, 'existing profile and consultation settings expand; back returns to menu');
  await menu(p);
  await p.getByRole('link', {name: '활동 지역', exact: true}).click();
  await expect(p.locator('.urgent-panel h2').filter({hasText: /^주활동지역$/})).toBeFocused();
  await menu(p);
  await p.getByRole('link', {name: '지금 방문 상담', exact: true}).click();
  await expect(p.getByRole('heading', {name: '지금 방문 상담 가능', exact: true})).toBeFocused();
  check(true, 'area and instant-visit entries focus existing settings');
  await menu(p);
  await p.getByRole('link', {name: '상담 요청', exact: true}).click();
  await expect(p.locator('#workflowFilters select[name=state]')).toHaveValue('requested');
  await expect(p.locator('#workflowFilters')).toBeFocused();
  check(true, 'consultation requests open existing requested filter');
  for (const [label, target] of [['실천 기록', '#growthPractice h2'], ['상담 자료', '#growthLibrary h2']]) {
    await menu(p); await p.getByRole('link', {name: label, exact: true}).click();
    await expect(p.locator(target)).toBeFocused();
  }
  check(true, 'growth and material links focus existing content');
  failedRPC.add('expert_optional_profile');
  await menu(p); await expect(p.locator('#menuRetry')).toBeVisible();
  await expect(p.getByRole('link', {name: '프로필 수정', exact: true})).toBeVisible();
  failedRPC.clear(); await p.getByRole('button', {name: '다시 확인'}).click();
  await expect(p.locator('#menuRetry')).toBeHidden();
  check(true, 'partial failure preserves main actions, retry recovers');
  await expert.context.close();

  for (const actor of [null, ids.customer, ids.admin]) {
    const {page, context} = await open(actor); await menu(page);
    await expect(page.getByRole('link', {name: '프로필 수정', exact: true})).toHaveCount(0);
    await expect(page.getByRole('link', {name: '상담 자료', exact: true})).toHaveCount(0);
    await expect(page.getByRole('link', {name: '관리자 화면', exact: true})).toHaveCount(actor === ids.admin ? 1 : 0);
    if (!actor) { await expect(page.getByRole('link', {name: '로그인', exact: true})).toHaveAttribute('href', '/login.html?next=%2Fmenu.html'); }
    if (!flowsOnly) await page.screenshot({path: `artifacts/menu-screens/${!actor ? 'guest' : actor === ids.admin ? 'admin' : 'consumer'}-390.png`, fullPage: true});
    await context.close();
  }
  check(true, 'guest/consumer/admin see only appropriate menus; login returns to menu');
  const failure = await open(ids.planner);
  failedRPC.add('my_membership'); await menu(failure.page);
  await expect(failure.page.getByRole('link', {name: '관리자 화면', exact: true})).toHaveCount(0);
  await expect(failure.page.locator('#menuRetry')).toBeVisible();
  failedRPC.clear(); await failure.page.getByRole('button', {name: '다시 확인'}).click();
  await expect(failure.page.getByRole('link', {name: '프로필 수정', exact: true})).toBeVisible();
  await failure.context.close();
  check(true, 'membership failure does not grant roles; recovery loads server roles');
  check(errors.length === 0, 'no browser exceptions: ' + errors.join('; '));
  await writeFile('artifacts/menu-results.json', JSON.stringify({checks, errors, productionWrites: false}, null, 2));
} finally { await browser.close(); await f.db.close(); }
