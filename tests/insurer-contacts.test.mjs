import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {setupUrgent} from './urgent-fixture.mjs';
import {ids} from './commerce-fixture.mjs';

const sql = name => readFile('supabase/' + name, 'utf8');
const sample = {name: '삼성생명', category: '생명', homepage_url: 'https://www.samsunglife.com',
  tel_customer: '1588-3114', sort_order: 10};

async function setup() {
  const f = await setupUrgent(false);
  await f.db.exec('reset role');
  await f.db.exec(await sql('073_insurer_contacts.sql'));
  return f;
}
const call = (f, op, payload = {}) => f.rpc('insurer_contacts_command', [op, payload]);

test('관리자만 등록·수정하고 승인 전문가는 읽기와 즐겨찾기만 한다', async () => {
  const f = await setup();
  try {
    await f.login(ids.admin);
    const saved = await call(f, 'save', sample);
    assert.equal(saved.contacts.length, 1);
    assert.equal(saved.contacts[0].name, '삼성생명');

    // 승인 전문가: 공개된 항목만 보이고 메모는 가려진다.
    await f.login(ids.planner);
    const expert = await call(f, 'list');
    assert.equal(expert.admin, false);
    assert.equal(expert.contacts.length, 1);
    assert.equal(expert.contacts[0].memo, null);
    await assert.rejects(call(f, 'save', {...sample, name: '임의생명'}), /admin_required/);
    await assert.rejects(call(f, 'delete', {id: saved.contacts[0].id}), /admin_required/);

    // 소비자 계정은 조회 자체가 막힌다.
    await f.login(ids.customer);
    await assert.rejects(call(f, 'list'), /insurer_access_required/);
    await f.login(null, 'anon');
    await assert.rejects(call(f, 'list'), /permission denied|insurer_access_required/);
  } finally { await f.db.close(); }
});

test('노출을 끄면 전문가에게 숨고 관리자에게는 남는다', async () => {
  const f = await setup();
  try {
    await f.login(ids.admin);
    const saved = await call(f, 'save', sample);
    const id = saved.contacts[0].id;
    const hidden = await call(f, 'set_active', {id, is_active: false});
    assert.equal(hidden.contacts.length, 1);
    assert.equal(hidden.contacts[0].is_active, false);

    await f.login(ids.planner);
    assert.deepEqual((await call(f, 'list')).contacts, []);

    await f.login(ids.admin);
    await call(f, 'set_active', {id, is_active: true});
    await f.login(ids.planner);
    assert.equal((await call(f, 'list')).contacts.length, 1);
  } finally { await f.db.close(); }
});

test('즐겨찾기는 본인 것만 보이고 목록 맨 앞에 온다', async () => {
  const f = await setup();
  try {
    await f.login(ids.admin);
    await call(f, 'save', sample);
    const second = await call(f, 'save', {name: '현대해상', category: '손해', sort_order: 5});
    const hyundai = second.contacts.find(c => c.name === '현대해상').id;

    await f.login(ids.planner);
    assert.equal((await call(f, 'list')).contacts[0].name, '현대해상', 'sort_order 순이 기본');
    const after = await call(f, 'favorite', {id: (await call(f, 'list')).contacts.find(c => c.name === '삼성생명').id, on: true});
    assert.equal(after.contacts[0].name, '삼성생명', '즐겨찾기가 맨 앞');
    assert.equal(after.contacts[0].favorite, true);

    // 다른 전문가에게는 남의 즐겨찾기가 보이지 않는다.
    await f.login(ids.next);
    const other = await call(f, 'list');
    assert.equal(other.contacts.every(c => c.favorite === false), true);
    assert.equal(other.contacts[0].name, '현대해상');

    await f.login(ids.planner);
    const off = await call(f, 'favorite', {id: hyundai, on: false});
    assert.equal(off.contacts.find(c => c.name === '현대해상').favorite, false);
  } finally { await f.db.close(); }
});

test('일괄 등록은 이름이 겹치면 덮어쓰기를 고를 때만 바꾼다', async () => {
  const f = await setup();
  try {
    await f.login(ids.admin);
    await call(f, 'save', sample);
    const keep = await call(f, 'import', {rows: [{...sample, tel_customer: '1588-0000'}], overwrite: false});
    assert.deepEqual([keep.written, keep.skipped], [0, 1]);
    assert.equal(keep.contacts[0].tel_customer, '1588-3114', '덮어쓰지 않음');

    const over = await call(f, 'import', {rows: [{...sample, tel_customer: '1588-0000'}], overwrite: true});
    assert.deepEqual([over.written, over.skipped], [1, 0]);
    assert.equal(over.contacts[0].tel_customer, '1588-0000');

    const added = await call(f, 'import', {rows: [{name: '새마을금고', category: '공제', sort_order: 900}], overwrite: false});
    assert.equal(added.written, 1);
    assert.equal(added.contacts.length, 2);
  } finally { await f.db.close(); }
});

