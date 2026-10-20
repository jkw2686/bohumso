-- 073 원복. 기본은 API만 끊고 표는 남긴다(관리자가 넣은 연락처를 말없이 지우지 않는다).
-- 표까지 지우려면 아래 DROP 두 줄의 주석을 직접 풀고 실행한다.
begin;
select pg_advisory_xact_lock(730073);

drop function if exists public.insurer_contacts_command(text,jsonb);
drop function if exists private.insurer_rows(boolean);
drop function if exists private.insurer_reader();

do $$declare n integer;begin
 select count(*) into n from private.insurer_contacts;
 if n>0 then raise notice '보험사 연락처 %건은 남겨 둡니다. 표까지 지우려면 이 파일의 DROP 주석을 푸세요.',n;end if;
end$$;

-- drop table if exists private.insurer_favorites;
-- drop table if exists private.insurer_contacts;
commit;
