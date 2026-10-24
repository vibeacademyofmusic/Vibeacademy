// Run with: node scripts/test-direct-assessment-migration.cjs
// Supabase test db only mounts the tests directory, so load the ACTUAL migration
// here and stream the transaction-scoped pgTAP fixture to the LOCAL container.
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { execFileSync } = require('node:child_process')
const migration = readFileSync(resolve(__dirname, '../supabase/migrations/20260918003000_fix_direct_assessment_subjects.sql'), 'utf8')
const sql = `begin;
create extension if not exists pgtap with schema extensions;
select plan(8);
insert into public.curriculums(id,code,name) values('bda00000-0000-0000-0000-000000000001','DIRECT-MIGRATION-TEST','Migration fixture');
insert into public.curriculum_levels(id,curriculum_id,code,name,sequence_no) values('bda00000-0000-0000-0000-000000000002','bda00000-0000-0000-0000-000000000001','FIXTURE','Fixture level',1);
insert into public.curriculum_subjects(id,level_id,family_code,code,name,is_required,completion_rule) values
('aa9eb2eb-e204-44f5-8b50-b50c9926f185','bda00000-0000-0000-0000-000000000002','FIXTURE','ADVENTURE','Adventure Level 2B',true,'ALL_REQUIRED_COMPONENTS'),
('68f31cf3-f042-4bb8-8c33-c6066d2b94e3','bda00000-0000-0000-0000-000000000002','FIXTURE','THEORY','Music Theory Kid1',true,'ALL_REQUIRED_COMPONENTS'),
('bda00000-0000-0000-0000-000000000003','bda00000-0000-0000-0000-000000000002','FIXTURE','OTHER','Untargeted component subject',true,'ALL_REQUIRED_COMPONENTS');
${migration}
select is((select count(*) from public.curriculum_subjects where level_id='bda00000-0000-0000-0000-000000000002' and completion_rule='DIRECT_ASSESSMENT'),2::bigint,'only the two verified ID/name targets are corrected');
select ok((select bool_and(is_required) from public.curriculum_subjects where level_id='bda00000-0000-0000-0000-000000000002'),'required flags preserved');
select is((select completion_rule from public.curriculum_subjects where id='bda00000-0000-0000-0000-000000000003'),'ALL_REQUIRED_COMPONENTS','unrelated subject unchanged');
select is((select count(*) from public.curriculum_subject_components where subject_id in ('aa9eb2eb-e204-44f5-8b50-b50c9926f185','68f31cf3-f042-4bb8-8c33-c6066d2b94e3')),0::bigint,'no fake components inserted');
update public.curriculum_subjects set updated_at='2000-01-01' where id in ('aa9eb2eb-e204-44f5-8b50-b50c9926f185','68f31cf3-f042-4bb8-8c33-c6066d2b94e3');
${migration}
select ok((select bool_and(updated_at='2000-01-01'::timestamptz) from public.curriculum_subjects where id in ('aa9eb2eb-e204-44f5-8b50-b50c9926f185','68f31cf3-f042-4bb8-8c33-c6066d2b94e3')),'rerun does not rewrite already corrected targets');
update public.curriculum_subjects set name='Unexpected subject' where id='aa9eb2eb-e204-44f5-8b50-b50c9926f185';
select throws_ok($migration_test$${migration}$migration_test$,'P0001','Direct assessment migration: unexpected configuration for Adventure Level 2B (aa9eb2eb-e204-44f5-8b50-b50c9926f185). Verify target scope.','mismatched ID/name fails closed');
update public.curriculum_subjects set name='Adventure Level 2B' where id='aa9eb2eb-e204-44f5-8b50-b50c9926f185';
insert into public.curriculum_subjects(id,level_id,family_code,code,name) values('bda00000-0000-0000-0000-000000000004','bda00000-0000-0000-0000-000000000002','FIXTURE','DUPLICATE','Adventure Level 2B');
select throws_ok($migration_test$${migration}$migration_test$,'P0001','Direct assessment migration: ambiguous or different ID for Adventure Level 2B. Verify curriculum/level/subject codes before deployment.','duplicate name fails closed');
delete from public.curriculum_subjects where id='aa9eb2eb-e204-44f5-8b50-b50c9926f185';
select throws_ok($migration_test$${migration}$migration_test$,'P0001','Direct assessment migration: ambiguous or different ID for Adventure Level 2B. Verify curriculum/level/subject codes before deployment.','different environment ID fails closed');
select * from finish();
rollback;
`
const output = execFileSync('docker', ['exec', '-i', 'supabase_db_vibe-academy-system', 'psql', '-X', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres'], { input: sql, encoding: 'utf8' })
process.stdout.write(output)
if (/^not ok/m.test(output) || !/^1\.\.8$/m.test(output) || (output.match(/^ok \d+ -/gm) || []).length !== 8) process.exitCode = 1
