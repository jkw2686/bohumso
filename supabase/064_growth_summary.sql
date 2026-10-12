-- Development candidate; keeps existing drafts and publication permissions.
begin;
select pg_advisory_xact_lock(640064);
insert into private.expert_integration_backup
 select p.oid::regprocedure::text,pg_get_functiondef(p.oid) from pg_proc p
 where p.oid in ('private.growth_checks(jsonb)'::regprocedure,'private.growth_content_view(private.growth_contents)'::regprocedure)
 on conflict do nothing;
do $$declare definition text;begin
 definition:=pg_get_functiondef('private.growth_checks(jsonb)'::regprocedure);
 if position('summary' in definition)=0 then
  execute replace(definition,'begin',E'begin\n if length(coalesce(doc->>''summary'',''''))>200 then raise exception ''invalid_content'';end if;');
 end if;
 definition:=pg_get_functiondef('private.growth_content_view(private.growth_contents)'::regprocedure);
 if position('source_key' in definition)=0 then
  execute replace(definition,'''id'',c.id','''source_key'',c.source_key,''id'',c.id');
 end if;
end$$;
revoke all on function private.growth_checks(jsonb),private.growth_content_view(private.growth_contents) from public,anon,authenticated;
create or replace function public.growth_first_draft() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not private.is_admin() then raise exception 'admin_required';end if;
 return $template${"source_key":"bohumso-after-meeting-five-minutes-v1","content":{"title":"청구 상담을 마칠 때 확인할 세 가지","category":"tools","body":"1. 오늘 확인한 청구 절차와 아직 확인이 필요한 내용을 구분합니다.\n2. 추가 준비가 필요하면 고객과 전문가가 할 일을 각각 정리합니다.\n3. 다음 연락이 필요하면 고객과 날짜를 정합니다.\n\n청구 도움을 보험 가입의 조건으로 삼지 않습니다.\n고객이 요청하지 않은 가입 상담으로 대화를 전환하지 않습니다.\n\n‘나의 실천’에는 고객 이름·연락처·건강정보·보험계약·세무자료를 기록하지 마세요. ‘다음 상담 전 공식 안내 확인하기’처럼 개인정보 없는 자신의 할 일만 적어주세요.","practice":"상담 마무리 확인사항 정리하기","origin":"bohumso","method":"operator","sources":[],"checked_date":null,"base_date":null,"evidence":"pending","advertising":false,"summary":"오늘 확인한 내용과 다음 행동을 짧게 정리해 보세요."}}$template$::jsonb;
end$$;
revoke all on function public.growth_first_draft() from public,anon,authenticated;
grant execute on function public.growth_first_draft() to authenticated;
commit;
