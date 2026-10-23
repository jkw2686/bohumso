// 전문가 보험사 연락처 화면 검사. 격리 모의 응답만 쓰고 운영 데이터는 건드리지 않는다.
import {chromium, expect} from '@playwright/test';
import {readFile, mkdir} from 'node:fs/promises';
import path from 'node:path';
import launch from './playwright-launch.cjs';

const origin = 'https://insurer.fixture.test', auth = 'https://auth.fixture.test';
const actor = '20000000-0000-4000-8000-000000000001';
const out = 'artifacts/insurer-expert';
const checks = [];
const check = (ok, label) => { if (!ok) throw Error(label); checks.push(label); console.log('PASS ' + label); };

const seed = () => ([
  {id: 'a1', name: '삼성생명', category: '생명', homepage_url: 'https://www.samsunglife.com',
    portal_url: 'https://portal.samsunglife.test', terms_url: 'https://terms.samsunglife.test', claim_form_url: null,
    tel_customer: '1588-3114', tel_incall: '02-751-8000', tel_it_help: null, fax_claim: '02-751-8001',
    sort_order: 10, is_active: true, verified: true, memo: null, updated_at: '2026-10-20T01:00:00Z', favorite: false},
  {id: 'b2', name: '현대해상', category: '손해', homepage_url: null, portal_url: null, terms_url: null,
    claim_form_url: 'https://claim.hi.test', tel_customer: '1588-5656', tel_incall: null, tel_it_help: null,
    fax_claim: null, sort_order: 20, is_active: true, verified: false, memo: null, updated_at: '2026-10-20T01:00:00Z', favorite: false},
  {id: 'c3', name: '신협공제', category: '공제', homepage_url: null, portal_url: null, terms_url: null,
    claim_form_url: null, tel_customer: '1566-6000', tel_incall: null, tel_it_help: null, fax_claim: null,
    sort_order: 30, is_active: true, verified: false, memo: null, updated_at: '2026-10-20T01:00:00Z', favorite: false},
]);

async function open({access = 'expert'} = {}) {
  const browser = await chromium.launch(launch);
  const context = await browser.newContext({viewport: {width: 390, height: 900}, deviceScaleFactor: 2});
  const user = {id: actor, email: 'isolated@example.test', aud: 'authenticated'};
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const session = {user, access_token: Buffer.from('{"alg":"HS256"}').toString('base64url') + '.'
    + Buffer.from(JSON.stringify({sub: actor, exp})).toString('base64url') + '.fixture',
    refresh_token: 'fixture', expires_at: exp, expires_in: 3600};
  if (access !== 'anonymous') await context.addInitScript(s => localStorage.setItem('woori-account', JSON.stringify(s)), session);
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
    if (u.pathname.endsWith('/user')) return access === 'anonymous'
      ? route.fulfill({status: 401, json: {message: 'not signed in'}}) : route.fulfill({json: user});
    if (u.pathname.endsWith('/token')) return route.fulfill({json: session});
    const name = u.pathname.split('/').pop(), args = route.request().postDataJSON() || {};
    if (name === 'insurer_contacts_command') {
      state.calls.push(args);
      if (access !== 'expert' && access !== 'admin')
        return route.fulfill({status: 400, json: {message: 'insurer_access_required'}});
      if (args.operation === 'favorite') {
        const row = state.contacts.find(c => c.id === args.payload.id);
        row.favorite = args.payload.on;
        state.contacts = [...state.contacts].sort((a, b) => Number(b.favorite) - Number(a.favorite) || a.sort_order - b.sort_order);
      }
      return route.fulfill({json: {admin: access === 'admin', contacts: state.contacts}});
    }
    return route.fulfill({json: {}});
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(origin + '/insurer-contacts.html');
  return {browser, page, state, errors};
}

