#!/usr/bin/env node
// 동시성 부하검사 — 실제 PostgreSQL의 다중 동시 연결로 경합 불변식을 검증한다.
// PGlite(직렬 단일 연결)로는 검증 불가한, 락/제약의 진짜 동시성 안전을 확인한다.
//
// 대상: **일회용(폐기 가능) PostgreSQL** 을 쓴다. 운영/공용 DB에 실행하지 말 것.
//   예) docker run --rm -e POSTGRES_PASSWORD=pw -p 5432:5432 postgres:16
//       DATABASE_URL=postgres://postgres:pw@localhost:5432/postgres
// 스크립트는 전용 스키마에 setup을 하고, 끝나면 정리한다(--keep로 보존).
//
// 사용: DATABASE_URL=postgres://... node scripts/concurrency-test.mjs [--customers 6] [--keep]
// 사전: `npm i` 로 devDependency `pg` 설치.
// 종료코드: 모든 불변식 통과 0, 위반/오류 1.

import { readFile } from 'node:fs/promises';
import pg from 'pg';

const CONN = process.env.DATABASE_URL;
if (!CONN) { console.error('DATABASE_URL 필요 (일회용 Postgres).'); process.exit(1); }
const N = Math.max(3, parseInt(process.argv[getFlagIdx('--customers') + 1] || '6', 10));
const KEEP = process.argv.includes('--keep');
function getFlagIdx(f) { const i = process.argv.indexOf(f); return i >= 0 ? i : -1; }

const uuid = (a, b) => `${a}0000000-0000-4000-8000-0000000000${String(b).padStart(2, '0')}`;
const plannerId = uuid('2', 1);
const adminId = uuid('3', 1);
const customerIds = Array.from({ length: N }, (_, i) => uuid('1', i + 1));
const slot = (n) => new Date(Math.ceil((Date.now() + 86400000) / 1800000) * 1800000 + n * 1800000).toISOString();

const admin = new pg.Client({ connectionString: CONN });
let failures = 0;
const assert = (ok, label, detail = '') => { if (!ok) failures++; console.log(`  ${ok ? '✔' : '✗'} ${label}${detail ? '  — ' + detail : ''}`); };

async function asUser(client, id, role = 'authenticated') {
  await client.query('reset role');
  await client.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
  await client.query('set role ' + role);
}
const rpc = (client, name, args) => client.query(`select public.${name}(${args.map((_, i) => '$' + (i + 1)).join(',')}) result`, args).then(r => r.rows[0].result);

async function setup() {
  await admin.connect();
  // 역할은 클러스터 전역 — 이미 있으면(Supabase 등) 건너뛴다.
  await admin.query(`do $$ begin
    if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if;
    if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
    if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role; end if;
  end $$;`);
  await admin.query("create schema if not exists auth");
  await admin.query("create table if not exists auth.users(id uuid primary key,email_confirmed_at timestamptz)");
  await admin.query("create or replace function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$");
  await admin.query("grant usage on schema auth to authenticated");
  for (const f of ['001_accounts', '002_requests', '003_consultations', '004_payment_ledger', '005_matching_worker', '006_metrics']) {
    await admin.query(await readFile('supabase/' + f + '.sql', 'utf8'));
  }
  // 사용자/멤버십 시드
  for (const id of [...customerIds, plannerId, adminId]) await admin.query('insert into auth.users values($1,now()) on conflict do nothing', [id]);
  await admin.query('insert into private.admin_memberships values($1) on conflict do nothing', [adminId]);
  for (const id of [...customerIds, plannerId, adminId]) { await asUser(admin, id); await rpc(admin, 'complete_membership', [true, true, true, false]); }
  // 설계사 승인+검증
  await asUser(admin, plannerId);
  await rpc(admin, 'apply_partner', ['부하검사 설계사', 'planner', '테스트 소속', '서울 마포구', 'LOADTEST-P', true]);
  await rpc(admin, 'consultation_command', ['profile', { specialties: ['claim', 'coverage'], biography: 'x', experience: 0, hours: 'x', available: true, phone: '01000000000', latitude: 37.566, longitude: 126.902 }]);
  await asUser(admin, adminId);
  await rpc(admin, 'review_partner', [plannerId, 'approved', '부하검사 전용']);
  await rpc(admin, 'consultation_command', ['verify_planner', { planner_id: plannerId, identity_key: 'LOADTEST-REG', evidence: '테스트 데이터', checked: true, is_sample: true }]);
}

// 각 고객: 자기 booking을 'coordinating' 상태(설계사 accept 완료)까지 진행. distinct slot.
async function seedBookings(distinctSlots) {
  const ids = [];
  for (let i = 0; i < N; i++) {
    await asUser(admin, customerIds[i]);
    const r = await rpc(admin, 'consultation_command', ['request', { planner_id: plannerId, purpose: 'claim', region: '서울 마포구', method: 'nearby', preferred_at: distinctSlots ? slot(i + 1) : slot(1), automatic: false }]);
    const id = r.id;
    await asUser(admin, plannerId);
    const pol = (await admin.query('select id from private.connection_policies order by id desc limit 1')).rows[0].id;
    await rpc(admin, 'consultation_command', ['accept', { id, revision: 1, policy_id: pol, paid_consent: false }]);
    ids.push(id);
  }
  return ids;
}

