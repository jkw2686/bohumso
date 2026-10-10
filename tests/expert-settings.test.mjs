// 전문가 노출·방문 설정(058) + 기존 예약 보험소 시간(059) 격리 검증.
// 격리 PGlite + 가상 소비자/전문가/관리자. 운영 DB·네트워크·알림 없음.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {setupVisits} from './expert-visits-fixture.mjs';
import {ids} from './commerce-fixture.mjs';

const sql = name => readFile('supabase/' + name, 'utf8');
const CHAIN = ['052_optional_expert_profile.sql', '053_connection_review.sql', '054_profile_office_scope.sql',
  '056_booking_hardening.sql', '057_support_conversations.sql', '058_expert_settings.sql', '059_existing_office_hours.sql'];

async function setup() {
  const f = await setupVisits();
  await f.db.exec('reset role');
  for (const name of CHAIN) await f.db.exec(await sql(name));
  await f.db.exec('reset role');
  return f;
}

const settings = (f, operation, payload = {}) => f.db.query('select public.expert_settings($1,$2) v', [operation, payload]).then(r => r.rows[0].v);
const state = f => settings(f, 'get');

test('적용 순서·재실행·원복·재적용', async () => {
  const f = await setup();
  // 재실행: 같은 파일을 다시 적용해도 깨지지 않는다 (rename 가드 / if not exists).
  for (const name of CHAIN) await f.db.exec(await sql(name));
  await f.db.exec('reset role');
  // 원복 후 재적용.
  await f.db.exec(await sql('058_expert_settings_rollback.sql'));
  await f.db.exec(await sql('058_expert_settings.sql'));
  await f.db.exec('reset role');
  // 숨김 선택 열은 원복해도 남는다.
  const col = await f.db.query("select 1 from information_schema.columns where table_schema='private' and table_name='planner_directory' and column_name='self_map_visible'");
  assert.equal(col.rows.length, 1, '원복 후에도 self_map_visible 열은 보존되어야 한다');
  await f.db.close();
});

test('1) 지도 OFF → 소비자 목록·방문 목록에서 제외, 지금 방문 즉시 OFF', async () => {
  const f = await setup();
  await f.login(ids.planner);
  const before = await state(f);
  assert.equal(before.mapEnabled, true);
  assert.equal(before.visitEnabled, true, '픽스처가 지금 방문을 켜둔 상태여야 한다');

  const off = await settings(f, 'map', {enabled: false, confirmed: true, revision: before.revision});
  assert.equal(off.mapEnabled, false);
  assert.equal(off.visitEnabled, false, '지도 OFF는 같은 트랜잭션에서 지금 방문도 끈다');

  await f.login(ids.customer);
  const catalog = await f.db.query("select public.planner_catalog('','') v").then(r => r.rows[0].v);
  assert.equal(catalog.planners.some(p => p.id === ids.planner), false, '숨긴 전문가는 목록에서 제외된다');
  const visits = await f.db.query("select public.visit_catalog($1) v", [{area: '경기 분당', latitude: 37.383, longitude: 127.119}]).then(r => r.rows[0].v);
  assert.equal(visits.some(v => v.id === ids.planner), false, '숨긴 전문가는 방문 후보에서 제외된다');
  await f.db.close();
});

test('2) 숨긴 전문가에게 신규 상담·방문 요청 거부', async () => {
  const f = await setup();
  await f.login(ids.planner);
  const s = await state(f);
  await settings(f, 'map', {enabled: false, confirmed: true, revision: s.revision});

  await f.login(ids.customer);
  await assert.rejects(
    () => f.db.query('select public.consultation_command($1,$2)', ['request',
      {planner_id: ids.planner, purpose: 'claim', region: '경기 분당', method: 'scheduled', request_key: crypto.randomUUID(), preferred_at: new Date(Date.now() + 864e5).toISOString()}]),
    /expert_not_visible/, '숨긴 전문가 신규 상담 요청은 거부된다');
  await f.db.close();
});

