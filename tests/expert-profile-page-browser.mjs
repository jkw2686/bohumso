import PW_LAUNCH from './playwright-launch.cjs';
// A-4 검증. partner.html 첫 화면 구성과 카드 펼침·저장·요약 갱신.
// 실제 번들·실제 페이지 + 격리 DB. 운영 데이터·알림·결제 없음.
import {chromium, expect} from '@playwright/test';
import {readFile, mkdir} from 'node:fs/promises';
import path from 'node:path';
import {setupCare, ids} from './appointment-care-fixture.mjs';

const f = await setupCare(), browser = await chromium.launch(PW_LAUNCH);
await mkdir('artifacts', {recursive: true});
const origin = 'https://profile.fixture.test', auth = 'https://auth.fixture.test';
const errors = [];
let failed = 0;
const check = (ok, label) => { if (!ok) { failed++; console.log('FAIL ' + label); } else console.log('CHECK ' + label); };

function sessionFor(actor) {
  const user = {id: actor, email: 'profile@example.test', aud: 'authenticated'};
  const exp = Math.floor(Date.now() / 1000) + 3600;
  return {user, session: {access_token: Buffer.from('{"alg":"HS256"}').toString('base64url') + '.' +
    Buffer.from(JSON.stringify({sub: actor, exp})).toString('base64url') + '.fixture',
    refresh_token: 'fixture', expires_at: exp, expires_in: 3600, token_type: 'bearer', user}};
}

async function open(actor) {
  const {user, session} = sessionFor(actor);
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
    if (u.pathname.endsWith('/token')) return r.fulfill({json: session});
    const name = u.pathname.split('/').pop(), args = r.request().postDataJSON() || {};
    try { await f.login(actor); return r.fulfill({json: await f.rpc(name, Object.values(args))}); }
    catch (e) { return r.fulfill({status: 400, json: {message: e.message, code: e.code}}); }
  });
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(e.message));
  return {context, page};
}