// 동시에 confirm — 각자 전용 커넥션.
async function concurrentConfirm(bookingIds) {
  const clients = customerIds.map(() => new pg.Client({ connectionString: CONN }));
  await Promise.all(clients.map(c => c.connect()));
  try {
    const results = await Promise.allSettled(bookingIds.map(async (id, i) => {
      await asUser(clients[i], customerIds[i]);
      return rpc(clients[i], 'consultation_command', ['confirm', { id, revision: 2, share_consent: true, name: '홍길동', phone: '01011112222' }]);
    }));
    return results;
  } finally { await Promise.all(clients.map(c => c.end())); }
}

async function run() {
  console.log('보험소 동시성 부하검사 (실 PostgreSQL 다중 연결)\n');
  await setup();
  const policy = (await admin.query('select free_meetings from private.connection_policies order by id desc limit 1')).rows[0].free_meetings;

  // 불변식 1: 무료 쿠폰 과다배정 방지 (distinct slot, 동시 confirm)
  console.log(`[1] 무료 쿠폰 과다배정 — 고객 ${N}명 동시 confirm, free_meetings=${policy}`);
  const ids1 = await seedBookings(true);
  const res1 = await concurrentConfirm(ids1);
  const freeCount = (await admin.query("select count(*)::int n from private.consultations where planner_id=$1 and is_free=true", [plannerId])).rows[0].n;
  const reserved = (await admin.query("select count(*)::int n from private.consultations where planner_id=$1 and coupon_state='reserved'", [plannerId])).rows[0].n;
  const ok1 = res1.filter(r => r.status === 'fulfilled').length;
  assert(freeCount === Math.min(policy, N), `is_free=true 개수 == ${Math.min(policy, N)}`, `실제 ${freeCount}`);
  assert(reserved === Math.min(policy, N), `coupon reserved == ${Math.min(policy, N)} (과다배정 없음)`, `실제 ${reserved}`);
  // paid_consent=false 이므로 한도 초과분은 planner_price_consent_required 로 거부돼야 정상.
  assert(ok1 === Math.min(policy, N), `무료 confirm 성공 == ${Math.min(policy, N)} (초과분 거부)`, `실제 성공 ${ok1}/${N}`);

  // 불변식 2: 슬롯 이중예약 방지 (동일 slot, 동시 confirm)
  console.log('\n[2] 슬롯 이중예약 — 동일 설계사·동일 시간 동시 confirm');
  // 새 설계사 세션 없이, 같은 시간으로 2건만 사용
  const two = customerIds.slice(0, 2);
  const bookingsSameSlot = [];
  for (let i = 0; i < 2; i++) {
    await asUser(admin, two[i]);
    const r = await rpc(admin, 'consultation_command', ['request', { planner_id: plannerId, purpose: 'claim', region: '서울 마포구', method: 'nearby', preferred_at: slot(100), automatic: false }]);
    await asUser(admin, plannerId);
    const pol = (await admin.query('select id from private.connection_policies order by id desc limit 1')).rows[0].id;
    await rpc(admin, 'consultation_command', ['accept', { id: r.id, revision: 1, policy_id: pol, paid_consent: true }]);
    bookingsSameSlot.push(r.id);
  }
  const clients = two.map(() => new pg.Client({ connectionString: CONN }));
  await Promise.all(clients.map(c => c.connect()));
  let okCount = 0;
  try {
    const res2 = await Promise.allSettled(bookingsSameSlot.map(async (id, i) => {
      await asUser(clients[i], two[i]);
      return rpc(clients[i], 'consultation_command', ['confirm', { id, revision: 2, share_consent: true, name: '홍길동', phone: '01011112222' }]);
    }));
    okCount = res2.filter(r => r.status === 'fulfilled').length;
  } finally { await Promise.all(clients.map(c => c.end())); }
  const bookedAtSlot = (await admin.query("select count(*)::int n from private.consultations where planner_id=$1 and preferred_at=$2 and state in ('confirmed','scheduled','awaiting_completion')", [plannerId, slot(100)])).rows[0].n;
  assert(bookedAtSlot === 1, '동일 슬롯 확정 예약 == 1 (이중예약 없음)', `실제 ${bookedAtSlot}, 성공한 confirm ${okCount}`);

  console.log(`\n결과: ${failures ? `불변식 위반/오류 ${failures}건` : '모든 동시성 불변식 통과'}.`);
}

async function cleanup() {
  try {
    if (!KEEP) {
      await admin.query('drop schema if exists private cascade');
      await admin.query('drop schema if exists auth cascade');
    }
  } catch {}
  await admin.end();
}

run().catch(e => { console.error('오류:', e.message); failures++; })
  .finally(async () => { await cleanup(); process.exit(failures ? 1 : 0); });
