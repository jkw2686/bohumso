# 삼성화재 링크 최소 수정 — 2026-10-14

코드 수정 완료. 배포·원격 main 변경·DB/설정 변경 없음.

## 변경
- public/claim-resources-data.js: 삼성화재 URL/대체 홈페이지/메뉴/버튼명/verification/checkNote/checkedAt만 변경. reviewStatus=detail은 실제 본문 확인에 맞게 유지.
- src/help-guide-content.mjs: 공통 삼성화재 필요서류 URL 교체.
- public/help/{claim,death,cancer,hospitalization,accident}.html: 공통 원본에서 재생성한 링크 5개.
- 빌드 시 public/assets/rights.js의 데이터 사본도 재생성됨(Git 제외 산출물).
- 기존 scopeSource/importedVerification/sourceNote/sourceDate=2026-10-10 보존. 다른 보험사 데이터 불변.

## 최종 링크
https://www.samsungfire.com/v2/html/customer/13/G_030_010_010.html

공식 홈페이지의 보험금 청구 → 질병/상해 필요서류 안내 버튼에서 발견. 후보 P_P03_01_02_009는 삼성화재 홈으로 이동하여 채택하지 않음. 나머지 구형 후보는 채택하거나 검증 완료로 표시하지 않음.

## 실제 검수
- IAB에서 최종 주소를 직접 열어 1440×900 및 390×844의 제목/질병·상해 탭/공통서류 본문/청구서 양식 메뉴 확인. 개인정보·청구·다운로드 없음.
- 로컬 자료실 검색 삼성화재 1건, 확인정보 펼치기, 검수일/원자료 날짜 구분 확인. 전문가 살펴보기 클릭 시 map.html?view=experts&situation=claim 유지 및 지도 화면 열림.
- 자료실과 소비자 안내 5곳의 외부 링크 클릭 후 원래 URL 유지 확인. target=_blank 및 rel=noopener noreferrer 유지. IAB가 외부 새 창을 제어 가능한 탭으로 노출하지 않아 클릭 후 외부 새 창 본문 자체의 추적 검증은 미완료. 최종 목적지 본문은 별도 직접 탐색으로 확인.
- node scripts/build.mjs 통과. node --test tests/claim-resource-search.test.mjs 2개 통과.
- 기존 claim-resources-browser의 자료실 검사는 320/360/390/768/1440px 모두 통과. 후속 예약 검사는 18:00 가상 입력이 현행 09~17시 슬롯과 맞지 않아 실패.
- 기존 claim-help-browser는 가상 전문가 지도핀 1개 기대/실제0에서 실패. 통합 검사 전체 통과로 보고하지 않음. 이 테스트/예약/지도 코드는 수정하지 않음.

## 한계·다음 단계
- 모바일 실기기, 모든 청구 항목/서식 다운로드/실제 접수 미검증.
- 운영 배포 후 링크 클릭 재검수 필요. 과거 직군별 배포 승인은 완료된 별도 작업이며 이번 배포 승인으로 확대하지 않음.
- 원래 작업 폴더 보존. 최신 main 739a5d2 기반 별도 작업본에서 수정; 현재 운영 코드 fb970b4와 동일한 관련 링크임.
- 제한 환경에서 기존 폴더의 광범위 Git/remote 열람은 자동 검토가 거절. 이후 사용자 최신 수정 요청을 명시한 해당 폴더 하나의 status/log만 승인받아 읽었고, 원격 URL 일괄 열람하지 않음. 남은 권한 차단 없음.
