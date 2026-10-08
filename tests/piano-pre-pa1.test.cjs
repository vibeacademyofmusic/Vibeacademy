const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const { buildPlan, SUBJECT_NAME, LEVEL_NAME } = require('../lib/academic/piano-pre-pa1.cjs')
const { buildAuthoringSql, buildMigration } = require('../scripts/piano-pre-pa1-sql.cjs')
const { createFixture } = require('./helpers/curriculum-authoring-db.cjs')

const migrationPath = 'supabase/migrations/20261005234500_piano_pre_pa1_lesson_book.sql'

function pages(value) {
  return value.split(', ').map(page => Number(page))
}

test('Piano Adventures Level 1 map is 50 ordered lessons across the approved units', () => {
  const plan = buildPlan()
  assert.equal(plan.subject_name, SUBJECT_NAME)
  assert.equal(plan.previous_subject_name, 'Methode Book')
  assert.equal(plan.level_name, LEVEL_NAME)
  assert.equal(plan.source_edition, '2nd Edition')
  assert.equal(plan.source_authors, 'Nancy and Randall Faber')
  assert.deepEqual(plan.units.map(unit => unit.name), [
    'FOUNDATION REVIEW',
    'UNIT 1 — Legato and Staccato',
    'UNIT 2 — Treble F-A-C-E',
    'UNIT 3 — Treble C-D-E-F-G',
    'UNIT 4 — Intervals (2nd, 3rd, 4th, 5th)',
    'UNIT 5 — Half Rest and Whole Rest',
    'UNIT 6 — Sharps and Flats',
    'UNIT 7 — Tonic and Dominant',
    'UNIT 8 — The C (I) Chord',
    'UNIT 9 — The V7 Chord',
    'UNIT 10 — G Five-Finger Scales',
  ])
  assert.equal(plan.lessons.length, 50)
  assert.deepEqual(plan.lessons.map(lesson => lesson.lesson_code), Array.from({ length: 50 }, (_, index) => `PIANO-PRE-PA1-L${String(index + 1).padStart(2, '0')}`))
  assert.deepEqual(plan.lessons.map(lesson => lesson.sort_order), Array.from({ length: 50 }, (_, index) => index + 1))
  assert.equal(new Set(plan.lessons.map(lesson => lesson.lesson_code)).size, 50)
  assert.equal(new Set(plan.lessons.map(lesson => lesson.title)).size, 50)
  for (const unit of plan.units) assert.ok(plan.lessons.some(lesson => lesson.unit === unit.code))
  for (const lesson of plan.lessons) {
    assert.match(lesson.learning_objectives, /^Student performs /)
    assert.doesNotMatch(lesson.learning_objectives, /\bunderstand\b/i)
    assert.match(lesson.checkpoint, /PASS/)
    assert.match(lesson.independent_practice, /không được ghi là hoàn thành học thuật/)
    assert.equal(lesson.source_book, plan.source_book)
    for (const page of pages(lesson.source_pages)) assert.ok(page >= 4 && page <= 64)
  }
  assert.equal(plan.lessons[0].source_pages, '4')
  assert.equal(plan.lessons[0].title, 'Get Ready for Take-off! (Primer Review)')
  assert.equal(plan.lessons[49].source_pages, '62, 64')
  assert.match(plan.lessons[49].checkpoint, /không tự chuyển học viên lên Grade/)
  assert.match(plan.lessons[49].review, /I và V7/)
  assert.equal(fs.readFileSync(migrationPath, 'utf8'), buildMigration())
  assert.match(buildMigration(), /'code',i\.code/)
  assert.match(buildMigration(), /i\.code,i\.name/)
})

async function pianoTree(db) {
  const program = (await db.query("insert into curriculums(code,name,status) values('PIANO','Piano','ACTIVE') returning id")).rows[0].id
  const preStep = (await db.query("insert into curriculum_levels(curriculum_id,code,name,sequence_no,level_type,completion_rule,status) values($1,'PRE_STEP','Pre Step',0,'FOUNDATION','ALL_REQUIRED_SUBJECTS','ACTIVE') returning id", [program])).rows[0].id
  const pre = (await db.query("insert into curriculum_levels(curriculum_id,code,name,sequence_no,level_type,completion_rule,status) values($1,'PRE','Pre',1,'FOUNDATION','ALL_REQUIRED_SUBJECTS','ACTIVE') returning id", [program])).rows[0].id
  const stepSubject = (await db.query("insert into curriculum_subjects(level_id,code,name,family_code,status,is_required,completion_rule,sort_order) values($1,'METHODE_BOOK','Methode Book','METHODE_BOOK','ACTIVE',false,'ALL_REQUIRED_COMPONENTS',1) returning id", [preStep])).rows[0].id
  const subject = (await db.query("insert into curriculum_subjects(level_id,code,name,family_code,status,is_required,completion_rule,sort_order) values($1,'METHODE_BOOK','Methode Book','METHODE_BOOK','INACTIVE',false,'ALL_REQUIRED_COMPONENTS',1) returning id", [pre])).rows[0].id
  const technique = (await db.query("insert into curriculum_subjects(level_id,code,name,family_code,status,is_required,completion_rule,sort_order) values($1,'TECHNIQUE_FOUNDATION','Technique Foundation Pre','TECHNIQUE','ACTIVE',true,'ALL_REQUIRED_COMPONENTS',2) returning id", [pre])).rows[0].id
  await db.query("insert into curriculum_subjects(level_id,code,name,family_code,status,is_required,completion_rule,sort_order) values($1,'AURAL','Aural Pre','AURAL','ACTIVE',true,'ALL_REQUIRED_COMPONENTS',3)", [pre])
  await db.query("insert into curriculum_subjects(level_id,code,name,family_code,status,is_required,completion_rule,sort_order) values($1,'SIGHTREADING','Sightreading Pre','SIGHTREADING','ACTIVE',true,'ALL_REQUIRED_COMPONENTS',4)", [pre])
  const draft = (await db.query("insert into curriculum_subject_components(subject_id,code,name,is_required,sort_order,completion_rule,status) values($1,'LESSON_DRAFTS','Bài học dự thảo',false,1,'DIRECT_ASSESSMENT','INACTIVE') returning id", [subject])).rows[0].id
  for (let index = 1; index <= 10; index += 1) {
    await db.query('insert into curriculum_component_items(component_id,code,name,sort_order,is_required,status) values($1,$2,$3,$4,false,\'INACTIVE\')', [draft, `L${String(index).padStart(2, '0')}`, `Lesson ${String(index).padStart(2, '0')}`, index])
  }
  const kept = (await db.query("insert into curriculum_component_items(component_id,code,name,sort_order) values($1,'STEP-L01','Pre Step lesson',1) returning id", [(await db.query("insert into curriculum_subject_components(subject_id,code,name) values($1,'STEP','Pre Step group') returning id", [stepSubject])).rows[0].id])).rows[0].id
  return { program, pre, subject, technique, kept }
}

