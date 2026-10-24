const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const { buildPlan, buildMapMarkdown, VOLUME_1_NAME, VOLUME_2_NAME } = require('../lib/academic/guitar-pre-werner.cjs')
const { buildMigration } = require('../scripts/guitar-pre-werner-sql.cjs')
const { createFixture } = require('./helpers/curriculum-authoring-db.cjs')

const migrationPath = 'supabase/migrations/20261006040000_guitar_pre_grade_werner_volumes.sql'
const mapPath = 'docs/curriculum/guitar-pre-grade-werner-map-v1.md'

function codes(lessons) {
  return lessons.map(lesson => lesson.code)
}

async function guitarTree(db) {
  const program = (await db.query("insert into curriculums(code,name,status) values('GUITAR','Guitar','ACTIVE') returning id")).rows[0].id
  const other = (await db.query("insert into curriculums(code,name,status) values('PIANO','Piano','ACTIVE') returning id")).rows[0].id
  const pre = (await db.query("insert into curriculum_levels(curriculum_id,code,name,sequence_no,level_type,completion_rule,status) values($1,'PRE','Pre',1,'FOUNDATION','ALL_REQUIRED_SUBJECTS','ACTIVE') returning id", [program])).rows[0].id
  const grade = (await db.query("insert into curriculum_levels(curriculum_id,code,name,sequence_no,level_number,level_type,completion_rule,status) values($1,'GRADE_1','Grade 1',2,1,'GRADE','ALL_REQUIRED_SUBJECTS','ACTIVE') returning id", [program])).rows[0].id
  const pianoLevel = (await db.query("insert into curriculum_levels(curriculum_id,code,name,sequence_no,level_type,status) values($1,'PRE','Pre Grade',1,'FOUNDATION','ACTIVE') returning id", [other])).rows[0].id
  const method = (await db.query("insert into curriculum_subjects(level_id,code,name,family_code,status,is_required,completion_rule,sort_order) values($1,'METHODE_BOOK','Methode Book','METHODE_BOOK','INACTIVE',false,'ALL_REQUIRED_COMPONENTS',1) returning id", [pre])).rows[0].id
  const repertoire = (await db.query("insert into curriculum_subjects(level_id,code,name,family_code,status,is_required,completion_rule,sort_order) values($1,'REPERTOIRE','Repertoire Pre','REPERTOIRE','ACTIVE',true,'ALL_REQUIRED_COMPONENTS',1) returning id", [pre])).rows[0].id
  const technique = (await db.query("insert into curriculum_subjects(level_id,code,name,family_code,status,is_required,completion_rule,sort_order) values($1,'TECHNIQUE_FOUNDATION','Technique Foundation Pre','TECHNIQUE','ACTIVE',true,'ALL_REQUIRED_COMPONENTS',2) returning id", [pre])).rows[0].id
  await db.query("insert into curriculum_subjects(level_id,code,name,family_code,status,is_required,completion_rule,sort_order) values($1,'SIGHTREADING','Sightreading Pre','SIGHTREADING','ACTIVE',true,'ALL_REQUIRED_COMPONENTS',3)", [pre])
  await db.query("insert into curriculum_subjects(level_id,code,name,family_code,status,is_required,completion_rule,sort_order) values($1,'AURAL','Aural Pre','AURAL','ACTIVE',true,'ALL_REQUIRED_COMPONENTS',4)", [pre])
  const core = (await db.query("insert into curriculum_subject_components(subject_id,code,name,is_required,sort_order,completion_rule,status) values($1,'CORE','Core',true,1,'ALL_REQUIRED_ITEMS','ACTIVE') returning id", [repertoire])).rows[0].id
  const techniqueComponent = (await db.query("insert into curriculum_subject_components(subject_id,code,name,is_required,sort_order,completion_rule,status) values($1,'CORE','Core',true,1,'ALL_REQUIRED_ITEMS','ACTIVE') returning id", [technique])).rows[0].id
  const gradeSubject = (await db.query("insert into curriculum_subjects(level_id,code,name,family_code,status,is_required,completion_rule,sort_order) values($1,'REPERTOIRE','Repertoire Grade 1','REPERTOIRE','ACTIVE',true,'ALL_REQUIRED_COMPONENTS',1) returning id", [grade])).rows[0].id
  const gradeComponent = (await db.query("insert into curriculum_subject_components(subject_id,code,name,is_required,sort_order,completion_rule,status) values($1,'CORE','Core',true,1,'ALL_REQUIRED_ITEMS','ACTIVE') returning id", [gradeSubject])).rows[0].id
  const gradeLesson = (await db.query("insert into curriculum_component_items(component_id,code,name,sort_order,is_required,status) values($1,'L01','Grade 1 stays',1,true,'ACTIVE') returning id", [gradeComponent])).rows[0].id
  const techniqueLesson = (await db.query("insert into curriculum_component_items(component_id,code,name,sort_order,is_required,status) values($1,'L01','Technique stays',1,true,'ACTIVE') returning id", [techniqueComponent])).rows[0].id
  const pianoLesson = (await db.query("insert into curriculum_component_items(component_id,code,name,sort_order) values($1,'L01','Piano stays',1) returning id", [(await db.query("insert into curriculum_subject_components(subject_id,code,name) values($1,'CORE','Core') returning id", [(await db.query("insert into curriculum_subjects(level_id,code,name,family_code) values($1,'METHODE_BOOK','Piano method','METHODE_BOOK') returning id", [pianoLevel])).rows[0].id])).rows[0].id])).rows[0].id
  const placeholders = []
  for (let index = 1; index <= 10; index += 1) {
    const row = (await db.query(
      'insert into curriculum_component_items(component_id,code,name,sort_order,is_required,status) values($1,$2,$3,$4,true,\'ACTIVE\') returning id',
      [core, `L${String(index).padStart(2, '0')}`, `Lesson ${String(index).padStart(2, '0')}`, index],
    )).rows[0]
    placeholders.push(row.id)
  }
  return { program, pre, method, repertoire, technique, gradeLesson, techniqueLesson, pianoLesson, placeholders, core }
}

