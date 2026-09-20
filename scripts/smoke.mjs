#!/usr/bin/env node
// 배포 연결 스모크 테스트. 읽기 전용. 시크릿 값은 절대 출력하지 않는다.
// 프리플라이트(형식 검증) 다음에, 키를 설정한 뒤 실제 도달성을 확인한다.
//
// 사용:
//   SUPABASE_URL=... SUPABASE_PUBLISHABLE_KEY=... node scripts/smoke.mjs
//   옵션:
//     --config https://앱-origin   : /api/config 엔드포인트 확인
//     --toss                        : TOSS_SECRET_KEY(test_gsk_)로 토스 인증 확인(외부 호출)
//
// 종료코드: 필수 확인 모두 통과 0, 하나라도 실패 1.

const env = (k) => process.env[k] ?? '';
const args = process.argv.slice(2);
const getOpt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const has = (name) => args.includes(name);

let failed = 0;
const line = (ok, label, detail = '') => { if (ok === false) failed++; console.log(`  ${ok === null ? 'ℹ' : ok ? '✔' : '✗'} ${label}${detail ? '  — ' + detail : ''}`); };
const timeout = () => AbortSignal.timeout(10000);

console.log('보험소 배포 스모크 테스트 (읽기 전용, 시크릿 미출력)\n');

const url = env('SUPABASE_URL').replace(/\/$/, '');
const anon = env('SUPABASE_PUBLISHABLE_KEY');
if (!/^https:\/\//.test(url) || !anon) {
  line(false, 'SUPABASE_URL/SUPABASE_PUBLISHABLE_KEY', '필수 — 형식 오류 또는 미설정. 프리플라이트 먼저.');
  console.log('\n결과: 필수 설정 없음. 중단.'); process.exit(1);
}

// 1) Supabase Auth health
try {
  const r = await fetch(url + '/auth/v1/health', { signal: timeout() });
  line(r.status < 500, 'Supabase Auth health', `status ${r.status}`);
} catch (e) { line(false, 'Supabase Auth health', e.message); }

// 2) PostgREST 도달성 (anon 키)
try {
  const r = await fetch(url + '/rest/v1/', { headers: { apikey: anon }, signal: timeout() });
  line(r.status < 500, 'PostgREST 도달', `status ${r.status}`);
} catch (e) { line(false, 'PostgREST 도달', e.message); }

// 3) 공개 RPC planner_catalog (마이그레이션 적용 + anon 실행권한 확인)
try {
  const r = await fetch(url + '/rest/v1/rpc/planner_catalog', {
    method: 'POST',
    headers: { apikey: anon, Authorization: 'Bearer ' + anon, 'Content-Type': 'application/json' },
    body: JSON.stringify({ area: '', wanted: '' }), signal: timeout(),
  });
  if (r.ok) {
    const data = await r.json();
    const okShape = data && typeof data === 'object' && Array.isArray(data.planners);
    line(okShape, 'RPC planner_catalog', okShape ? `planners 배열 반환 (마이그레이션 OK, 등록 설계사 ${data.planners.length}명)` : '형태 예상과 다름');
  } else if (r.status === 404) {
    line(false, 'RPC planner_catalog', '404 — 마이그레이션(003) 미적용으로 보임');
  } else {
    line(false, 'RPC planner_catalog', `status ${r.status} — 권한/스키마 점검`);
  }
} catch (e) { line(false, 'RPC planner_catalog', e.message); }

// 4) (옵션) /api/config
const base = getOpt('--config');
if (base) {
  try {
    const r = await fetch(base.replace(/\/$/, '') + '/api/config', { signal: timeout() });
    const data = await r.json().catch(() => ({}));
    line(r.ok, '/api/config', r.ok ? `enabled=${data.enabled}` : `status ${r.status}`);
    if (data && 'key' in data && String(data.key).includes(env('SUPABASE_SERVICE_ROLE_KEY') || '\0none')) {
      line(false, '/api/config 시크릿 노출', '서비스롤 키가 응답에 포함됨 — 즉시 점검!');
    }
  } catch (e) { line(false, '/api/config', e.message); }
} else {
  line(null, '/api/config', '건너뜀 (--config <origin> 로 활성화)');
}

// 5) (옵션) 토스 인증 확인 — 존재하지 않는 주문 조회로 키 인증만 검증
if (has('--toss')) {
  const sk = env('TOSS_SECRET_KEY');
  if (env('TOSS_MODE') !== 'test' || !sk.startsWith('test_gsk_')) {
    line(false, '토스 인증', 'TOSS_MODE=test 및 test_gsk_ 키 필요');
  } else {
    try {
      const r = await fetch('https://api.tosspayments.com/v1/payments/orders/boh_smoke_nonexistent_1', {
        headers: { Authorization: 'Basic ' + Buffer.from(sk + ':').toString('base64') }, signal: timeout(),
      });
      const data = await r.json().catch(() => ({}));
      // 인증 실패면 401/UNAUTHORIZED, 인증 성공+없는 주문이면 NOT_FOUND 계열
      const authOk = r.status !== 401 && data.code !== 'UNAUTHORIZED_KEY';
      line(authOk, '토스 인증', authOk ? `키 인증 OK (code ${data.code || r.status})` : '키 인증 실패');
    } catch (e) { line(false, '토스 인증', e.message); }
  }
} else {
  line(null, '토스 인증', '건너뜀 (--toss 로 활성화, 외부 호출)');
}

console.log(`\n결과: ${failed ? `실패 ${failed}건 — 위 항목 점검` : '모든 필수 확인 통과'}.`);
process.exit(failed ? 1 : 0);
