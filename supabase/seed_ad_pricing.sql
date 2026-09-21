-- 광고구독 요금제/슬롯 테스트 시드 (운영 데이터, 스키마 아님 → 번호 없는 파일로 자동 migrate 대상 아님)
-- CLAUDE.md §2: 정액 광고구독(노출 슬롯)만. 건당/성사 연동 금지.
-- Supabase(bohumso) SQL Editor에 붙여넣고 RUN. 멱등 — 여러 번 실행해도 안전.
-- 값은 테스트용 예시. 실제 운영가는 확정 후 ad_admin_command RPC 또는 이 파일로 갱신.
begin;

-- 요금제 3종: 가격/기간/약정노출 설정 + 활성화
update private.ad_plans set amount= 99000, period_days=30, guaranteed_impressions= 3000, enabled=true, reason='테스트 가격 2026-09'
 where code='basic';
update private.ad_plans set amount=199000, period_days=30, guaranteed_impressions= 8000, enabled=true, reason='테스트 가격 2026-09'
 where code='premium';
update private.ad_plans set amount=490000, period_days=30, guaranteed_impressions=20000, enabled=true, reason='테스트 가격 2026-09'
 where code='regional_exclusive';

-- 노출 슬롯: 요금제 code와 지역 조합. 수도권 3개 지역 개설.
insert into private.ad_slots(code,region,enabled) values
 ('basic','서울',true),('basic','경기',true),('basic','인천',true),
 ('premium','서울',true),('premium','경기',true),('premium','인천',true),
 ('regional_exclusive','서울',true),('regional_exclusive','경기',true),('regional_exclusive','인천',true)
on conflict(code,region) do update set enabled=true;

commit;

-- 확인용(선택): 활성 요금제/슬롯 조회
-- select code,name,amount,period_days,guaranteed_impressions,enabled from private.ad_plans order by amount;
-- select code,region,enabled from private.ad_slots order by code,region;