test('형식에 맞지 않는 주소·전화·구분은 저장되지 않는다', async () => {
  const f = await setup();
  try {
    await f.login(ids.admin);
    await assert.rejects(call(f, 'save', {...sample, homepage_url: 'http://www.samsunglife.com'}), /check constraint|insurer_contacts/);
    await assert.rejects(call(f, 'save', {...sample, tel_customer: '1588-3114 (평일)'}), /check constraint|insurer_contacts/);
    await assert.rejects(call(f, 'save', {...sample, category: '기타'}), /check constraint|insurer_contacts/);
    await assert.rejects(call(f, 'save', {...sample, name: null}), /not-null|null value/);
    assert.deepEqual((await call(f, 'list')).contacts, [], '실패한 저장은 남지 않는다');
  } finally { await f.db.close(); }
});

test('두 번 실행해도 안전하고 원복은 자료를 지우지 않는다', async () => {
  const f = await setup();
  try {
    await f.login(ids.admin);
    await call(f, 'save', sample);
    await f.db.exec('reset role');
    await f.db.exec(await sql('073_insurer_contacts.sql'));
    await f.login(ids.admin);
    assert.equal((await call(f, 'list')).contacts.length, 1, '재실행해도 자료 유지');

    await f.db.exec('reset role');
    await f.db.exec(await sql('rollback_insurer_contacts.sql'));
    await f.login(ids.admin);
    await assert.rejects(call(f, 'list'), /does not exist/, '원복 후에는 API가 사라진다');

    // private 표는 소유자만 직접 읽는다. 자료가 남아 있는지는 역할을 되돌려 확인한다.
    await f.db.exec('reset role');
    assert.equal((await f.db.query('select count(*)::int n from private.insurer_contacts')).rows[0].n, 1,
      '원복해도 등록한 연락처는 남는다');
  } finally { await f.db.close(); }
});

// CSV 읽기는 화면에서 하므로 함수만 따로 검사한다.
const {parseCsv} = await import('../src/admin-insurers.js');

test('CSV는 BOM·따옴표 안 쉼표·빈 줄을 바르게 읽는다', () => {
  const rows = parseCsv('\uFEFFname,category,tel_customer,sort_order,is_active,verified,memo\n'
    + '삼성생명,생명,1588-3114,10,TRUE,FALSE,\n'
    + '"현대해상, 주",손해,1588-5656,20,true,yes,"메모, 쉼표"\n'
    + ',,,,,,\n');
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], {name: '삼성생명', category: '생명', tel_customer: '1588-3114', sort_order: 10, is_active: true, verified: false});
  assert.equal(rows[1].name, '현대해상, 주');
  assert.equal(rows[1].memo, '메모, 쉼표');
  assert.equal(rows[1].verified, true);
});

test('모르는 머리글은 버리고 이름 없는 줄은 읽지 않는다', () => {
  const rows = parseCsv('name,category,unknown_column\n가나생명,생명,버릴값\n,손해,x\n');
  assert.deepEqual(rows, [{name: '가나생명', category: '생명'}]);
});

test('받은 39개사 CSV가 스키마 제약을 모두 통과한다', async () => {
  const {readFile} = await import('node:fs/promises');
  let text;
  try { text = await readFile('C:/Users/AdMins/Downloads/insurer_contacts.csv', 'utf8'); }
  catch { return; } // 원본 파일이 없는 환경에서는 건너뛴다.
  const rows = parseCsv(text);
  assert.equal(rows.length, 39);
  for (const row of rows) {
    assert.ok(['생명', '손해', '공제'].includes(row.category), row.name + ' 구분');
    for (const key of ['homepage_url', 'portal_url', 'terms_url', 'claim_form_url'])
      if (row[key]) assert.match(row[key], /^https:\/\/\S{3,200}$/, row.name + ' ' + key);
    for (const key of ['tel_customer', 'tel_incall', 'tel_it_help', 'fax_claim'])
      if (row[key]) assert.match(row[key], /^[0-9-]{3,20}$/, row.name + ' ' + key);
  }
});