test('3) 숨김 전에 받은 방문 요청은 수락할 수 있다', async () => {
  const f = await setup();
  // 소비자가 숨김 전에 방문 요청을 보낸다.
  await f.login(ids.customer);
  const requested = await f.db.query('select public.urgent_command($1,$2) v', ['request', {
    planner_id: ids.planner, area: '경기 분당', purpose: 'claim', place: '분당구청 정문', phone: '01000000002',
    meeting_kind: 'nearby', consent: true, request_key: crypto.randomUUID(),
    preferred_at: new Date(Date.now() + 36e5).toISOString(), latitude: 37.383, longitude: 127.119,
  }]).then(r => r.rows[0].v);
  assert.ok(requested.id, '방문 요청이 접수되어야 한다');

  // 전문가가 지도를 숨긴다 → 지금 방문도 꺼진다.
  await f.login(ids.planner);
  const s = await state(f);
  const off = await settings(f, 'map', {enabled: false, confirmed: true, revision: s.revision});
  assert.equal(off.visitEnabled, false);

  // 그래도 이미 받은 요청은 수락된다. (1차 지시 1항 a)
  const accepted = await f.db.query('select public.urgent_command($1,$2) v', ['accept', {id: requested.id}]).then(r => r.rows[0].v);
  assert.ok(accepted, '숨긴 뒤에도 이미 받은 방문 요청 수락은 허용된다');
  await f.db.exec('reset role');
  const row = await f.db.query('select state,planner_id from private.urgent_requests where id=$1', [requested.id]);
  assert.equal(row.rows[0].state, 'ACCEPTED');
  assert.equal(row.rows[0].planner_id, ids.planner);
  await f.db.close();
});

test('4) 지도 다시 ON → 지금 방문은 OFF 유지', async () => {
  const f = await setup();
  await f.login(ids.planner);
  let s = await state(f);
  const off = await settings(f, 'map', {enabled: false, confirmed: true, revision: s.revision});
  assert.equal(off.visitEnabled, false);
  const on = await settings(f, 'map', {enabled: true, revision: off.revision});
  assert.equal(on.mapEnabled, true);
  assert.equal(on.visitEnabled, false, '재ON은 지금 방문을 자동으로 켜지 않는다');
  await f.db.close();
});

test('5) 숨긴 전문가는 빈 시간 조회가 빈 목록', async () => {
  const f = await setup();
  await f.login(ids.planner);
  const s = await state(f);
  await settings(f, 'map', {enabled: false, confirmed: true, revision: s.revision});
  await f.login(ids.customer);
  const day = new Date(Date.now() + 864e5).toISOString().slice(0, 10);
  const slots = await f.db.query('select public.reservation_slots(null,$1,$2,$3) v', [ids.planner, day, 'scheduled']).then(r => r.rows[0].v);
  assert.deepEqual(slots, [], '숨긴 전문가 지정 조회는 빈 목록');
  await f.db.close();
});

test('6) stale revision과 연속 조작 차단', async () => {
  const f = await setup();
  await f.login(ids.planner);
  const s = await state(f);
  await settings(f, 'map', {enabled: false, confirmed: true, revision: s.revision});
  await assert.rejects(() => settings(f, 'map', {enabled: true, revision: s.revision}),
    /stale_settings/, '오래된 revision은 거부된다');
  await f.db.close();
});

test('7) 지도 OFF는 확인 없이 되지 않고, 타인 설정은 건드릴 수 없다', async () => {
  const f = await setup();
  await f.login(ids.planner);
  const s = await state(f);
  await assert.rejects(() => settings(f, 'map', {enabled: false, revision: s.revision}),
    /confirmation_required/, '확인 없는 지도 OFF는 거부된다');
  await assert.rejects(() => settings(f, 'map', {enabled: false, confirmed: true, revision: s.revision, user_id: ids.next}),
    /request_forbidden/, '다른 사람 id를 실으면 거부된다');
  await f.db.close();
});