test('authoring renames Piano Pre Methode Book, keeps the other subjects, and does not promote', async () => {
  const db = await createFixture()
  try {
    await db.exec('create role service_role')
    const tree = await pianoTree(db)
    const techniqueBefore = (await db.query('select * from curriculum_subjects where id=$1', [tree.technique])).rows[0]
    const stepBefore = (await db.query("select name from curriculum_subjects where code='METHODE_BOOK' and level_id<>(select id from curriculum_levels where code='PRE')")).rows[0]
    const applied = (await db.exec(buildAuthoringSql())).find(result => result.rows[0]?.report).rows[0].report
    assert.equal(applied.skipped, false)
    assert.equal(applied.old_subject_name, 'Methode Book')
    assert.equal(applied.new_subject_name, SUBJECT_NAME)
    assert.equal(applied.subject_is_required, false)
    assert.equal(applied.level_completion_rule, 'ALL_REQUIRED_SUBJECTS')
    assert.equal(applied.active_lessons, 50)
    assert.equal(applied.level_status_unchanged, true)
    const subject = (await db.query('select * from curriculum_subjects where id=$1', [tree.subject])).rows[0]
    assert.equal(subject.name, SUBJECT_NAME)
    assert.equal(subject.code, 'METHODE_BOOK')
    assert.equal(subject.status, 'ACTIVE')
    assert.equal(subject.is_required, false)
    assert.equal((await db.query('select name from curriculum_levels where id=$1', [tree.pre])).rows[0].name, 'Pre Grade')
    assert.deepEqual((await db.query('select * from curriculum_subjects where id=$1', [tree.technique])).rows[0], techniqueBefore)
    assert.equal((await db.query("select name from curriculum_subjects where code='METHODE_BOOK' and level_id<>(select id from curriculum_levels where code='PRE')")).rows[0].name, stepBefore.name)
    const lessons = (await db.query(`select i.code, i.name, i.sort_order, i.status, i.is_required, c.code as unit, g.source_pages
      from curriculum_component_items i
      join curriculum_subject_components c on c.id=i.component_id
      join curriculum_lesson_guides g on g.item_id=i.id
      where c.subject_id=$1 order by i.sort_order`, [tree.subject])).rows
    assert.equal(lessons.length, 50)
    assert.deepEqual(lessons.map(lesson => lesson.code), buildPlan().lessons.map(lesson => lesson.lesson_code))
    assert.ok(lessons.every(lesson => lesson.status === 'ACTIVE' && lesson.is_required))
    assert.equal((await db.query("select count(*)::int n from curriculum_subject_components where subject_id=$1 and code='LESSON_DRAFTS'", [tree.subject])).rows[0].n, 0)
    assert.equal((await db.query('select name from curriculum_component_items where id=$1', [tree.kept])).rows[0].name, 'Pre Step lesson')
    const again = (await db.exec(buildAuthoringSql())).find(result => result.rows[0]?.report).rows[0].report
    assert.equal(again.active_lessons, 50)
    assert.equal((await db.query('select count(*)::int n from curriculum_component_items i join curriculum_subject_components c on c.id=i.component_id where c.subject_id=$1', [tree.subject])).rows[0].n, 50)
  } finally {
    await db.close()
  }
})

test('authoring refuses to delete a draft lesson that already has history', async () => {
  const db = await createFixture()
  try {
    await db.exec('create role service_role')
    const tree = await pianoTree(db)
    const item = (await db.query("select id from curriculum_component_items where name='Lesson 01'")).rows[0].id
    const progress = (await db.query('insert into student_component_progress(status) values(\'IN_PROGRESS\') returning id')).rows[0].id
    await db.query('insert into student_component_item_progress(component_progress_id,item_id,status) values($1,$2,\'IN_PROGRESS\')', [progress, item])
    await assert.rejects(db.exec(buildAuthoringSql()), /draft lessons have student history/)
    await db.exec('rollback')
    assert.equal((await db.query('select name from curriculum_subjects where id=$1', [tree.subject])).rows[0].name, 'Methode Book')
  } finally {
    await db.close()
  }
})

test('fresh database without Piano skips catalog changes', async () => {
  const db = await createFixture()
  try {
    await db.exec('create role service_role')
    const report = (await db.exec(buildAuthoringSql())).find(result => result.rows[0]?.report).rows[0].report
    assert.equal(report.skipped, true)
    assert.equal((await db.query('select count(*)::int n from curriculums')).rows[0].n, 0)
  } finally {
    await db.close()
  }
})
