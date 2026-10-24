const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const { createFixture } = require('./helpers/curriculum-authoring-db.cjs')

const migration = fs.readFileSync('supabase/migrations/20261006051000_piano_pre_repertoire_books_required.sql', 'utf8')

async function ready(db) {
  await db.exec(`
    delete from student_component_item_progress;
    delete from student_component_progress;
    delete from student_subject_progress;
    delete from student_level_progress;
    alter table student_level_progress add column level_id uuid;
    alter table student_subject_progress add column level_progress_id uuid, add column subject_id uuid;
    alter table student_component_progress add column subject_progress_id uuid, add column component_id uuid;
    alter table student_subject_progress add constraint subject_progress_pair unique (level_progress_id, subject_id);
    alter table student_component_progress add constraint component_progress_pair unique (subject_progress_id, component_id);
    insert into curriculums(code, name) values ('PIANO', 'Piano');
    insert into curriculum_levels(curriculum_id, code, name, sequence_no)
    select id, 'PRE', 'Pre Grade', 1 from curriculums where code = 'PIANO';
    insert into curriculum_subjects(level_id, family_code, code, name, is_required, completion_rule, sort_order, status)
    select l.id, 'REPERTOIRE', 'REPERTOIRE', 'Repertoire Pre', true, 'ALL_REQUIRED_COMPONENTS', 1, 'INACTIVE' from curriculum_levels l;
    insert into curriculum_subjects(level_id, family_code, code, name, is_required, completion_rule, sort_order, status)
    select l.id, 'TECHNIQUE', 'TECHNIQUE_FOUNDATION', 'Technique Foundation Pre', true, 'ALL_REQUIRED_COMPONENTS', 2, 'ACTIVE' from curriculum_levels l;
    insert into curriculum_subjects(level_id, family_code, code, name, is_required, completion_rule, sort_order, status)
    select l.id, 'REPERTOIRE', x.code, x.name, false, 'MANUAL', x.sort_order, 'ACTIVE'
    from curriculum_levels l
    cross join (values ('REPERTOIRE_2A', 'Piano Adventures - Level 2A - Lesson Book (2nd Edition)', 5), ('REPERTOIRE_2B', 'Piano Adventures - Level 2B - Lesson Book (2nd Edition)', 6)) as x(code, name, sort_order);
    insert into curriculum_subject_components(subject_id, code, name, is_required, sort_order, status, completion_rule)
    select s.id, 'U0', 'Ôn Level 1', false, 0, 'ACTIVE', 'DIRECT_ASSESSMENT' from curriculum_subjects s where s.code = 'REPERTOIRE_2A';
    insert into curriculum_subject_components(subject_id, code, name, is_required, sort_order, status, completion_rule)
    select s.id, 'U1', 'Unit 1 — Eighth Notes', false, 1, 'ACTIVE', 'DIRECT_ASSESSMENT' from curriculum_subjects s where s.code = 'REPERTOIRE_2A';
    insert into student_level_progress(level_id, status)
    select id, 'IN_PROGRESS' from curriculum_levels where code = 'PRE';
    insert into student_level_progress(level_id, status)
    select id, 'COMPLETED' from curriculum_levels where code = 'PRE';
  `)
}

test('open Piano Pre Grade records list 2A and 2B as required, completed grades stay unchanged', async () => {
  const db = await createFixture()
  try {
    await ready(db)
    const techniqueBefore = (await db.query("select is_required, completion_rule from curriculum_subjects where code = 'TECHNIQUE_FOUNDATION'")).rows[0]
    await db.exec(migration)
    const books = (await db.query("select code, is_required, completion_rule from curriculum_subjects where code like 'REPERTOIRE_2%' order by code")).rows
    assert.deepEqual(books, [
      { code: 'REPERTOIRE_2A', is_required: true, completion_rule: 'ALL_REQUIRED_COMPONENTS' },
      { code: 'REPERTOIRE_2B', is_required: true, completion_rule: 'ALL_REQUIRED_COMPONENTS' },
    ])
    assert.equal((await db.query("select count(*)::int as n from curriculum_subject_components c join curriculum_subjects s on s.id = c.subject_id where s.code = 'REPERTOIRE_2A' and c.is_required")).rows[0].n, 2)
    const open = (await db.query(`
      select s.code, sp.status
      from student_subject_progress sp
      join curriculum_subjects s on s.id = sp.subject_id
      join student_level_progress lp on lp.id = sp.level_progress_id
      where lp.status = 'IN_PROGRESS'
      order by s.code
    `)).rows
    assert.deepEqual(open, [
      { code: 'REPERTOIRE_2A', status: 'NOT_STARTED' },
      { code: 'REPERTOIRE_2B', status: 'NOT_STARTED' },
    ])
    assert.equal((await db.query(`
      select count(*)::int as n
      from student_component_progress cp
      join student_subject_progress sp on sp.id = cp.subject_progress_id
      join student_level_progress lp on lp.id = sp.level_progress_id
      where lp.status = 'IN_PROGRESS' and cp.status = 'NOT_STARTED'
    `)).rows[0].n, 2)
    assert.equal((await db.query(`
      select count(*)::int as n
      from student_subject_progress sp
      join student_level_progress lp on lp.id = sp.level_progress_id
      where lp.status = 'COMPLETED'
    `)).rows[0].n, 0)
    assert.deepEqual((await db.query("select status from student_level_progress order by status")).rows.map(row => row.status), ['COMPLETED', 'IN_PROGRESS'])
    assert.deepEqual((await db.query("select is_required, completion_rule from curriculum_subjects where code = 'TECHNIQUE_FOUNDATION'")).rows[0], techniqueBefore)
    await db.exec(migration)
    assert.equal((await db.query('select count(*)::int as n from student_subject_progress')).rows[0].n, 2)
  } finally {
    await db.close()
  }
})

test('migration does nothing when Piano Pre Grade is absent', async () => {
  const db = await createFixture()
  try {
    await db.exec(`
      delete from student_component_item_progress;
      alter table student_level_progress add column level_id uuid;
      alter table student_subject_progress add column level_progress_id uuid, add column subject_id uuid;
      alter table student_component_progress add column subject_progress_id uuid, add column component_id uuid;
      alter table student_subject_progress add constraint subject_progress_pair unique (level_progress_id, subject_id);
      alter table student_component_progress add constraint component_progress_pair unique (subject_progress_id, component_id);
    `)
    await db.exec(migration)
    assert.equal((await db.query('select count(*)::int as n from curriculum_subjects')).rows[0].n, 0)
  } finally {
    await db.close()
  }
})
