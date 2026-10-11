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

test('12) 숨김 전에 받은 상담 요청: 수락·연락처·일정변경·완료가 모두 된다', async () => {
  const f = await setup();
  const when = f.slot(4);
  await f.login(ids.customer);
  const made = await f.cmd('request', {planner_id: ids.planner, purpose: 'claim', region: '경기 분당',
    method: 'scheduled', request_key: crypto.randomUUID(), preferred_at: when});
  await f.login(ids.planner);
  await f.cmd('accept', {id: made.id, revision: (await f.row(made.id, 'partner')).revision});

  // 전문가가 지도를 숨긴다.
  const s = await settings(f, 'map', {enabled: false, confirmed: true, revision: (await state(f)).revision});
  assert.equal(s.mapEnabled, false);

  // 고객은 그대로 확정할 수 있다.
  await f.login(ids.customer);
  await f.cmd('confirm', {id: made.id, revision: (await f.row(made.id)).revision, name: '확인 고객', share_consent: true});
  assert.equal((await f.row(made.id)).state, 'scheduled');

  // 전문가 화면에서 고객 연락처가 보인다.
  await f.login(ids.planner);
  const seen = await f.row(made.id, 'partner');
  assert.ok(seen.contact?.phone, '숨긴 뒤에도 확정된 예약의 연락처는 보여야 한다');

  // 일정 변경(새 시각 제안)도 된다. 055 이후 propose 는 상대 확인용 제안 행을 만들고
  // 예약 상태는 scheduled 로 유지한다.
  const next = f.slot(6);
  await f.cmd('propose', {id: made.id, revision: seen.revision, preferred_at: next});
  await f.db.exec('reset role');
  const proposed = await f.db.query(
    "select count(*)::int n from private.consultation_schedule_proposals where consultation_id=$1 and state='pending'", [made.id]);
  assert.equal(proposed.rows[0].n, 1, '숨긴 뒤에도 일정 재제안이 된다');
  await f.db.close();
});

test('13) 관리자 정지는 노출·신규·방문을 모두 끄고, 재승인은 방문을 복원하지 않는다', async () => {
  const f = await setup();
  await f.login(ids.planner);
  const before = await state(f);
  assert.equal(before.visitEnabled, true);

  await f.login(ids.admin);
  await f.rpc('early_expert_review', ['suspend', {user_id: ids.planner, reason: '격리 테스트 정지 사유'}]);

  await f.db.exec('reset role');
  const row = await f.db.query('select enabled,latitude from private.instant_availability where user_id=$1', [ids.planner]);
  assert.equal(row.rows[0].enabled, false, '정지 시 지금 방문이 즉시 꺼진다');
  assert.equal(row.rows[0].latitude, null, '좌표도 지운다');

  await f.login(ids.customer);
  const list = await f.rpc('planner_catalog', ['', '']);
  assert.equal(list.planners.some(p => p.id === ids.planner), false, '정지된 전문가는 목록에서 빠진다');
  await assert.rejects(() => f.cmd('request', {planner_id: ids.planner, purpose: 'claim', region: '경기 분당',
    method: 'scheduled', request_key: crypto.randomUUID(), preferred_at: f.slot(4)}),
    /invalid_partner|expert_not_visible/, '정지된 전문가에게 신규 요청은 거부된다');

  // 재승인해도 지금 방문은 꺼진 채로 둔다. 전문가가 직접 켜야 한다.
  await f.login(ids.admin);
  await f.rpc('early_expert_review', ['approve', {user_id: ids.planner, reason: '격리 테스트 재승인 사유', organization: '격리 테스트 소속', registration_reference: 'TEST-REF-001'}]);
  await f.db.exec('reset role');
  const after = await f.db.query('select enabled from private.instant_availability where user_id=$1', [ids.planner]);
  assert.equal(after.rows[0].enabled, false, '재승인은 방문을 자동 복원하지 않는다');
  await f.db.close();
});