async function apply(db) {
  const results = await db.exec('select public.apply_guitar_pre_werner_v1() as report')
  return results.find(result => result.rows?.[0]?.report).rows[0].report
}

test('Werner map is two exact 50-lesson volumes', () => {
  const plan = buildPlan()
  assert.equal(plan.volume1_name, VOLUME_1_NAME)
  assert.equal(plan.volume2_name, VOLUME_2_NAME)
  assert.equal(plan.volume1_previous_name, 'Methode Book')
  assert.deepEqual(plan.volume2_previous_names, ['Repertoire Pre', 'Repertoire'])
  assert.equal(plan.volume1.length, 50)
  assert.equal(plan.volume2.length, 50)
  assert.deepEqual(codes(plan.volume1), Array.from({ length: 50 }, (_, index) => `L${String(index + 1).padStart(2, '0')}`))
  assert.deepEqual(codes(plan.volume2), codes(plan.volume1))
  assert.equal(new Set(plan.volume1.map(lesson => lesson.title)).size, 50)
  assert.equal(new Set(plan.volume2.map(lesson => lesson.title)).size, 50)
  assert.equal(plan.volume1[0].title, 'Getting Started: Finger Names & Guitar Anatomy')
  assert.equal(plan.volume1[49].title, 'Final Volume 1 Repertoire & Technique Review')
  assert.equal(plan.volume1[49].section, 'Part 1 close, with Part 2 chord and fingerstyle exposure and Part 3 technique review')
  assert.equal(plan.volume2[0].title, 'C Major: Scale, Arpeggio, Triads & Chord Progression')
  assert.equal(plan.volume2[27].title, 'Introduction to 3rd & 5th Position')
  assert.equal(plan.volume2[38].title, 'Tips for Counting Rhythms')
  assert.equal(plan.volume2[45].title, 'Right-Hand Alternation & Open-String Exercises')
  assert.equal(plan.volume2[49].title, 'Barre, Position Playing & Volume 2 Review')
  assert.match(plan.volume2[5].title, /Küffner/)
  assert.equal(fs.readFileSync(migrationPath, 'utf8'), buildMigration())
  assert.equal(fs.readFileSync(mapPath, 'utf8'), buildMapMarkdown())
  assert.match(fs.readFileSync('app/admin/programs/data.ts', 'utf8'), /from \+= 1000/)
})

test('lesson loader continues after a full 1000-row page', async () => {
  const all = Array.from({ length: 1001 }, (_, index) => index)
  const rows = []
  for (let from = 0; ; from += 1000) {
    const page = all.slice(from, from + 1000)
    rows.push(...page)
    if (page.length < 1000) break
  }
  assert.equal(rows.length, 1001)
  assert.equal(rows[1000], 1000)
})

