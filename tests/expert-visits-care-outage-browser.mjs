import PW_LAUNCH from './playwright-launch.cjs';
// appointment_care(약속 안내)가 500 을 내도 방문 요청 '희망시간 수락' 버튼이 보이고 수락이 성공해야 한다.
// 약속 안내는 부가 기능이므로 그 장애가 핵심 동선을 막으면 안 된다. 격리 DB·실제 번들.
import {chromium, expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {setupVisits} from './expert-visits-fixture.mjs';
import {ids} from './commerce-fixture.mjs';

const f = await setupVisits();
const b = await chromium.launch(PW_LAUNCH);
let queue = Promise.resolve();
const serial = fn => { const next = queue.then(fn); queue = next.catch(() => {}); return next; };
const errors = [], careCalls = [];
const harness = '<meta name="viewport" content="width=device-width,initial-scale=1">'
  + '<link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/account.css">'
  + '<link rel="stylesheet" href="/urgent.css"><link rel="stylesheet" href="/type-system.css">'
  + '<main id="root" class="container"></main><script type="module">'
  + 'import{renderInstant,renderUrgentWorkspace}from"/assets/urgent.js";'
  + 'const client={rpc:async(name,args)=>{const r=await fetch("https://test.supabase.co/rest/v1/rpc/"+name,{method:"POST",body:JSON.stringify(args||{})});'
  + 'const data=await r.json();return r.ok?{data}:{error:data};}};'
  + 'await renderInstant(client,document.getElementById("root"));'
  + 'await renderUrgentWorkspace(client,document.getElementById("root"));<\/script>';

async function pageFor(id) {
  const p = await b.newPage({viewport: {width: 390, height: 844}});
  p.on('pageerror', e => errors.push(e.message));
  await p.route('**/*', async route => {
    const req = route.request(), u = new URL(req.url());
    if (u.hostname === 'test.supabase.co') return serial(async () => {
      if (u.pathname.endsWith('/user')) return route.fulfill({json: id ? {id, email: 'fixture@example.test', aud: 'authenticated'} : {}});
      const name = u.pathname.split('/').pop();
      // 약속 안내만 장애를 흉내낸다. code 없는 500 이라 careStatus 의 미적용 판정(PGRST202/42883)에 걸리지 않는다.
      if (name === 'appointment_care') { careCalls.push(req.postDataJSON()); return route.fulfill({status: 500, json: {message: 'care outage'}}); }
      try { await f.login(id, id ? 'authenticated' : 'anon'); return route.fulfill({json: await f.rpc(name, Object.values(req.postDataJSON() || {}))}); }
      catch (e) { return route.fulfill({status: 400, json: {message: e.message, code: e.code}}); }
    });
    if (u.hostname !== 'fixture.test') return route.abort();
    if (u.pathname === '/api/config') return route.fulfill({json: {enabled: true, url: 'https://test.supabase.co', key: 'fixture'}});
    if (u.pathname === '/test-pro') return route.fulfill({contentType: 'text/html', body: harness});
    try {
      return route.fulfill({body: await readFile(path.resolve('public', '.' + (u.pathname === '/' ? '/index.html' : u.pathname))),
        contentType: u.pathname.endsWith('.js') ? 'text/javascript' : u.pathname.endsWith('.css') ? 'text/css'
          : u.pathname.endsWith('.woff2') ? 'font/woff2' : u.pathname.endsWith('.svg') ? 'image/svg+xml' : 'text/html; charset=utf-8'});
    } catch { return route.fulfill({status: 404, body: ''}); }
  });
  await p.addInitScript(({id}) => {
    if (id) { const exp = Math.floor(Date.now() / 1000) + 3600;
      localStorage.setItem('woori-account', JSON.stringify({access_token: btoa('{"alg":"HS256"}') + '.' + btoa(JSON.stringify({sub: id, exp})) + '.x',
        refresh_token: 'fixture', expires_at: exp, expires_in: 3600, token_type: 'bearer', user: {id, email: 'fixture@example.test', aud: 'authenticated'}})); }
    Object.defineProperty(navigator, 'geolocation', {value: {getCurrentPosition: ok => ok({coords: {latitude: 37.383, longitude: 127.119, accuracy: 20}})}});
  }, {id});
  return p;
}

try {
  const customer = await pageFor(ids.customer), pro = await pageFor(ids.planner);
  await pro.goto('https://fixture.test/test-pro');
  await pro.getByRole('button', {name: '방문 가능 끄기', exact: true}).click();
  await pro.getByRole('button', {name: '방문 가능 켜기', exact: true}).click();
  await pro.getByRole('checkbox').check();
  await pro.getByRole('button', {name: '위치 사용하고 시작'}).click();
  await expect(pro.getByRole('button', {name: '현재 위치 갱신'})).toBeVisible();

  await customer.goto('https://fixture.test/urgent.html?region=' + encodeURIComponent('경기 분당'));
  await customer.getByRole('button', {name: '이 전문가에게 방문상담 요청'}).first().click();
  await customer.getByLabel('실제 방문 주소·만날 장소').fill('약속안내 장애 테스트 주소');
  await customer.getByLabel('연락 가능한 휴대전화').fill('01000000000');
  await customer.getByRole('checkbox').check();
  await customer.getByRole('button', {name: '방문상담 요청 보내기'}).click();

  // 1) 약속 안내가 500 이어도 방문 내역이 렌더되고 수락 버튼이 보인다
  await pro.getByRole('button', {name: '내역 새로고침'}).click();
  await expect(pro.locator('.urgent-request')).toHaveCount(1);
  await expect(pro.getByRole('button', {name: '희망시간 수락'})).toBeVisible();
  await expect(pro.getByRole('button', {name: '요청 거절'})).toBeVisible();

  // 2) 수락이 실제로 성공한다
  await pro.getByRole('button', {name: '희망시간 수락'}).click();
  await expect(pro.locator('.urgent-request')).toContainText('전문가가 요청을 수락했습니다.');

  // 3) 고객 쪽도 확정 버튼까지 간다
  await customer.getByRole('button', {name: '내역 새로고침'}).click();
  await customer.getByRole('checkbox').check();
  await expect(customer.getByRole('button', {name: '방문 일정 확정', exact: true})).toBeVisible();

  // 3-b) 약속 안내(carePolicy)는 데이터 없이도 그대로 나온다 — 안내가 통째로 사라지지는 않는다
  await expect(pro.locator('.urgent-request, .appointment-policy').first()).toBeVisible();

  // 4) 장애를 실제로 흉내냈는지 (호출이 있었는지) 확인 — 없으면 이 테스트가 무의미하다
  expect(careCalls.length).toBeGreaterThan(0);
  // 5) 화면 오류 없이 진행
  expect(errors).toEqual([]);
  await pro.screenshot({path: 'artifacts/expert-visits-care-outage-390.png', fullPage: true});
  await f.login(ids.planner); await f.urgent('stop');
  console.log('PASS appointment_care 500 중에도: 방문 내역 렌더, 희망시간 수락·요청 거절 노출, 수락 성공, 고객 확정 버튼 노출, 콘솔 오류 없음 (care 호출 ' + careCalls.length + '회).');
} finally { await b.close(); await f.db.close(); }
