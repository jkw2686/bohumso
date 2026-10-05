import {readFile} from 'node:fs/promises';
export const migrations=['030_public_early_access.sql','031_expert_early_access.sql','032_expert_verification.sql','033_reservation_integrity.sql','034_organization_roster.sql','035_operational_metrics.sql','036_member_rights_admin.sql'];
export async function earlyMigrationSQL(){
 let sql="begin;\nselect pg_advisory_xact_lock(hashtextextended('bohumso-early-migration',1));\ndo $baseline$ begin if to_regclass('private.release_controls') is null or to_regclass('private.service_areas') is null or to_regclass('private.office_locations') is null then raise exception 'production_027_baseline_required';end if;end $baseline$;\ncreate table if not exists private.schema_migrations(name text primary key,applied_at timestamptz not null default now());\nalter table private.schema_migrations enable row level security;\nrevoke all on private.schema_migrations from public,anon,authenticated;\n";
 for(const name of [...migrations,'expert_storage_setup.sql']){
  const source=(await readFile(new URL('../supabase/'+name,import.meta.url),'utf8')).replace(/^begin;\s*/m,'').replace(/commit;\s*$/,'');
  const tag='$migration_'+name.replace(/\W/g,'_')+'$';
  if(source.includes(tag))throw Error('SQL quote collision');
  sql+=`\n-- ${name}: skip the complete migration when already committed.\ndo $apply$ begin\nif not exists(select 1 from private.schema_migrations where name='${name}') then\nexecute ${tag}${source}${tag};\ninsert into private.schema_migrations(name) values('${name}');\nend if;end $apply$;\n`;
 }
 return sql+'commit;\n';
}