test('authoring renames both Guitar Pre subjects and preserves progress ids', async () => {
  const db = await createFixture()
  try {
    await db.exec('create role service_role')
    await db.exec(buildMigration())
    const tree = await guitarTree(db)
    const progressParent = (await db.query('select id from student_component_progress limit 1')).rows[0].id
    for (const itemId of tree.placeholders) {
      await db.query(
        "insert into student_component_item_progress(component_progress_id,item_id,status) values($1,$2,'NOT_STARTED')",
        [progressParent, itemId],
      )
    }
    const before = (await db.query('select id, item_id, status from student_component_item_progress order by id')).rows
    const report = await apply(db)
    assert.equal(report.applied, true)
    assert.equal(report.renamed, 10)
    assert.equal(report.created, 90)
    assert.equal(report.retired, 0)
    assert.equal((await db.query('select name from curriculum_levels where id=$1', [tree.pre])).rows[0].name, 'Pre Grade')
    assert.equal((await db.query('select name, status, is_required from curriculum_subjects where id=$1', [tree.method])).rows[0].name, VOLUME_1_NAME)
    assert.equal((await db.query('select status from curriculum_subjects where id=$1', [tree.method])).rows[0].status, 'ACTIVE')
    assert.equal((await db.query('select sort_order from curriculum_subjects where id=$1', [tree.method])).rows[0].sort_order, 0)
    assert.equal((await db.query('select sort_order from curriculum_subjects where id=$1', [tree.repertoire])).rows[0].sort_order, 1)
    assert.equal((await db.query('select is_required from curriculum_subjects where id=$1', [tree.method])).rows[0].is_required, false)
    assert.equal((await db.query('select name, status, is_required from curriculum_subjects where id=$1', [tree.repertoire])).rows[0].name, VOLUME_2_NAME)
    assert.equal((await db.query('select is_required from curriculum_subjects where id=$1', [tree.repertoire])).rows[0].is_required, true)
    const volume1 = (await db.query("select i.code, i.name, i.sort_order, i.status, i.is_required from curriculum_component_items i join curriculum_subject_components c on c.id=i.component_id where c.subject_id=$1 order by i.sort_order", [tree.method])).rows
    const volume2 = (await db.query("select i.id, i.code, i.name, i.sort_order, i.status, i.is_required from curriculum_component_items i join curriculum_subject_components c on c.id=i.component_id where c.subject_id=$1 order by i.sort_order", [tree.repertoire])).rows
    assert.deepEqual(volume1.map(row => row.code), codes(buildPlan().volume1))
    assert.deepEqual(volume2.map(row => row.code), codes(buildPlan().volume2))
    assert.deepEqual(volume1.map(row => row.name), buildPlan().volume1.map(lesson => lesson.title))
    assert.deepEqual(volume2.map(row => row.name), buildPlan().volume2.map(lesson => lesson.title))
    assert.ok(volume1.every(row => row.status === 'ACTIVE' && row.is_required && row.sort_order === Number(row.code.slice(1))))
    assert.ok(volume2.every(row => row.status === 'ACTIVE' && row.is_required))
    assert.deepEqual(volume2.slice(0, 10).map(row => row.id), tree.placeholders)
    const after = (await db.query('select id, item_id, status from student_component_item_progress order by id')).rows
    assert.deepEqual(after, before)
    assert.equal((await db.query('select name from curriculum_component_items where id=$1', [tree.gradeLesson])).rows[0].name, 'Grade 1 stays')
    assert.equal((await db.query('select name from curriculum_component_items where id=$1', [tree.techniqueLesson])).rows[0].name, 'Technique stays')
    assert.equal((await db.query('select name from curriculum_component_items where id=$1', [tree.pianoLesson])).rows[0].name, 'Piano stays')
    assert.equal((await db.query("select name from curriculum_subjects where id=$1", [tree.technique])).rows[0].name, 'Technique Foundation Pre')
    const again = await apply(db)
    assert.equal(again.created, 0)
    assert.equal(again.renamed, 0)
    assert.equal(again.kept, 100)
    assert.equal((await db.query('select count(*)::int n from curriculum_component_items i join curriculum_subject_components c on c.id=i.component_id where c.subject_id=$1', [tree.method])).rows[0].n, 50)
    assert.deepEqual((await db.query('select id, item_id, status from student_component_item_progress order by id')).rows, before)
  } finally {
    await db.close()
  }
})

test('authoring refuses to overwrite a lesson that is no longer a placeholder', async () => {
  const db = await createFixture()
  try {
    await db.exec('create role service_role')
    await db.exec(buildMigration())
    const tree = await guitarTree(db)
    await db.query("update curriculum_component_items set name='Student piece' where id=$1", [tree.placeholders[2]])
    await assert.rejects(apply(db), /GUITAR_EXISTING_LESSON_CONFLICT/)
    assert.equal((await db.query('select name from curriculum_subjects where id=$1', [tree.method])).rows[0].name, 'Methode Book')
    assert.equal((await db.query('select name from curriculum_component_items where id=$1', [tree.placeholders[2]])).rows[0].name, 'Student piece')
    assert.equal((await db.query('select count(*)::int n from curriculum_component_items i join curriculum_subject_components c on c.id=i.component_id where c.subject_id=$1', [tree.method])).rows[0].n, 0)
  } finally {
    await db.close()
  }
})

test('fresh database without Guitar skips catalog changes', async () => {
  const db = await createFixture()
  try {
    await db.exec('create role service_role')
    const results = await db.exec(buildMigration())
    const report = results.find(result => result.rows?.[0]?.apply_guitar_pre_werner_v1).rows[0].apply_guitar_pre_werner_v1
    assert.equal(report.applied, false)
    assert.equal(report.reason, 'GUITAR_NOT_PRESENT')
    assert.equal((await db.query('select count(*)::int n from curriculums')).rows[0].n, 0)
  } finally {
    await db.close()
  }
})
