const fs = require('node:fs')
const path = require('node:path')
const { buildPlan } = require('../lib/academic/piano-pre-pa1.cjs')
const root = path.resolve(__dirname, '..')

function extractFunction(file, signatureStart) {
  const sql = fs.readFileSync(path.join(root, file), 'utf8')
  const start = sql.indexOf(signatureStart)
  if (start < 0) throw new Error(`Missing ${signatureStart}`)
  const end = sql.indexOf('$$;', start)
  if (end < 0) throw new Error(`Unclosed ${signatureStart}`)
  return sql.slice(start, end + 3)
}

function displayFunctions() {
  const teacher = extractFunction(
    'supabase/migrations/20260924160000_teacher_session_workspace_v1.sql',
    'create or replace function public.session_teaching_academic(p_program uuid)',
  ).replace(
    "jsonb_build_object('id',i.id,'name',i.name,'progress_id',ip.id,'status',coalesce(ip.status,'NOT_STARTED'))",
    "jsonb_build_object('id',i.id,'code',i.code,'name',i.name,'progress_id',ip.id,'status',coalesce(ip.status,'NOT_STARTED'))",
  )
  if (!teacher.includes("'code',i.code")) throw new Error('Teacher lesson label was not updated')
  const video = extractFunction(
    'supabase/migrations/20261004183000_academic_video_links.sql',
    'create function public.academic_video_link_context(p_student uuid, p_enrollment uuid)',
  ).replace(
    'create function public.academic_video_link_context',
    'create or replace function public.academic_video_link_context',
  ).replace(
    "'lesson_name',concat_ws(' · ',s.name,c.name,i.name)",
    "'lesson_name',concat_ws(' · ',s.name,c.name,i.code,i.name)",
  ).replace(
    "'name',concat_ws(' · ',s.name,c.name,i.name)",
    "'name',concat_ws(' · ',i.code,i.name)",
  )
  if (!video.includes('i.code,i.name')) throw new Error('Video lesson label was not updated')
  return `${teacher}\n\n${video}\n`
}

const guideDdl = `
create table if not exists public.curriculum_lesson_guides (
  item_id uuid primary key references public.curriculum_component_items(id) on delete cascade,
  source_book text not null,
  source_edition text not null,
  source_authors text not null,
  source_pages text not null,
  piece_reference text not null,
  learning_objectives text not null,
  core_concepts text not null,
  teacher_demonstration text not null,
  guided_practice text not null,
  independent_practice text not null,
  review text not null,
  checkpoint text not null,
  homework text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint curriculum_lesson_guides_pages_check check (source_pages ~ '^[0-9]{1,3}(, [0-9]{1,3})?$'),
  constraint curriculum_lesson_guides_objective_check check (learning_objectives like 'Student performs %')
);

create index if not exists curriculum_lesson_guides_pages_idx
  on public.curriculum_lesson_guides (source_pages);

drop trigger if exists trg_curriculum_lesson_guides_updated_at on public.curriculum_lesson_guides;
create trigger trg_curriculum_lesson_guides_updated_at
before update on public.curriculum_lesson_guides
for each row execute function public.set_updated_at();

alter table public.curriculum_lesson_guides enable row level security;
revoke all on public.curriculum_lesson_guides from public, anon, authenticated;
grant select on public.curriculum_lesson_guides to authenticated;
grant all on public.curriculum_lesson_guides to service_role;

drop policy if exists curriculum_lesson_guides_super_admin_read on public.curriculum_lesson_guides;
create policy curriculum_lesson_guides_super_admin_read
on public.curriculum_lesson_guides
for select to authenticated
using (public.has_role('SUPER_ADMIN'));
`

function authoringBody() {
  const payload = JSON.stringify(buildPlan()).replaceAll("'", "''")
  const sql = fs.readFileSync(path.join(__dirname, 'sql/piano-pre-pa1-authoring.sql'), 'utf8')
  return `create temp table if not exists pa1_plan(payload jsonb) on commit drop;\ndelete from pa1_plan;\ninsert into pa1_plan values ('${payload}'::jsonb);\n${sql}`
}

function buildMigration() {
  return `-- Piano Pre Grade: Piano Adventures Level 1 Lesson Book.
-- Renames the existing Methode Book subject when that catalog is already present.
-- A database without PIANO keeps this schema and does not invent a second program.
${guideDdl}
${displayFunctions()}
${authoringBody()}
`
}

function buildAuthoringSql() {
  return `begin;\n${guideDdl}\n${authoringBody()}\ncommit;\n`
}

module.exports = { buildMigration, buildAuthoringSql, guideDdl, displayFunctions, authoringBody }

if (require.main === module) {
  const target = path.join(root, 'supabase/migrations/20261005234500_piano_pre_pa1_lesson_book.sql')
  fs.writeFileSync(target, buildMigration())
  console.log(target)
}
