import test from 'node:test';
import assert from 'node:assert/strict';
import {readdir} from 'node:fs/promises';
import {planMigrations} from '../scripts/migration-plan.mjs';

const sample = ['001_a.sql', '002_b.sql', '003_c.sql', '004_d.sql'];

test('최초 실행에 채택 지점이 없으면 전부 기록만 하고 실행하지 않는다', () => {
  const plan = planMigrations({files: sample, applied: new Set()});
  assert.deepEqual(plan.seed, sample);
  assert.deepEqual(plan.apply, []);
});

test('최초 실행에 채택 지점을 주면 그 뒤 파일만 적용한다', () => {
  const plan = planMigrations({files: sample, applied: new Set(), adoptThrough: '002_b.sql'});
  assert.deepEqual(plan.seed, ['001_a.sql', '002_b.sql']);
  assert.deepEqual(plan.apply, ['003_c.sql', '004_d.sql']);
});

test('이력이 있어도 채택 지점 이전의 미기록 파일은 실행하지 않고 기록만 한다', () => {
  const plan = planMigrations({files: sample, applied: new Set(['001_a.sql']), adoptThrough: '003_c.sql'});
  assert.deepEqual(plan.skip, ['001_a.sql']);
  assert.deepEqual(plan.seed, ['002_b.sql', '003_c.sql']);
  assert.deepEqual(plan.apply, ['004_d.sql']);
});

test('이력이 있는 DB에 채택 지점 없이 미기록 파일이 있으면 아무것도 실행하지 않는다', () => {
  const plan = planMigrations({files: sample, applied: new Set(['001_a.sql'])});
  assert.match(plan.error, /MIGRATE_ADOPT_THROUGH/);
  assert.equal(plan.apply, undefined);
});

test('이력이 있고 미기록 파일이 없으면 적용할 것이 없다', () => {
  const plan = planMigrations({files: sample, applied: new Set(sample)});
  assert.equal(plan.error, undefined);
  assert.deepEqual(plan.apply, []);
  assert.deepEqual(plan.seed, []);
});

test('채택 지점 파일이 없으면 거부한다', () => {
  const plan = planMigrations({files: sample, applied: new Set(), adoptThrough: '009_missing.sql'});
  assert.match(plan.error, /supabase\/에 없습니다/);
});

test('저장소의 실제 파일에서 운영 채택 지점 뒤만 적용 대상이 된다', async () => {
  const files = (await readdir('supabase')).filter(f => /^\d{3}_.*\.sql$/.test(f)).sort();
  const adopt = '071_help_intent.sql';
  assert.ok(files.includes(adopt), '채택 지점 파일이 저장소에 있어야 한다');
  const plan = planMigrations({files, applied: new Set(['001_init.sql']), adoptThrough: adopt});
  assert.equal(plan.error, undefined);
  assert.ok(plan.apply.every(f => f > adopt), '채택 지점 이전 파일은 적용 대상이 아니다');
  assert.ok(!plan.apply.includes(adopt));
  assert.ok(plan.apply.includes('072_planner_claim_expert_label.sql'));
});
