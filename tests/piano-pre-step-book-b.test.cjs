const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const plan = require('../lib/academic/piano-pre-step-book-b.json')
const { buildSql } = require('../scripts/piano-pre-step-book-b-sql.cjs')
const { buildSql: foundationSql } = require('../scripts/local-violin-piano-curriculum.cjs')
const { createFixture, snapshot } = require('./helpers/curriculum-authoring-db.cjs')

test('Book B preserves all 50 authored entries and all source pages except duplicate 49', () => {
  assert.deepEqual(plan.lessons.map(l => l.number), Array.from({ length: 50 }, (_, i) => i + 1))
  assert.deepEqual(Array.from({ length: 8 }, (_, i) => plan.lessons.filter(l => l.unit === i + 1).length), [4, 6, 6, 12, 4, 5, 5, 8])
  const covered = []
  for (const l of plan.lessons) {
    for (const k of ['title', 'unit_title', 'learning_objectives', 'classroom_activities', 'homework', 'teacher_notes']) assert.ok(l[k].length > 0)
    const [a, b = a] = l.source_pdf_pages.split('-').map(Number)
    for (let n = a; n <= b; n++) covered.push(n)
    assert.equal(l.source_printed_pages === null, l.number <= 28)
  }
  assert.deepEqual(covered, Array.from({ length: 82 }, (_, i) => i + 4).filter(n => n !== 49))
  assert.equal(plan.lessons[23].source_pdf_pages, '47-48')
  assert.equal(plan.lessons[36].source_pdf_pages, '65')
  assert.match(plan.source_context, /Music Library/)
  assert.match(plan.source_context, /50 Lesson/)
  assert.match(plan.lessons[49].teacher_notes, /không tự cấp chứng chỉ/)
  assert.equal(fs.readFileSync('supabase/migrations/20261006003000_piano_pre_step_book_b.sql', 'utf8'), buildSql())
})

async function fixture() {
  const db = await createFixture()
  await db.exec('create role service_role; create table academic_video_links(item_id uuid);')
  await db.exec(foundationSql(true))
  return db
}
const progressTables = ['student_curriculum_enrollments', 'student_level_progress', 'student_subject_progress', 'student_component_progress', 'student_component_item_progress']

test('import reuses ten draft IDs, adds 40 and preserves progression; rerun changes nothing', async () => {
  const db = await fixture()
  try {
    const before = await snapshot(db, progressTables)
    const ids = (await db.query("select i.id from curriculum_component_items i join curriculum_subject_components c on c.id=i.component_id join curriculum_subjects s on s.id=c.subject_id join curriculum_levels l on l.id=s.level_id join curriculums p on p.id=l.curriculum_id where p.code='PIANO' and l.code='PRE_STEP' and s.code='METHODE_BOOK'")).rows.map(r => r.id)
    await db.exec('begin;'+buildSql()+'commit;')
    assert.equal((await db.query('select count(*)::int n from curriculum_lesson_syllabi')).rows[0].n, 50)
    for (const id of ids) assert.equal((await db.query('select count(*)::int n from curriculum_lesson_syllabi where item_id=$1',[id])).rows[0].n,1)
    assert.deepEqual(await snapshot(db, progressTables), before)
    const after = await snapshot(db)
    await db.exec('begin;'+buildSql()+'commit;')
    assert.deepEqual(await snapshot(db), after)
  } finally { await db.close() }
})

test('existing authored draft refuses import and rolls back', async () => {
  const db = await fixture()
  try {
    await db.exec("update curriculum_component_items set name='Preserve my authored content' where id=(select i.id from curriculum_component_items i join curriculum_subject_components c on c.id=i.component_id join curriculum_subjects s on s.id=c.subject_id join curriculum_levels l on l.id=s.level_id join curriculums p on p.id=l.curriculum_id where p.code='PIANO' and l.code='PRE_STEP' and s.code='METHODE_BOOK' order by i.sort_order limit 1)")
    const before = await snapshot(db)
    await assert.rejects(db.exec('begin;'+buildSql()+'commit;'), /BOOK_B_EXISTING_LESSON_HAS_CONTENT_OR_HISTORY/)
    await db.exec('rollback;')
    assert.deepEqual(await snapshot(db), before)
  } finally { await db.close() }
})