test('9) 위치 유효시간 만료는 OFF로 보이고, 진행 중 방문과 구분된다', async () => {
  const f = await setup();
  await f.login(ids.planner);
  const fresh = await state(f);
  assert.equal(fresh.locationState, 'fresh');
  assert.equal(fresh.visitAvailable, true, '위치가 신선하면 요청 가능');
  assert.equal(fresh.visitInProgress, false);

  // 위치 갱신 시각만 만료시킨다. 방문 자동종료 시각(expires_at)은 그대로 둔다.
  await f.db.exec('reset role');
  const cfg = await f.db.query("select (private.visit_config()->>'expireMinutes')::int m").then(r => r.rows[0].m);
  await f.db.query(`update private.instant_availability set updated_at=now()-make_interval(mins=>$1) where user_id=$2`, [cfg + 5, ids.planner]);
  await f.login(ids.planner);
  const stale = await state(f);
  assert.equal(stale.visitEnabled, true, '자동종료 시각은 남아 있다');
  assert.equal(stale.locationState, 'expired');
  assert.equal(stale.visitAvailable, false, '스위치는 OFF로 보여야 한다');
  assert.equal(stale.visitInProgress, false, '위치 만료는 진행 중 방문과 다른 상태다');
  // 화면은 visitAvailable 기준으로 분기하므로 이 상태에서 클릭하면 '켜기'(start)로 간다.
  const restarted = await settings(f, 'visit', {enabled: true, consent: true, duration: 60, latitude: 37.383, longitude: 127.119, accuracy: 20, revision: stale.revision});
  assert.equal(restarted.visitAvailable, true, '동의·위치 확인 후 다시 켜진다');
  assert.equal(restarted.locationState, 'fresh');
  await f.db.close();
});

test('10) 새로고침·재조회는 만료시간을 연장하지 않는다', async () => {
  const f = await setup();
  await f.login(ids.planner);
  const first = await state(f);
  const before = first.expiresAt;
  assert.ok(before, '자동종료 시각이 있어야 한다');
  for (let i = 0; i < 3; i++) await state(f);
  const after = (await state(f)).expiresAt;
  assert.equal(after, before, '상태 재조회만으로 expires_at 이 바뀌면 안 된다');
  await f.db.close();
});

test('11) planner_catalog 가 availability_until 을 내려주고 좌표는 비공개', async () => {
  const f = await setup();
  await f.login(ids.customer);
  const row = await f.db.query("select public.planner_catalog('','') v")
    .then(r => r.rows[0].v.planners.find(p => p.id === ids.planner));
  assert.ok(row, '전문가가 목록에 있어야 한다');
  assert.equal(row.availability_status, 'now', '픽스처가 지금 방문을 켜둔 상태');
  assert.ok(row.availability_until, "'지금 가능'에는 유효시각이 함께 온다");

  await f.db.exec('reset role');
  const limits = await f.db.query(`select i.expires_at, i.updated_at+make_interval(mins=>(private.visit_config()->>'expireMinutes')::int) loc
    from private.instant_availability i where i.user_id=$1`, [ids.planner]).then(r => r.rows[0]);
  // pg 드라이버가 timestamptz 를 Date 로 돌려주므로 Date.parse 를 쓰면 밀리초가 잘린다.
  const expected = Math.min(Number(new Date(limits.expires_at)), Number(new Date(limits.loc)));
  assert.equal(Number(new Date(row.availability_until)), expected, '방문 종료시각과 위치 유효시간 중 이른 쪽');

  // 좌표는 계속 비공개다.
  assert.equal(row.latitude, undefined);
  assert.equal(row.longitude, undefined);

  // 위치 유효시간이 지나면 '지금 가능'이 아니고 유효시각도 내려오지 않는다.
  const cfg = await f.db.query("select (private.visit_config()->>'expireMinutes')::int m").then(r => r.rows[0].m);
  await f.db.query('update private.instant_availability set updated_at=now()-make_interval(mins=>$1) where user_id=$2', [cfg + 5, ids.planner]);
  await f.login(ids.customer);
  const stale = await f.db.query("select public.planner_catalog('','') v")
    .then(r => r.rows[0].v.planners.find(p => p.id === ids.planner));
  assert.notEqual(stale.availability_status, 'now');
  assert.equal(stale.availability_until, null);
  await f.db.close();
});

test('8) 관리자 보험소 배정은 숨긴 전문가를 거부', async () => {
  const f = await setup();
  await f.login(ids.planner);
  const s = await state(f);
  await settings(f, 'map', {enabled: false, confirmed: true, revision: s.revision});
  await f.db.exec('reset role');
  const booking = await f.db.query(`insert into private.consultations(customer_id,purpose,region,method,preferred_at,allocation_mode,customer_ok)
    values($1,'claim','경기 분당','scheduled',now()+interval '2 days','office',true) returning id,revision`, [ids.customer]);
  await f.login(ids.admin);
  await assert.rejects(() => f.db.query('select public.consultation_command($1,$2)', ['office_assign',
    {id: booking.rows[0].id, revision: booking.rows[0].revision, planner_id: ids.planner}]),
    /expert_not_visible/, '숨긴 전문가 배정은 거부된다');
  await f.db.close();
});
