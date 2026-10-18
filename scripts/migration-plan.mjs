// 어떤 마이그레이션을 실제로 실행하고 어떤 것을 '이미 적용됨'으로 기록만 할지 결정한다.
// DB 없이 단독으로 검증할 수 있도록 순수 함수로 분리했다.
//
// adoptThrough(= MIGRATE_ADOPT_THROUGH): 이 파일까지는 운영에 이미 적용된 것으로 보고
// 실행하지 않고 기록만 한다. 그 뒤 번호부터 실제로 적용한다.
//
// 안전장치: 적용 이력이 있는 DB에서 adoptThrough 없이 미기록 파일을 만나면 아무것도 실행하지 않는다.
// 수동으로 적용해 온 과거 파일을 자동화가 다시 실행하는 사고를 막는다.
export function planMigrations({files, applied, adoptThrough = ''}) {
  const adopt = String(adoptThrough || '').trim();
  const known = new Set(files);
  if (adopt && !known.has(adopt)) {
    return {error: `MIGRATE_ADOPT_THROUGH '${adopt}' 파일이 supabase/에 없습니다. 실행하지 않았습니다.`};
  }
  const firstRun = applied.size === 0;
  const seed = [], apply = [], skip = [];
  for (const file of files) {
    if (applied.has(file)) { skip.push(file); continue; }
    if (adopt ? file <= adopt : firstRun) seed.push(file); else apply.push(file);
  }
  if (!firstRun && !adopt && apply.length) {
    return {error: `적용 이력이 있는 DB에 미기록 마이그레이션 ${apply.length}건(${apply[0]} …)이 있습니다. `
      + 'MIGRATE_ADOPT_THROUGH로 이미 적용된 마지막 파일을 지정해야 그 뒤부터 적용합니다. 실행하지 않았습니다.'};
  }
  return {seed, apply, skip, adopt};
}
