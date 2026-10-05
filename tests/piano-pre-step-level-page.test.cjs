const test = require('node:test')
const assert = require('node:assert/strict')
const { harness, id, renderToStaticMarkup } = require('./helpers/finance-operations.cjs')
const fixtures = {
 curriculums:[{id:id(1),code:'PIANO',name:'Piano'}],
 curriculum_levels:[{id:id(2),curriculum_id:id(1),code:'PRE_STEP',name:'Pre Step',status:'ACTIVE',completion_rule:'ALL_REQUIRED_SUBJECTS'}],
 curriculum_subjects:[{id:id(3),level_id:id(2),name:'Book B',code:'METHODE_BOOK',status:'ACTIVE',completion_rule:'MANUAL',sort_order:1},{id:id(4),level_id:id(2),name:'Technique Foundation',code:'TECHNIQUE_FOUNDATION',status:'INACTIVE',completion_rule:'ALL_REQUIRED_COMPONENTS',sort_order:2}],
 curriculum_subject_components:[{id:id(5),subject_id:id(3),status:'ACTIVE',completion_rule:'DIRECT_ASSESSMENT',is_required:false},{id:id(6),subject_id:id(4),status:'INACTIVE',completion_rule:'DIRECT_ASSESSMENT',is_required:false}],
 curriculum_component_items:[{id:id(7),component_id:id(5),status:'ACTIVE',is_required:false},{id:id(8),component_id:id(6),status:'ACTIVE',is_required:false}],
}
async function render(h){return renderToStaticMarkup(await h.load('../academic/[id]/levels/[levelId]/page.tsx').default({params:Promise.resolve({id:id(1),levelId:id(2)}),searchParams:Promise.resolve({})}))}
for(const table of ['curriculum_subjects','curriculum_subject_components','curriculum_component_items']) test(`query failure in ${table} cannot be rendered as academic readiness or zero lessons`,async()=>{
 const h=harness(fixtures)
 const original=h.db.from.bind(h.db)
 h.db.from=name=>{
  const q=original(name)
  if(name===table) q.then=(resolve,reject)=>Promise.resolve({data:null,error:{message:'Synthetic query failure'}}).then(resolve,reject)
  return q
 }
 const html=await render(h)
 assert.match(html,/Không tải được/); assert.match(html,/Chưa thể kiểm tra cấu trúc học thuật/)
 assert.doesNotMatch(html,/Đủ cấu trúc|Cần bổ sung cấu trúc|Chưa có môn học|vibe-metric/)
})
test('level counts exclude inactive parent content and keeps unpublished subjects visible',async()=>{
 const html=await render(harness(fixtures))
 assert.match(html,/Môn đang hoạt động/);assert.match(html,/Unit \/ nhóm đang hoạt động/)
 assert.match(html,/1 môn chưa phát hành: Technique Foundation/)
 assert.match(html,/Đủ cấu trúc phần đang hoạt động/)
 for(const label of ['Môn đang hoạt động','Unit / nhóm đang hoạt động','Lesson đang hoạt động']) assert.ok(html.includes(`<p>${label}</p><strong>1</strong>`))
})
