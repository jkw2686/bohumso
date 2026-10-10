# 057·058·059 운영 적용 준비안

작성: Claude Code / 2026-10-11 준비 · 수신: 총괄 → 대표 승인용
**이 문서는 계획서입니다. 운영 Supabase·Netlify에 어떤 작업도 실행하지 않았습니다.**

---

## 0. 이 문서의 한계 — 먼저 확인할 것

작성 기준은 `origin/main` `65e4d8d`이며, **057·058·059 파일을 열어보지 못했습니다.**

| 대상 | 상태 | 근거 |
|---|---|---|
| `origin/main` 마이그레이션 | **056까지** | `042_region_waitlist` · `043_auth_phone_status_bridge` · `044`~`048` · `051`~`056` |
| `057_*` (고객센터) | **접근 불가** | main에 없음 |
| `058_expert_settings.sql` | **접근 불가** | main에 없음. `self_map_visible` 문자열이 저장소 전체에서 0건 |
| `059_existing_office_hours.sql` | **아직 없음** | 1차 지시 2항에서 신규 작성 대상 |
| 브랜치 `codex/interaction-settings` / `204bed6` | **없음** | `git fetch --all` 결과 원격은 `origin/main` 단독. `204bed6`은 `Not a valid object name` |

따라서 아래 계획에서 **057·058·059의 내부 내용에 의존하는 항목은 `[파일 수령 후 확정]`으로 표시**했습니다.
절차·백업·원복·순서는 저장소의 기존 관례(`production-migration-contract.md`, `scripts/migrate.mjs`,
`056_booking_hardening.sql`)에서 확정한 것이므로 그대로 쓸 수 있습니다.

**선행 조건: Codex가 `codex/interaction-settings`를 push해야 이 계획의 빈칸이 채워집니다.**

---

## ① 운영 DB 현재 상태와 저장소 기대값 비교

### 적용 메커니즘 (확정)

`scripts/migrate.mjs`가 `supabase/NNN_*.sql`을 **번호 순서로, 미적용분만** 실행하고
`private.schema_migrations`에 파일명을 기록합니다. **각 파일이 자체 `begin;…commit;` 트랜잭션**입니다.
`DATABASE_URL` 환경변수가 필요하며 값은 로그에 출력되지 않습니다.

`scripts/early-sql.mjs`는 030–036만 한 묶음으로 처리하는 구버전 경로입니다. 040 이후는 쓰지 않습니다.

### 비교 쿼리 (전부 읽기 전용 · SELECT만)

**A. 적용 이력 — 가장 먼저**
```sql
select name from private.schema_migrations order by name;
```
→ `056_booking_hardening.sql`까지 있어야 정상. 빠진 번호가 있으면 그 지점부터 점검합니다.
→ 이 테이블이 없으면 수동 적용 이력이고, `migrate.mjs`를 처음 쓸 때 `MIGRATE_BASELINE`으로
   기준선을 기록해야 합니다(실행 없이 기록만).

**B. `match_expert_roster`에 056 조건이 들어있는지** — 지시 ①에서 지목한 항목
```sql
select position('new.status=''APPROVED''' in pg_get_functiondef('private.match_expert_roster()'::regprocedure)) > 0
       as has_056_guard;
```
→ `true`면 056이 반영된 상태입니다.
→ 저장소 쪽 기대값은 확정했습니다: **`056_booking_hardening.sql:51-53`이 함수 정의를 읽어
  `new.status='APPROVED'`가 없으면 조기 반환 가드에 끼워 넣습니다.** 즉 승인 계정은 로스터
  매칭을 건너뜁니다. 운영 DB의 실제 값은 **접근 불가이므로 미확인**이며, 위 쿼리로 확인합니다.

**C. 핵심 함수 원문 — 저장소와 대조할 대상**
```sql
select p.oid::regprocedure::text as name, md5(pg_get_functiondef(p.oid)) as fingerprint
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where (n.nspname='private' and p.proname in
         ('specialty_match','check_reservation_slot','check_reservation_slot_before_visits',
          'match_expert_roster','planner_eligible','urgent_eligible','visit_available','expire_urgent'))
    or (n.nspname='public' and p.proname in
         ('planner_catalog','visit_catalog','consultation_command','urgent_command','reservation_slots'))
 order by 1;
```
→ 지문만 뽑아 비교합니다. 원문 전체는 백업(②)에서 따로 보관합니다.

