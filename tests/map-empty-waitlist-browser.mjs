// 빈 지역 화면의 오픈 알림 신청 연결 검증 + 360/390 캡처.
// 지도 데이터와 openRegionWaitlist 는 가로채고, 운영 신청 데이터를 만들지 않는다.
// 기본은 msedge. Edge 가 없는 환경은 PLAYWRIGHT_CHANNEL='' + PLAYWRIGHT_EXECUTABLE_PATH 로 실행한다.
import {chromium} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
import path from 'node:path';

const out = 'artifacts/map-empty-waitlist';
const root = path.resolve('public');
const channel = process.env.PLAYWRIGHT_CHANNEL ?? 'msedge';
const executablePath = process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined;
let failed = 0;
const check = (ok, label) => { if (!ok) { failed++; console.log('FAIL ' + label); } else console.log('CHECK ' + label); };

const browser = await chromium.launch({headless: true, ...(channel ? {channel} : {}), ...(executablePath ? {executablePath} : {})});
await mkdir(out, {recursive: true});

async function openMap(page, {withMember = true} = {}) {
  await page.route('**/*', async route => {
    const u = new URL(route.request().url());
    if (u.pathname === '/assets/member.js') {
      // member.js 는 module 이라 지도보다 늦게 준비될 수 있다. withMember=false 로 그 상황을 재현한다.
      return route.fulfill({contentType: 'text/javascript',
        body: withMember ? 'window.openRegionWaitlist=function(o){window.__waitlist=o;};' : ''});
    }
    if (u.pathname.startsWith('/assets/')) return route.fulfill({contentType: 'text/javascript', body: ''});
    if (u.pathname === '/api/config') return route.fulfill({json: {enabled: true, url: 'https://stub.test', key: 'stub'}});
    if (u.pathname.startsWith('/api/')) return route.fulfill({json: {}});
    if (u.hostname.endsWith('tile.openstreetmap.org')) return route.fulfill({status: 204, body: ''});
    try { await route.fulfill({path: path.join(root, u.pathname)}); } catch { await route.fulfill({status: 404, body: ''}); }
  });
  await page.addInitScript(() => {
    window.bohumsoCatalog = async area => ({planners: area === '서울 마포구'
      ? [{id: 'p1', name: '가상 전문가', organization: '테스트 소속', region: '서울 마포구',
          area_latitude: 37.566, area_longitude: 126.902, specialties: ['claim'], available: true,
          availability_status: 'scheduled', reviews: [], offices: [], is_sample: false}] : []});
    window.bohumsoOffices = async () => [];
  });
  // 기본 보기는 오픈 예정 보험소(PLANNED)가 함께 떠서 비지 않는다.
  // 빈 상태가 실제로 보이는 경로는 전문가 보기다.
  await page.goto('http://127.0.0.1/map.html?view=experts');
  // 목록 시트는 접힌 상태로 시작한다. 지역을 고르면 applyRegion 이 showList 로 펼친다.
  await page.waitForSelector('#listBody', {state: 'attached'});
}

async function pickRegion(page, city, gu) {
  await page.selectOption('#regionCity', city);
  if (gu) await page.selectOption('#regionGu', gu);
  else await page.click('#regionApply');
  await page.waitForTimeout(400);
  // 목록 시트가 접혀 있으면 펼친다(실사용에서는 사용자가 손잡이를 올린다).
  if (!await page.locator('#listBody').isVisible()) {
    await page.click('#listGrip');
    await page.waitForTimeout(300);
  }
}

