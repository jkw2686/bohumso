# 코드 검토 노트 — 결제·예약·매칭 경로 (배포 전 QA)

범위: `supabase/003_consultations.sql`, `004_payment_ledger.sql`, `005_matching_worker.sql`, `netlify/functions/payment.mts`, `_shared/payments.mjs`, `public-config.mjs`.
결론: **돈·예약 정합성 및 접근권한 관점에서 수정이 필요한 버그를 발견하지 못함.** 아래는 확인된 방어 장치와 소소한 강건성 노트.

## 확인된 정합성 방어 장치
- **쿠폰 원자성**: 무료 이용권 예약(`confirm`)·수락(`accept`)·완료(`complete_confirm`)·후속(`followup_confirm`)이 모두 `planner_directory` 행을 `for update`로 잠근 뒤 `free_remaining`을 계산·갱신한다. 같은 설계사에 대한 동시 확정이 직렬화되어 한도 초과 예약이 방지된다.
- **슬롯 유일성**: 부분 유니크 인덱스 `consultation_slot(planner_id,preferred_at) where state in ('confirmed','scheduled','awaiting_completion')`와 `followup_slot`이 이중 예약을 하드 차단한다.
- **결제 단계 게이팅**: 유료 건은 stage-1 정산(`connection_reconcile`) 후에만 `scheduled`가 되어 `complete_request` 가능. `complete_confirm`이 유료 건을 `balance_due`로 전이시켜 stage-2 `connection_checkout` 조건(payment_state∈{balance_due,confirming,failed} ∧ state=completed)을 충족. → 미결제 완료·이중청구 경로 없음.
- **지연 성공이 환불을 되살리지 않음**: `connection_reconcile`의 DONE 처리는 주문이 이미 refund 계열이면 `reconcile_refund`로 빠져 상태를 되돌리지 않는다.
- **불확실 거래 처리**: 승인 타임아웃/중복은 실패로 단정하지 않고 재조회(`payment_status_pending`).
- **분쟁 잔금 보류**: 미해결 dispute/refund/no_show 이슈가 있으면 checkout이 `dispute_on_hold`로 차단.
- **접근권한**: 고객 연락처는 `customer_ok ∧ state∈{scheduled,awaiting_completion}`일 때만, 그것도 자기 담당 건에 한해 설계사에게 노출. 민감 테이블 직접권한 0, 결제 반영은 service_role 전용.
- **구형 우회 차단**: 003 말미에서 구형 쓰기 API의 authenticated 실행권한 제거.

## 소소한 강건성 노트 (버그 아님, 선택 개선)
1. 슬롯 이중예약 등 경합은 Postgres `unique_violation` 원시 오류로 표출된다. 앱 계층에서 사용자 친화 메시지로 매핑되는지 확인 권장(기능상 안전은 유지).
2. `resolve_issue`는 해당 예약의 **미해결 이슈 전체**를 한 번에 resolved 처리한다(예약 단위 해결 모델). 개별 이슈만 닫아야 하는 요구가 생기면 조정 필요.
3. 무료 노쇼 복원은 자동이 아니라 **관리자 `resolve_issue(outcome='cancelled')`**로 reserved 쿠폰이 released 된다(설계상 "확인된 노쇼" 요건과 일치).
4. 2단계 결제는 `total_won/2` 균등분할 — 정책 금액은 짝수 유지(테이블 제약 `total_won%2=0`으로 이미 강제됨. 확인함).

## 미검토/실측 필요 (인적 게이트)
- 실제 독립 PostgreSQL 연결 간 동시성 부하검사(현재는 로컬 직렬 요청·락/제약 검사).
- 실제 토스 테스트 상점 승인·환불·웹훅 재전송.
- 프론트엔드 onclick→addEventListener 리팩터링 시 결제/관리자 흐름 브라우저 회귀.
