const test = require('node:test')
const assert = require('node:assert/strict')
const { buildPlan, counts } = require('../scripts/curriculum-violin-piano-plan.cjs')
const { buildSql, verifyTarget, envValue, localOrigin } = require('../scripts/local-violin-piano-curriculum.cjs')
const { createFixture, snapshot } = require('./helpers/curriculum-authoring-db.cjs')
const progressTables = ['student_curriculum_enrollments', 'student_level_progress', 'student_subject_progress', 'student_component_progress', 'student_component_item_progress']
const execute = async (db, apply = true) => {
  const result = await db.exec(buildSql(apply))
  return result.find(r => r.rows[0]?.report)?.rows[0].report
}
async function existingPre(db, program = 'VIOLIN', lessons = 0) {
  const p = (await db.query('insert into curriculums(code,name) values($1,$2) returning id', [program, program === 'VIOLIN' ? 'Violin' : 'Piano'])).rows[0].id
  const l = (await db.query("insert into curriculum_levels(curriculum_id,code,name,sequence_no,level_type) values($1,'PRE_GRADE','Pre Grade',1,'FOUNDATION') returning id", [p])).rows[0].id
  const s = (await db.query("insert into curriculum_subjects(level_id,code,name,family_code) values($1,'METHOD_BOOK','Methode Book','METHOD') returning id", [l])).rows[0].id
  const c = (await db.query("insert into curriculum_subject_components(subject_id,code,name) values($1,'EXISTING','Teacher-owned material') returning id", [s])).rows[0].id
  for (let i = 1; i <= lessons; i++) await db.query('insert into curriculum_component_items(component_id,code,name,sort_order) values($1,$2,$3,$4)', [c, `L${String(i).padStart(2, '0')}`, `Teacher lesson ${i}`, i])
  return { p, l, s, c }
}

test('current request has 9 Violin levels/450 slots and 2 Piano levels/80 slots', () => {
  assert.deepEqual(counts(buildPlan()), [
    { program: 'Piano', levels: 2, subjects: 8, lessons: 80 },
    { program: 'Violin', levels: 9, subjects: 45, lessons: 450 },
  ])
  const violin = buildPlan()[1]
  assert.deepEqual(violin.levels.map(l => l.subjects.length), [4, 4, 4, 4, 5, 5, 5, 7, 7])
  for (const program of buildPlan()) for (const level of program.levels) for (const subject of level.subjects) {
    assert.equal(subject.lessons.length, 10)
    assert.deepEqual(subject.lessons.map(l => l.code), Array.from({ length: 10 }, (_, i) => `L${String(i + 1).padStart(2, '0')}`))
  }
})

test('local target guard rejects cloud, credential URLs and mismatched database', () => {
  const target = { appUrl: 'http://localhost:54321', apiUrl: 'http://127.0.0.1:54321', dbUrl: 'postgresql://postgres:local@127.0.0.1:54322/postgres', container: 'supabase_db_vibe', projectId: 'vibe', portBinding: '0.0.0.0:54322' }
  assert.equal(verifyTarget(target).databasePort, '54322')
  for (const changes of [{ appUrl: 'https://cloud.supabase.co' }, { apiUrl: 'http://localhost:55321' }, { dbUrl: 'postgres://postgres@cloud.example:54322/postgres' }, { portBinding: '0.0.0.0:55322' }, { container: 'supabase_db_other' }]) {
    assert.throws(() => verifyTarget({ ...target, ...changes }))
  }
  assert.throws(() => localOrigin('http://secret@localhost:54321'))
  assert.equal(envValue('export NEXT_PUBLIC_SUPABASE_URL="http://localhost:54321"\n', 'NEXT_PUBLIC_SUPABASE_URL'), 'http://localhost:54321')
})

