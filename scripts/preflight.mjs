#!/usr/bin/env node
// 배포 전 환경변수/설정 프리플라이트. 읽기 전용. 시크릿 값은 절대 출력하지 않는다.
// 사용: (환경변수 설정 후) node scripts/preflight.mjs [--net]
//   --net : Supabase URL 도달성(HEAD)까지 확인. 없으면 형식 검증만.
// 종료코드: 모든 필수 통과 시 0, 하나라도 실패 시 1.

const env = (k) => process.env[k] ?? '';
const results = [];
const add = (ok, label, detail = '') => results.push({ ok, label, detail });
const present = (k) => env(k).trim().length > 0;

// --- 계정/Supabase ---
add(present('SUPABASE_URL') && /^https:\/\//.test(env('SUPABASE_URL')), 'SUPABASE_URL', 'https URL 필요');
const pub = env('SUPABASE_PUBLISHABLE_KEY');
const pubOk = pub.startsWith('sb_publishable_') || (pub.split('.').length === 3 && (() => {
  try { return JSON.parse(Buffer.from(pub.split('.')[1], 'base64url').toString()).role === 'anon'; } catch { return false; }
})());
add(pubOk, 'SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_ 또는 anon JWT (공개키)');
add(present('SUPABASE_SERVICE_ROLE_KEY'), 'SUPABASE_SERVICE_ROLE_KEY', '서버 전용, 값 미검사(존재만)');
add(!pub.includes(env('SUPABASE_SERVICE_ROLE_KEY') || '\0nope') , '공개키≠서비스롤키', '공개키에 서비스롤키가 섞이지 않았는지');

// --- 운영 정보 ---
add(present('OPERATOR_NAME'), 'OPERATOR_NAME', '실제 운영 주체');
add(present('PRIVACY_CONTACT'), 'PRIVACY_CONTACT', '개인정보 문의처');

// --- 결제(토스, 테스트 전용) ---
add(env('TOSS_MODE') === 'test', 'TOSS_MODE=test', '라이브는 이 코드에서 차단');
add(env('TOSS_CLIENT_KEY').startsWith('test_ck_'), 'TOSS_CLIENT_KEY', 'test_ck_ 접두사');
add(env('TOSS_SECRET_KEY').startsWith('test_sk_'), 'TOSS_SECRET_KEY', 'test_sk_ 접두사 (서버 전용)');

// --- origin ---
let originOk = false;
try {
  const u = new URL(env('APP_ORIGIN'));
  originOk = u.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(u.hostname);
} catch {}
add(originOk, 'APP_ORIGIN', 'https 또는 localhost origin');

// --- 활성화 플래그 (배포 게이트) ---
const flag = (k) => env(k) === 'true';
add(true, `ACCOUNTS_ENABLED=${flag('ACCOUNTS_ENABLED')}`, flag('ACCOUNTS_ENABLED') ? '회원 기능 ON' : 'OFF (가입 비활성)');
add(true, `POLICIES_APPROVED=${flag('POLICIES_APPROVED')}`, flag('POLICIES_APPROVED') ? '약관 확정됨' : 'OFF (약관 미확정)');
add(true, `PAYMENTS_ENABLED=${flag('PAYMENTS_ENABLED')}`, flag('PAYMENTS_ENABLED') ? '테스트 결제 ON' : 'OFF');
add(true, `MATCHING_WORKER_ENABLED=${flag('MATCHING_WORKER_ENABLED')}`, '');
add(true, `VISIT_METRICS_ENABLED=${flag('VISIT_METRICS_ENABLED')}`, '');

// 상호 일관성 경고 (실패 아님)
const warns = [];
if (flag('PAYMENTS_ENABLED') && !flag('ACCOUNTS_ENABLED')) warns.push('PAYMENTS_ENABLED=true 인데 ACCOUNTS_ENABLED=false — 로그인 없이는 결제 불가');
if (flag('ACCOUNTS_ENABLED') && !flag('POLICIES_APPROVED')) warns.push('ACCOUNTS_ENABLED=true 인데 POLICIES_APPROVED=false — 약관 확정 전 가입 활성');

// --- 출력 ---
let failed = 0;
console.log('보험소 배포 프리플라이트 (읽기 전용, 시크릿 미출력)\n');
for (const r of results) {
  // 정보성(플래그) 항목은 ok=true로 넣었으니 상태표시만 구분
  const isInfo = /=(true|false)$/.test(r.label);
  if (!isInfo && !r.ok) failed++;
  const mark = isInfo ? 'ℹ' : (r.ok ? '✔' : '✗');
  console.log(`  ${mark} ${r.label}${r.detail ? '  — ' + r.detail : ''}`);
}
if (warns.length) { console.log('\n경고:'); for (const w of warns) console.log('  ⚠ ' + w); }

// --net: Supabase 도달성만 (키 노출 없음)
if (process.argv.includes('--net') && /^https:\/\//.test(env('SUPABASE_URL'))) {
  try {
    const res = await fetch(env('SUPABASE_URL') + '/auth/v1/health', { method: 'GET', signal: AbortSignal.timeout(8000) });
    console.log(`\n네트워크: Supabase ${res.status < 500 ? '도달 가능' : '오류'} (status ${res.status})`);
  } catch (e) {
    console.log('\n네트워크: Supabase 도달 실패 — ' + e.message);
    failed++;
  }
}

console.log(`\n결과: 필수 ${results.filter(r => !/=(true|false)$/.test(r.label)).length - failed}/${results.filter(r => !/=(true|false)$/.test(r.label)).length} 통과${failed ? `, 실패 ${failed}` : ''}.`);
process.exit(failed ? 1 : 0);
