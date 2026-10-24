// Exact catalog table DDL/constraints from migrations. Progress/auth dependencies
// are minimal fixtures; this is not Supabase or authorization acceptance.
const fs = require('node:fs')
const path = require('node:path')
const { PGlite } = require('@electric-sql/pglite')
const root = path.resolve(__dirname, '../..')
const read = file => fs.readFileSync(path.join(root, 'supabase/migrations', file), 'utf8')

async function createFixture() {
  const db = new PGlite()
  const baseline = read('20260830000000_baseline.sql')
  const names = ['curriculums', 'curriculum_levels', 'curriculum_subjects', 'curriculum_subject_components']
  await db.exec(`
    create role anon; create role authenticated;
    create function public.has_role(text) returns boolean language sql as $$select false$$;
    create function public.set_updated_at() returns trigger language plpgsql as $$begin new.updated_at=now(); return new; end$$;
    create table public.student_component_progress(id uuid primary key default gen_random_uuid(), status text default 'IN_PROGRESS');
    create table public.student_curriculum_enrollments(id uuid primary key default gen_random_uuid(), status text default 'ACTIVE');
    create table public.student_level_progress(id uuid primary key default gen_random_uuid(), status text default 'IN_PROGRESS');
    create table public.student_subject_progress(id uuid primary key default gen_random_uuid(), status text default 'IN_PROGRESS');
    insert into student_component_progress default values;
    insert into student_curriculum_enrollments default values;
    insert into student_level_progress default values;
    insert into student_subject_progress default values;
  `)
  for (const name of names) {
    const ddl = baseline.match(new RegExp(`CREATE TABLE IF NOT EXISTS "public"\\."${name}" \\([\\s\\S]*?\\n\\);`))?.[0]
    if (!ddl) throw new Error(`Missing actual DDL for ${name}`)
    await db.exec(ddl)
  }
  for (const sql of baseline.matchAll(/ALTER TABLE ONLY "public"\."([^"]+)"\s+ADD CONSTRAINT [\s\S]*?;/g)) {
    if (names.includes(sql[1])) await db.exec(sql[0])
  }
  await db.exec(read('20260918070000_academic_component_items.sql'))
  await db.exec(read('20260918074500_component_completion_rule.sql'))
  return db
}

async function snapshot(db, tables = ['curriculums', 'curriculum_levels', 'curriculum_subjects', 'curriculum_subject_components', 'curriculum_component_items']) {
  const result = {}
  for (const table of tables) result[table] = (await db.query(`select * from public.${table} order by id`)).rows
  return result
}
module.exports = { createFixture, snapshot }