try {
  const {context, page} = await open(ids.planner);
  await page.goto(origin + '/partner.html');
  await expect(page.locator('#accountContent')).toBeVisible();

  // 1) 지금 방문 카드가 맨 위 + 첫 화면 안에 조작 버튼
  const order = await page.$$eval('#accountContent h2', h => h.map(x => x.textContent.trim()));
  check(order[0] === '지금 방문 상담 가능', `① 지금 방문 카드가 맨 위 (${order.slice(0, 4).join(' / ')})`);
  const toggleBtn = page.getByRole('button', {name: /방문 가능 (켜기|끄기)/});
  await expect(toggleBtn).toBeVisible();
  const box = await toggleBtn.boundingBox();
  check(box.y + box.height <= 844, `① 390x844 첫 화면 안에 켜기/끄기 버튼 (하단 ${Math.round(box.y + box.height)}px)`);
  check(box.height >= 48, `① 버튼 48px 이상 (${Math.round(box.height)}px)`);
  await page.screenshot({path: 'artifacts/expert-profile-page-390-top.png'});

  // 6) ▶ 접힘 요소가 이 화면에 없다 (미리보기용 내부 details 는 폼 안이므로 펼치기 전에 확인)
  // 카드 레벨 ▶ 는 모두 없애는 것이 이번 변경이다.
  // 폼 안의 '지도에 보이는 프로필 미리보기' 는 optional-profile 폼 내부라 수정 금지 범위이고,
  // 폼을 열기 전에는 보이지도 않는다. 그 하나만 예외로 허용하고 나머지는 0이어야 한다.
  const cardLevel = await page.$$eval('#accountContent details',
    d => d.filter(x => !x.closest('#optionalProfileBody,#consultSettingsBody'))
          .map(x => (x.querySelector('summary')?.textContent || '').trim()));
  check(cardLevel.length === 0, `⑥ 카드 레벨 ▶ 접힘 없음 — 남은 것: ${cardLevel.join(' / ') || '없음'}`);
  const visibleDetails = await page.$$eval('#accountContent details',
    d => d.filter(x => x.getBoundingClientRect().height > 0).map(x => (x.querySelector('summary')?.textContent || '').trim()));
  check(visibleDetails.length === 0, `⑥ 첫 화면에 보이는 ▶ 없음 — 남은 것: ${visibleDetails.join(' / ') || '없음'}`);

  // 2) 순서: 지금 방문 → … → 주활동지역 → 지도 프로필 → 상담 요청·연락처
  const idx = t => order.indexOf(t);
  check(idx('주활동지역') > 0 && idx('지도 프로필') > idx('주활동지역') && idx('상담 요청·연락처') > idx('지도 프로필'),
    `② 카드 순서 (${order.join(' / ')})`);

  // 3) 지도 프로필: 입력 전 버튼 문구 → 펼침 → 저장 → 문구·요약 갱신
  const mapCard = page.locator('.optional-profile');
  const mapToggle = mapCard.getByRole('button', {name: /^(프로필 입력|프로필 수정|입력 닫기)$/});
  const before = (await mapToggle.textContent()).trim();
  check(['프로필 입력', '프로필 수정'].includes(before), `③ 펼치기 전 버튼 문구 (${before})`);
  check(await mapCard.locator('#optionalProfileBody').isVisible() === false, '③ 폼은 기본 접힘');
  await mapToggle.click();
  check(await mapCard.locator('#optionalProfileBody').isVisible(), '③ 버튼을 누르면 같은 카드 안에서 폼 펼침');
  check(await mapToggle.getAttribute('aria-expanded') === 'true', '③ aria-expanded=true');
  check((await mapToggle.textContent()).trim() === '입력 닫기', '③ 펼친 뒤 버튼 문구 입력 닫기');
  await mapCard.getByLabel('소개 인사말 (선택 · 40자)').fill('청구 서류부터 같이 확인해 드려요');
  await mapCard.getByRole('button', {name: '저장하기'}).click();
  await expect(mapCard.locator('.profile-status')).toContainText('저장');
  check(await mapCard.locator('#optionalProfileBody').isVisible() === false, '③ 저장 성공 후 폼 닫힘');
  check((await mapToggle.textContent()).trim() === '프로필 수정', '③ 저장 후 버튼 문구 프로필 수정');
  check((await mapCard.locator('.profile-summary').textContent()).includes('청구 서류부터'), '③ 요약에 소개 첫 줄 반영');
  await mapCard.screenshot({path: 'artifacts/expert-profile-page-390-mapcard.png'});

  // 4) 상담 설정: 요약 정확(연락처 뒤 4자리), 펼쳐 저장 후 요약 갱신
  const setCard = page.locator('.consult-settings');
  const setToggle = setCard.getByRole('button', {name: /^(상담 설정 변경|설정 닫기)$/});
  check((await setCard.locator('.profile-summary').textContent()).includes('상담 요청 받기 ·'), '④ 요약에 상담 요청 받기 상태');
  await setToggle.click();
  await setCard.getByLabel('예약 확정 후 공개할 상담 연락처').fill('010-2222-3456');
  const avail = setCard.getByLabel('상담 요청 받기');
  if (!await avail.isChecked()) await avail.check();
  await setCard.getByRole('button', {name: '프로필 저장'}).click();
  await expect(setCard.locator('.profile-status')).toContainText('저장');
  const sum = await setCard.locator('.profile-summary').textContent();
  check(sum.includes('010-****-3456'), `④ 연락처 뒤 4자리만 (${sum.replace(/\s+/g, ' ').trim()})`);
  check(sum.includes('켜짐'), '④ 저장 후 요약 갱신');
  check(await setCard.locator('#consultSettingsBody').isVisible() === false, '④ 저장 후 폼 닫힘');
  await mapCard.screenshot({path: 'artifacts/expert-profile-page-390-form.png'});

  // 5) 하단 이동 링크
  const last = await page.$eval('#accountContent', n => n.lastElementChild.textContent.trim());
  check(last.includes('받은 요청·예약 보기'), `⑤ 맨 아래 이동 링크 (${last})`);
  check(await page.getByText('주활동지역 · 지금 가능 설정').count() === 0, '⑤ 옛 설정 링크 제거');

  // 7) 가로 넘침·버튼 높이
  for (const width of [360, 390, 430, 1440]) {
    await page.setViewportSize({width, height: 844});
    check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `⑦ ${width}px 가로 넘침 없음`);
  }
  await page.setViewportSize({width: 390, height: 844});
  const heights = await page.$$eval('#accountContent .btn.profile-toggle', b => b.map(x => Math.round(x.getBoundingClientRect().height)));
  check(heights.length === 2 && heights.every(h => h >= 48), `⑦ 카드 버튼 48px 이상 (${heights.join(',')})`);

  // 6) 키보드: Tab 으로 닿고 Enter 로 펼쳐진다
  await setToggle.focus();
  await page.keyboard.press('Enter');
  check(await setCard.locator('#consultSettingsBody').isVisible(), '⑥ Enter 로 펼침');
  check(await page.evaluate(() => { const a = document.activeElement; return !!a && a.closest('#consultSettingsBody') !== null; }), '⑥ 펼친 뒤 폼 안으로 포커스 이동');
  await context.close();

  // 5) 승인 전 계정: 카드 대신 안내 한 줄
  const pre = await open(ids.customer);
  await pre.page.goto(origin + '/partner.html');
  await pre.page.waitForTimeout(1200);
  const text = await pre.page.locator('body').textContent();
  check(!text.includes('지금 방문 상담 가능'), '⑤ 승인 전에는 지금 방문 카드 없음');
  check(text.includes('승인 후 지금 방문 상담을 켤 수 있어요'), '⑤ 승인 전 안내 한 줄');
  await pre.page.screenshot({path: 'artifacts/expert-profile-page-390-pending.png'});
  await pre.context.close();

  check(errors.length === 0, `콘솔 오류 없음 (${errors.join(' | ') || '없음'})`);
  console.log(failed ? `FAIL ${failed} checks` : 'PASS partner.html A-4: 카드 순서·첫 화면 노출·펼침/저장/요약·연락처 마스킹·승인 전 안내·접힘 제거·키보드·4폭. 캡처 artifacts/expert-profile-page-390-*.png');
} finally { await browser.close(); await f.db.close(); }
process.exit(failed ? 1 : 0);