test('PostgreSQL import acceptance', async t => {
  await t.test('dry run rolls back; apply produces 530 inactive slots; rerun changes nothing', async () => {
    const db = await createFixture()
    try {
      const before = await snapshot(db)
      const progress = await snapshot(db, progressTables)
      const dry = await execute(db, false)
      assert.equal(dry.changes.filter(c => c.kind === 'lesson').length, 530)
      assert.deepEqual(await snapshot(db), before)
      const applied = await execute(db)
      assert.equal(applied.subjects.length, 53)
      assert.ok(applied.subjects.every(s => s.after_count === 10))
      assert.equal((await db.query("select count(*)::int n from curriculum_component_items where status='INACTIVE' and not is_required")).rows[0].n, 530)
      assert.deepEqual(await snapshot(db, progressTables), progress)
      const after = await snapshot(db)
      assert.deepEqual((await execute(db)).changes, [])
      assert.deepEqual(await snapshot(db), after)
    } finally { await db.close() }
  })

  await t.test('Piano foundations precede existing grades, preserving IDs and all progression rows', async () => {
    const db = await createFixture()
    try {
      const p = (await db.query("insert into curriculums(code,name) values('PIANO','Piano') returning id")).rows[0].id
      for (let i = 1; i <= 8; i++) await db.query("insert into curriculum_levels(curriculum_id,code,name,sequence_no,level_number) values($1,$2,$3,$4,$4)", [p, `GRADE_${i}`, `Grade ${i}`, i])
      const old = (await db.query('select * from curriculum_levels order by sequence_no')).rows
      const progress = await snapshot(db, progressTables)
      await execute(db)
      const levels = (await db.query('select * from curriculum_levels where curriculum_id=$1 order by sequence_no', [p])).rows
      assert.deepEqual(levels.map(l => l.name), ['Pre Step', 'Pre', ...old.map(l => l.name)])
      for (let i = 0; i < old.length; i++) assert.deepEqual({ ...levels[i + 2], sequence_no: old[i].sequence_no }, old[i])
      assert.deepEqual(await snapshot(db, progressTables), progress)
    } finally { await db.close() }
  })

  await t.test('grade and Sightreading aliases are reused without duplicate subjects or levels', async () => {
    const db = await createFixture()
    try {
      const p = (await db.query("insert into curriculums(code,name) values('VIOLIN','Violin') returning id")).rows[0].id
      const l = (await db.query("insert into curriculum_levels(curriculum_id,code,name,sequence_no,level_number) values($1,'GRADE_1','Grade 1',1,1) returning id", [p])).rows[0].id
      const s = (await db.query("insert into curriculum_subjects(level_id,code,name,family_code) values($1,'SIGHTREADING','Sightreading 1','SIGHTREADING') returning id", [l])).rows[0].id
      await execute(db)
      assert.equal((await db.query('select count(*)::int n from curriculum_levels where curriculum_id=$1', [p])).rows[0].n, 9)
      assert.equal((await db.query('select count(*)::int n from curriculum_subjects where level_id=$1', [l])).rows[0].n, 4)
      assert.equal((await db.query('select name from curriculum_subjects where id=$1', [s])).rows[0].name, 'Sightreading 1')
    } finally { await db.close() }
  })

  await t.test('50 authored lessons and live assessment configuration remain unchanged', async () => {
    const db = await createFixture()
    try {
      const { s, c } = await existingPre(db, 'PIANO', 50)
      const before = (await db.query('select * from curriculum_component_items where component_id=$1 order by id', [c])).rows
      const report = await execute(db)
      assert.equal(report.subjects.find(row => row.subject_id === s).after_count, 50)
      assert.equal(report.subjects.find(row => row.subject_id === s).preserved_more_than_ten, true)
      assert.deepEqual((await db.query('select * from curriculum_component_items where component_id=$1 order by id', [c])).rows, before)
      assert.equal((await db.query('select count(*)::int n from curriculum_subject_components where subject_id=$1', [s])).rows[0].n, 1)
    } finally { await db.close() }
  })

  await t.test('partial subject gains only missing slots in separate inactive container', async () => {
    const db = await createFixture()
    try {
      const { s, c } = await existingPre(db, 'VIOLIN', 3)
      const before = (await db.query('select * from curriculum_component_items where component_id=$1 order by id', [c])).rows
      const report = await execute(db)
      assert.equal(report.subjects.find(row => row.subject_id === s).after_count, 10)
      assert.deepEqual((await db.query('select * from curriculum_component_items where component_id=$1 order by id', [c])).rows, before)
      assert.deepEqual((await db.query("select i.code from curriculum_component_items i join curriculum_subject_components cc on cc.id=i.component_id where cc.subject_id=$1 and cc.code='LESSON_DRAFTS' order by i.sort_order", [s])).rows.map(r => r.code), ['L04', 'L05', 'L06', 'L07', 'L08', 'L09', 'L10'])
    } finally { await db.close() }
  })

  await t.test('test programs and unrelated instrument catalogs are untouched', async () => {
    const db = await createFixture()
    try {
      await db.exec("insert into curriculums(code,name) values('TEST_VIOLIN','Violin'),('TEST_PIANO','Piano'),('GUITAR','Guitar')")
      const before = (await db.query('select * from curriculums order by id')).rows
      await execute(db)
      assert.deepEqual((await db.query("select * from curriculums where code in ('TEST_VIOLIN','TEST_PIANO','GUITAR') order by id")).rows, before)
      assert.equal((await db.query('select count(*)::int n from curriculums')).rows[0].n, 3)
    } finally { await db.close() }
  })

  await t.test('ambiguous subjects abort without leaving a partially created Piano tree', async () => {
    const db = await createFixture()
    try {
      const { l } = await existingPre(db)
      await db.query("insert into curriculum_subjects(level_id,code,name,family_code) values($1,'METHODE_BOOK','Methode Book','METHOD')", [l])
      const before = await snapshot(db)
      await assert.rejects(() => execute(db), /Ambiguous subject/)
      await db.exec('rollback')
      assert.deepEqual(await snapshot(db), before)
    } finally { await db.close() }
  })

  await t.test('an active component using the draft code is never silently repurposed', async () => {
    const db = await createFixture()
    try {
      const { c } = await existingPre(db)
      await db.query("update curriculum_subject_components set code='LESSON_DRAFTS' where id=$1", [c])
      const before = await snapshot(db)
      await assert.rejects(() => execute(db), /no longer an inactive authoring container/)
      await db.exec('rollback')
      assert.deepEqual(await snapshot(db), before)
    } finally { await db.close() }
  })

  for (const [label, sql, expected] of [
    ['ambiguous program names', "insert into curriculums(code,name) values('VIOLIN','Violin'),('VIOLIN_NEW','Violin')", /Ambiguous official program/],
    ['conflicting program identity', "insert into curriculums(code,name) values('VIOLIN','Piano')", /Ambiguous official program/],
    ['duplicate level aliases', "insert into curriculums(code,name) values('VIOLIN','Violin'); insert into curriculum_levels(curriculum_id,code,name,sequence_no,level_number) select id,'G1','Grade 1',1,1 from curriculums; insert into curriculum_levels(curriculum_id,code,name,sequence_no,level_number) select id,'GRADE_1','Grade 1',2,1 from curriculums", /Duplicate semantic level/],
    ['out of order grades', "insert into curriculums(code,name) values('VIOLIN','Violin'); insert into curriculum_levels(curriculum_id,code,name,sequence_no,level_number) select id,'G2','Grade 2',1,2 from curriculums; insert into curriculum_levels(curriculum_id,code,name,sequence_no,level_number) select id,'G1','Grade 1',2,1 from curriculums", /Existing level order conflicts/],
    ['conflicting foundation identity', "insert into curriculums(code,name) values('VIOLIN','Violin'); insert into curriculum_levels(curriculum_id,code,name,sequence_no,level_number) select id,'PRE','Pre',1,1 from curriculums", /Conflicting level identity/],
    ['conflicting numeric grade identity', "insert into curriculums(code,name) values('VIOLIN','Violin'); insert into curriculum_levels(curriculum_id,code,name,sequence_no,level_number) select id,'G1','Grade 1',1,2 from curriculums", /Conflicting level identity/],
  ]) await t.test(`${label} aborts the whole transaction`, async () => {
    const db = await createFixture()
    try {
      await db.exec(sql)
      const before = await snapshot(db)
      await assert.rejects(() => execute(db), expected)
      await db.exec('rollback')
      assert.deepEqual(await snapshot(db), before)
    } finally { await db.close() }
  })

  await t.test('unexpected progress-writing trigger aborts and rolls back all imported rows', async () => {
    const db = await createFixture()
    try {
      await db.exec("create function fixture_bad_trigger() returns trigger language plpgsql as $$begin update student_level_progress set status='COMPLETED'; return new; end$$; create trigger fixture_bad after insert on curriculum_component_items for each row execute function fixture_bad_trigger();")
      const before = await snapshot(db)
      const progress = await snapshot(db, progressTables)
      await assert.rejects(() => execute(db), /Student progress changed/)
      await db.exec('rollback')
      assert.deepEqual(await snapshot(db), before)
      assert.deepEqual(await snapshot(db, progressTables), progress)
    } finally { await db.close() }
  })
})
