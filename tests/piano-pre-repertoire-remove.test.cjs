const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const { createFixture } = require('./helpers/curriculum-authoring-db.cjs')

const migration = fs.readFileSync('supabase/migrations/20261006060000_remove_piano_pre_repertoire_placeholder.sql', 'utf8')

async function ready(db) {
  await db.exec(`
    delete from student_component_item_progress;
    delete from student_component_progress;
    delete from student_subject_progress;
    delete from student_level_progress;
    alter table student_level_progress add column if not exists level_id uuid;
    alter table student_subject_progress add column if not exists level_progress_id uuid;
    alter table student_subject_progress add column if not exists subject_id uuid;
    alter table student_component_progress add column if not exists subject_progress_id uuid;
    alter table student_component_progress add column if not exists component_id uuid;
    create table if not exists student_placement_cases(id uuid primary key default gen_random_uuid(), subject_id uuid);
    create table if not exists registration_applications(id uuid primary key default gen_random_uuid(), subject_id uuid);
    create table if not exists academic_video_links(id uuid primary key default gen_random_uuid(), item_id uuid);
    create table if not exists curriculum_lesson_syllabi(item_id uuid primary key);
    insert into curriculums(code, name) values ('PIANO', 'Piano'), ('DRUMS', 'Drums');
    insert into curriculum_levels(curriculum_id, code, name, sequence_no)
    select id, 'PRE', 'Pre Grade', 1 from curriculums;
    insert into curriculum_subjects(level_id, family_code, code, name, is_required, completion_rule, sort_order, status)
    select l.id, 'REPERTOIRE', 'REPERTOIRE', 'Repertoire Pre', true, 'ALL_REQUIRED_COMPONENTS', 1, 'INACTIVE'
    from curriculum_levels l join curriculums c on c.id = l.curriculum_id where c.code = 'PIANO';
    insert into curriculum_subjects(level_id, family_code, code, name, is_required, completion_rule, sort_order, status)
    select l.id, 'REPERTOIRE', 'REPERTOIRE', 'Repertoire Pre', true, 'ALL_REQUIRED_COMPONENTS', 1, 'ACTIVE'
    from curriculum_levels l join curriculums c on c.id = l.curriculum_id where c.code = 'DRUMS';
    insert into curriculum_subjects(level_id, family_code, code, name, is_required, completion_rule, sort_order, status)
    select l.id, 'REPERTOIRE', 'REPERTOIRE_2A', 'Piano Adventures - Level 2A - Lesson Book (2nd Edition)', true, 'ALL_REQUIRED_COMPONENTS', 5, 'ACTIVE'
    from curriculum_levels l join curriculums c on c.id = l.curriculum_id where c.code = 'PIANO';
    insert into curriculum_subject_components(subject_id, code, name, is_required, sort_order, status, completion_rule)
    select id, 'CORE', 'Core', true, 1, 'ACTIVE', 'ALL_REQUIRED_ITEMS' from curriculum_subjects where name = 'Repertoire Pre' and status = 'INACTIVE';
    insert into curriculum_component_items(component_id, code, name, sort_order, status, is_required)
    select c.id, 'L01', 'Lesson 01', 1, 'ACTIVE', true
    from curriculum_subject_components c
    join curriculum_subjects s on s.id = c.subject_id
    where s.name = 'Repertoire Pre' and s.status = 'INACTIVE';
    insert into student_level_progress(level_id, status)
    select l.id, 'IN_PROGRESS' from curriculum_levels l join curriculums c on c.id = l.curriculum_id where c.code = 'PIANO';
    insert into student_subject_progress(level_progress_id, subject_id, status)
    select lp.id, s.id, 'NOT_STARTED'
    from student_level_progress lp
    join curriculum_subjects s on s.name = 'Repertoire Pre' and s.status = 'INACTIVE';
    insert into student_component_progress(subject_progress_id, component_id, status)
    select sp.id, c.id, 'NOT_STARTED'
    from student_subject_progress sp
    join curriculum_subject_components c on c.subject_id = sp.subject_id;
    insert into student_component_item_progress(component_progress_id, item_id, status)
    select cp.id, i.id, 'NOT_STARTED'
    from student_component_progress cp
    join curriculum_component_items i on i.component_id = cp.component_id;
    insert into student_placement_cases(subject_id)
    select id from curriculum_subjects where name = 'Repertoire Pre' and status = 'INACTIVE';
    insert into registration_applications(subject_id)
    select id from curriculum_subjects where name = 'Repertoire Pre' and status = 'INACTIVE';
  `)
}

test('Piano Pre Grade placeholder Repertoire Pre is removed from the program and academic record', async () => {
  const db = await createFixture()
  try {
    await ready(db)
    await db.exec(migration)
    assert.equal((await db.query("select count(*)::int as n from curriculum_subjects s join curriculum_levels l on l.id = s.level_id join curriculums c on c.id = l.curriculum_id where c.code = 'PIANO' and s.name = 'Repertoire Pre'")).rows[0].n, 0)
    assert.equal((await db.query("select count(*)::int as n from curriculum_subjects where name = 'Repertoire Pre' and status = 'ACTIVE'")).rows[0].n, 1)
    assert.equal((await db.query("select count(*)::int as n from curriculum_subjects where code = 'REPERTOIRE_2A'")).rows[0].n, 1)
    assert.equal((await db.query('select count(*)::int as n from student_subject_progress')).rows[0].n, 0)
    assert.equal((await db.query('select count(*)::int as n from student_component_item_progress')).rows[0].n, 0)
    assert.equal((await db.query('select count(*)::int as n from student_placement_cases where subject_id is null')).rows[0].n, 1)
    assert.equal((await db.query("select status from student_level_progress")).rows[0].status, 'IN_PROGRESS')
    await db.exec(migration)
    assert.equal((await db.query("select count(*)::int as n from curriculum_subjects where code = 'REPERTOIRE_2A'")).rows[0].n, 1)
  } finally {
    await db.close()
  }
})

test('started progress on the placeholder is refused and left in place', async () => {
  const db = await createFixture()
  try {
    await ready(db)
    await db.exec("update student_subject_progress set status = 'IN_PROGRESS'")
    await assert.rejects(db.exec(migration), /PIANO_REPERTOIRE_PROGRESS_NOT_PLACEHOLDER/)
    assert.equal((await db.query("select count(*)::int as n from curriculum_subjects where name = 'Repertoire Pre' and status = 'INACTIVE'")).rows[0].n, 1)
  } finally {
    await db.close()
  }
})
