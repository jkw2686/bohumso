import PW_LAUNCH from './playwright-launch.cjs';
// 3-6 검증. 아이콘 통일·홈 카드·애니메이션·reduced-motion·CPU 감속·그림 자리.
// 정적 파일만 띄운다. 로그인·DB·발송 없음.
import {chromium, expect} from '@playwright/test';
import {readFile, mkdir} from 'node:fs/promises';
import path from 'node:path';

const browser = await chromium.launch(PW_LAUNCH);
await mkdir('artifacts', {recursive: true});
let failed = 0;
const errors = [];
const check = (ok, label) => { if (!ok) { failed++; console.log('FAIL ' + label); } else console.log('CHECK ' + label); };

const serve = async r => {
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
};

const lin = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };

try {
  // ── 1) 홈 상황 카드 6개: 원형 배경·크기·대비·카드 전체 클릭 ──
  const page = await browser.newPage({viewport: {width: 390, height: 900}});
  page.on('pageerror', e => errors.push(e.message));
  await page.route('**/*', serve);
  await page.goto('https://fixture.test/');

  const cards = page.locator('.situation-cards a');
  check(await cards.count() === 6, `① 상황 카드 6개 (${await cards.count()})`);
  const wraps = await page.locator('.situation-cards a>[data-icon]').evaluateAll(ns => ns.map(n => {
    const st = getComputedStyle(n), r = n.getBoundingClientRect();
    return {w: Math.round(r.width), h: Math.round(r.height), radius: st.borderRadius, bg: st.backgroundColor, fg: st.color,
      svg: !!n.querySelector('svg.ui-icon')};
  }));
  check(wraps.length === 6 && wraps.every(w => w.w >= 40 && w.w <= 48 && w.h === w.w),
    `① 아이콘 40~48px 정사각 (${wraps.map(w => w.w + 'x' + w.h).join(' ')})`);
  check(wraps.every(w => w.radius.startsWith('50%') || parseFloat(w.radius) >= w.w / 2), `① 원형 배경 (${wraps[0]?.radius})`);
  check(wraps.every(w => w.svg), '① 모두 ui-icons SVG');
  const ratio = await page.evaluate(() => {
    const n = document.querySelector('.situation-cards a>[data-icon]'), st = getComputedStyle(n);
    const l = v => { const [r, g, b] = v.match(/\d+/g).map(Number);
      const f = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
    const a = l(st.color) + 0.05, b = l(st.backgroundColor) + 0.05;
    return Math.round((Math.max(a, b) / Math.min(a, b)) * 100) / 100;
  });
  check(ratio >= 4.5, `① 아이콘 대비 4.5:1 이상 (${ratio}:1)`);
  const whole = await cards.first().evaluate(a => a.tagName === 'A' && !!a.getAttribute('href'));
  check(whole, '① 카드 전체가 링크');

  // ── 2) '서비스 더 알아보기' 가 ▶ 접힘이 아니라 카드형 버튼 ──
  check(await page.locator('.home-more .more-card').count() === 2, `② 카드형 버튼 2개 (${await page.locator('.home-more .more-card').count()})`);
  check(await page.locator('main details').count() === 0, `② 홈에 ▶ 접힘 없음 (${await page.locator('main details').count()})`);
  const moreBox = await page.locator('.more-card').first().boundingBox();
  check(moreBox.height >= 44, `② 카드 터치 44px (${Math.round(moreBox.height)})`);
  await page.screenshot({path: 'artifacts/home-icons-390.png', fullPage: true});

  // ── 3) 애니메이션이 선언되어 있다 ──
  const motion = await page.evaluate(() => {
    const probe = document.createElement('span');
    probe.className = 'avail-badge avail-now'; document.body.append(probe);
    const dot = getComputedStyle(probe, '::before');
    const btn = document.querySelector('.btn');
    const out = {pulse: dot.animationName, pulseMs: dot.animationDuration, btn: getComputedStyle(btn).transitionDuration};
    probe.remove(); return out;
  });
  check(motion.pulse === 'bohumso-pulse', `③ '지금 가능' 깜빡임 선언 (${motion.pulse} ${motion.pulseMs})`);
  check(parseFloat(motion.btn) > 0 && parseFloat(motion.btn) <= 0.15, `③ 버튼 누름 100ms 수준 (${motion.btn})`);
  const appear = await page.evaluate(() => {
    const n = document.createElement('div'); n.className = 'appear'; document.body.append(n);
    const st = getComputedStyle(n); const out = {name: st.animationName, ms: st.animationDuration}; n.remove(); return out;
  });
  check(appear.name === 'bohumso-appear' && parseFloat(appear.ms) >= 0.15 && parseFloat(appear.ms) <= 0.2,
    `③ 카드 등장 150~200ms (${appear.ms})`);

  // ── 4) prefers-reduced-motion 이면 전부 끈다 ──
  const still = await browser.newPage({viewport: {width: 390, height: 900}, reducedMotion: 'reduce'});
  await still.route('**/*', serve);
  await still.goto('https://fixture.test/');
  const off = await still.evaluate(() => {
    const probe = document.createElement('span'); probe.className = 'avail-badge avail-now'; document.body.append(probe);
    const appearNode = document.createElement('div'); appearNode.className = 'appear'; document.body.append(appearNode);
    const out = {
      pulse: getComputedStyle(probe, '::before').animationName,
      appear: getComputedStyle(appearNode).animationName,
      btn: getComputedStyle(document.querySelector('.btn')).transitionDuration,
      cards: getComputedStyle(document.querySelector('.situation-cards a')).transitionDuration
    };
    probe.remove(); appearNode.remove(); return out;
  });
  check(off.pulse === 'none', `④ reduced-motion 깜빡임 끔 (${off.pulse})`);
  check(off.appear === 'none', `④ reduced-motion 등장 끔 (${off.appear})`);
  check(parseFloat(off.btn) === 0, `④ reduced-motion 버튼 전환 끔 (${off.btn})`);
  check(parseFloat(off.cards) === 0, `④ reduced-motion 카드 전환 끔 (${off.cards})`);
  await still.close();

  // ── 5) CPU 4배 감속에서도 홈이 뜨고 넘침이 없다 ──
  const slow = await browser.newPage({viewport: {width: 390, height: 900}});
  await slow.route('**/*', serve);
  const cdp = await slow.context().newCDPSession(slow);
  await cdp.send('Emulation.setCPUThrottlingRate', {rate: 4});
  const began = Date.now();
  await slow.goto('https://fixture.test/');
  await expect(slow.locator('.situation-cards a')).toHaveCount(6);
  const took = Date.now() - began;
  check(await slow.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), '⑤ CPU 4배 감속 가로 넘침 없음');
  check(took < 20000, `⑤ CPU 4배 감속에서 홈 렌더 (${took}ms)`);
  await cdp.send('Emulation.setCPUThrottlingRate', {rate: 1});
  await slow.close();

  // ── 6) 그림 자리 4곳 ──
  for (const [url, slot] of [['/support.html', 'support'], ['/claim-resources.html', 'empty'], ['/partner.html', 'loading']]) {
    await page.goto('https://fixture.test' + url);
    const node = page.locator(`[data-art-slot="${slot}"]`);
    check(await node.count() >= 1, `⑥ ${url} 그림 자리 '${slot}'`);
    check(await node.first().locator('svg.ui-icon').count() === 1 || slot === 'empty',
      `⑥ ${url} 그림 자리에 기존 아이콘`);
  }
  check(/artSlot/.test(await readFile('public/ui-icons.js', 'utf8')), '⑥ 공통 artSlot 헬퍼');
  check(/data-art-slot/.test(await readFile('src/partner-onboarding.js', 'utf8')) ||
        /artSlot/.test(await readFile('src/partner-onboarding.js', 'utf8')), '⑥ 완료 화면 그림 자리');

  // ── 7) 4개 폭에서 홈 넘침 없음 ──
  for (const width of [360, 390, 430, 1440]) {
    await page.setViewportSize({width, height: 900});
    await page.goto('https://fixture.test/');
    check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `⑦ ${width}px 가로 넘침 없음`);
  }

  check(errors.length === 0, `콘솔 오류 없음 (${errors.join(' | ') || '없음'})`);
  console.log(failed ? `FAIL ${failed} checks` : 'PASS 3-6: 상황 카드 원형 아이콘·카드형 버튼·애니메이션·reduced-motion·CPU 4배·그림 자리·4폭. 정적 파일만 사용.');
} finally { await browser.close(); }
process.exit(failed ? 1 : 0);
