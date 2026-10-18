-- 072 원복: 보관해 둔 직군 표시명으로 되돌린다. 데이터 삭제 없음.
begin;
select pg_advisory_xact_lock(720072);
update private.profession_definitions d
 set definition=jsonb_set(d.definition,'{name}',to_jsonb(b.name))
 from private.profession_label_backup_20261018 b
 where d.id=b.id and d.definition->>'name' is distinct from b.name;
commit;
