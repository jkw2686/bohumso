# supabase/ 마이그레이션 규칙

## 자동 적용 방식

`main`에 `supabase/**`가 바뀐 채로 push되면 `.github/workflows/migrate.yml`이
`node scripts/migrate.mjs`를 실행한다.

- 대상은 `supabase/NNN_*.sql`(세 자리 번호)뿐이다. `rollback_*.sql`, `seed_*.sql`,
  `_apply_all.sql`, `validation/`은 자동 적용되지 않는다. 원복은 언제나 사람이 판단한다.
- 적용된 파일은 `private.schema_migrations`에 파일명으로 기록되고, 기록에 있는 파일은
  다시 실행하지 않는다.
- 적용할 파일이 있을 때만 `private.release_controls` · `service_areas` ·
  `office_locations` 존재를 확인한다. 없으면 엉뚱한 DB로 보고 중단한다.

## 채택 지점(MIGRATE_ADOPT_THROUGH)

migrate.yml의 `MIGRATE_ADOPT_THROUGH`는 **운영에 이미 적용된 마지막 파일**이다.
그 이하는 실행하지 않고 기록만 하고, 그 뒤 번호부터 실제로 적용한다.

현재 값: `071_help_intent.sql` (001~071은 손으로 적용된 분량)

> **SQL을 손으로 적용했다면 이 값을 그 파일로 올려야 한다.**
> 올리지 않으면 자동화가 같은 파일을 다시 실행한다.

적용 이력이 있는 DB에서 채택 지점이 비어 있으면 `scripts/migration-plan.mjs`가
아무것도 실행하지 않고 거부한다. 과거 파일을 통째로 다시 실행하는 사고를 막기 위한 것이다.

## 새 SQL을 추가할 때

1. 다음 빈 번호를 쓴다. 기존 번호를 재사용하지 않는다.
2. 파일 하나 = 트랜잭션 하나(`begin; ... commit;`), 재실행해도 안전하게 쓴다.
3. 바꾸기 전 정의·값을 자체 백업하고, 짝이 되는 `rollback_*.sql`을 같이 둔다.
4. `DATABASE_URL`(GitHub Actions secret)은 Supabase **Session pooler** 문자열이어야 한다.
   Actions는 IPv4만 되므로 Direct 연결(IPv6)로는 접속하지 못한다.
   비밀번호에 특수문자가 있으면 percent-encode 한다.
   시크릿이 비어 있으면 적용 단계는 건너뛰고 **잡은 초록색으로 끝난다.** 실행 주석을 확인할 것.
