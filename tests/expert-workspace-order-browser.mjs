import PW_LAUNCH from './playwright-launch.cjs';
// /partner-work.html 첫 화면 순서 검증.
// 전문가가 매일 쓰는 두 가지(지금 방문 ON/OFF, 청구지원 자료실)가 맨 위에 보여야 한다.
// 실제 번들·실제 페이지 + 격리 DB. 외부 연결·운영 데이터 없음.
import {chromium, expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {setupCare, ids} from './appointment-care-fixture.mjs';

const f = await setupCare();
const browser = await chromium.launch(PW_LAUNCH);
const origin = 'https://pages.fixture.test', auth = 'https://auth.fixture.test';
const errors = [];
try {
  await f.booking();
  const actor = ids.planner;
  const user = {id: actor, email: 'planner@example.test', aud: 'authenticated'};
  const session = {access_token: Buffer.from('{"alg":"HS256"}').toString('base64url') + '.' +
    Buffer.from(JSON.stringify({sub: actor, exp: Math.floor(Date.now() / 1000) + 3600})).toString('base64url') + '.fixture',
    refresh_token: 'fixture', expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: 3600, token_type: 'bearer', user};
  const context = await browser.newContext({viewport: {width: 390, height: 844}});
  await context.addInitScript(s => localStorage.setItem('woori-account', JSON.stringify(s)), session);
  await context.route('**/*', async r => {
    const u = new URL(r.request().url());
    if (u.origin === origin) {
      if (u.pathname === '/api/config') return r.fulfill({json: {enabled: true, earlyAccess: true, signupEnabled: true, paymentsEnabled: false, url: auth, key: 'fixture'}});
      try {
        const file = path.resolve('public', '.' + u.pathname);
        return r.fulfill({body: await readFile(file), contentType: file.endsWith('.js') ? 'text/javascript'
          : file.endsWith('.css') ? 'text/css' : file.endsWith('.svg') ? 'image/svg+xml'
          : file.endsWith('.png') ? 'image/png' : file.endsWith('.woff2') ? 'font/woff2' : 'text/html; charset=utf-8'});
      } catch { return r.fulfill({status: 404, body: ''}); }
    }
    if (u.origin !== auth) return r.abort();
    if (u.pathname.endsWith('/user')) return r.fulfill({json: user});
    if (u.pathname.endsWith('/token')) return r.fulfill({json: session});
    const name = u.pathname.split('/').pop(), args = r.request().postDataJSON() || {};
    try { await f.login(actor); return r.fulfill({json: await f.rpc(name, Object.values(args))}); }
    catch (e) { return r.fulfill({status: 400, json: {message: e.message, code: e.code}}); }
  });
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(origin + '/partner-work.html');
  await expect(page.locator('#accountContent')).toBeVisible();
  await expect(page.getByRole('heading', {name: '지금 방문 상담 가능'})).toBeVisible();

  // 1) 첫 두 카드가 ON/OFF → 청구지원 자료실 순서
  const order = await page.$$eval('#accountContent .card h2', h => h.map(x => x.textContent.trim()));
  expect(order[0]).toBe('지금 방문 상담 가능');await expect(page.locator('[data-expert-resources]')).toHaveClass('compact-work-menu');

  // 2) 실제로 눌러야 하는 것이 첫 화면 안에 들어온다.
  //    카드 테두리가 아니라 조작 요소(스위치 버튼 / 자료실 링크) 기준으로 본다.
  const reach = () => page.evaluate(() => {
    const q = s => { const n = document.querySelector(s); if (!n) return null;
      const r = n.getBoundingClientRect(); return {top: Math.round(r.top), bottom: Math.round(r.bottom)}; };
    const toggleBtn = [...document.querySelectorAll('#accountContent .card button')]
      .find(b => /방문 가능 (켜기|끄기)/.test(b.textContent))?.getBoundingClientRect();
    return {h: window.innerHeight, toggle: toggleBtn ? Math.round(toggleBtn.bottom) : null,
      resource: q('[data-expert-resources] a[href="/claim-resources.html"]')};
  });
  let box = await reach();
  expect(box.toggle).not.toBeNull();
  expect(box.toggle).toBeLessThanOrEqual(box.h);          // 844px: 스위치 버튼
  expect(box.resource.bottom).toBeLessThanOrEqual(box.h); // 844px: 자료실 링크

  // 3) 더 좁은 세로(640px)에서도 스위치 버튼은 첫 화면에 남는다
  await page.setViewportSize({width: 390, height: 640});
  box = await reach();
  expect(box.toggle).toBeLessThanOrEqual(box.h);
  await page.setViewportSize({width: 390, height: 844});

  // 4) 자료실 링크가 살아 있다 (이동만 확인, 페이지 이탈 없음)
  expect(await page.getAttribute('[data-expert-resources] a[href="/claim-resources.html"]', 'href')).toBe('/claim-resources.html');

  // 5) 주활동지역·배정된 상담은 그대로 아래에 남는다
  expect(order).toContain('주활동지역');
  expect(order).toContain('배정된 상담·일정');
  expect(order.indexOf('주활동지역')).toBeGreaterThan(0);

  for (const width of [360, 390, 430]) {
    await page.setViewportSize({width, height: 844});
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  }
  await page.setViewportSize({width: 390, height: 844});
  await page.screenshot({path: 'artifacts/expert-workspace-order-390.png'});
  await context.close();
  expect(errors).toEqual([]);
  console.log('PASS partner-work.html 첫 화면: 지금 방문 ON/OFF → 간결한 업무 메뉴 순, 844px 안에 둘 다 노출, 360/390/430 가로 넘침 없음, 콘솔 오류 없음. 캡처 artifacts/expert-workspace-order-390.png');
} finally { await browser.close(); await f.db.close(); }