for (const [width, label] of [[360, '360'], [390, '390']]) {
  const page = await browser.newPage({viewport: {width, height: 780}});
  page.on('pageerror', e => { failed++; console.log('FAIL 콘솔 오류: ' + e.message); });
  await openMap(page);

  // 1) 빈 지역 → 문구 + 버튼 3개
  await pickRegion(page, '서울', '종로구');
  const text = await page.textContent('#listSheet');
  check(text.includes('아직 이 지역에 등록된 전문가가 없어요'), `${label}px 빈 지역 문구`);
  const labels = await page.$$eval('#listBody .empty-actions .btn', e => e.map(x => x.textContent.trim()));
  check(labels.length === 3 && labels[0] === '오픈 알림 신청' && labels[1] === '이 지역에서 활동하고 싶어요'
    && labels[2] === '전체 지역 전문가 보기', `${label}px 버튼 3개 (${labels.join(' / ')})`);
  await page.screenshot({path: `${out}/empty-${label}.png`, fullPage: false});

  // 8) 48px, 가로 스크롤
  const heights = await page.$$eval('#listBody .empty-actions .btn', e => e.map(x => x.getBoundingClientRect().height));
  check(heights.every(h => h >= 48), `${label}px 버튼 48px 이상 (${heights.join(',')})`);
  check(!await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), `${label}px 가로 스크롤 없음`);

  // 2) 오픈 알림 신청 → consumer
  await page.click('#listBody .empty-actions .btn >> nth=0');
  let sent = await page.evaluate(() => window.__waitlist);
  check(sent && sent.region === '서울 종로구' && sent.role === 'consumer', `${label}px 신청 지역·role (${JSON.stringify(sent)})`);

  // 3) 활동 신청 → planner
  await page.evaluate(() => { window.__waitlist = null; });
  await page.click('#listBody .empty-actions .btn >> nth=1');
  sent = await page.evaluate(() => window.__waitlist);
  check(sent && sent.region === '서울 종로구' && sent.role === 'planner', `${label}px 활동 신청 role`);

  // 5) 지역 변경 → 새 지역으로 신청
  await page.evaluate(() => { window.__waitlist = null; });
  await pickRegion(page, '서울', '성동구');
  await page.click('#listBody .empty-actions .btn >> nth=0');
  sent = await page.evaluate(() => window.__waitlist);
  check(sent && sent.region === '서울 성동구', `${label}px 지역 변경 후 새 지역으로 신청 (${sent && sent.region})`);

  // 4) 시만 선택 → 구 선택 안내
  await pickRegion(page, '인천', '');
  const hint = await page.textContent('#listBody');
  check(hint.includes('구를 선택하면 오픈 알림을 신청할 수 있어요'), `${label}px 시만 선택 시 구 선택 안내`);
  const only = await page.$$eval('#listBody .empty-actions .btn', e => e.map(x => x.textContent.trim()));
  check(!only.includes('오픈 알림 신청'), `${label}px 시만 선택이면 신청 버튼 없음`);
  await page.screenshot({path: `${out}/city-only-${label}.png`, fullPage: false});

  // 6) 전문가가 있는 지역 → 기존 목록 그대로
  await pickRegion(page, '서울', '마포구');
  check(await page.$$eval('#listBody .empty-actions', e => e.length) === 0, `${label}px 전문가 있는 지역은 빈 안내 없음`);
  check((await page.textContent('#listCount')).indexOf('없어요') < 0, `${label}px 전문가 있는 지역 목록 문구 유지`);
  await page.screenshot({path: `${out}/with-expert-${label}.png`, fullPage: false});
  await page.close();
}

// 7) member.js 로드 전 클릭 → 안내 문구, 콘솔 오류 없음
{
  const page = await browser.newPage({viewport: {width: 390, height: 780}});
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await openMap(page, {withMember: false});
  await pickRegion(page, '서울', '종로구');
  await page.click('#listBody .empty-actions .btn >> nth=0');
  const after = await page.textContent('#listBody .empty-actions .btn >> nth=0');
  check(after.includes('잠시 후 다시 눌러 주세요'), `member.js 미준비 시 안내 문구 (${after.trim()})`);
  check(errors.length === 0, `member.js 미준비 시 콘솔 오류 없음 (${errors.join('|') || '없음'})`);
  await page.close();
}

await browser.close();
console.log(failed ? `FAIL ${failed} checks` : 'PASS map empty waitlist: 문구·버튼·지역값·전환·폴백·48px. 캡처 ' + out);
process.exit(failed ? 1 : 0);
