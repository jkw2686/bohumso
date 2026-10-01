# 비공개 소셜 로그인 설정

## 키를 넣을 파일
프로젝트 루트 `.env.social.local` (Git 제외). 브라우저 번들에 포함하지 않습니다.

```dotenv
SOCIAL_TEST_ENABLED=false
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
KAKAO_CLIENT_ID=
KAKAO_CLIENT_SECRET=
KAKAO_EMAIL_ENABLED=false
```

키 발급 후 테스트를 시작할 때만 SOCIAL_TEST_ENABLED=true로 바꾸세요.
- Google Cloud Console → Google Auth Platform → Clients → Web application. Audience는 Testing, 테스트 사용자 등록.
- Kakao Developers → 앱 → 카카오 로그인 활성화, REST API 키를 KAKAO_CLIENT_ID에 입력, Client Secret 발급. 닉네임 동의 항목 설정. 이메일 권한을 받을 수 있을 때만 KAKAO_EMAIL_ENABLED=true.
- 두 제공자 Redirect URI: `http://127.0.0.1:3200/auth/callback`
- 실행: `node --env-file=.env.social.local scripts/social-preview.mjs`
- 화면: http://127.0.0.1:3200/signup.html 또는 /login.html
- 클라이언트 ID는 OAuth 이동 URL에 포함되는 공개 식별자입니다. Secret, 토큰, 인가코드 교환은 서버에만 존재합니다. 코드/키를 채팅에 보내지 마세요.

## 범위와 검증
이 구현은 비공개 로컬 테스트 앱에만 연결됩니다. 공개 Supabase 로그인/배포/실회원 DB 변경 없음.
키 미설정 시 소셜 버튼 비활성, 별도 `테스트 체험 시작`은 명시적인 가상 세션입니다. 실제 OAuth 성공으로 표시하지 않습니다.
서버가 제공자 토큰을 교환하고 프로필을 조회합니다. 이메일 미동의/미제공 시 null, 이름 미제공 시 직접 입력. 토큰은 응답/브라우저 저장소에 전달하지 않습니다.
연락처는 010+8자리 형식만 검사하고 phone_verified=false, phone_source=manual로 서버 세션에 기록. 번호 소유 인증은 아닙니다.
카카오싱크는 사용하지 않으며 상태는 kakaoSync=false. 전환 시 별도 승인/구현 필요.
기존 테스트 역할·DB를 사용하는 화면이며, 영속 실계정/권한 시스템이 아닙니다. 프로필·소셜 세션은 서버 재시작 시 소멸. 전문가 승인 규칙은 유지.

실제 키/사용자 동의가 없어 실제 제공자 가입 E2E는 미검증. 테스트 응답으로 state 불일치/재사용 차단, 비밀값 미노출, 프로필 매핑 검증. 브라우저로 번호 직접 입력 및 인증 없이 가입 완료 검증.

공식 문서:
- https://developers.google.com/identity/protocols/oauth2/web-server
- https://developers.kakao.com/docs/ko/kakaologin/rest-api
