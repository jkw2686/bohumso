# 관리자 재배포 버튼

## 동작
관리자 → 앱 업데이트·재배포 → 최신 버전 재배포 → 공개 사이트 변경 확인.
Netlify에 연결된 저장소와 Build Hook에 지정된 브랜치의 최신 코드를 빌드합니다.
PC의 미커밋 파일이나 아직 push하지 않은 변경은 포함되지 않습니다.
Git 자동 배포가 켜져 있으면 push 시 이미 배포될 수 있으므로 이 버튼은 수동 재빌드/재배포 용도입니다.

## 한 번 필요한 연결
1. 기존 계정 스키마(001)의 private.is_admin/admin_memberships가 있는 DB에 supabase/008_admin_deploy.sql을 한 번 적용합니다. 기존 테이블을 초기화하지 않습니다. Claude의 마이그레이션 러너와 이력 관리에 맞춰 적용하세요.
2. Netlify의 bohumso 프로젝트 → Build & deploy → Build hooks에서 지정 브랜치(main)를 사용하는 훅을 생성합니다. 훅을 테스트 호출하지 않습니다.
3. 생성된 훅 URL을 서버 전용 NETLIFY_ADMIN_BUILD_HOOK에 저장합니다. URL 자체가 배포 권한이므로 공개하면 안 됩니다.
4. config/admin-deploy.env.example의 변수와 기존 Supabase 서버 키, 정확한 APP_ORIGIN을 Functions 범위에 설정합니다.
5. 관리자 버튼 코드와 새 Function이 포함된 버전을 정상 릴리스 절차로 처음 한 번 배포해야 합니다. 해당 릴리스/DB/서버 설정이 준비된 뒤 ADMIN_REDEPLOY_ENABLED=true로 사용합니다.

이번 작업에서는 실제 DB 적용, Build Hook 생성·호출, 서버 변수 변경, 공개 배포를 수행하지 않았습니다.
연결된 Netlify 프로젝트는 도구에서 bohumso / 386bda36-11e1-4d2f-a82c-41c108616d04로 확인했습니다.

## 권한·중복·실패 처리
- 브라우저의 기존 woori-account 세션 토큰만 서버로 전송. 클라이언트가 보낸 관리자 표시값은 신뢰하지 않습니다.
- 서버에서 Supabase getUser + my_membership.admin 확인, POST Origin과 JSON/확인값/UUID 검증.
- 훅 URL은 api.netlify.com/build_hooks의 고정 패턴만 허용. 사용자 요청으로 URL·브랜치를 지정할 수 없습니다.
- DB 단일 잠금으로 요청 예약을 직렬화, 모든 관리자에 공통 10분 제한, UUID 재요청은 외부 호출 없이 기존 결과 반환.
- 상태/기록 조회는 관리자, claim/finish는 service_role만 허용.
- accepted는 Netlify가 요청을 접수했다는 의미이며 배포 성공을 뜻하지 않습니다. 실제 빌드 결과는 Netlify 배포 화면에서 확인합니다.
- 타임아웃/서버 오류는 unknown. 이미 시작됐을 수 있어 자동 재전송하지 않습니다.
- 훅 URL, 서비스 키, 원본 외부 오류는 응답/로그에 노출하지 않습니다.

## 검증
node --test tests/admin-redeploy.test.mjs
node tests/admin-console.cjs
외부 호출은 모의 처리, DB는 PGlite. 권한 거부, 출처 거부, 확인 누락, 비활성 설정, 중복·쿨다운, 타임아웃, 기록 보호, UI 취소·접수·비활성화를 검사합니다.
실제 Netlify 배포 성공 검증은 별도이며 이번 작업에서 실행하지 않았습니다.

공식 근거: https://docs.netlify.com/build/configure-builds/build-hooks/
