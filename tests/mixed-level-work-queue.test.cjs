const { test } = require('node:test')
const assert = require('node:assert/strict')
const React = require('react')
const { harness, id, renderToStaticMarkup } = require('./helpers/finance-operations.cjs')

function setup(count = 1) {
  const branch = id(1)
  const classes = Array.from({ length: count }, (_, i) => ({ id: id(10+i), name: `Class ${i}`, status: 'ACTIVE', branch_id: branch,
    accepted_from_level_id: id(2), accepted_to_level_id: id(3), courses: { name: 'Guitar', curriculum_id: id(4) }, branches: { name: 'TEST' } }))
  const enrollments = classes.map((c,i) => ({ id: id(1000+i), class_id: c.id, student_id: id(5), status: 'ACTIVE' }))
  const h = harness({ classes, enrollments, curriculum_levels: [{ id: id(2), name: 'Pre' }, { id: id(3), name: 'Grade 5' }] })
  const calls = []
  h.db.rpc = async (name, args) => { calls.push({name,args}); return { data: 'OUTSIDE_SCOPE', error: null } }
  return { h, calls, branch, classes, enrollments }
}

test('same canonical compatibility drives list and linked overview; students deduplicated across classes/pages', async () => {
  const { h, calls, branch } = setup(201)
  const data = await h.load('../classes/_ops/data.ts').loadClassOps(h.db, {branch}, 'classes')
  assert.equal(data.overview, null)
  assert.ok(data.classes.data.every(c => c.outOfScopeCount === 1))
  assert.equal(calls.length, 201)
  assert.ok(calls.every(c => c.name === 'class_enrollment_compatibility'))
  const Workspace = h.load('../classes/_ops/Workspace.tsx').default
  const list = renderToStaticMarkup(React.createElement(Workspace, {data, params: {}, view: 'classes'}))
  assert.match(list, /Cần xử lý/)
  assert.match(list, new RegExp(`href="/admin/classes/${id(10)}">1 học viên ngoài phạm vi`))
  const overviewData = await h.load('../classes/_ops/data.ts').loadClassOps(h.db, {branch}, 'overview')
  assert.equal(overviewData.overview.outOfScopeStudents, 1)
  assert.equal(overviewData.overview.outOfScopeClasses.length, 201)
  const overview = renderToStaticMarkup(React.createElement(Workspace, {data: overviewData, params: {}, view: 'overview'}))
  assert.match(overview, /1 học viên ngoài phạm vi tại 201 ca dạy/)
  assert.match(overview, new RegExp(`href="/admin/classes/${id(210)}"`))
})

test('branch filter excludes other classes and canonical compatible result removes warning', async () => {
  const {h, calls} = setup()
  let data = await h.load('../classes/_ops/data.ts').loadClassOps(h.db, {branch:id(99)}, 'classes')
  assert.equal(data.overview, null)
  assert.equal(calls.length,0)
  h.db.rpc = async () => ({data:'IN_SCOPE', error:null})
  data = await h.load('../classes/_ops/data.ts').loadClassOps(h.db, {}, 'classes')
  assert.equal(data.classes.data[0].outOfScopeCount,0)
  assert.equal(data.overview, null)
})

test('RPC errors do not silently present a clean work queue', async () => {
  const {h} = setup()
  h.db.rpc = async () => ({data:null,error:new Error('compatibility unavailable')})
  await assert.rejects(h.load('../classes/_ops/data.ts').loadClassOps(h.db, {}, 'overview'), /compatibility unavailable/)
})

test('overview retains missing-scope and partially marked attendance queues', async () => {
  const today = new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Ho_Chi_Minh'}).format(new Date())
  const h = harness({
    classes: [{id:id(10),name:'Unconfigured',status:'ACTIVE',accepted_from_level_id:null,accepted_to_level_id:null,
      courses:{name:'Guitar'},branches:{name:'TEST'}}],
    enrollments: [1,2].map(n=>({id:id(100+n),class_id:id(10),student_id:id(200+n),status:'ACTIVE'})),
    session_occurrences:[{id:id(50),occurrence_date:today,status:'SCHEDULED',starts_at:today+'T08:00:00Z',ends_at:today+'T09:00:00Z',
      schedules:{class_id:id(10),classes:{name:'Unconfigured'}}}],
    attendance_records:[{session_occurrence_id:id(50),status:'PRESENT'}],
  })
  h.db.rpc = async () => ({data:'CLASS_SCOPE_UNCONFIGURED',error:null})
  const data = await h.load('../classes/_ops/data.ts').loadClassOps(h.db, {}, 'overview')
  assert.equal(data.overview.unscopedClasses,1)
  assert.equal(data.overview.incompleteAttendance,1)
  assert.equal(data.overview.outOfScopeStudents,0)
  assert.equal(data.overview.needsAttention,2)
})


test('acceptance invokes authoritative assignment/start and never directly sets current_level_id', () => {
  const {seedSql, acceptanceSql} = require('../scripts/local-mixed-level-class-fixture.cjs')
  assert.match(seedSql(), /assign_student_academic_program/)
  assert.match(acceptanceSql(), /start_student_academic_level/)
  assert.doesNotMatch(seedSql() + acceptanceSql(), /update\s+(?:public\.)?student_curriculum_enrollments|set\s+current_level_id/i)
})

 test('attendance loads only its workspace and hides writes without management permission', async () => {
 const h = harness()
 const data = await h.load('../classes/_ops/data.ts').loadClassOps(h.db, {}, 'attendance')
 assert.equal(data.overview, null)
 assert.equal(data.classes, null)
 assert.equal(h.calls.some(c => c.table === 'courses' || c.table === 'curriculum_levels'), false)
 assert.equal(h.calls.some(c => c.rpc === 'class_enrollment_compatibility'), false)
 const Workspace = h.load('../classes/_ops/Workspace.tsx').default
 const html = renderToStaticMarkup(React.createElement(Workspace,{data,params:{},view:'classes',embedded:true,canManage:false}))
 assert.doesNotMatch(html, /Tạo ca dạy|name="branch_id"/)
 })
