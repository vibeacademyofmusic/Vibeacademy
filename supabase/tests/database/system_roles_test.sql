begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

create temporary table expected_system_roles (code text primary key);
insert into expected_system_roles values
  ('SUPER_ADMIN'), ('BRANCH_MANAGER'), ('ACADEMIC_MANAGER'), ('TEACHER'),
  ('STUDENT'), ('PARENT'), ('ACCOUNTANT'), ('STAFF');

select is(
  (select count(*) from public.roles r join expected_system_roles e using (code)),
  8::bigint, 'all eight expected system roles exist after migrations'
);
select is(
  (select count(*) from public.roles),
  (select count(distinct code) from public.roles),
  'role codes are unique'
);
select ok(exists (select 1 from public.roles where code = 'SUPER_ADMIN'),
  'SUPER_ADMIN exists without creating an auth user');
select is(
  (select count(*) from public.roles r join expected_system_roles e using (code)
    where r.is_system = true),
  8::bigint, 'all expected roles are marked as system roles'
);

-- Replay the applied migration from the Supabase ledger. The test container
-- does not mount the host migrations directory, so a psql include is not portable.
create function pg_temp.replay_system_roles_migration() returns void
language plpgsql as $$
declare
  migration_statements text[];
  statement text;
begin
  select statements into strict migration_statements
  from supabase_migrations.schema_migrations
  where version = '20260914170000';
  if coalesce(cardinality(migration_statements), 0) = 0 then
    raise exception 'System roles migration SQL is missing from the ledger';
  end if;
  foreach statement in array migration_statements loop
    execute statement;
  end loop;
end;
$$;
create temporary table original_roles as select * from public.roles;
do $$ begin perform pg_temp.replay_system_roles_migration(); end $$;
select results_eq(
  'select * from public.roles order by code',
  'select * from original_roles order by code',
  'reapplying the migration leaves existing role rows unchanged'
);

update public.roles set is_system = false, name = 'Existing admin name',
  description = 'Existing admin description' where code = 'SUPER_ADMIN';
insert into public.roles (code, name, description, is_system)
values ('ROLE_SEED_TEST_CUSTOM', 'Custom role', 'Keep custom metadata', false);
create temporary table custom_role_before as
  select * from public.roles where code = 'ROLE_SEED_TEST_CUSTOM';
do $$ begin perform pg_temp.replay_system_roles_migration(); end $$;
select ok((select is_system from public.roles where code = 'SUPER_ADMIN'),
  'an existing system code with is_system false is normalized');
select ok(exists (
  select 1 from public.roles r join original_roles o using (code)
  where r.code = 'SUPER_ADMIN' and r.id = o.id
    and r.name = 'Existing admin name'
    and r.description = 'Existing admin description'
), 'normalization preserves existing ID, name and description');
select results_eq(
  $$select * from public.roles where code = 'ROLE_SEED_TEST_CUSTOM'$$,
  'select * from custom_role_before',
  'a custom role outside the system code list is untouched'
);
select * from finish();
rollback;
