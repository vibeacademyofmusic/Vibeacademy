const test=require('node:test')
const assert=require('node:assert/strict')
const {harness,id,renderToStaticMarkup}=require('./helpers/finance-operations.cjs')
const plan=require('../lib/academic/piano-pre-grade-repertoire.json')
for(const b of plan.books) test(`${b.book} shows exact lesson scope and separates VIBE syllabus page from source scan pages`,async()=>{
 const l=b.lessons[b.book==='2A'?38:28]
 const h=harness({curriculums:[{id:id(1),name:'Piano'}],curriculum_levels:[{id:id(2),curriculum_id:id(1),name:'Pre Grade'}],curriculum_subjects:[{id:id(3),level_id:id(2),name:b.subject_name,completion_rule:'MANUAL'}],curriculum_subject_components:[{id:id(4),subject_id:id(3),status:'ACTIVE',name:l.unit_title}],curriculum_component_items:[{id:id(5),component_id:id(4),code:l.code,name:l.title,status:'ACTIVE'}],curriculum_lesson_syllabi:[{item_id:id(5),source_book:b.subject_name,source_authors:b.source_authors,...l}]})
 const Page=h.load('../academic/[id]/levels/[levelId]/subjects/[subjectId]/lessons/[itemId]/page.tsx').default
 const html=renderToStaticMarkup(await Page({params:Promise.resolve({id:id(1),levelId:id(2),subjectId:id(3),itemId:id(5)}),searchParams:Promise.resolve({})}))
 assert.match(html,new RegExp(`Giáo án Repertoire ${b.book}`))
 assert.match(html,new RegExp(`Trang giáo án VIBE ${l.syllabus_pdf_page}`))
 assert.match(html,new RegExp(`Trang PDF sách đối chiếu ${l.source_pdf_pages}`))
 assert.ok(html.includes(l.content_scope));assert.ok(html.includes(l.homework));assert.ok(html.includes(l.teacher_notes))
 assert.doesNotMatch(html,/Giáo án Book B/)
})
test('retired historical subject is removed from main table but remains accessible with all-subject filter',async()=>{
 const fixtures={curriculums:[{id:id(1),name:'Piano'}],curriculum_levels:[{id:id(2),curriculum_id:id(1),name:'Pre Grade',status:'ACTIVE'}],curriculum_subjects:[{id:id(3),level_id:id(2),name:'Repertoire Pre',status:'INACTIVE',completion_rule:'ALL_REQUIRED_COMPONENTS',sort_order:2},{id:id(6),level_id:id(2),name:'Repertoire 2A',status:'ACTIVE',completion_rule:'MANUAL',sort_order:6}],curriculum_subject_components:[{id:id(4),subject_id:id(3),status:'ACTIVE'}],curriculum_component_items:[{id:id(5),component_id:id(4),status:'ACTIVE'}]}
 const Page=harness(fixtures).load('../academic/[id]/levels/[levelId]/page.tsx').default
 const params=Promise.resolve({id:id(1),levelId:id(2)})
 const main=renderToStaticMarkup(await Page({params,searchParams:Promise.resolve({})}))
 assert.match(main,/Môn đã ngừng sử dụng: Repertoire Pre/)
 assert.doesNotMatch(main.match(/<tbody>[\s\S]*?<\/tbody>/)[0],/Repertoire Pre/)
 const all=renderToStaticMarkup(await Page({params,searchParams:Promise.resolve({subjects:'all'})}))
 assert.match(all.match(/<tbody>[\s\S]*?<\/tbody>/)[0],/Repertoire Pre/)
 assert.match(all,/Ngừng sử dụng cho hoạt động mới/)
})
