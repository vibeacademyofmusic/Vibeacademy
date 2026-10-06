/* eslint-disable @typescript-eslint/no-require-imports -- Standalone CommonJS local utility. */
// Only the conflict-free, inactive authoring scaffold. No component/lesson mapping
// is inferred and no student/progress data is written.
const { execFileSync } = require('node:child_process')
const { buildPlan } = require('./curriculum-four-programs-plan.cjs')
const fs = require('node:fs')
const path = require('node:path')
const root = path.resolve(__dirname, '..')
const q = value => `'${String(value).replaceAll("'", "''")}'`

function sql(apply) {
  const plan = buildPlan().find(p => p.code === 'GUITAR')
  return `begin;
select pg_advisory_xact_lock(hashtextextended('vibe:curriculum-four-programs-v1',0));
lock table curriculums,curriculum_levels,curriculum_subjects in share row exclusive mode;
create temp table scaffold_audit(kind text,id uuid);
create temp table progress_before as select md5(coalesce(jsonb_agg(to_jsonb(p) order by id)::text,'')) digest from student_level_progress p;
do $scaffold$
declare p uuid; l uuid; s uuid; base integer;
begin
select id into strict p from curriculums where code='GUITAR';
select coalesce(max(sequence_no),0) into base from curriculum_levels where curriculum_id=p;
${plan.levels.map((level, i) => `
select id into l from curriculum_levels where curriculum_id=p and code=${q(level.code)};
if l is null then
  insert into curriculum_levels(curriculum_id,code,name,sequence_no,level_number,level_type,status)
  values(p,${q(level.code)},${q(level.name)},base+${i + 1},${level.grade ?? 'null'},${q(level.levelType)},'INACTIVE') returning id into l;
  insert into scaffold_audit values('level',l);
end if;
${level.subjects.map((subject, n) => {
    const code = subject.name.toUpperCase().replaceAll(' ', '_')
    return `select id into s from curriculum_subjects where level_id=l and code=${q(code)};
if s is null then
  insert into curriculum_subjects(level_id,code,name,family_code,subject_level,sort_order,status,is_required)
  values(l,${q(code)},${q(subject.name)},${q(code)},${level.grade ?? 'null'},${n + 1},'INACTIVE',false) returning id into s;
  insert into scaffold_audit values('subject',s);
end if;`
  }).join('\n')}`).join('\n')}
if (select digest from progress_before) is distinct from
 (select md5(coalesce(jsonb_agg(to_jsonb(progress_row) order by id)::text,'')) from student_level_progress progress_row) then
 raise exception 'Student level progress changed';
end if;
end $scaffold$;
select jsonb_build_object('mode',${q(apply ? 'APPLIED' : 'DRY_RUN')},'new_rows',coalesce(jsonb_agg(to_jsonb(a)),'[]'::jsonb)) from scaffold_audit a;
${apply ? 'commit' : 'rollback'};
`
}

if (require.main === module) {
  if (!['--dry-run', '--apply'].includes(process.argv[2]) || process.argv.length !== 3) throw new Error('Use --dry-run or --apply')
  if (process.cwd() !== root) throw new Error('Run from the MAIN worktree')
  const env = fs.readFileSync(path.join(root, '.env.local'), 'utf8')
  if (!/^NEXT_PUBLIC_SUPABASE_URL=http:\/\/127\.0\.0\.1:54321\s*$/m.test(env)) throw new Error('Not the verified local API')
  const apply = process.argv[2] === '--apply'
  const output = execFileSync('docker', ['exec', '-i', 'supabase_db_vibe-academy-system', 'psql', '-v', 'ON_ERROR_STOP=1', '-X', '-qAt', '-U', 'postgres', '-d', 'postgres'], {
    input: sql(apply), encoding: 'utf8', maxBuffer: 1024 * 1024,
  })
  process.stdout.write(output)
}
module.exports = { sql }
