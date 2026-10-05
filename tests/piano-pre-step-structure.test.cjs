const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')
const { createFixture, snapshot } = require('./helpers/curriculum-authoring-db.cjs')
const { buildSql: foundationSql } = require('../scripts/local-violin-piano-curriculum.cjs')
const { buildSql: bookSql } = require('../scripts/piano-pre-step-book-b-sql.cjs')
const sql = fs.readFileSync('scripts/sql/piano-pre-step-draft-reconciliation.sql', 'utf8')
const m = { exports: {} }
new Function('module', 'exports', ts.transpileModule(fs.readFileSync('app/admin/programs/model.ts','utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(m,m.exports)
const { subjectAcademicValid } = m.exports

async function fixture() {
 const db = await createFixture()
 await db.exec('create role service_role; create table academic_video_links(item_id uuid); create table curriculum_lesson_guides(item_id uuid); alter table student_subject_progress add column subject_id uuid; alter table student_component_progress add column component_id uuid;')
 await db.exec(foundationSql(true))
 await db.exec('begin;'+bookSql()+'commit;')
 await db.exec("update curriculum_subjects set status='ACTIVE' where id in(select s.id from curriculum_subjects s join curriculum_levels l on l.id=s.level_id join curriculums p on p.id=l.curriculum_id where p.code='PIANO' and l.code='PRE_STEP' and s.code='METHODE_BOOK')")
 await db.exec("update curriculum_subjects set status='ACTIVE',completion_rule='ALL_REQUIRED_COMPONENTS' where id in (select s.id from curriculum_subjects s join curriculum_levels l on l.id=s.level_id join curriculums p on p.id=l.curriculum_id where p.code='PIANO' and l.code='PRE_STEP' and s.code='TECHNIQUE_FOUNDATION'); update curriculum_subject_components set status='ACTIVE' where subject_id in(select s.id from curriculum_subjects s join curriculum_levels l on l.id=s.level_id join curriculums p on p.id=l.curriculum_id where p.code='PIANO' and l.code='PRE_STEP' and s.code='TECHNIQUE_FOUNDATION');")
 const { rows:[target] } = await db.query("select s.id sid,c.id cid from curriculum_subjects s join curriculum_subject_components c on c.subject_id=s.id join curriculum_levels l on l.id=s.level_id join curriculums p on p.id=l.curriculum_id where p.code='PIANO' and l.code='PRE_STEP' and s.code='TECHNIQUE_FOUNDATION'")
 return { db, ...target }
}
const tables=['student_curriculum_enrollments','student_level_progress','student_subject_progress','student_component_progress','student_component_item_progress']
test('draft reconciliation preserves content, IDs, rules, other subjects and progression, then reruns without changes', async () => {
 const { db,sid,cid }=await fixture()
 try {
 const before=await snapshot(db)
 const progress=await snapshot(db,tables)
 await db.exec('begin;'+sql+'commit;')
 const after=await snapshot(db)
 assert.deepEqual(after.curriculum_component_items,before.curriculum_component_items)
 assert.deepEqual(after.curriculums,before.curriculums)
 assert.deepEqual(after.curriculum_levels,before.curriculum_levels)
 assert.deepEqual(after.curriculum_subjects.filter(s=>s.id!==sid),before.curriculum_subjects.filter(s=>s.id!==sid))
 assert.deepEqual(after.curriculum_subject_components.filter(c=>c.id!==cid),before.curriculum_subject_components.filter(c=>c.id!==cid))
 const s=after.curriculum_subjects.find(s=>s.id===sid), c=after.curriculum_subject_components.find(c=>c.id===cid)
 assert.equal(s.status,'INACTIVE'); assert.equal(c.status,'INACTIVE')
 assert.equal(s.completion_rule,'ALL_REQUIRED_COMPONENTS'); assert.equal(s.is_required,false)
 assert.equal(c.completion_rule,'DIRECT_ASSESSMENT'); assert.equal(c.is_required,false)
 assert.deepEqual(await snapshot(db,tables),progress)
 await db.exec('begin;'+sql+'commit;')
 assert.deepEqual(await snapshot(db),after)
 } finally { await db.close() }
})
for(const scenario of ['authored','history','required','video','guide']) test(`reconciliation refuses ${scenario} rather than hiding an operational subject`,async()=>{
 const {db,sid,cid}=await fixture()
 try {
 if(scenario==='authored') await db.query("update curriculum_component_items set name='Authored technique' where component_id=$1",[cid])
 if(scenario==='history') await db.query('insert into student_subject_progress(subject_id) values($1)',[sid])
 if(scenario==='required') await db.query('update curriculum_subjects set is_required=true where id=$1',[sid])
 if(scenario==='video') await db.query('insert into academic_video_links select id from curriculum_component_items where component_id=$1 limit 1',[cid])
 if(scenario==='guide') await db.query('insert into curriculum_lesson_guides select id from curriculum_component_items where component_id=$1 limit 1',[cid])
 const before=await snapshot(db)
 await assert.rejects(db.exec('begin;'+sql+'commit;'),/TECHNIQUE_/)
 await db.exec('rollback;')
 assert.deepEqual(await snapshot(db),before)
 } finally {await db.close()}
})
test('active incomplete technique still fails the academic rule; reconciliation does not weaken validation',()=>{
 assert.equal(subjectAcademicValid({status:'ACTIVE',completionRule:'ALL_REQUIRED_COMPONENTS',activeLessonCount:0,components:[{status:'ACTIVE',isRequired:false,completionRule:'DIRECT_ASSESSMENT',requiredActiveLessons:0}]}),false)
})