**D. 058이 추가할 컬럼이 이미 있는지 (중복 적용 방지)**
```sql
select column_name from information_schema.columns
 where table_schema='private' and table_name='expert_profiles'
   and column_name in ('map_visible','self_map_visible');
```
→ `self_map_visible`이 이미 있으면 058이 일부 적용된 상태입니다. 그대로 재실행하지 않습니다.

**E. 기능 스위치 현재값**
```sql
select * from private.service_features;
select * from private.release_controls;
```
→ `production-migration-contract.md` 기준으로 **DB가 정책의 최종 기준**입니다.
   Netlify 환경변수는 공급자 사용 가능 여부만 제한하며 DB 권한을 부여하지 않습니다.

**F. 영향 규모 파악**
```sql
select count(*) filter (where status='APPROVED') as approved_experts,
       count(*) filter (where map_visible) as map_visible_experts
  from private.expert_profiles;
select count(*) from private.consultations
 where state in ('requested','coordinating','confirmed','scheduled','awaiting_completion');
select count(*) from private.instant_availability where enabled and expires_at > now();
```
→ 적용 전후 비교용 기준값입니다. ④에서 다시 씁니다.

### `[파일 수령 후 확정]`
057·058·059가 각각 어떤 함수를 `create or replace` 하는지 목록화한 뒤, 그 함수들을
위 **C** 쿼리의 대상에 추가해야 합니다. 현재 목록은 046·056 기준으로만 작성했습니다.

---

## ② 백업 대상과 방법

### 저장소 관례 (056에서 확정)

056은 적용 직전에 **스스로 백업을 뜨는 블록**을 포함합니다. 같은 패턴을 057·058·059에도 넣습니다.

```
private.booking_hardening_backup(name text pk, definition text)
  ← pg_get_functiondef 로 변경 대상 함수 원문 저장. RLS 활성, anon/authenticated 권한 회수
private.booking_hardening_snapshot(name text pk, payload jsonb)
  ← schema(information_schema.columns), member 1건, directory, counts
advisory lock: pg_advisory_xact_lock(hashtextextended('bohumso-booking-hardening',56))
```

057·058·059용으로는 **번호를 달리한 별도 백업 테이블**을 쓰고, 같은 트랜잭션 안에서
`insert … on conflict do nothing`으로 1회만 기록하게 합니다. 재실행 시 원본이 덮이지 않습니다.

### 대표가 직접 해야 하는 백업 (저장소 밖)

`production-migration-contract.md`에 명시된 대로, **저장소 밖 로컬 `private-backup` 폴더**에 보관합니다.

| 대상 | 방법 | 주의 |
|---|---|---|
| 전체 구조 + 함수 정의 + 권한 | Supabase SQL Editor에서 ①-C를 원문(`pg_get_functiondef` 전체)으로 실행 → 결과 저장 | 지문이 아니라 원문 |
| 기존 회원 1건 export | 대표가 직접 추출 | 실제 고객 데이터이므로 채팅·브라우저에 넣지 않음 |
| Supabase 자동 백업 시점 확인 | Supabase 대시보드 → Database → Backups | **위 백업은 Supabase 전체 백업을 대신하지 않습니다.** Auth 비밀번호·Storage 파일은 별도입니다 |
| 적용 직전 수동 백업 | 가능하면 적용 직전 시점의 복원 지점 확보 | 플랜 등급에 따라 PITR 가능 여부가 다릅니다 |

**비밀값(DATABASE_URL, service key)은 파일·채팅·브라우저에 입력하지 않습니다.** 런북의 기존 원칙입니다.

---

## ③ 적용 순서와 트랜잭션 묶음 단위

### 묶음 단위 (확정)

`migrate.mjs` 방식에서 **파일 1개 = 트랜잭션 1개**입니다. 057·058·059를 한 트랜잭션으로 묶지 않습니다.
이유: 하나가 실패해도 앞선 파일이 살아 있어야 ledger와 실제 상태가 어긋나지 않고,
`schema_migrations` 기록이 파일 단위로 남습니다.

