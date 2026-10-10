// 전문가 노출·상담 상태 화면: 스위치 표시와 클릭 동작의 일치, 44px 터치 영역,
// 360/390px 레이아웃을 확인하고 캡처를 남긴다.
// 격리 PGlite 로 만든 실제 서버 상태값을 화면에 먹인다. 운영 DB·외부 네트워크·알림 없음.
// 기본은 msedge. Edge 가 없는 환경은 PLAYWRIGHT_CHANNEL='' + PLAYWRIGHT_EXECUTABLE_PATH 로 실행한다.
import {chromium} from '@playwright/test';
import {build} from 'esbuild';
import {mkdir, readFile} from 'node:fs/promises';
import path from 'node:path';
import {setupVisits} from './expert-visits-fixture.mjs';
import {ids} from './commerce-fixture.mjs';

const CHAIN = ['052_optional_expert_profile.sql', '053_connection_review.sql', '054_profile_office_scope.sql',
  '056_booking_hardening.sql', '057_support_conversations.sql', '058_expert_settings.sql', '059_existing_office_hours.sql'];
const out = 'artifacts/expert-settings';
const channel = process.env.PLAYWRIGHT_CHANNEL ?? 'msedge';
const executablePath = process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined;

const f = await setupVisits();
await f.db.exec('reset role');
for (const name of CHAIN) await f.db.exec(await readFile('supabase/' + name, 'utf8'));
await f.db.exec('reset role');
await f.login(ids.planner);
const baseState = await f.db.query("select public.expert_settings('get','{}') v").then(r => r.rows[0].v);
await f.db.exec('reset role');
await f.db.close();

const probe = (await build({entryPoints: ['src/expert-settings.js'], bundle: true, format: 'esm',
  platform: 'browser', target: ['es2020'], write: false})).outputFiles[0].text;

const root = path.resolve('public');
let failed = 0, html = '';
const check = (ok, label) => { if (!ok) { failed++; console.log('FAIL ' + label); } else console.log('CHECK ' + label); };

const harness = state => `<!doctype html><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/type-system.css">
<link rel="stylesheet" href="/account.css"><link rel="stylesheet" href="/urgent.css">
<link rel="stylesheet" href="/expert-settings.css">
<body><main class="container"><div id="host"></div></main>
<script type="module">
import {renderExpertSettings} from '/probe.js';
window.__calls=[];
const state=${JSON.stringify(state)};
const client={rpc:async(name,args)=>{window.__calls.push(args.operation);return {data:{...state,saved:args.operation!=='get'}};}};
await renderExpertSettings(client,document.getElementById('host'));
document.body.dataset.ready='1';
</script></body>`;

const browser = await chromium.launch({headless: true, ...(channel ? {channel} : {}), ...(executablePath ? {executablePath} : {})});
await mkdir(out, {recursive: true});

for (const [width, label] of [[360, '360'], [390, '390']]) {
  const page = await browser.newPage({viewport: {width, height: 820}});
  await page.route('**/*', async route => {
    const u = new URL(route.request().url());
    if (u.pathname === '/view') return route.fulfill({contentType: 'text/html', body: html});
    if (u.pathname === '/probe.js') return route.fulfill({contentType: 'text/javascript', body: probe});
    try { return route.fulfill({path: path.join(root, u.pathname)}); } catch { return route.fulfill({status: 404, body: ''}); }
  });
  const show = async state => { html = harness(state); await page.goto('http://127.0.0.1/view'); await page.waitForSelector('body[data-ready="1"]'); };
  const switches = () => page.$$('#expertPresence .ui-switch');

  // ① 지도 ON / 상담 ON — 두 스위치가 모두 켜져 보인다.
  await show(baseState);
  const sw = await switches();
  check(await sw[0].getAttribute('aria-checked') === 'true', `${label}px 지도 스위치 ON`);
  check(await sw[1].getAttribute('aria-checked') === 'true', `${label}px 지금 방문 스위치 ON`);
  const heights = await page.$$eval('#expertPresence .ui-switch', e => e.map(x => x.getBoundingClientRect().height));
  check(heights.every(h => h >= 44), `${label}px 스위치 터치 영역 44px 이상 (${heights.join(',')})`);
  const btnHeights = await page.$$eval('#expertPresence .btn', e => e.map(x => x.getBoundingClientRect().height));
  check(btnHeights.every(h => h >= 48), `${label}px 주요 버튼 48px 이상 (${btnHeights.join(',')})`);
  check(!await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), `${label}px 가로 스크롤 없음`);
  await page.screenshot({path: `${out}/settings-on-${label}.png`, fullPage: true});

  // ② 위치 유효시간만 만료 — OFF 로 보이고, 눌렀을 때 stop 이 아니라 동의창이 열린다.
  await show({...baseState, visitAvailable: false, locationState: 'expired'});
  const stale = await switches();
  check(await stale[1].getAttribute('aria-checked') === 'false', `${label}px 위치 만료는 OFF 로 표시`);
  await stale[1].click();
  await page.waitForTimeout(200);
  const calls = await page.evaluate(() => window.__calls.filter(c => c !== 'get'));
  check(await page.locator('dialog.interaction-dialog').count() === 1, `${label}px 위치 만료 클릭에 동의창 열림`);
  check(calls.length === 0, `${label}px 위치 만료 클릭이 stop 을 호출하지 않음 (calls=${calls.join('|') || '없음'})`);
  await page.screenshot({path: `${out}/settings-expired-${label}.png`, fullPage: true});

  // ③ 승인 대기 — 지도 스위치 비활성 + 안내 문구.
  await show({...baseState, eligible: false, mapVisible: false, visitAvailable: false});
  const pending = await switches();
  check(await pending[0].isDisabled(), `${label}px 승인 대기 시 지도 스위치 비활성`);
  check((await page.textContent('#expertPresence')).includes('승인 후 지도에 표시됩니다'), `${label}px 승인 대기 안내 문구`);
  await page.screenshot({path: `${out}/settings-pending-${label}.png`, fullPage: true});

  // ④ 진행 중 방문 — 사실대로 안내하고 스위치를 잠근다.
  await show({...baseState, visitAvailable: false, visitInProgress: true});
  const busy = await switches();
  check(await busy[1].isDisabled(), `${label}px 진행 중 방문이면 지금 방문 스위치 비활성`);
  check((await page.textContent('#expertPresence')).includes('진행 중인 방문이 있어 새 요청을 받지 않습니다'), `${label}px 진행 중 방문 안내`);
  await page.screenshot({path: `${out}/settings-visit-in-progress-${label}.png`, fullPage: true});
  await page.close();
}

await browser.close();
console.log(failed ? `FAIL ${failed} checks` : 'PASS expert settings: 스위치 표시와 클릭 동작 일치, 44/48px, 가로 스크롤 없음. 캡처 ' + out);
process.exit(failed ? 1 : 0);