try {
  await mkdir(out, {recursive: true});
  let env = await open();
  const cards = env.page.locator('[data-insurer-card]');
  await expect(cards.first()).toBeVisible();
  check(await cards.count() === 3, '승인 전문가에게 보험사 카드가 보인다');

  // 구분 뱃지와 전산 접속 버튼
  await expect(cards.first().locator('.insurer-badge')).toHaveText('생명');
  const portal = cards.first().locator('.insurer-portal');
  check(await portal.getAttribute('target') === '_blank' && await portal.getAttribute('rel') === 'noopener noreferrer',
    '전산 접속은 새 탭으로 연다');
  const noPortal = cards.nth(1).locator('.insurer-portal');
  check(await noPortal.getAttribute('aria-disabled') === 'true' && await noPortal.evaluate(n => n.tagName) === 'SPAN',
    '주소가 없으면 전산 접속 버튼을 쓸 수 없다');
  check(await cards.nth(1).locator('.insurer-links .is-empty').count() === 1, '약관 주소가 없으면 그 버튼만 비활성');

  check(await cards.first().locator('a[href="tel:027518001"]').count() === 0, '팩스는 전화 링크가 아님');
  await expect(cards.first().getByRole('button',{name:'02-751-8001 복사'})).toBeVisible();
  await env.page.evaluate(()=>{Object.defineProperty(navigator,'clipboard',{value:{writeText:async text=>{window.copiedFax=text;}}});});
  await cards.first().getByRole('button',{name:'02-751-8001 복사'}).click();
  check(await env.page.evaluate(()=>window.copiedFax)==='02-751-8001','팩스 번호 복사 동작');
  // 전화번호는 tel: 링크, 없으면 '정보 없음'
  check(await cards.first().locator('dd a[href="tel:15883114"]').count() === 1, '고객센터는 tel 링크');
  check(await cards.first().locator('.insurer-none').count() === 1, '빈 항목은 정보 없음으로 표시');
  check((await cards.nth(2).locator('.insurer-none').allTextContents()).length === 3, '값이 없는 행은 모두 정보 없음');
  await expect(cards.first().locator('.insurer-asof')).toHaveText('2026.10.20 기준');
  check(true, '카드 하단에 기준일 표시');

  // 탭과 검색
  await env.page.getByRole('tab', {name: '손해'}).click();
  check(await cards.count() === 1, '구분 탭');
  await env.page.getByRole('tab', {name: '전체'}).click();
  await env.page.locator('.insurer-search input').fill('신협');
  check(await cards.count() === 1, '이름 검색');
  await env.page.locator('.insurer-search input').fill('');

  // 즐겨찾기는 맨 앞으로
  await cards.nth(2).locator('.insurer-star').click();
  await expect(cards.first().locator('h2')).toHaveText('신협공제');
  check(await cards.first().locator('.insurer-star').getAttribute('aria-pressed') === 'true', '즐겨찾기가 맨 앞으로 온다');
  await env.page.getByRole('tab', {name: '즐겨찾기'}).click();
  check(await cards.count() === 1, '즐겨찾기 탭');
  await env.page.getByRole('tab', {name: '전체'}).click();

  // 2열 / 3열 / 4열
  for (const [width, columns] of [[390, 2], [800, 3], [1280, 4]]) {
    await env.page.setViewportSize({width, height: 900});
    await env.page.waitForTimeout(150);
    const count = await env.page.evaluate(() => new Set([...document.querySelectorAll('[data-insurer-card]')]
      .map(n => Math.round(n.getBoundingClientRect().left))).size);
    check(count === Math.min(columns, 3), width + 'px에서 ' + count + '열 배치');
    check(await env.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), width + 'px 가로 넘침 없음');
  }
  await env.page.setViewportSize({width: 390, height: 1200});
  await env.page.waitForTimeout(200);
  await env.page.screenshot({path: out + '/expert-390.png', fullPage: true});
  await env.page.setViewportSize({width: 1280, height: 900});
  await env.page.waitForTimeout(200);
  await env.page.screenshot({path: out + '/expert-1280.png', fullPage: true});
  check(env.errors.length === 0, '콘솔 오류 없음 (' + env.errors.join(' | ') + ')');
  await env.browser.close();

  // 권한이 없는 계정과 비로그인
  env = await open({access: 'consumer'});
  await expect(env.page.getByText('승인된 전문가만 볼 수 있는 자료입니다.')).toBeVisible();
  check(await env.page.locator('[data-insurer-card]').count() === 0, '소비자에게는 카드가 없고 안내만 보인다');
  await env.page.setViewportSize({width: 390, height: 700});
  await env.page.screenshot({path: out + '/blocked-390.png'});
  await env.browser.close();

  env = await open({access: 'anonymous'});
  await expect(env.page.getByText('로그인 후 보험사 연락처를 확인할 수 있습니다.')).toBeVisible();
  check(env.state.calls.length === 0, '비로그인은 서버에 묻지도 않는다');
  await env.browser.close();

  console.log('PASS insurer expert: ' + checks.length + ' checks');
} catch (e) {
  console.log('FAIL ' + e.message);
  process.exitCode = 1;
}