### 순서

```
0) 백업 (②) 완료 확인
1) 057  고객센터 구조 (support_threads / messages)
        → 독립. 기존 함수 변경 없음         [파일 수령 후 확정]
2) 058  전문가 설정 (self_map_visible, visit_catalog·urgent request 숨김 검사)
        → 046 visit_available·visit_catalog 와 맞물림. 1차 지시 1항의 수정분 반영 후에만 적용
3) 059  기존 예약 원래 시각 확정 완화
        → 056 check_reservation_slot_before_visits 의존. 058과 분리된 별도 커밋·별도 파일
```

### 순서를 바꾸면 안 되는 이유

- **058 → 059**: 059는 056의 `check_reservation_slot_before_visits`를 건드리고, 058도 예약 경로에
  영향을 줍니다. 번호 순서가 곧 `migrate.mjs`의 적용 순서이므로 파일명을 지키면 자동으로 보장됩니다.
- **057은 독립**이지만 번호가 앞이므로 먼저 적용됩니다. 문제될 것은 없습니다.

### 금지 사항 (계약 문서 기준)

- **이미 적용된 파일을 수정해 재실행하지 않습니다.** 고칠 일이 생기면 새 번호를 만듭니다.
- 동시 실행은 각 파일의 advisory lock으로 직렬화됩니다. 두 사람이 동시에 실행하지 않습니다.
- 042·043 번호는 이미 `042_region_waitlist` · `043_auth_phone_status_bridge`가 점유하고 있습니다.
  **제가 앞서 만든 `042_booking_discovery_fix.sql` · `043_expert_visibility_split.sql`은 폐기이며
  이 적용 계획에 포함하지 않습니다.** (사유는 §부록)

---

## ④ 적용 직후 확인 (쿼리 6 + 화면 4)

### 쿼리

1. ```sql
   select name from private.schema_migrations where name like '05%' order by name;
   ```
   → 057·058·059가 기록됐는지
2. ①-D 재실행 → `self_map_visible` 컬럼 존재 확인
3. ①-B 재실행 → `match_expert_roster` 가드가 **그대로 true**인지 (058이 덮어쓰지 않았는지)
4. ```sql
   select proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='private' and proname in ('visit_available','check_reservation_slot_before_visits');
   ```
   → 046·056 함수가 사라지지 않았는지
5. ①-F 재실행 → 승인 전문가 수·진행 중 예약 수가 **적용 전과 동일**한지 (데이터 유실 없음)
6. ```sql
   select count(*) from private.consultations
    where state in ('requested','coordinating','confirmed','scheduled','awaiting_completion');
   ```
   → 진행 중 예약이 하나도 상태가 바뀌지 않았는지

### 화면 (운영 배포 후)

7. 전문가 계정: 설정 화면에서 지도 스위치가 현재 상태를 올바르게 표시하는지
8. 전문가 계정: 지도 OFF → 소비자 계정에서 목록·홈 지도에서 사라지는지
9. 전문가 계정: 지도 OFF 상태에서 **이미 받은 예약**의 고객 연락처가 보이고 완료 확인이 되는지
10. 소비자 계정: 전문가를 골라 예약 진입이 막히지 않는지

9번이 가장 중요합니다. 1차 지시 1항(a)가 바로 이 지점이고, 여기서 실패하면 즉시 ⑤로 넘어갑니다.

---

## ⑤ 실패 시 원복 순서와 '원복해도 남는 것'

### 원복 순서 (역순)

```
1) Netlify: 검증된 이전 배포로 롤백 (화면 먼저 되돌림 — 없는 RPC를 호출하지 않게)
2) DB: 번호 역순으로 원복
     rollback_existing_office_hours.sql   (059)   [작성 필요]
     rollback_expert_settings.sql         (058)   [작성 필요]
     rollback_support_threads.sql         (057)   [작성 필요]
3) private.schema_migrations 에서 해당 행 삭제 (삭제하지 않으면 재적용이 건너뛰어짐)
4) ②의 backup 테이블에서 함수 원문을 꺼내 복원
5) ①-B·①-C 재실행으로 지문이 적용 전과 같은지 확인
```

