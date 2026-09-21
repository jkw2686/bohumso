#!/usr/bin/env node
// Supabase 마이그레이션 자동 적용기.
// supabase/NNN_*.sql 를 번호 순서로, 아직 적용 안 된 것만 실행하고 private.schema_migrations에 기록한다.
// 각 파일은 자체 begin;...commit; 트랜잭션이다.
//
// 최초(이력 비어있음) 처리:
//   - MIGRATE_BASELINE(파일명, 예 006_metrics.sql)이 있으면 그 파일까지는 "이미 적용됨"으로 기록만 하고
//     그 이후 파일부터 실제 적용한다. (기존에 수동 적용된 DB를 채택하면서 신규만 반영)
//   - MIGRATE_BASELINE이 없으면 현재 모든 파일을 기준선으로 기록만 한다(전체 채택, 실행 없음).
// 이후(이력 있음)에는 기록에 없는 파일만 실제 적용한다.
//
// 사용: DATABASE_URL=postgres://...  node scripts/migrate.mjs
//   DATABASE_URL은 Supabase 연결 문자열(비밀). GitHub Actions Secrets에 둔다. 로그에 값 출력 금지.
import pg from 'pg';
import { readFile, readdir } from 'node:fs/promises';

const url = process.env.DATABASE_URL;
if (!url) { console.error('DATABASE_URL 환경변수가 필요합니다(Supabase 연결 문자열). 실행하지 않았습니다.'); process.exit(1); }
const baseline = (process.env.MIGRATE_BASELINE || '').trim();

const files = (await readdir('supabase')).filter(f => /^\d{3}_.*\.sql$/.test(f)).sort();
const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15000 });

// 연결 실패는 별도로 잡아 안전한 진단(호스트/포트/에러코드)만 출력한다. 비밀번호는 절대 로그로 나가지 않는다.
let host = '(알 수 없음)', port = '5432';
try { const u = new URL(url); host = u.hostname; port = u.port || '5432'; } catch {}
try {
  await client.connect();
} catch (e) {
  console.error(`DB 연결 실패 — host=${host} port=${port} code=${e.code || '?'} : ${e.message}`);
  if (e.code === 'ENETUNREACH' || e.code === 'EHOSTUNREACH') {
    console.error('힌트: 이 호스트가 IPv6 전용(Direct 연결)일 수 있습니다. GitHub Actions는 IPv4만 되므로 Supabase "Session pooler"(...pooler.supabase.com, 사용자명 postgres.<ref>) 문자열을 쓰세요.');
  } else if (e.code === 'ENOTFOUND') {
    console.error('힌트: 호스트 이름이 잘못되었습니다. Supabase Settings→Database의 연결 문자열을 다시 확인하세요.');
  } else if (/password|authentication|SASL/i.test(e.message)) {
    console.error('힌트: 비밀번호가 틀렸거나 [YOUR-PASSWORD] 자리표시자가 실제 비밀번호로 치환되지 않았습니다.');
  }
  process.exit(1);
}
try {
  await client.query('create schema if not exists private');
  await client.query('create table if not exists private.schema_migrations(name text primary key, applied_at timestamptz not null default now())');
  const applied = new Set((await client.query('select name from private.schema_migrations')).rows.map(r => r.name));
  const firstRun = applied.size === 0;
  if (firstRun) console.log(baseline ? `최초 실행: '${baseline}'까지 기준선으로 기록하고 이후만 적용합니다.` : '최초 실행: 현재 모든 마이그레이션을 기준선으로 기록만 합니다(실행 없음).');

  let ran = 0, seeded = 0, skipped = 0;
  for (const f of files) {
    if (applied.has(f)) { skipped++; continue; }
    const seedOnly = firstRun && (!baseline || f <= baseline);
    if (seedOnly) {
      await client.query('insert into private.schema_migrations(name) values($1) on conflict do nothing', [f]);
      seeded++; console.log('  기준선 기록(실행 안 함):', f);
    } else {
      console.log('  적용 중:', f);
      await client.query(await readFile('supabase/' + f, 'utf8'));
      await client.query('insert into private.schema_migrations(name) values($1) on conflict do nothing', [f]);
      ran++; console.log('  ✔ 적용 완료:', f);
    }
  }
  console.log(`\n완료 — 신규 적용 ${ran}건 · 기준선 기록 ${seeded}건 · 이미 적용 ${skipped}건.`);
} catch (e) {
  console.error('마이그레이션 실패:', e.message);
  process.exit(1);
} finally {
  await client.end();
}
