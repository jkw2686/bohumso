# 특허 검토 필요사항

상태: **PATENT_ATTORNEY_REVIEW_REQUIRED**

현재 지도 탐색, 지역 중심 전문가 직접선택, 보험소 방문시간 요청, 보험소 담당자 배정, 수락·고객 확인 절차를 유지한다. 전문가 지도 좌표는 주활동지역 중심이며 개인별 판매 노출반경을 두지 않는다.

- DOCUMENT_BASED_RADIUS_ENABLED=false: 자격서류는 확인용이며 거리 확대에 사용하지 않는다.
- PAID_RADIUS_BOOST_ENABLED=false: 결제·구독과 노출거리를 분리한다.
- INVITE_RADIUS_BOOST_ENABLED=false: 초대와 노출범위를 분리한다.
- PERFORMANCE_RADIUS_BOOST_ENABLED=false: 실적·리뷰·계약건수로 개인 반경을 늘리지 않는다.
- PRODUCT_TO_EXPERT_MATCHING_ENABLED=false: 보험상품을 먼저 고르게 하는 매칭을 구현하지 않는다.
- ENABLE_LIVE_LOCATION=false / ENABLE_BACKGROUND_LOCATION=false: 고객의 1회 위치, 지역 중심, 참고 거리, 수동 진행상태만 사용한다.

변리사 검토 대상: 지도상 전문가 표시·직접선택·일정 연결, 보험소 방문예약·담당 배정, 주활동지역과 추가지역 노출, 지금 가능 표시·순차 요청, 향후 Android 위치 처리. 실제 청구항·권리 상태와 구현을 대조해야 한다. 이 문서는 비침해 판정이나 법률 의견이 아니다. 향후 실시간 이동 추적은 앱 안정화 및 별도 위치정보 검토 후 결정한다.