원복 파일 이름은 저장소 관례(`rollback_<기능명>.sql`, 번호 없음)를 따릅니다.
기존 예: `rollback_booking_hardening.sql`, `rollback_expert_visits.sql`, `rollback_appointment_care.sql`.

### 원복해도 남는 것 — 대표께 반드시 설명할 항목

`production-migration-contract.md`가 정한 대로 원복 SQL은 **비파괴적 운영 롤백**입니다.
스키마를 과거 상태로 삭제 복원하지 않습니다. 따라서:

| 남는 것 | 이유 |
|---|---|
| **전문가의 '지도 숨김' 선택** | `self_map_visible` 컬럼과 값은 보존합니다. 원복 후에도 숨김을 선택했던 전문가는 숨김 상태로 남습니다. 지우면 전문가의 의사 표시를 임의로 뒤집는 것이 됩니다 |
| **고객센터 대화 데이터** | `support_threads` / `support_messages`의 행은 보존합니다. 고객이 보낸 문의를 삭제하면 안 됩니다 |
| 추가된 테이블·컬럼 자체 | 삭제하지 않습니다. 함수와 권한만 되돌립니다 |
| 동의 기록(`member_consents`) | UPDATE/DELETE를 거부하는 추가 전용 테이블입니다 |
| 업로드 자료 메타데이터·Storage | 보존합니다 |

→ **원복은 "기능을 끄는 것"이고 "데이터를 지우는 것"이 아닙니다.** 1차 지시 1항(e)가 요구한
   '완전 원복이 아님' 명시를 각 원복 SQL 파일 머리말에도 같은 문장으로 넣습니다.

---

## ⑥ 화면 배포와 DB 적용의 순서

### 결론: **DB 먼저 → 화면 나중**

| 단계 | 작업 | 이유 |
|---|---|---|
| 1 | DB에 057·058·059 적용 | 058은 새 컬럼과 새 RPC를 만듭니다 |
| 2 | ④의 쿼리 1~6 확인 | 실패하면 화면을 건드리기 전에 ⑤로 |
| 3 | Netlify 배포 (화면) | `src/expert-settings.js`가 058의 새 RPC를 호출합니다 |
| 4 | ④의 화면 7~10 확인 | |

**화면을 먼저 배포하면 안 됩니다.** 새 화면이 아직 없는 RPC를 호출해 전문가 설정 화면 전체가
오류로 열리지 않습니다. 반대로 DB를 먼저 적용하면, 구버전 화면은 새 컬럼을 모르는 채
기존 동작을 그대로 유지합니다(하위호환).

**원복은 역순입니다** — 화면을 먼저 되돌립니다. ⑤의 1번이 그 이유입니다.

### Netlify 배포 방식

`main`에 push하면 배포됩니다. 저장소 커밋 이력에 `[skip netlify]` 태그 관례가 있어,
문서·SQL만 올릴 때는 그 태그로 배포를 건너뛸 수 있습니다.
**화면 배포 시점은 대표가 의도적으로 고르는 것이며, SQL 커밋에 딸려 나가지 않게 해야 합니다.**

---

## ⑦ 예상 작업 시간과 대표가 직접 할 일

### 예상 시간

| 단계 | 시간 | 비고 |
|---|---|---|
| ② 백업 (①-C 원문 추출 + 회원 1건 + 백업 시점 확인) | 20~30분 | 대표 직접 |
| ①의 A~F 비교 쿼리 실행·대조 | 15분 | 대표 직접 (결과는 공유 가능) |
| 057·058·059 적용 | 5~10분 | 파일 3개, 각각 별도 트랜잭션 |
| ④ 쿼리 1~6 | 10분 | |
| Netlify 배포 + 빌드 | 5분 | |
| ④ 화면 7~10 (계정 2개로 교차 확인) | 30~40분 | 가장 오래 걸립니다 |
| **합계** | **약 1시간 40분 ~ 2시간** | 문제 없이 진행될 때 |
| 원복이 필요할 경우 | +30~40분 | |

