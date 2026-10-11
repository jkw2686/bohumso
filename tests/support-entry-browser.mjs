import PW_LAUNCH from './playwright-launch.cjs';
// 3-1 검증. 소비자 하단 탭 5개·고객센터 진입 경로·전문가 화면 상단 버튼.
// 정적 파일만 띄운다. 로그인·DB·발송 없음.
import {chromium, expect} from '@playwright/test';
import {readFile, mkdir} from 'node:fs/promises';
import path from 'node:path';

const browser = await chromium.launch(PW_LAUNCH);
await mkdir('artifacts', {recursive: true});
const errors = [];
let failed = 0;
const check = (ok, label) => { if (!ok) { failed++; console.log('FAIL ' + label); } else console.log('CHECK ' + label); };

const TABS = ['홈', '지도', '예약', '고객센터', '내 정보'];

try {
  const page = await browser.newPage({viewport: {width: 390, height: 844}});
  page.on('pageerror', e => errors.push(e.message));
  await page.route('**/*', async r => {
    const u = new URL(r.request().url());
    if (u.origin !== 'https://fixture.test') return r.abort();
    if (u.pathname.startsWith('/api/')) return r.fulfill({json: {enabled: false}});
    if (u.pathname === '/location.js') return r.fulfill({body: 'window.startBohumsoLocation=()=>{};', contentType: 'text/javascript'});
    if (u.pathname.startsWith('/assets/')) return r.fulfill({body: '', contentType: 'text/javascript'});
    try {
      const file = path.resolve('public', '.' + (u.pathname === '/' ? '/index.html' : u.pathname));
      return r.fulfill({body: await readFile(file), contentType: file.endsWith('.css') ? 'text/css'
        : file.endsWith('.js') ? 'text/javascript' : file.endsWith('.svg') ? 'image/svg+xml'
        : file.endsWith('.png') ? 'image/png' : file.endsWith('.woff2') ? 'font/woff2' : 'text/html; charset=utf-8'});
    } catch { return r.fulfill({status: 404, body: ''}); }
  });

  // 1) 소비자 화면마다 하단 탭 5개
  for (const [url, active] of [['/', 'home'], ['/map.html', 'pin'], ['/requests.html', 'calendar'],
                               ['/support.html', 'support'], ['/account.html', 'person']]) {
    await page.goto('https://fixture.test' + url);
    const nav = page.locator('[data-customer-nav]');
    await expect(nav.locator('a')).toHaveCount(5);
    const labels = await nav.locator('a span').allTextContents();
    check(labels.join('/') === TABS.join('/'), `① ${url} 탭 5개 (${labels.join(' / ')})`);
    const current = await nav.locator('a[aria-current=page] span').textContent().catch(() => null);
    check(current === TABS[['home', 'pin', 'calendar', 'support', 'person'].indexOf(active)], `① ${url} 현재 탭 표시 (${current})`);
  }

  // 2) 360·390·430 에서 탭 글자가 잘리지 않는다
  for (const width of [360, 390, 430]) {
    await page.setViewportSize({width, height: 844});
    await page.goto('https://fixture.test/support.html');
    const cut = await page.locator('[data-customer-nav] a').evaluateAll(
      as => as.filter(a => { const s = a.querySelector('span'); return s && s.scrollWidth > s.clientWidth + 1; })
             .map(a => a.textContent.trim()));
    check(cut.length === 0, `② ${width}px 탭 글자 잘림 없음 (${cut.join(',') || '없음'})`);
    check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `② ${width}px 가로 넘침 없음`);
    const boxes = await page.locator('[data-customer-nav] a').evaluateAll(as => as.map(a => Math.round(a.getBoundingClientRect().height)));
    check(boxes.every(h => h >= 44), `② ${width}px 터치 44px (${boxes.join(',')})`);
    if (width === 390) await page.screenshot({path: 'artifacts/support-entry-390.png'});
  }

  // 3) support.html 공통 헤더 + 약관 줄 '문의하기' 유지
  await page.setViewportSize({width: 390, height: 844});
  await page.goto('https://fixture.test/support.html');
  check(await page.locator('header.nav .brand-logo').count() === 1, '③ support.html 공통 헤더');
  check(await page.locator('.policy-footer').getByRole('link', {name: '문의하기', exact: true}).count() === 1, '③ 약관 줄 문의하기 유지');

  // 4) 전문가 화면 상단 고객센터 버튼
  for (const url of ['/partner.html', '/partner-work.html']) {
    await page.goto('https://fixture.test' + url);
    const link = page.locator('.nav [data-expert-support]');
    check(await link.count() === 1 && await link.getAttribute('href') === '/support.html', `④ ${url} 상단 고객센터 버튼`);
    const box = await link.boundingBox();
    check(box !== null && box.height >= 44, `④ ${url} 터치 44px (${box ? Math.round(box.height) : '없음'})`);
    check(await page.locator('[data-customer-nav]').count() === 0, `④ ${url} 소비자 하단 탭 없음`);
  }

  check(errors.length === 0, `콘솔 오류 없음 (${errors.join(' | ') || '없음'})`);
  console.log(failed ? `FAIL ${failed} checks` : 'PASS 3-1: 하단 탭 5개·현재 탭·잘림 없음·공통 헤더·전문가 상단 버튼. 정적 파일만 사용.');
} finally { await browser.close(); }
process.exit(failed ? 1 : 0);
