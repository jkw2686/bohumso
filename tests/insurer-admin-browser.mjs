// 관리자 보험사 연락처 화면 검사. 격리 모의 응답만 쓰고 운영 데이터는 건드리지 않는다.
import {chromium, expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import launch from './playwright-launch.cjs';

const origin = 'https://insurer.fixture.test', auth = 'https://auth.fixture.test';
const actor = '30000000-0000-4000-8000-000000000001';
const checks = [];
const check = (ok, label) => { if (!ok) throw Error(label); checks.push(label); console.log('PASS ' + label); };

const seed = () => ([
  {id: 'a1', name: '삼성생명', category: '생명', homepage_url: 'https://www.samsunglife.com', portal_url: null,
    terms_url: null, claim_form_url: null, tel_customer: '1588-3114', tel_incall: null, tel_it_help: null,
    fax_claim: null, sort_order: 10, is_active: true, verified: false, memo: '내부 메모', updated_at: '2026-10-20T00:00:00Z', favorite: false},
  {id: 'b2', name: '현대해상', category: '손해', homepage_url: 'https://www.hi.co.kr', portal_url: null,
    terms_url: null, claim_form_url: null, tel_customer: '1588-5656', tel_incall: null, tel_it_help: null,
    fax_claim: null, sort_order: 20, is_active: false, verified: true, memo: null, updated_at: '2026-10-20T00:00:00Z', favorite: false},
]);

async function openAdmin({admin, partnerStatus = null}) {
  const browser = await chromium.launch(launch);
  const context = await browser.newContext({viewport: {width: 390, height: 900}});
  const user = {id: actor, email: 'isolated@example.test', aud: 'authenticated'};
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const session = {user, access_token: Buffer.from('{"alg":"HS256"}').toString('base64url') + '.'
    + Buffer.from(JSON.stringify({sub: actor, exp})).toString('base64url') + '.fixture',
    refresh_token: 'fixture', expires_at: exp, expires_in: 3600};
  await context.addInitScript(s => localStorage.setItem('woori-account', JSON.stringify(s)), session);
  const state = {contacts: seed(), calls: []};
  await context.route('**/*', async route => {
    const u = new URL(route.request().url());
    if (u.origin === origin) {
      if (u.pathname === '/api/config') return route.fulfill({json: {enabled: true, url: auth, key: 'fixture'}});
      let pathname = u.pathname === '/' ? '/index.html' : u.pathname;
      if (!path.extname(pathname)) pathname += '.html';
      try {
        const file = path.resolve('public', '.' + pathname);
        return route.fulfill({body: await readFile(file), contentType: file.endsWith('.js') ? 'text/javascript'
          : file.endsWith('.css') ? 'text/css' : file.endsWith('.svg') ? 'image/svg+xml'
          : file.endsWith('.png') ? 'image/png' : 'text/html; charset=utf-8'});
      } catch { return route.fulfill({status: 404, body: ''}); }
    }
    if (u.origin !== auth) return route.abort();
    if (u.pathname.endsWith('/settings')) return route.fulfill({json: {external: {}}});
    if (u.pathname.endsWith('/user')) return route.fulfill({json: user});
    if (u.pathname.endsWith('/token')) return route.fulfill({json: session});
    const name = u.pathname.split('/').pop(), args = route.request().postDataJSON() || {};
    if (name === 'my_membership') return route.fulfill({json: {member: true, admin, partner_status: partnerStatus}});
    if (name === 'insurer_contacts_command') {
      state.calls.push(args);
      if (!admin && partnerStatus !== 'approved') return route.fulfill({status: 400, json: {message: 'insurer_access_required'}});
      const visible = () => admin ? state.contacts : state.contacts.filter(c => c.is_active).map(c => ({...c, memo: null}));
      if (args.operation === 'set_active') {
        const row = state.contacts.find(c => c.id === args.payload.id);
        row.is_active = args.payload.is_active;
      }
      if (args.operation === 'delete') state.contacts = state.contacts.filter(c => c.id !== args.payload.id);
      if (args.operation === 'save') {
        if (!/^https:\/\//.test(args.payload.homepage_url || 'https://x')) return route.fulfill({status: 400, json: {message: 'check constraint'}});
        state.contacts.push({...args.payload, id: 'new', updated_at: '2026-10-20T00:00:00Z', favorite: false});
      }
      if (args.operation === 'import') return route.fulfill({json: {admin: true, written: args.payload.rows.length, skipped: 0, contacts: visible()}});
      return route.fulfill({json: {admin, contacts: visible()}});
    }
    return route.fulfill({json: {}});
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(origin + '/admin.html');
  return {browser, page, state, errors};
}

try {
  // 1) 관리자: 목록·배지·필터·검색
  let env = await openAdmin({admin: true});
  const card = env.page.locator('[data-insurer-admin]');
  await expect(card).toBeVisible();
  await expect(card.getByRole('heading', {name: '보험사 연락처'})).toBeVisible();
  check((await card.locator('[data-insurer-row]').count()) === 2, '관리자는 숨긴 항목까지 본다');
  await expect(card.locator('[data-insurer-row]').first()).toContainText('검증 전');
  await expect(card.locator('[data-insurer-row]').nth(1)).toContainText('숨김');
  await expect(card.locator('[data-insurer-row]').first()).toContainText('내부 메모');
  check(true, '구분·검증·노출 상태와 관리자 메모 표시');

  await card.locator('select').first().selectOption('손해');
  check((await card.locator('[data-insurer-row]').count()) === 1, '구분 필터');
  await card.locator('select').first().selectOption('');
  await card.locator('input[type=search]').fill('삼성');
  check((await card.locator('[data-insurer-row]').count()) === 1, '이름 검색');
  await card.locator('input[type=search]').fill('');

  // 2) 노출 토글
  await card.locator('[data-insurer-row]').first().getByRole('button', {name: '숨기기'}).click();
  await expect(card.locator('[data-insurer-row]').first()).toContainText('숨김');
  check(env.state.calls.some(c => c.operation === 'set_active' && c.payload.is_active === false), '노출 토글이 서버로 간다');

  // 3) 삭제는 확인창을 거친다
  env.page.once('dialog', d => d.dismiss());
  await card.locator('[data-insurer-row]').first().getByRole('button', {name: '삭제'}).click();
  check(!env.state.calls.some(c => c.operation === 'delete'), '확인창을 취소하면 삭제하지 않는다');
  env.page.once('dialog', d => d.accept());
  await card.locator('[data-insurer-row]').first().getByRole('button', {name: '삭제'}).click();
  await expect(card.locator('[data-insurer-row]')).toHaveCount(1);
  check(true, '확인 후에만 삭제');

  // 4) 등록 폼의 형식 검증
  await card.getByRole('button', {name: '새 보험사'}).click();
  const form = env.page.locator('dialog.insurer-form');
  await expect(form).toBeVisible();
  const homepage = form.locator('input[type=url]').first();
  check(await homepage.getAttribute('pattern') === 'https://.+', '주소는 https 형식만 받는다');
  const tel = form.locator('input[inputmode=tel]').first();
  check(await tel.getAttribute('pattern') === '[0-9-]{3,20}', '전화번호는 숫자·하이픈만 받는다');
  await homepage.fill('http://insecure.test');
  check(await homepage.evaluate(n => !n.checkValidity()), 'http 주소는 브라우저 검증에서 막힌다');
  await homepage.fill('https://ok.test');
  check(await homepage.evaluate(n => n.checkValidity()), 'https 주소는 통과');
  await form.getByRole('button', {name: '닫기'}).click();

  // 5) CSV 업로드 자리
  await expect(card.getByText('CSV 일괄 등록')).toBeVisible();
  check(true, 'CSV 일괄 등록 진입 제공');

  for (const width of [360, 390, 1440]) {
    await env.page.setViewportSize({width, height: 900});
    check(await env.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), width + 'px 가로 넘침 없음');
  }
  check(env.errors.length === 0, '콘솔 오류 없음 (' + env.errors.join(' | ') + ')');
  await env.browser.close();

  // 6) 승인 전문가와 일반회원에게는 이 관리자 화면이 뜨지 않는다
  for (const [label, role] of [['승인 전문가', {admin: false, partnerStatus: 'approved'}], ['일반회원', {admin: false}]]) {
    env = await openAdmin(role);
    await env.page.waitForTimeout(800);
    check(await env.page.locator('[data-insurer-admin]').count() === 0, label + '에게 관리자 보험사 화면이 보이지 않는다');
    check(!env.state.calls.some(c => c.operation === 'save' || c.operation === 'delete'), label + ' 세션에서 쓰기 호출 없음');
    await env.browser.close();
  }
  console.log('PASS insurer admin: ' + checks.length + ' checks');
} catch (e) {
  console.log('FAIL ' + e.message);
  process.exitCode = 1;
}