처음 시도는 **주말 낮 등 이용자가 적은 시간대**를 권합니다. 9번(지도 OFF 상태의 기존 예약)에서
실패하면 그 시점에 예약을 진행 중인 전문가·고객이 직접 영향을 받습니다.

### 대표가 직접 해야 하는 일 (제가 할 수 없는 것)

| 항목 | 이유 |
|---|---|
| Supabase SQL Editor에서 SQL 실행 | 운영 DB 접근 권한. 이 세션에서 거부됩니다 |
| `DATABASE_URL` 설정 (`migrate.mjs` 사용 시) | 비밀값. 제가 취급하지 않습니다 |
| Supabase 백업 시점 확인·복원 지점 확보 | 대시보드 권한 |
| 회원 1건 export | 실제 고객 데이터 |
| Netlify 배포 트리거 / 이전 배포로 롤백 | 배포 권한. 이 세션에서 거부됩니다 |
| 테스트 계정 2개(전문가·소비자) 로그인 교차 확인 | 자격증명. 제가 취급하지 않습니다 |
| 360·390px 캡처 | 실제 기기·브라우저 |

### 제가 할 수 있는 일

- 057·058·059 파일을 받으면 ①-C 대상 함수 목록 확정, ④ 쿼리 보강, 원복 SQL 3종 작성
- 적용 결과·에러 메시지를 주시면 원인 판정
- 코드 수정(1차 지시 1~4항) — **단 `codex/interaction-settings` push가 선행 조건**

---

## 부록. 제 042·043을 이 계획에서 제외한 사유

총괄 판단이 맞습니다. 근거를 확인했습니다.

- **번호 충돌**: `042_region_waitlist.sql` · `043_auth_phone_status_bridge.sql`이 이미 존재합니다.
- **`056:15`이 `specialty_match`를 재정의**합니다. 제 042의 해당 블록은 중복이며 덮어쓸 위험이 있습니다.
- **`046:101`이 `urgent_offers`에 `(r.id, target, 1, …)` 한 행만 삽입**합니다.
  소비자가 고른 전문가 1명에게 rank 1로 들어갑니다. **5명 자동배분은 046에서 이미
  소비자 직접 선택 방식으로 해결됐습니다.** 제 042의 차단 블록은 불필요합니다.
- **`056:51-53`이 `match_expert_roster`에 `new.status='APPROVED'` 가드를 추가**합니다.
  제가 올렸던 승인 강등 의심(§2-J)도 이미 처리됐습니다.
- 제 043은 046의 `check_reservation_slot` 래퍼를 덮어써 방문 약속 겹침 검사와
  신규 예약 30분 리드타임을 지웁니다. **적용하면 안 됩니다.**

제 로컬 브랜치 `fix/booking-discovery-042`에 커밋 3개가 남아 있습니다(push 안 됨).
**병합하지 말고 삭제를 권합니다** — `git branch -D fix/booking-discovery-042`.
그 안의 `docs/review-20261010-*.md` 2종은 이미 파일로 전달했으므로 분석 내용은 남습니다.

### 다만 아직 살아 있는 항목 하나

`origin/main:src/availability.js`는 **변경되지 않았습니다.**
`Date.parse(p.availability_until) > now`를 요구하는데 `availability_until`은 046·056·`directory.js`·
`map.js` 어디에서도 내려주지 않습니다(저장소 전체 0건). 따라서 **🟢지금 가능 배지는 현재
운영에서 표시되지 않습니다.**

1차 지시 4항(a)의 "`planner_catalog`가 `availability_until = least(방문 종료시각, 위치 갱신시각+30분)`을
함께 반환"이 정확한 해결책입니다. 제가 임시로 손봤던 클라이언트 우회는 폐기하고 4항(a)로 가는 것이 맞습니다.

---

## 다음 단계

1. **Codex가 `codex/interaction-settings` push** ← 이 계획의 빈칸이 채워지는 조건
2. 057·058·059 원문 확보 후 제가 ①-C 함수 목록 확정 + 원복 SQL 3종 작성
3. 총괄 검수
4. 대표 승인 후 ②부터 순차 실행

**현재 상태: 운영 미적용 · 미배포 · 운영 DB 조회 0건.**
