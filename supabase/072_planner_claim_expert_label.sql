-- 직군 표시명만 바꾼다: 보험설계사 → 보험설계사(청구전문가).
-- 자격·승인·노출·예약·요금 조건은 건드리지 않는다. 재실행 안전.
begin;
select pg_advisory_xact_lock(720072);

-- 바꾸기 전 값을 한 번만 보관한다(원복용).
create table if not exists private.profession_label_backup_20261018(
 id text primary key,
 name text not null,
 saved_at timestamptz not null default now());
alter table private.profession_label_backup_20261018 enable row level security;
revoke all on private.profession_label_backup_20261018 from public,anon,authenticated;

insert into private.profession_label_backup_20261018(id,name)
select id,definition->>'name' from private.profession_definitions where id='planner'
on conflict(id) do nothing;

update private.profession_definitions
 set definition=jsonb_set(definition,'{name}','"보험설계사(청구전문가)"')
 where id='planner' and definition->>'name' is distinct from '보험설계사(청구전문가)';

do $$begin
 if (select definition->>'name' from private.profession_definitions where id='planner') is distinct from '보험설계사(청구전문가)'
  then raise exception 'planner_label_update_failed';end if;
end$$;
commit;
