const test=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs')
const {createFixture,snapshot}=require('./helpers/curriculum-authoring-db.cjs')
const {buildSql:foundation}=require('../scripts/local-violin-piano-curriculum.cjs')
const {buildSql:bookB}=require('../scripts/piano-pre-step-book-b-sql.cjs')
const {buildSql}=require('../scripts/piano-pre-grade-repertoire-sql.cjs')
const plan=require('../lib/academic/piano-pre-grade-repertoire.json')
const progress=['student_curriculum_enrollments','student_level_progress','student_subject_progress','student_component_progress','student_component_item_progress']
async function fixture(){
 const db=await createFixture()
 await db.exec('create role service_role; create table academic_video_links(item_id uuid); alter table student_subject_progress add column subject_id uuid;')
 await db.exec(foundation(true));await db.exec('begin;'+bookB()+'commit;')
 await db.exec("update curriculum_levels set name='Pre Grade' where code='PRE' and curriculum_id=(select id from curriculums where code='PIANO');insert into curriculum_subjects(level_id,code,name,family_code,sort_order,status,is_required,completion_rule) select l.id,'REPERTOIRE','Repertoire Pre','REPERTOIRE',5,'ACTIVE',true,'ALL_REQUIRED_COMPONENTS' from curriculum_levels l join curriculums p on p.id=l.curriculum_id where p.code='PIANO' and l.code='PRE';insert into curriculum_subject_components(subject_id,code,name,sort_order,status,is_required,completion_rule) select id,'CORE','Core',1,'ACTIVE',true,'ALL_REQUIRED_ITEMS' from curriculum_subjects where code='REPERTOIRE' and name='Repertoire Pre';insert into curriculum_component_items(component_id,code,name,sort_order,status,is_required) select id,'L01','Original lesson retained',1,'ACTIVE',true from curriculum_subject_components where code='CORE';insert into student_subject_progress(subject_id,status) select id,'IN_PROGRESS' from curriculum_subjects where code='REPERTOIRE' and name='Repertoire Pre';")
 return db
}
test('100 exact ordered lessons, source-page coverage, distinct shared-page scopes and challenge placement',()=>{
 assert.deepEqual(plan.books.map(b=>b.book),['2A','2B'])
 for(const b of plan.books){
 assert.deepEqual(b.lessons.map(l=>l.number),Array.from({length:50},(_,i)=>i+1))
 assert.equal(b.lessons[0].syllabus_pdf_page,6);assert.equal(b.lessons[49].syllabus_pdf_page,30)
 for(const l of b.lessons)for(const k of ['title','content_scope','learning_objectives','classroom_activities','homework','teacher_notes']) assert.ok(l[k].length>0)
 const pages=new Set(b.lessons.flatMap(l=>{const [a,z=a]=l.source_printed_pages.split('-').map(Number);return Array.from({length:z-a+1},(_,i)=>a+i)}))
 assert.deepEqual([...pages].sort((a,b)=>a-b),Array.from({length:b.book==='2A'?60:68},(_,i)=>i+4))
 assert.equal(b.lessons.filter(l=>l.challenge).length,b.book==='2A'?4:6)
 assert.ok(b.lessons.filter(l=>l.challenge).every(l=>l.unit===(b.book==='2A'?7:10)))
 }
 assert.deepEqual(Array.from({length:8},(_,i)=>plan.books[0].lessons.filter(l=>l.unit===i).length),[4,6,6,3,5,7,4,15])
 assert.deepEqual(Array.from({length:11},(_,i)=>plan.books[1].lessons.filter(l=>l.unit===i).length),[2,4,2,4,5,6,4,2,4,5,12])
 assert.match(plan.books[0].lessons[38].teacher_notes,/Không giao Secondo/)
 assert.notEqual(plan.books[1].lessons[27].content_scope,plan.books[1].lessons[28].content_scope)
 assert.match(plan.books[1].lessons[39].title,/Ultimate F Scale Warm-up$/)
 assert.equal(fs.readFileSync('supabase/migrations/20261006021000_piano_pre_grade_repertoire_books.sql','utf8'),buildSql())
})
test('replacement retains historical subject/children/progress and makes two distinct optional manual subjects; rerun is unchanged',async()=>{
 const db=await fixture()
 try{
 const before=await snapshot(db),history=await snapshot(db,progress)
 const old=before.curriculum_subjects.find(s=>s.code==='REPERTOIRE'&&s.name==='Repertoire Pre')
 await db.exec('begin;'+buildSql()+'commit;')
 const after=await snapshot(db)
 assert.deepEqual(after.curriculum_component_items.filter(i=>before.curriculum_component_items.some(j=>j.id===i.id)),before.curriculum_component_items)
 assert.deepEqual(after.curriculum_subject_components.filter(i=>before.curriculum_subject_components.some(j=>j.id===i.id)),before.curriculum_subject_components)
 assert.deepEqual(after.curriculum_subjects.find(s=>s.id===old.id),{...old,status:'INACTIVE'})
 assert.deepEqual(after.curriculum_subjects.filter(s=>s.id!==old.id&&!s.code.startsWith('REPERTOIRE_')),before.curriculum_subjects.filter(s=>s.id!==old.id))
 for(const code of ['REPERTOIRE_2A','REPERTOIRE_2B']){
 const s=after.curriculum_subjects.find(s=>s.code===code)
 assert.equal(s.status,'ACTIVE');assert.equal(s.is_required,false);assert.equal(s.completion_rule,'MANUAL')
 const cs=after.curriculum_subject_components.filter(c=>c.subject_id===s.id)
 assert.equal(after.curriculum_component_items.filter(i=>cs.some(c=>c.id===i.component_id)).length,50)
 }
 assert.deepEqual(await snapshot(db,progress),history)
 const syllabi=(await db.query('select * from curriculum_lesson_syllabi order by item_id')).rows
 await db.exec('begin;'+buildSql()+'commit;')
 assert.deepEqual(await snapshot(db),after)
 assert.deepEqual((await db.query('select * from curriculum_lesson_syllabi order by item_id')).rows,syllabi)
 }finally{await db.close()}
})
test('conflicting existing book content refuses import and rolls back without overwriting or duplicate rows',async()=>{
 const db=await fixture()
 try{
 await db.exec('begin;'+buildSql()+'commit;')
 await db.exec("update curriculum_component_items set name='Preserve authored edit' where code='PIANO-PRE-REP-2A-L01'")
 const before=await snapshot(db)
 await assert.rejects(db.exec('begin;'+buildSql()+'commit;'),/REPERTOIRE_EXISTING_LESSON_CONFLICT/)
 await db.exec('rollback;');assert.deepEqual(await snapshot(db),before)
 }finally{await db.close()}
})
