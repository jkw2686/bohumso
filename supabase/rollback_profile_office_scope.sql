begin;
do $$declare item record;begin
 for item in select definition from private.profile_scope_backup loop execute item.definition;end loop;
end$$;
-- Keep existing optional data and backup definitions.
commit;