test('14) 활동지역 저장은 승인 상태와 지도 노출을 바꾸지 않는다', async () => {
  const f = await setup();
  await f.db.exec('reset role');
  const before = await f.db.query('select status,map_visible from private.expert_profiles where user_id=$1', [ids.planner]).then(r => r.rows[0]);

  await f.login(ids.planner);
  const s = await state(f);
  await f.db.exec('reset role');
  const areas = await f.db.query("select id from private.service_areas order by id limit 2").then(r => r.rows.map(x => x.id));
  await settings(f, 'area', {primary: areas[0], secondary: areas.slice(1), revision: s.revision});
  await f.db.exec('reset role');

  await f.db.exec('reset role');
  const after = await f.db.query('select status,map_visible from private.expert_profiles where user_id=$1', [ids.planner]).then(r => r.rows[0]);
  // 058 의 save_areas 는 expert_profiles 를 update 하므로 034 로스터 트리거가 함께 돈다.
  assert.equal(after.status, before.status, '활동지역 저장이 승인 상태를 바꾸면 안 된다');
  assert.equal(after.map_visible, before.map_visible, '활동지역 저장이 지도 노출을 바꾸면 안 된다');
  await f.db.close();
});

test('15) 보험소 운영시간이 바뀌어도 기존 예약은 원래 시각으로 확정된다 (059)', async () => {
  const f = await setup();
  await f.db.exec('reset role');
  await f.db.exec(`insert into private.office_locations(id,name,region,status,address,latitude,longitude,weekdays)
    values('hours-office','시간변경 보험소','경기 분당','active','테스트 사무실',37.3,127.1,array[0,1,2,3,4,5,6])`);
  // 18:00 시작은 기본 last_start_hour=18 에서 허용된다.
  const day = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
  const when = day + 'T18:00:00+09:00';
  await f.login(ids.customer);
  const made = await f.cmd('request', {office_id: 'hours-office', office_assignment: true, purpose: 'claim',
    region: '경기 분당', method: 'scheduled', request_key: crypto.randomUUID(), preferred_at: when});
  await f.login(ids.admin);
  await f.cmd('office_assign', {id: made.id, revision: (await f.row(made.id, 'admin')).revision, planner_id: ids.planner});
  await f.login(ids.planner);
  await f.cmd('accept', {id: made.id, revision: (await f.row(made.id, 'partner')).revision});

  // 운영시간을 줄인다. 기존 예약 시각(18:00)이 새 운영시간 밖이 된다.
  await f.db.exec('reset role');
  await f.db.exec("update private.office_locations set last_start_hour=12 where id='hours-office'");

  // 원래 시각 확정은 성공해야 한다.
  await f.login(ids.customer);
  await f.cmd('confirm', {id: made.id, revision: (await f.row(made.id)).revision, name: '확인 고객', share_consent: true});
  assert.equal((await f.row(made.id)).state, 'scheduled', '원래 시각 확정은 운영시간 변경과 무관하게 된다');

  // 새 시각 제안은 바뀐 운영시간으로 검사한다.
  const rev = (await f.row(made.id)).revision;
  await assert.rejects(() => f.cmd('propose', {id: made.id, revision: rev, preferred_at: day + 'T17:00:00+09:00'}),
    /invalid_slot/, '새 시각은 바뀐 운영시간을 따른다');
  await f.db.close();
});

test('16) 휴무일 지정은 기존 예약에도 오류를 유지한다 (059)', async () => {
  const f = await setup();
  await f.db.exec('reset role');
  await f.db.exec(`insert into private.office_locations(id,name,region,status,address,latitude,longitude,weekdays)
    values('closed-office','휴무 보험소','경기 분당','active','테스트 사무실',37.3,127.1,array[0,1,2,3,4,5,6])`);
  const day = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
  await f.login(ids.customer);
  const made = await f.cmd('request', {office_id: 'closed-office', office_assignment: true, purpose: 'claim',
    region: '경기 분당', method: 'scheduled', request_key: crypto.randomUUID(), preferred_at: day + 'T11:00:00+09:00'});
  await f.login(ids.admin);
  await f.cmd('office_assign', {id: made.id, revision: (await f.row(made.id, 'admin')).revision, planner_id: ids.planner});
  await f.login(ids.planner);
  await f.cmd('accept', {id: made.id, revision: (await f.row(made.id, 'partner')).revision});

  await f.db.exec('reset role');
  await f.db.query("insert into private.office_calendar_exceptions(office_id,day,closed) values('closed-office',$1,true)", [day]);
  await f.login(ids.customer);
  const rev = (await f.row(made.id)).revision;
  await assert.rejects(() => f.cmd('confirm', {id: made.id, revision: rev, name: '확인 고객', share_consent: true}),
    /invalid_slot/, '휴무일은 기존 예약에도 오류를 낸다 — 화면에서 일정 재제안을 안내한다');
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
